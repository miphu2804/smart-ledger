"""Fail CI when required real-PostgreSQL suites are missing, skipped or failing."""

from pathlib import Path
import sys
from xml.etree import ElementTree


REQUIRED = {
    "com.smartledger.core.config.SaleRefundMigrationPostgresTest": set(),
    "com.smartledger.core.service.DebtVoidPostgresTest": set(),
    "com.smartledger.core.service.AuditLogPostgresTest": {
        "lateCheckoutFailureRollsBackEveryBusinessWriteAndCanBeRetried",
        "laterProductFailureRollsBackEarlierStockChangeAndCustomer",
    },
}


def verify(reports: Path) -> None:
    suites = {}
    for report in reports.glob("TEST-*.xml"):
        suite = ElementTree.parse(report).getroot()
        suites[suite.get("name")] = suite
    problems = []
    for name, required_methods in REQUIRED.items():
        suite = suites.get(name)
        if suite is None:
            problems.append(f"{name}: report missing")
            continue
        cases = suite.findall("testcase")
        if int(suite.get("tests", "0")) <= 0 or not cases:
            problems.append(f"{name}: no tests executed")
        if any(int(suite.get(field, "0")) for field in ("skipped", "failures", "errors")) or any(
            case.find(tag) is not None for case in cases for tag in ("skipped", "failure", "error")
        ):
            problems.append(f"{name}: tests skipped or failed")
        missing = required_methods - {case.get("name") for case in cases}
        if missing:
            problems.append(f"{name}: required checkout tests missing: {sorted(missing)}")
        print(f"{name}: tests={suite.get('tests')}, skipped={suite.get('skipped')}")
    if problems:
        raise SystemExit("PostgreSQL verification incomplete:\n" + "\n".join(problems))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: verify_postgres_tests.py <surefire-reports-directory>")
    verify(Path(sys.argv[1]))
