# Credential map

The credential map shows, for one environment, every variable kept in Dopbase or declared on GitHub, which service reads it, which service it connects to, and what breaks when it is wrong or missing.
Open [`staging.html`](staging.html) or [`production.html`](production.html) in a browser; each page is a table of variables grouped by the service that reads them, with the services each one connects to and its status on every row; filter with the status strip, the search box or the service menu, and click a row to see its references and what breaks when it is wrong.
The pages hold variable names, file references and Dopbase update dates only, never values.

## Regenerate

Log in to the Dopbase CLI first (see [Secrets and environment variables](../secrets-and-env.md)), then run from the repository root:

```bash
python3 scripts/secrets/credential_map.py
```

Pass `staging` or `production` to rebuild one page.
The script asks Dopbase for key names with `dopbase secret list`, scans the tracked files for each name, and writes both pages here.
Regenerate after a variable is added, renamed or removed in Dopbase or in code, and commit the pages with that change.

## Where each column comes from

| Column | Source |
|---|---|
| Source | The Dopbase `project/environment` that holds the key, `<project> .env.example` for a key only in the example file, or `GitHub` for a `secrets.*` or `vars.*` name a workflow reads that no Dopbase project of this environment holds |
| Service → connects to | The project's service and the `edges` patterns in [`scripts/secrets/credential-map.json`](../../../scripts/secrets/credential-map.json) |
| Kind | A name heuristic in the script, corrected by the `kinds` lists in the JSON file |
| Status | Found in tracked code or not, only in `.env.example`, missing from the other environment of the same project, or only on GitHub |
| Used in code | `path:line` of each tracked file that names the key; docs, Markdown and lock files are skipped |
| What breaks | The `symptoms` entries in the JSON file, each with the code line that produces it |

A key marked "Không thấy trong code" is not read by any tracked file on this branch, so it is either dead, read by code on an unmerged branch (the row then says which), or read implicitly, such as Spring's `SPRING_*` relaxed binding.
Add a symptom only after reading the code path that produces it, and cite that line.
