# Shared preflight report for the device build scripts (scripts/ios-device-release.sh, scripts/android-release.sh).
# Every check prints one line (✓ passed, ! warning, ✗ failed). A failure says how to fix it and can register an action
# (open a page or an app, or run a command); pf_finish then lists those actions so the user can start one from the
# terminal instead of looking up what to install. Written for the bash 3.2 that ships with macOS.

pf_failures=0
pf_warnings=0
pf_action_labels=()
pf_action_commands=()

if [ -t 1 ]; then
  pf_bold=$'\033[1m' pf_dim=$'\033[2m' pf_green=$'\033[32m' pf_yellow=$'\033[33m' pf_red=$'\033[31m' pf_reset=$'\033[0m'
else
  pf_bold="" pf_dim="" pf_green="" pf_yellow="" pf_red="" pf_reset=""
fi

pf_ci() { [ "${GITHUB_ACTIONS:-}" = true ]; }

pf_section() {
  echo
  echo "${pf_bold}$1${pf_reset}"
}

pf_ok() { echo "  ${pf_green}✓${pf_reset} $1"; }

# pf_warn <what> [<how to fix>]: does not stop the build.
pf_warn() {
  pf_warnings=$((pf_warnings + 1))
  echo "  ${pf_yellow}!${pf_reset} $1"
  [ -z "${2:-}" ] || printf '%b\n' "$2" | sed 's/^/      /'
}

# pf_fail <what> <how to fix> [<action label> <shell command>]: stops the build at pf_finish.
pf_fail() {
  pf_failures=$((pf_failures + 1))
  echo "  ${pf_red}✗${pf_reset} $1"
  if pf_ci; then echo "::error::Preflight: $1"; fi
  [ -z "${2:-}" ] || printf '%b\n' "$2" | sed 's/^/      /'
  if [ -n "${3:-}" ]; then
    local i
    # One entry per command: two checks fixed in the same place (e.g. Xcode's Accounts pane) share it.
    for ((i = 0; i < ${#pf_action_commands[@]}; i++)); do
      [ "${pf_action_commands[i]}" != "$4" ] || return 0
    done
    pf_action_labels+=("$3")
    pf_action_commands+=("$4")
  fi
}

# Opens a URL, a file or (with -a) an app in the desktop session.
pf_open() {
  if command -v open >/dev/null; then
    open "$@"
  elif command -v xdg-open >/dev/null; then
    xdg-open "${@: -1}"
  else
    echo "  Open this yourself: ${*: -1}"
  fi
}

# Starts a new group of checks (the iOS script checks the Mac first, then the chosen iPhone).
pf_begin() {
  pf_failures=0
  pf_warnings=0
  pf_action_labels=()
  pf_action_commands=()
}

# Returns when nothing failed. Otherwise offers the registered actions (interactive terminals only) and exits 1, so the
# user fixes the problems and runs the script again.
pf_finish() {
  local n i choice
  if [ "$pf_failures" -eq 0 ]; then
    if [ "$pf_warnings" -gt 0 ]; then
      echo "  ${pf_dim}Passed with $pf_warnings warning(s).${pf_reset}"
    else
      echo "  ${pf_dim}All checks passed.${pf_reset}"
    fi
    return 0
  fi
  echo
  echo "${pf_red}${pf_bold}Preflight failed: $pf_failures problem(s) above.${pf_reset} Fix them, then run the script again."
  echo "${pf_dim}To build anyway, pass --skip-preflight.${pf_reset}"
  n=${#pf_action_labels[@]}
  if [ "$n" -gt 0 ] && [ -t 0 ] && [ -t 1 ] && ! pf_ci; then
    echo
    echo "${pf_bold}Fixes this script can start for you:${pf_reset}"
    for ((i = 0; i < n; i++)); do
      echo "  $((i + 1))) ${pf_action_labels[i]}"
    done
    while true; do
      printf 'Pick a number to start it, or press Enter to exit: '
      IFS= read -r choice || break
      [ -n "$choice" ] || break
      if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le "$n" ]; then
        echo "${pf_dim}→ ${pf_action_commands[choice - 1]}${pf_reset}"
        eval "${pf_action_commands[choice - 1]}" || echo "  ${pf_yellow}That command failed; see its output above.${pf_reset}"
      else
        echo "  Pick a number from 1 to $n."
      fi
    done
  fi
  exit 1
}
