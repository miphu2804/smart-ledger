"""Exercise the CI gate itself, including false-green failure modes."""

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from xml.etree import ElementTree

from verify_postgres_tests import REQUIRED, verify


class PostgresGateTest(unittest.TestCase):
    def setUp(self):
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


if __name__ == "__main__":
    unittest.main()
