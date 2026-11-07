#!/usr/bin/env python3
"""Keeps the `.okf/` bundle in sync with the human Markdown documents.

Human documents carry no YAML frontmatter. Their Open Knowledge Format (OKF v0.2) metadata lives in `.okf/`, which
mirrors the repository paths: `.okf/docs/product/business-requirements.md` describes `docs/product/business-requirements.md`
and its `resource` field points back to it. Run it without arguments after adding, renaming or retitling a document, then
replace any `description: TODO`. `--check` writes nothing and exits 1 when the bundle drifts; CI runs it.
"""

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUNDLE = ROOT / ".okf"
MANAGED = [
    re.compile(pattern)
    for pattern in (r"docs/.+\.md", r"(backend|frontend)/[^/]+/docs/[^/]+\.md", r"CONTRIBUTING\.md", r"SECURITY\.md")
]
ROOT_NOTE = (
    "This bundle holds the metadata of the human documents in this repository. The `resource` field of each concept "
    "points to its document. Edit the human document, then run `python3 scripts/docs/okf_sync.py` to update this bundle."
)
KEY = re.compile(r"^([A-Za-z_][\w-]*):\s*(.*)$")
LINK = re.compile(r"\[[^\]]*\]\(((?:[^()\s]|\([^()\s]*\))+)(?:\s+\"[^\"]*\")?\)")


def markdown_files() -> list[str]:
    """Lists the repository-relative Markdown files outside `.okf/` and `.agents/`, tracked or not yet added."""
    output = subprocess.check_output(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "--", "*.md"], cwd=ROOT, text=True
    )
    files = [f for f in output.splitlines() if (ROOT / f).is_file()]
    return sorted(f for f in files if not f.startswith((".okf/", ".agents/")))


def is_managed(path: str) -> bool:
    """Tells whether a human document needs a concept: `index.md` and READMEs outside `docs/` do not."""
    name = path.rsplit("/", 1)[-1]
    if name == "index.md" or (name == "README.md" and not path.startswith("docs/")):
        return False
    return any(pattern.fullmatch(path) for pattern in MANAGED)


def split_frontmatter(text: str) -> tuple[list[str], str] | None:
    """Splits a leading `---` block from the rest; returns None when the text has no such block."""
    lines = text.split("\n")
    if lines[0] != "---":
        return None
    for i in range(1, len(lines)):
        if lines[i] == "---":
            return lines[1:i], "\n".join(lines[i + 1 :])
    return None


def field(lines: list[str], key: str) -> str | None:
    """Returns the scalar value of a top-level frontmatter key, unquoted, or None when the key is absent."""
    for line in lines:
        match = KEY.match(line)
        if match and match.group(1) == key:
            value = match.group(2).strip()
            if value.startswith('"'):
                try:
                    return json.loads(value)
                except ValueError:
                    return value
            if len(value) > 1 and value[0] == value[-1] == "'":
                return value[1:-1].replace("''", "'")
            return value
    return None


def first_heading(path: str) -> str | None:
    """Returns the text of the first `# ` heading of a document, ignoring code fences."""
    in_fence = False
    for line in (ROOT / path).read_text(encoding="utf-8").split("\n"):
        if line.startswith("```"):
            in_fence = not in_fence
        elif not in_fence and line.startswith("# "):
            return line[2:].strip()
    return None


def concept_text(lines: list[str], title: str, resource: str, concept: str) -> str:
    """Renders a concept: its frontmatter lines and one link to the human document."""
    link = os.path.relpath(ROOT / resource, (ROOT / concept).parent)
    return "---\n" + "\n".join(lines) + f"\n---\n\n[{title}]({link})\n"


def load_concepts() -> dict[str, list[str]]:
    """Maps each concept path (repository-relative) to its frontmatter lines; unparseable concepts map to []."""
    concepts = {}
    for path in sorted(BUNDLE.rglob("*.md")):
        if path.name == "index.md":
            continue
        parsed = split_frontmatter(path.read_text(encoding="utf-8"))
        concepts[str(path.relative_to(ROOT))] = parsed[0] if parsed else []
    return concepts


def write_concepts(concepts: dict[str, list[str]]) -> None:
    """Sets every title from the document's heading, rewrites the link body and adds stubs for undocumented files."""
    for concept, lines in concepts.items():
        resource = field(lines, "resource")
        if resource and (ROOT / resource).is_file():
            title = first_heading(resource) or field(lines, "title") or resource
            if field(lines, "title") != title:
                lines = [line for line in lines if not line.startswith("title:")]
                lines.insert(1 if lines and lines[0].startswith("type:") else 0, f"title: {json.dumps(title, ensure_ascii=False)}")
            (ROOT / concept).write_text(concept_text(lines, title, resource, concept), encoding="utf-8")
            concepts[concept] = lines
    described = {field(lines, "resource") for lines in concepts.values()}
    for doc in filter(is_managed, markdown_files()):
        if doc not in described:
            title = first_heading(doc) or doc
            lines = ["type: Guide", f"title: {json.dumps(title, ensure_ascii=False)}", "description: TODO", f"resource: {doc}"]
            concept = f".okf/{doc}"
            (ROOT / concept).parent.mkdir(parents=True, exist_ok=True)
            (ROOT / concept).write_text(concept_text(lines, title, doc, concept), encoding="utf-8")
            concepts[concept] = lines


def read_header(path: str) -> str | None:
    """Returns the hand-written part of an index (everything above its first bullet), or None when it has no file."""
    file = ROOT / path
    if not file.is_file():
        return None
    text = file.read_text(encoding="utf-8")
    return re.split(r"^\* ", text, maxsplit=1, flags=re.M)[0]


def header_parts(header: str | None) -> tuple[str, str]:
    """Returns the H1 and the intro sentence (the paragraph after the H1) of an index header; empty when absent."""
    body = (split_frontmatter(header) or ([], header))[1] if header else ""
    lines = [line for line in body.split("\n") if line.strip()]
    h1 = next((line[2:].strip() for line in lines if line.startswith("# ")), "")
    after = lines[lines.index(f"# {h1}") + 1 :] if h1 else []
    return h1, after[0].strip() if after and not after[0].startswith("<") else ""


def listing(directory: str, concepts: dict[str, list[str]], indexed: dict[str, list[tuple[str, str, str]]]):
    """Returns the (title, description, link) entries of a bundle directory and records the directories that get an index.

    A subdirectory with fewer than two entries gets no index of its own; its entry is listed in its parent instead.
    """
    prefix = f".okf/{directory}/" if directory else ".okf/"
    entries, subdirs = [], set()
    for concept, lines in concepts.items():
        if concept.startswith(prefix):
            rest = concept[len(prefix) :]
            if "/" in rest:
                subdirs.add(rest.split("/", 1)[0])
            else:
                entries.append((field(lines, "title") or rest, field(lines, "description") or "", rest))
    for sub in sorted(subdirs):
        sub_path = f"{directory}/{sub}" if directory else sub
        sub_entries = listing(sub_path, concepts, indexed)
        if len(sub_entries) >= 2:
            h1, intro = header_parts(read_header(f".okf/{sub_path}/index.md"))
            entries.append((h1 or sub_path, intro or "TODO", f"{sub}/index.md"))
        else:
            entries.extend((title, desc, f"{sub}/{link}") for title, desc, link in sub_entries)
    entries.sort(key=lambda entry: entry[0].casefold())
    if len(entries) >= 2 or not directory:
        indexed[directory] = entries
    return entries


def expected_indexes(concepts: dict[str, list[str]]) -> dict[str, str]:
    """Builds the content of every `index.md` the bundle should have, keyed by repository-relative path."""
    indexed: dict[str, list[tuple[str, str, str]]] = {}
    listing("", concepts, indexed)
    files = {}
    for directory, entries in indexed.items():
        body = "\n".join(f"* [{title}]({link}) - {desc}" for title, desc, link in entries)
        path = f".okf/{directory}/index.md" if directory else ".okf/index.md"
        header = read_header(path)
        if header is None and directory:
            header = f"# {directory}\n\nTODO\n"
        elif header is None:
            header = f'---\nokf_version: "0.2"\n---\n\n# SmartLedger Documentation Metadata\n\n{ROOT_NOTE}\n'
        files[path] = f"{header.rstrip()}\n\n{body}\n"
    return files


def write_indexes(concepts: dict[str, list[str]]) -> None:
    """Rewrites the generated indexes and removes indexes that are no longer expected."""
    expected = expected_indexes(concepts)
    for path in BUNDLE.rglob("index.md"):
        if str(path.relative_to(ROOT)) not in expected:
            path.unlink()
    for path, content in expected.items():
        (ROOT / path).parent.mkdir(parents=True, exist_ok=True)
        (ROOT / path).write_text(content, encoding="utf-8")


def broken_links(path: str) -> list[str]:
    """Lists the relative Markdown links of a file whose target does not exist."""
    text = (ROOT / path).read_text(encoding="utf-8")
    text = re.sub(r"```.*?```", "", text, flags=re.S)
    text = re.sub(r"`[^`\n]*`", "", text)
    problems = []
    for target in LINK.findall(text):
        if re.match(r"[a-zA-Z][a-zA-Z0-9+.-]*:", target) or target.startswith("#") or target == "relative/path":
            continue
        file_part = target.split("#", 1)[0].split("?", 1)[0]
        if file_part and not (ROOT / path).parent.joinpath(file_part.replace("%20", " ")).exists():
            problems.append(f"{path}: broken link {target}")
    return problems


def check(concepts: dict[str, list[str]]) -> list[str]:
    """Collects every drift problem between the human documents and the bundle, one line each."""
    problems = []
    files = markdown_files()
    described = {field(lines, "resource") for lines in concepts.values()}
    for doc in files:
        if (is_managed(doc) or doc.endswith("README.md")) and (ROOT / doc).read_text(encoding="utf-8").startswith("---\n"):
            problems.append(f"{doc}: human document starts with frontmatter; move it to .okf/")
        if is_managed(doc) and doc not in described:
            problems.append(f"{doc}: no concept in .okf/")
    for concept, lines in concepts.items():
        if not lines or not field(lines, "type"):
            problems.append(f"{concept}: no parseable frontmatter with a non-empty type")
            continue
        resource = field(lines, "resource")
        if not resource or not (ROOT / resource).is_file():
            problems.append(f"{concept}: resource {resource} is missing")
            continue
        if field(lines, "title") != first_heading(resource):
            problems.append(f"{concept}: title differs from the first heading of {resource}")
        if field(lines, "description") in (None, "", "TODO"):
            problems.append(f"{concept}: description is missing or TODO")
    for path, content in expected_indexes(concepts).items():
        if not (ROOT / path).is_file() or (ROOT / path).read_text(encoding="utf-8") != content:
            problems.append(f"{path}: not what okf_sync.py would generate")
    for path, content in expected_indexes(concepts).items():
        if header_parts(content.split("\n* ", 1)[0])[1] in ("", "TODO"):
            problems.append(f"{path}: group intro is missing")
    for path in BUNDLE.rglob("index.md"):
        if str(path.relative_to(ROOT)) not in expected_indexes(concepts):
            problems.append(f"{path.relative_to(ROOT)}: unexpected index")
    for path in [*files, *(str(p.relative_to(ROOT)) for p in BUNDLE.rglob("*.md"))]:
        if path.startswith(".okf/") or is_managed(path):
            problems.extend(broken_links(path))
    return problems


def main() -> int:
    """Runs write mode, or `--check` mode, and returns the process exit code."""
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--check", action="store_true", help="write nothing; exit 1 when the bundle drifts")
    args = parser.parse_args()
    concepts = load_concepts()
    if not args.check:
        write_concepts(concepts)
        write_indexes(concepts)
    problems = check(load_concepts())
    for problem in problems:
        print(problem)
    if problems and args.check:
        return 1
    print(f"okf_sync: {len(concepts)} concepts" + (f", {len(problems)} to fix" if problems else ", in sync"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
