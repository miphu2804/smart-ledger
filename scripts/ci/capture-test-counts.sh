#!/usr/bin/env bash
# Usage: capture-test-counts.sh junit <report.xml> | surefire <reports directory>
# Sets the outputs tests, failures, errors and skipped from a JUnit XML file (pytest) or from the TEST-*.xml files
# of a Surefire directory (Maven), and n/a for each when there is no report, so the run summary can still be built.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

python3 - "${1:?usage: capture-test-counts.sh junit|surefire <path>}" "${2:?usage: capture-test-counts.sh junit|surefire <path>}" << 'PY' |
import sys
from pathlib import Path
from xml.etree import ElementTree

kind, path = sys.argv[1], Path(sys.argv[2])
names = ("tests", "failures", "errors", "skipped")
counts = {name: "n/a" for name in names}
if kind == "junit" and path.exists():
    root = ElementTree.parse(path).getroot()
    suites = [root] if root.tag == "testsuite" else root.findall(".//testsuite")
    if not suites:
        suites = [root]
    counts = {name: str(sum(int(suite.get(name, "0")) for suite in suites)) for name in names}
elif kind == "surefire" and sorted(path.glob("TEST-*.xml")):
    counts = {name: 0 for name in names}
    for report in sorted(path.glob("TEST-*.xml")):
        suite = ElementTree.parse(report).getroot()
        for name in names:
            counts[name] += int(suite.get(name, "0"))
for name, value in counts.items():
    print(f"{name}={value}")
PY
  while IFS='=' read -r name value; do ci_output "$name" "$value"; done
