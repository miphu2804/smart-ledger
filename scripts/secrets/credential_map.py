"""Builds one credential map page per environment from Dopbase key names and the code that reads them.

The map answers "which variable, kept where, feeds which service and what breaks when it is wrong". Dopbase is
asked only for key names (`dopbase secret list`), never values, so the generated pages are safe to commit.
Connections, kinds and symptoms come from credential-map.json beside this script; references come from a scan of
the tracked files.

Usage:
    python3 scripts/secrets/credential_map.py [staging|production ...]

Writes docs/development/credential-map/<environment>.html. Needs a logged-in Dopbase CLI.
"""

import fnmatch
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True,
                           check=True).stdout.strip())
HERE = ROOT / "scripts/secrets"
OUT = ROOT / "docs/development/credential-map"
MAX_REFS = 8
NAME = re.compile(r"\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b")
WORKFLOW_REF = re.compile(r"\b(secrets|vars)\.([A-Z][A-Z0-9_]*)")
EXAMPLE_KEY = re.compile(r"^#?\s*([A-Z][A-Z0-9_]*)=", re.MULTILINE)
SECRET_NAME = re.compile(r"SECRET|PASSWORD|TOKEN|PRIVATE|CREDENTIAL|API_KEY|SSH_KEY|_JSON$|WEBHOOK|"
                         r"DATABASE_URL|POSTGRES_URL|READER_URL|VIRTUAL_KEY|ACCESS_KEY|ENCRYPTION_KEY")
# Docs and env templates list variables rather than read them, lock files only repeat package names, and the map's
# own files would count every name as used.
SKIPPED = ("docs/*", "*.md", "*.lock", "*package-lock.json", "*pnpm-lock.yaml", "*.env.example", "secrets/templates/*",
           "scripts/secrets/credential-map.*", "scripts/secrets/credential_map.py")


def main(environments):
    data = json.loads((HERE / "credential-map.json").read_text())
    refs, workflow = scan_code()
    dopbase = read_dopbase(data)
    branch = git("branch", "--show-current")
    OUT.mkdir(parents=True, exist_ok=True)
    for environment in environments:
        rows = build_rows(environment, data, dopbase, refs, workflow)
        page = render(environment, data, rows, branch)
        (OUT / f"{environment}.html").write_text(page)
        print(f"{environment}: {len(rows)} keys -> {(OUT / f'{environment}.html').relative_to(ROOT)}")


def scan_code():
    """Map each UPPER_SNAKE name to its `path:line` references, and collect GitHub workflow secrets and vars."""
    refs, workflow = {}, {}
    for path in git("ls-files").splitlines():
        if any(fnmatch.fnmatch(path, pattern) for pattern in SKIPPED):
            continue
        try:
            text = (ROOT / path).read_text()
        except (UnicodeDecodeError, IsADirectoryError, FileNotFoundError):
            continue
        for number, line in enumerate(text.splitlines(), 1):
            for name in set(NAME.findall(line)):
                refs.setdefault(name, []).append(f"{path}:{number}")
            if path.startswith(".github/"):
                for scope, name in WORKFLOW_REF.findall(line):
                    workflow[name] = "secret" if scope == "secrets" else "config"
    return refs, workflow


def read_dopbase(data):
    """Return {(project, env): {key: updatedAt}} for every environment the pages show."""
    wanted = {env for envs in data["environments"].values() for env in envs}
    found = {}
    for project in data["projects"]:
        for env in dopbase_json("env", "list", project):
            if env["name"] in wanted:
                keys = dopbase_json("secret", "list", f"{project}/{env['name']}")
                found[project, env["name"]] = {key["key"]: key["updatedAt"][:10] for key in keys}
    return found


def build_rows(environment, data, dopbase, refs, workflow):
    envs = data["environments"][environment]
    other = [env for name, group in data["environments"].items() if name != environment for env in group]
    rows, on_dopbase = [], set()
    for (project, env), keys in sorted(dopbase.items()):
        if env not in envs:
            continue
        service = data["projects"][project]["service"]
        example = example_keys(data["projects"][project].get("example"))
        elsewhere = set().union(*(dopbase.get((project, o), {}) for o in other))
        has_other = any((project, o) in dopbase for o in other)
        for key, updated in sorted(keys.items()):
            on_dopbase.add(key)
            status = ["used" if key in refs else "unused"]
            if has_other and key not in elsewhere:
                status.append("drift")
            rows.append(row(key, f"{project}/{env}", service, status, data, refs, key in example, updated))
            rows[-1]["note"] = data["projects"][project].get("note", "")
        for key in sorted(example - set(keys)):
            rows.append(row(key, f"{project} .env.example", service, ["missing"], data, refs, True))
    for key, kind in sorted(workflow.items()):
        if key not in on_dopbase:
            rows.append(row(key, "GitHub", "gha", ["github"], data, refs, False, kind=kind))
    return rows


def row(key, source, service, status, data, refs, in_example, updated="", kind=None):
    found = refs.get(key, [])
    implicit = next((note for pattern, note in data["implicit"].items() if fnmatch.fnmatch(key, pattern)), None)
    if implicit and not found:
        found = [implicit]
        status = ["used" if s == "unused" else s for s in status]
    return {
        "key": key,
        "source": source,
        "service": service,
        "to": targets(key, service, data["edges"]),
        "kind": kind or kind_of(key, data["kinds"]),
        "status": status,
        "inExample": in_example,
        "updatedAt": updated,
        "refs": found[:MAX_REFS],
        "refCount": len(found),
        "symptom": data["symptoms"].get(key),
    }


def targets(key, service, edges):
    return sorted({edge["to"] for edge in edges
                   if edge["from"] == service and any(fnmatch.fnmatch(key, p) for p in edge["keys"])})


def kind_of(key, kinds):
    if key in kinds["secret"]:
        return "secret"
    if key in kinds["config"] or key.startswith(("EXPO_PUBLIC_", "VITE_")):
        return "config"
    return "secret" if SECRET_NAME.search(key) else "config"


def example_keys(path):
    return set(EXAMPLE_KEY.findall((ROOT / path).read_text())) if path else set()


def render(environment, data, rows, branch):
    other = "production" if environment == "staging" else "staging"
    payload = {
        "generatedAt": datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M UTC%z"),
        "branch": branch,
        "envs": data["environments"][environment],
        "services": data["services"],
        "rows": rows,
    }
    # "</" would end the JSON script block early.
    blob = json.dumps(payload, ensure_ascii=False).replace("</", "<\\/")
    template = (HERE / "credential-map.html").read_text()
    return (template.replace("__ENV__", environment).replace("__DRIFT__", f"Không có ở {other}")
            .replace("__DATA__", blob))


def dopbase_json(*args):
    result = subprocess.run(["dopbase", *args, "--json"], capture_output=True, text=True)
    if result.returncode != 0:
        sys.exit(f"dopbase {' '.join(args)} failed: {result.stderr.strip()}")
    return json.loads(result.stdout)


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()


if __name__ == "__main__":
    chosen = sys.argv[1:] or ["staging", "production"]
    unknown = set(chosen) - {"staging", "production"}
    if unknown:
        sys.exit("usage: credential_map.py [staging|production ...]")
    main(chosen)
