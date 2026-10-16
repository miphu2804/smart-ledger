# Shared helpers for the device build scripts (scripts/ios-device-release.sh, scripts/android-release.sh): the
# preflight report and the arrow-key menu that picks a phone.
# Every check prints one line (✓ passed, ! warning, ✗ failed). A failure says how to fix it and can register an action
# (open a page or an app, or run a command); pf_finish then lists those actions so the user can start one from the
# terminal instead of looking up what to install. Written for the bash 3.2 that ships with macOS.

pf_failures=0
pf_warnings=0
pf_action_labels=()
pf_action_commands=()
# The scripts set pf_rerun to their absolute path and arguments, so pf_finish can check again after a fix ran.

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

# Node. The pinned major comes from NODE_MAJOR in .github/workflows/mobile-release.yml. A laptop often has another
# Node first on PATH (Homebrew's latest `node`, an nvm default) while the pinned one is installed beside it, so
# pf_use_node puts the pinned one first on PATH for this run (and for the Xcode and Gradle builds it starts) instead of
# failing. It looks in Homebrew's node@<major> (keg-only, never on PATH by itself), nvm, fnm, Volta, asdf, mise and n.
pf_node_note=""

pf_node_version() { "${1:-node}" -p 'process.versions.node' 2>/dev/null; }

pf_use_node() {
  local want="$1" have="" dir v best="" best_v=""
  [ -n "$want" ] || return 0
  have="$(pf_node_version || true)"
  [ "${have%%.*}" != "$want" ] || return 0
  for dir in "/opt/homebrew/opt/node@$want/bin" "/usr/local/opt/node@$want/bin" \
    "${NVM_DIR:-$HOME/.nvm}/versions/node/v$want".*/bin \
    "${FNM_DIR:-$HOME/.local/share/fnm}/node-versions/v$want".*/installation/bin \
    "$HOME/Library/Application Support/fnm/node-versions/v$want".*/installation/bin \
    "$HOME/.fnm/node-versions/v$want".*/installation/bin \
    "${VOLTA_HOME:-$HOME/.volta}/tools/image/node/$want".*/bin \
    "${ASDF_DATA_DIR:-$HOME/.asdf}/installs/nodejs/$want".*/bin \
    "${MISE_DATA_DIR:-$HOME/.local/share/mise}/installs/node/$want"*/bin \
    "${N_PREFIX:-/usr/local}/n/versions/node/$want".*/bin; do
    [ -x "$dir/node" ] || continue
    v="$(pf_node_version "$dir/node")" || continue
    [ "${v%%.*}" = "$want" ] || continue
    # Keep the newest patch release of the pinned major.
    if [ -z "$best" ] || [ "$(printf '%s\n%s\n' "$best_v" "$v" | sort -t. -k1,1n -k2,2n -k3,3n | tail -1)" = "$v" ]; then
      best="$dir" best_v="$v"
    fi
  done
  [ -n "$best" ] || return 0
  export PATH="$best:$PATH"
  hash -r
  pf_node_note="$best, used for this run; PATH had ${have:+Node }${have:-no working node}"
}

# Reinstalls node_modules when package-lock.json is newer than the last install (after a pull or a branch switch) or
# when the last install ran under another Node major, whose leftovers (native addons, engine checks, postinstall
# output) the pinned Node can reject.
pf_npm_install() {
  local major stamp=node_modules/.node-major
  major="$(pf_node_version || true)"
  major="${major%%.*}"
  if [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ] ||
    [ "$(cat "$stamp" 2>/dev/null || true)" != "$major" ]; then
    echo "${pf_bold}→ npm install${pf_reset}"
    npm install
    echo "$major" >"$stamp"
  fi
}

# pf_check_node <major>: switches to the pinned Node when it is installed, otherwise reports what to install.
pf_check_node() {
  local want="$1" found="" label="" cmd=""
  if [ -z "$want" ]; then
    pf_warn "Could not read NODE_MAJOR from .github/workflows/mobile-release.yml" "Node is not checked; CI builds with the version pinned there."
    return 0
  fi
  pf_use_node "$want"
  if [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
    label="Install Node $want with nvm" cmd=". '${NVM_DIR:-$HOME/.nvm}/nvm.sh' && nvm install $want"
  elif command -v fnm >/dev/null; then
    label="Install Node $want with fnm" cmd="fnm install $want"
  elif command -v brew >/dev/null; then
    # No `brew link`: it fails when Homebrew's unversioned node is installed, and pf_use_node finds the keg anyway.
    label="Install Node $want with Homebrew" cmd="brew install node@$want"
  else
    label="Open the Node.js download page" cmd="pf_open https://nodejs.org/en/download"
  fi
  if ! command -v node >/dev/null; then
    pf_fail "Node.js is not installed" "Install Node $want (the version pinned in .github/workflows/mobile-release.yml)." "$label" "$cmd"
  elif ! found="$(node -p 'process.versions.node' 2>&1)"; then
    # Typically Homebrew's node after `brew upgrade` replaced a library it links (dyld: Library not loaded: ...icu4c...).
    pf_fail "$(command -v node) does not run: $(printf '%s' "$found" | head -1)" "Install Node $want; the script then uses it instead of the broken one\n(or repair that one, e.g. brew reinstall node)." "$label" "$cmd"
  elif [ "${found%%.*}" != "$want" ]; then
    pf_fail "Node $want required, found $found ($(command -v node))" "Install Node $want; the script finds it in Homebrew (node@$want), nvm, fnm, Volta, asdf, mise or n\nand uses it for the build without changing your default Node." "$label" "$cmd"
  else
    pf_ok "Node $found${pf_node_note:+ ($pf_node_note)}"
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
  local n i choice cmd
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
    # One fix per run: asking again after a fix ran read as if the choice had been ignored. A command that succeeded
    # is followed by a fresh run of the checks; a page or an app that opened needs the user, so the script stops.
    while true; do
      printf 'Pick a number to start it, or press Enter to exit: '
      IFS= read -r choice || { echo; break; }
      [ -n "$choice" ] || break
      if ! [[ "$choice" =~ ^[0-9]+$ ]] || [ "$choice" -lt 1 ] || [ "$choice" -gt "$n" ]; then
        echo "  Pick a number from 1 to $n, or press Enter to exit."
        continue
      fi
      cmd="${pf_action_commands[choice - 1]}"
      echo "${pf_dim}→ $cmd${pf_reset}"
      if ! eval "$cmd"; then
        echo "  ${pf_yellow}That command failed; see its output above.${pf_reset}"
      elif [[ "$cmd" == pf_open* ]]; then
        echo "  Finish it there, then run the script again."
      elif [ -n "${pf_rerun+set}" ]; then
        echo
        echo "${pf_bold}→ Running the checks again${pf_reset}"
        exec bash "${pf_rerun[@]}"
      fi
      break
    done
  fi
  exit 1
}

# Arrow-key menu (up/down or j/k, Enter; q quits); stores the selected index in `choice`.
pf_pick() {
  local -a items=("$@")
  local n=${#items[@]} cur=0 key rest i
  tput civis 2>/dev/null || true
  trap 'tput cnorm 2>/dev/null || true' EXIT
  while true; do
    for ((i = 0; i < n; i++)); do
      if [ "$i" -eq "$cur" ]; then
        printf '\033[2K  %s❯ %s%s\n' "$pf_bold" "${items[i]}" "$pf_reset"
      else
        printf '\033[2K    %s\n' "${items[i]}"
      fi
    done
    IFS= read -rsn1 key
    if [ "$key" = $'\033' ]; then
      read -rsn2 -t 1 rest || true
      key="$key$rest"
    fi
    case "$key" in
      $'\033[A' | k) cur=$(((cur - 1 + n) % n)) ;;
      $'\033[B' | j) cur=$(((cur + 1) % n)) ;;
      '') choice=$cur; tput cnorm 2>/dev/null || true; return 0 ;;
      q | Q) echo; exit 130 ;;
    esac
    printf '\033[%dA' "$n"
  done
}
