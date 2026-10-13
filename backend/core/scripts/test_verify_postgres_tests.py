"""Exercise the CI gate itself, including false-green failure modes."""

from pathlib import Path
from contextlib import redirect_stdout
from io import StringIO
from tempfile import TemporaryDirectory
import unittest
from xml.etree import ElementTree

from verify_postgres_tests import REQUIRED, verify


class PostgresGateTest(unittest.TestCase):
    def setUp(self):
        output = redirect_stdout(StringIO())
        output.__enter__()
        self.addCleanup(output.__exit__, None, None, None)
        self.directory = TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.reports = Path(self.directory.name)
        for name, methods in REQUIRED.items():
            suite = ElementTree.Element("testsuite", name=name, tests=str(max(1, len(methods))),
                                        skipped="0", failures="0", errors="0")
            for method in methods or {"existingPostgresTest"}:
                ElementTree.SubElement(suite, "testcase", name=method)
            ElementTree.ElementTree(suite).write(self.reports / f"TEST-{name}.xml")

    def audit_report(self):
        return self.reports / "TEST-com.smartledger.core.service.AuditLogPostgresTest.xml"

    def test_accepts_executed_suites(self):
        verify(self.reports)

    def test_rejects_missing_reports(self):
        with self.assertRaisesRegex(SystemExit, "report missing"):
            verify(self.reports / "missing")

    def test_rejects_empty_suite(self):
        report = self.audit_report()
        suite = ElementTree.parse(report).getroot()
        suite.set("tests", "0")
        ElementTree.ElementTree(suite).write(report)
        with self.assertRaisesRegex(SystemExit, "no tests executed"):
            verify(self.reports)

    def test_rejects_skipped_or_failing_suites(self):
        report = self.audit_report()
        for field in ("skipped", "failures", "errors"):
            with self.subTest(field=field):
                suite = ElementTree.parse(report).getroot()
                suite.set(field, "1")
                ElementTree.ElementTree(suite).write(report)
                with self.assertRaisesRegex(SystemExit, "tests skipped or failed"):
                    verify(self.reports)
                suite.set(field, "0")
                ElementTree.ElementTree(suite).write(report)

    def test_rejects_skipped_test_even_if_suite_counter_is_zero(self):
        report = self.audit_report()
        suite = ElementTree.parse(report).getroot()
        ElementTree.SubElement(suite.find("testcase"), "skipped")
        ElementTree.ElementTree(suite).write(report)
        with self.assertRaisesRegex(SystemExit, "tests skipped or failed"):
            verify(self.reports)

    def test_rejects_removed_checkout_rollback_test(self):
        report = self.audit_report()
        suite = ElementTree.parse(report).getroot()
        suite.remove(suite.find("testcase"))
        ElementTree.ElementTree(suite).write(report)
        with self.assertRaisesRegex(SystemExit, "required tests missing"):
            verify(self.reports)

    def test_rejects_removed_notification_or_migration_test(self):
        for name in (
            "com.smartledger.core.service.NotificationPostgresTest",
            "com.smartledger.core.config.SaleRefundMigrationPostgresTest",
        ):
            with self.subTest(suite=name):
                report = self.reports / f"TEST-{name}.xml"
                suite = ElementTree.parse(report).getroot()
                case = suite.find("testcase")
                suite.remove(case)
                ElementTree.ElementTree(suite).write(report)
                with self.assertRaisesRegex(SystemExit, "required tests missing") as raised:
                    verify(self.reports)
                self.assertIn(name, str(raised.exception))
                self.assertIn(case.get("name"), str(raised.exception))
                suite.append(case)
                ElementTree.ElementTree(suite).write(report)

    def test_accepts_parameterized_surefire_method_names(self):
        for report in self.reports.glob("TEST-*.xml"):
            suite = ElementTree.parse(report).getroot()
            for case in suite.findall("testcase"):
                case.set("name", f"{case.get('name')}(boolean, String)[1]")
            ElementTree.ElementTree(suite).write(report)
        verify(self.reports)

    def test_rejects_missing_concurrency_suite(self):
        for name in REQUIRED:
            if "ConcurrencyPostgresTest" not in name:
                continue
            with self.subTest(suite=name):
                report = self.reports / f"TEST-{name}.xml"
                original = report.read_bytes()
                report.unlink()
                try:
                    with self.assertRaisesRegex(SystemExit, f"{name}: report missing"):
                        verify(self.reports)
                finally:
                    report.write_bytes(original)

    def test_rejects_skipped_concurrency_case_even_with_zero_suite_counter(self):
        for name in REQUIRED:
            if "ConcurrencyPostgresTest" not in name:
                continue
            with self.subTest(suite=name):
                report = self.reports / f"TEST-{name}.xml"
                suite = ElementTree.parse(report).getroot()
                case = suite.find("testcase")
                skipped = ElementTree.SubElement(case, "skipped")
                ElementTree.ElementTree(suite).write(report)
                with self.assertRaisesRegex(SystemExit, f"{name}: tests skipped or failed"):
                    verify(self.reports)
                case.remove(skipped)
                ElementTree.ElementTree(suite).write(report)

    def test_rejects_removed_critical_concurrency_or_overflow_method(self):
        for name, methods in REQUIRED.items():
            if "ConcurrencyPostgresTest" not in name and "NotificationPostgresTest" not in name:
                continue
            report = self.reports / f"TEST-{name}.xml"
            for method in methods:
                with self.subTest(suite=name, method=method):
                    suite = ElementTree.parse(report).getroot()
                    case = next(case for case in suite.findall("testcase") if case.get("name") == method)
                    suite.remove(case)
                    ElementTree.ElementTree(suite).write(report)
                    with self.assertRaisesRegex(SystemExit, "required tests missing") as raised:
                        verify(self.reports)
                    self.assertIn(name, str(raised.exception))
                    self.assertIn(method, str(raised.exception))
                    suite.append(case)
                    ElementTree.ElementTree(suite).write(report)

    def test_does_not_accept_a_different_method_with_the_required_prefix(self):
        report = self.audit_report()
        suite = ElementTree.parse(report).getroot()
        suite.find("testcase").set("name", suite.find("testcase").get("name") + "NotTheRequiredMethod(boolean)[1]")
        ElementTree.ElementTree(suite).write(report)
        with self.assertRaisesRegex(SystemExit, "required tests missing"):
            verify(self.reports)


if __name__ == "__main__":
    unittest.main()
