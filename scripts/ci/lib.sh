# shellcheck shell=bash
# Sourced by every script in scripts/ci/. This is the only file of scripts/ and deploy/ that knows which CI provider runs
# it (scripts/ci/check-provider-coupling.sh enforces that): it maps the provider's variables onto the SMARTLEDGER_* names
# below and wraps the few provider features the scripts use. Off CI the same names come from your shell and the wrappers
# print to the terminal, so a script behaves the same on a laptop.

# Names the scripts read. A caller sets one to override the provider's value, e.g. the commit a manual deploy names.
SMARTLEDGER_COMMIT="${SMARTLEDGER_COMMIT:-${GITHUB_SHA:-}}"
SMARTLEDGER_REF="${SMARTLEDGER_REF:-${GITHUB_REF_NAME:-}}"
SMARTLEDGER_REF_TYPE="${SMARTLEDGER_REF_TYPE:-${GITHUB_REF_TYPE:-branch}}"
SMARTLEDGER_RUN_ID="${SMARTLEDGER_RUN_ID:-${GITHUB_RUN_ID:-local}}"
SMARTLEDGER_JOB="${SMARTLEDGER_JOB:-${GITHUB_JOB:-local}}"
SMARTLEDGER_REPOSITORY="${SMARTLEDGER_REPOSITORY:-${GITHUB_REPOSITORY:-}}"
SMARTLEDGER_ACTOR="${SMARTLEDGER_ACTOR:-${GITHUB_ACTOR:-${USER:-unknown}}}"
SMARTLEDGER_RUN_URL="${SMARTLEDGER_RUN_URL:-${GITHUB_RUN_ID:+$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID}}"
# staging unless the branch is main, as for the deploy environments.
if [ -z "${SMARTLEDGER_ENVIRONMENT:-}" ]; then
  if [ "$SMARTLEDGER_REF" = main ]; then SMARTLEDGER_ENVIRONMENT=production; else SMARTLEDGER_ENVIRONMENT=staging; fi
fi
export SMARTLEDGER_COMMIT SMARTLEDGER_REF SMARTLEDGER_REF_TYPE SMARTLEDGER_RUN_ID SMARTLEDGER_JOB \
  SMARTLEDGER_REPOSITORY SMARTLEDGER_ACTOR SMARTLEDGER_RUN_URL SMARTLEDGER_ENVIRONMENT

# shellcheck disable=SC2034 # read by the scripts that source this file
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# True while a CI provider runs the script.
ci_running() { [ "${GITHUB_ACTIONS:-}" = true ]; }

# ci_error <message> [<file>], ci_warning <message>: an annotation on the run page, or a line on stderr.
ci_error() {
  if ci_running; then echo "::error${2:+ file=$2}::$1"; else echo "error: ${2:+$2: }$1" >&2; fi
}
ci_warning() {
  if ci_running; then echo "::warning::$1"; else echo "warning: $1" >&2; fi
}

# ci_output <name> <value>: an output of the step, or a name=value line.
ci_output() {
  if ci_running; then echo "$1=$2" >> "$GITHUB_OUTPUT"; else echo "$1=$2"; fi
}

# ci_env <name> <value>: sets a variable for the later steps of the job, or prints an export line for `eval "$(...)"`.
ci_env() {
  if ci_running; then echo "$1=$2" >> "$GITHUB_ENV"; else printf 'export %s=%q\n' "$1" "$2"; fi
}

# ci_add_path <directory>: puts the directory on PATH for the later steps, or prints an export line.
ci_add_path() {
  if ci_running; then echo "$1" >> "$GITHUB_PATH"; else printf 'export PATH=%q:"$PATH"\n' "$1"; fi
}

# ci_summary: appends stdin to the run summary, and to stdout where there is none.
ci_summary() {
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then tee -a "$GITHUB_STEP_SUMMARY"; else cat; fi
}

# ci_temp_dir: where one run keeps its scratch files. Off CI, export SMARTLEDGER_TEMP_DIR once so the scripts of a
# run share it; otherwise each call makes a new directory.
ci_temp_dir() {
  if [ -n "${RUNNER_TEMP:-}" ]; then echo "$RUNNER_TEMP"; else echo "${SMARTLEDGER_TEMP_DIR:-$(mktemp -d)}"; fi
}
