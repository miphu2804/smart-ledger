#!/usr/bin/env bash
# Build a Release of the mobile app (frontend/mobile) from the current checkout, against staging Core, and install it on
# the iOS Simulator (the default) or on a real iPhone paired with this Mac (cable or Wi-Fi), for quick testing.
#
#   ./scripts/release/ios-device-release.sh                  pick the target from a menu: the iOS Simulator (preselected, Enter)
#                                                    or a paired iPhone (up/down or j/k, Enter; q to quit)
#   ./scripts/release/ios-device-release.sh --simulator      the iOS Simulator without the menu (a booted iPhone, else the newest)
#   ./scripts/release/ios-device-release.sh --device <id>    skip the menu: UDID or name of a paired iPhone or of a simulator
#   ./scripts/release/ios-device-release.sh --clean          regenerate ios/ from app.json first (after native config changes)
#   ./scripts/release/ios-device-release.sh --check          only run the preflight checks
#   ./scripts/release/ios-device-release.sh --skip-preflight build even if a check fails
#
# Before building it checks the Mac (Xcode, its first-launch setup, CocoaPods, Node, the Firebase file), then the
# target: for the Simulator an installed iOS runtime; for an iPhone an Apple ID and a signing certificate in Xcode,
# Developer Mode, the iOS version against the Xcode SDK and a provisioning profile that can sign the app for it. On a
# fresh Mac it lists everything missing and, in a terminal, offers to open the App Store, Xcode, the Firebase Console or
# run the fixing command. When another Node than the pinned one is first on PATH, it uses the pinned one if installed.
# The Release build embeds the JS bundle, so the app runs without Metro. Mocks are always off (real Firebase and Core);
# Core defaults to staging and can be overridden with EXPO_PUBLIC_API_ENDPOINT in .env or the shell. To build another
# branch, git checkout it first.
set -euo pipefail

# pf_finish runs the script again with these arguments after a fix it started has succeeded.
pf_rerun=("$(cd "$(dirname "$0")" && pwd)/$(basename "$0")" "$@")
device=""
simulator=false
clean=false
preflight=true
check_only=false
while [ $# -gt 0 ]; do
  case "$1" in
    -d | --device) device="${2:?--device needs a value}"; shift 2 ;;
    -s | --simulator) simulator=true; shift ;;
    --clean) clean=true; shift ;;
    --check) check_only=true; shift ;;
    --skip-preflight) preflight=false; shift ;;
    -h | --help) sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $1 (see --help)" >&2; exit 2 ;;
  esac
done
if $simulator && [ -n "$device" ]; then
  echo "Pass --simulator or --device, not both (--device also takes a simulator's name or UDID)." >&2
  exit 2
fi

root="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=lib/preflight.sh
. "$root/scripts/release/lib/preflight.sh"
cd "$root/frontend/mobile"

bold="$pf_bold" dim="$pf_dim" cyan=$'\033[36m' yellow="$pf_yellow" red="$pf_red" reset="$pf_reset"
[ -t 1 ] || cyan=""
die() {
  echo "${red}✗ $*${reset}" >&2
  exit 1
}
checks=false
if $preflight || $check_only; then checks=true; fi
has_brew() { command -v brew >/dev/null; }

[ "$(uname -s)" = Darwin ] || die "iOS builds need macOS with Xcode."

xcode_app_store="macappstore://apps.apple.com/app/xcode/id497799835"
min_xcode=15 # xcrun devicectl, used to list and install on iPhones, arrived in Xcode 15
node_major="$(sed -n 's/^  NODE_MAJOR: *"\{0,1\}\([0-9]*\)"\{0,1\} *$/\1/p' "$root/.github/workflows/mobile-release.yml")"
# Put the pinned Node first on PATH when another one is (also with --skip-preflight, so the build uses it).
pf_use_node "$node_major"
bundle="$(sed -n 's/.*"bundleIdentifier": *"\([^"]*\)".*/\1/p' app.json | head -1)"
firebase_project="$(sed -n 's/^EXPO_PUBLIC_FIREBASE_PROJECT_ID=//p' .env 2>/dev/null | tail -1 || true)"
firebase_url="https://console.firebase.google.com/${firebase_project:+project/$firebase_project/settings/general}"

# One line per team signed in to Xcode: teamID<TAB>name<TAB>free|paid. Newer Xcode keeps them under
# IDEProvisioningTeamByIdentifier, older under IDEProvisioningTeams. Returns 1 when no Apple ID is signed in, 2 when
# the list exists but cannot be read.
xcode_teams() {
  local key json
  for key in IDEProvisioningTeamByIdentifier IDEProvisioningTeams; do
    defaults read com.apple.dt.Xcode "$key" >/dev/null 2>&1 || continue
    json="$(defaults export com.apple.dt.Xcode - 2>/dev/null | plutil -extract "$key" json -o - - 2>/dev/null)" || return 2
    node -e '
      const seen = new Set();
      for (const list of Object.values(JSON.parse(process.argv[1]))) {
        for (const t of [].concat(list)) {
          if (!t || !t.teamID || seen.has(t.teamID)) continue;
          seen.add(t.teamID);
          console.log([t.teamID, t.teamName || "?", t.isFreeProvisioningTeam ? "free" : "paid"].join("\t"));
        }
      }' "$json" || return 2
    return 0
  done
  return 1
}

check_mac() {
  local selected="" xcode_dir="" version="" major=""

  pf_section "Mac and Xcode"
  selected="$(xcode-select -p 2>/dev/null || true)"
  xcode_dir="$(ls -d /Applications/Xcode*.app 2>/dev/null | head -1 || true)"
  case "$selected" in
    *.app/Contents/Developer)
      version="$(xcodebuild -version 2>/dev/null | sed -n 's/^Xcode \([0-9.]*\).*/\1/p' | head -1)"
      major="${version%%.*}"
      if [ -z "$version" ]; then
        pf_fail "Xcode at $selected does not run" "Open Xcode once, accept the license and let it install its components." \
          "Accept the Xcode license and install its components (asks for your password)" "sudo xcodebuild -license accept && sudo xcodebuild -runFirstLaunch"
      elif [ "$major" -lt "$min_xcode" ]; then
        pf_fail "Xcode $version is too old (need $min_xcode or newer)" "Update Xcode from the App Store." \
          "Open Xcode in the App Store" "pf_open '$xcode_app_store'"
      else
        pf_ok "Xcode $version ($selected)"
        if xcodebuild -checkFirstLaunchStatus >/dev/null 2>&1; then
          pf_ok "Xcode first-launch setup done (license, system components)"
        else
          pf_fail "Xcode has not finished its first-launch setup (license, system components)" "Accept the license and install the components, or open Xcode once and follow its prompts." \
            "Accept the Xcode license and install its components (asks for your password)" "sudo xcodebuild -license accept && sudo xcodebuild -runFirstLaunch"
        fi
      fi
      ;;
    *)
      if [ -n "$xcode_dir" ]; then
        pf_fail "The active developer directory is ${selected:-not set}, not Xcode" "Point the command line tools at $xcode_dir." \
          "Select $xcode_dir as the active developer directory (asks for your password)" "sudo xcode-select -s '$xcode_dir/Contents/Developer'"
      else
        pf_fail "Xcode is not installed" "Install Xcode from the App Store (about 10 GB), open it once and accept the license.\nThe Command Line Tools alone cannot build iOS apps." \
          "Open Xcode in the App Store" "pf_open '$xcode_app_store'"
      fi
      ;;
  esac

  if command -v pod >/dev/null; then
    pf_ok "CocoaPods $(pod --version 2>/dev/null || echo '?')"
  elif has_brew; then
    pf_fail "CocoaPods is not installed" "expo prebuild runs pod install for the native iOS libraries." \
      "Install CocoaPods with Homebrew" "brew install cocoapods"
  else
    pf_fail "CocoaPods is not installed" "expo prebuild runs pod install for the native iOS libraries. Install Homebrew (https://brew.sh),\nthen brew install cocoapods." \
      "Open the Homebrew install page" "pf_open https://brew.sh"
  fi

  pf_check_node "$node_major"

  pf_section "Project files"
  if [ -f GoogleService-Info.plist ]; then
    pf_ok "Firebase config: frontend/mobile/GoogleService-Info.plist"
  else
    pf_fail "frontend/mobile/GoogleService-Info.plist is missing" "Firebase Console › Project settings › Your apps › iOS app $bundle › download GoogleService-Info.plist\ninto frontend/mobile/ (it is gitignored)." \
      "Open the Firebase Console" "pf_open '$firebase_url'"
  fi
  if [ -f .env ]; then
    pf_ok "frontend/mobile/.env"
  else
    pf_warn "No frontend/mobile/.env" "Copy .env.example to .env and fill it in; without it the Firebase web keys and the speech model URL are empty."
  fi
  if [ -z "${EXPO_PUBLIC_STT_MODEL_URL:-}$(sed -n 's/^EXPO_PUBLIC_STT_MODEL_URL=//p' .env 2>/dev/null | tail -1 || true)" ]; then
    pf_warn "EXPO_PUBLIC_STT_MODEL_URL is not set" "Voice ordering cannot download its speech model in this build."
  fi
}

# An iPhone build is signed; the Simulator build is not.
check_signing() {
  local teams="" status=0
  pf_section "Apple ID and signing certificate"
  teams="$(xcode_teams)" || status=$?
  if [ "$status" -eq 1 ] || { [ "$status" -eq 0 ] && [ -z "$teams" ]; }; then
    pf_fail "No Apple ID is signed in to Xcode" "Xcode › Settings › Accounts › + › Apple ID. Use an Apple ID that belongs to the team that owns $bundle;\na free Personal Team cannot sign a bundle ID that another team registered." \
      "Open Xcode (then Settings › Accounts)" "pf_open -a Xcode"
  elif [ "$status" -eq 2 ]; then
    pf_warn "Could not read the teams signed in to Xcode" "Check Xcode › Settings › Accounts yourself."
  else
    while IFS=$'\t' read -r id name kind; do
      if [ "$kind" = free ]; then pf_ok "Team $name ($id), free Personal Team"; else pf_ok "Team $name ($id)"; fi
    done <<<"$teams"
  fi
  if security find-identity -v -p codesigning 2>/dev/null | grep -q '"Apple Development'; then
    pf_ok "Apple Development certificate in the keychain"
  else
    pf_fail "No Apple Development certificate in the keychain" "Xcode › Settings › Accounts › select your Apple ID › Manage Certificates › + › Apple Development." \
      "Open Xcode (then Settings › Accounts › Manage Certificates)" "pf_open -a Xcode"
  fi
}

# One line per iPhone or iPad this Mac sees: udid<TAB>name<TAB>model<TAB>iOS<TAB>connection<TAB>developer mode<TAB>pairing
# state ("paired" once the user tapped Trust).
# xcodebuild needs hardwareProperties.udid, not the CoreDevice identifier.
list_devices() {
  local json
  json="$(mktemp)"
  xcrun devicectl list devices --quiet --json-output "$json" >/dev/null 2>&1 || { rm -f "$json"; return 1; }
  node -e '
    const { result } = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    for (const d of result.devices) {
      const hw = d.hardwareProperties, conn = d.connectionProperties, dp = d.deviceProperties;
      if (hw.platform !== "iOS" || hw.reality !== "physical") continue;
      const via = conn.transportType === "wired" ? "cable" : "Wi-Fi";
      console.log([hw.udid || d.identifier, dp.name, hw.marketingName, dp.osVersionNumber || "?", via,
        dp.developerModeStatus || "unknown", conn.pairingState || "unknown"].join("\t"));
    }' "$json"
  rm -f "$json"
}

# One line per available iPhone simulator, newest iOS runtime first: udid<TAB>name<TAB>iOS<TAB>state (Booted or Shutdown).
list_simulators() {
  local json
  json="$(mktemp)"
  xcrun simctl list devices available --json >"$json" 2>/dev/null || { rm -f "$json"; return 1; }
  node -e '
    const { devices } = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    const ver = (k) => (k.match(/\.iOS-([0-9-]+)$/) || [])[1];
    const rows = [];
    for (const [runtime, list] of Object.entries(devices)) {
      const v = ver(runtime);
      if (!v) continue;
      for (const d of list) {
        if (d.isAvailable === false || !/iPhone/.test(d.deviceTypeIdentifier || d.name)) continue;
        rows.push({ d, v: v.replace(/-/g, "."), n: v.split("-").map(Number) });
      }
    }
    rows.sort((a, b) => b.n[0] - a.n[0] || (b.n[1] || 0) - (a.n[1] || 0) || (b.n[2] || 0) - (a.n[2] || 0));
    for (const { d, v } of rows) console.log([d.udid, d.name, v, d.state].join("\t"));' "$json"
  rm -f "$json"
}

no_iphone_fix="Connect the iPhone by cable, unlock it and tap Trust. The first time, also open Xcode › Window ›\nDevices and Simulators so Xcode pairs with the iPhone and prepares it for development."

# The chosen iPhone (its line from list_devices) and the profile that can sign the app for it.
check_iphone() {
  local line="$1" udid="" name="" model="" ios="" via="" devmode="" pairing="" sdk="" pbx="" team="" teams="" kind="" ws="" now=""
  local f plist appid pteam exp pname devices seen="" ok="" fix=""
  IFS=$'\t' read -r udid name model ios via devmode pairing <<<"$line"

  pf_section "iPhone"
  pf_ok "$name ($model, iOS $ios, $via)"
  case "$devmode" in
    enabled) pf_ok "Developer Mode on" ;;
    disabled)
      pf_fail "Developer Mode is off on $name" "On the iPhone: Settings › Privacy & Security › Developer Mode › On, restart, then confirm Turn On.\nThe switch only appears after the iPhone has been connected to Xcode once." \
        "Open Xcode (then Window › Devices and Simulators)" "pf_open -a Xcode"
      ;;
    *) pf_warn "Could not read Developer Mode on $name" "If the install fails, check iPhone › Settings › Privacy & Security › Developer Mode." ;;
  esac
  sdk="$(xcrun --sdk iphoneos --show-sdk-version 2>/dev/null || true)"
  if [ -n "$sdk" ] && [ -n "$ios" ] && [ "${ios%%.*}" -gt "${sdk%%.*}" ]; then
    pf_fail "$name runs iOS $ios but this Xcode only has the iOS $sdk SDK" "Update Xcode to a version that supports iOS ${ios%%.*}." \
      "Open Xcode in the App Store" "pf_open '$xcode_app_store'"
  elif [ -n "$sdk" ]; then
    pf_ok "Xcode iOS SDK $sdk covers iOS $ios"
  fi

  # Signing. `expo run:ios` does not let Xcode create profiles (no -allowProvisioningUpdates), so the build only signs
  # when this Mac already holds a valid profile for the app's bundle ID, from the project's team, that lists this
  # iPhone. Without one, xcodebuild fails after bundling with "No profiles for '<bundle>' were found".
  pf_section "Provisioning profile for $bundle"
  pbx="$(ls ios/*.xcodeproj/project.pbxproj 2>/dev/null | head -1 || true)"
  ws="$(ls -d ios/*.xcworkspace 2>/dev/null | head -1 || true)"
  team=""
  [ -z "$pbx" ] || team="$(sed -n 's/.*DEVELOPMENT_TEAM = \([A-Z0-9]*\);.*/\1/p' "$pbx" | head -1)"
  teams="$(xcode_teams 2>/dev/null || true)"
  if [ -z "$pbx" ]; then
    pf_warn "No ios/ project yet, so the profile cannot be checked" "Run the script without --check: it generates ios/ first, then checks the profile before building."
  elif [ -z "$team" ]; then
    pf_warn "No signing team in the iOS project yet" "Pick one in the workspace › target › Signing & Capabilities, or set ios.appleTeamId in app.json and run with --clean."
  else
    kind="$(printf '%s\n' "$teams" | awk -F'\t' -v t="$team" '$1 == t { print $3 }')"
    case "$kind" in
      free) pf_ok "Project team $team (free Personal Team)" ;;
      paid) pf_ok "Project team $team" ;;
      *)
        pf_fail "Project team $team is not signed in to Xcode" "Sign in to Xcode with an Apple ID of that team, or pick a signed-in team in the project's Signing & Capabilities." \
          "Open Xcode (then Settings › Accounts)" "pf_open -a Xcode"
        ;;
    esac
  fi

  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  for f in "$HOME/Library/MobileDevice/Provisioning Profiles"/*.mobileprovision \
    "$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"/*.mobileprovision; do
    [ -f "$f" ] || continue
    plist="$(security cms -D -i "$f" 2>/dev/null)" || continue
    appid="$(plutil -extract Entitlements.application-identifier raw -o - - <<<"$plist" 2>/dev/null || true)"
    pteam="$(plutil -extract TeamIdentifier.0 raw -o - - <<<"$plist" 2>/dev/null || true)"
    exp="$(plutil -extract ExpirationDate raw -o - - <<<"$plist" 2>/dev/null || true)"
    pname="$(plutil -extract Name raw -o - - <<<"$plist" 2>/dev/null || true)"
    # application-identifier is "<team prefix>.<bundle ID or wildcard>"; the unquoted pattern matches "*" wildcards.
    # shellcheck disable=SC2053
    [[ "$bundle" == ${appid#*.} ]] || continue
    [ -z "$team" ] || [ "$pteam" = "$team" ] || { seen="$seen\n- $pname: team $pteam, not the project team $team"; continue; }
    [[ "$exp" > "$now" ]] || { seen="$seen\n- $pname: expired $exp"; continue; }
    if [ "$(plutil -extract ProvisionsAllDevices raw -o - - <<<"$plist" 2>/dev/null || true)" != true ]; then
      devices="$(plutil -extract ProvisionedDevices json -o - - <<<"$plist" 2>/dev/null || true)"
      grep -qi "\"$udid\"" <<<"$devices" || { seen="$seen\n- $pname: does not list $name"; continue; }
    fi
    ok="$pname"
    break
  done

  if [ -z "$pbx" ]; then
    :
  elif [ -n "$ok" ]; then
    pf_ok "$ok"
  else
    fix="xcodebuild would stop with \"No profiles for '$bundle' were found\"."
    [ -z "$seen" ] || fix="$fix\nProfiles found but not usable:$seen"
    fix="$fix\nTo fix: open the workspace › target › Signing & Capabilities › pick the team that owns $bundle, keep\n\"Automatically manage signing\" on, connect $name and wait for Xcode to create the profile."
    [ "$kind" != free ] || fix="$fix\nTeam $team is a free Personal Team: it cannot get a profile for $bundle if another team registered\nthat bundle ID. Ask that team's admin to add your Apple ID, then sign in to Xcode with it."
    fix="$fix\n--clean regenerates ios/ and resets the team; set ios.appleTeamId in app.json to keep it."
    if [ -n "$ws" ]; then
      pf_fail "No provisioning profile can sign $bundle${team:+ (team $team)} for $name" "$fix" \
        "Open $ws in Xcode (Signing & Capabilities)" "pf_open '$ws'"
    else
      pf_fail "No provisioning profile can sign $bundle${team:+ (team $team)} for $name" "$fix" \
        "Open Xcode (then Settings › Accounts)" "pf_open -a Xcode"
    fi
  fi
}

# Show what is being built, and warn when uncommitted changes make the installed app differ from the commit.
branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
commit="$(git log -1 --format='%h %s' 2>/dev/null || echo '?')"
echo "${bold}Sổ Nghe Lời: iOS Release build (Simulator or iPhone)${reset}"
echo "  Branch: ${cyan}$branch${reset}"
echo "  Commit: $commit"
[ -z "$(git status --porcelain -- . 2>/dev/null)" ] || echo "  ${yellow}! Uncommitted changes in frontend/mobile are built into the app.${reset}"
# Device builds always use real Firebase and Core. Expo does not override shell variables with .env values, so the
# exported mock flags cannot be turned back on by .env.
export EXPO_PUBLIC_USE_MOCK=false EXPO_PUBLIC_MOCK_CORE=false EXPO_PUBLIC_MOCK_SHOPS=false
api="${EXPO_PUBLIC_API_ENDPOINT:-$(sed -n 's/^EXPO_PUBLIC_API_ENDPOINT=//p' .env 2>/dev/null | tail -1 || true)}"
export EXPO_PUBLIC_API_ENDPOINT="${api:-https://staging.103-162-31-93.sslip.io}"
echo "  Mode:   real (mocks off), Core ${cyan}$EXPO_PUBLIC_API_ENDPOINT${reset}"

if $checks; then
  check_mac
  pf_finish
fi

# Targets. Both lists need Xcode, so they are read after the Mac checks passed. The default simulator is a booted
# iPhone, else the first iPhone of the newest iOS runtime.
simulators="$(list_simulators || true)"
default_sim="$(printf '%s\n' "$simulators" | awk -F'\t' '$4 == "Booted"' | head -1)"
[ -n "$default_sim" ] || default_sim="$(printf '%s\n' "$simulators" | sed '/^$/d' | head -1)"
devicectl=true
all_devices="$(list_devices)" || { devicectl=false; all_devices=""; }
devices="$(printf '%s\n' "$all_devices" | awk -F'\t' '$7 == "paired"')"
untrusted="$(printf '%s\n' "$all_devices" | awk -F'\t' 'NF && $7 != "paired" { print $2 }' | paste -sd, - | sed 's/,/, /g')"

no_simulator() {
  pf_begin
  pf_section "iOS Simulator"
  pf_fail "No iPhone simulator with an iOS runtime is installed" "Xcode › Settings › Components › iOS: Get, or download it from the terminal (about 8 GB).\nFor a real iPhone instead, connect it, tap Trust and pass --device <name>." \
    "Download the iOS Simulator runtime" "xcodebuild -downloadPlatform iOS"
  pf_finish
}
no_iphone() {
  pf_begin
  pf_section "iPhone"
  if [ -n "$untrusted" ]; then
    pf_fail "$untrusted is connected but has not trusted this Mac" "Unlock the iPhone, tap Trust on the \"Trust This Computer?\" prompt and enter the passcode. No prompt: unplug and\nplug the cable back in, or open Xcode › Window › Devices and Simulators." \
      "Open Xcode (then Window › Devices and Simulators)" "pf_open -a Xcode"
  elif ! $devicectl; then
    pf_fail "Could not list iPhones (xcrun devicectl)" "Open Xcode once so it finishes installing its components." "Open Xcode" "pf_open -a Xcode"
  else
    pf_fail "No iPhone is connected to this Mac" "$no_iphone_fix" "Open Xcode (then Window › Devices and Simulators)" "pf_open -a Xcode"
  fi
  pf_finish
}

# kind is "simulator" or "iphone"; target_line is the target's line from list_simulators or list_devices.
kind="" target_line=""
if $simulator; then
  [ -n "$default_sim" ] || no_simulator
  kind=simulator target_line="$default_sim"
elif [ -n "$device" ]; then
  target_line="$(printf '%s\n' "$devices" | awk -F'\t' -v d="$device" '$1 == d || $2 == d' | head -1)"
  if [ -n "$target_line" ]; then
    kind=iphone
  else
    target_line="$(printf '%s\n' "$simulators" | awk -F'\t' -v d="$device" '$1 == d || $2 == d' | head -1)"
    [ -n "$target_line" ] && kind=simulator
  fi
  if [ -z "$kind" ]; then
    if printf '%s\n' "$all_devices" | awk -F'\t' -v d="$device" '$1 == d || $2 == d' | grep -q .; then
      untrusted="$device"
      no_iphone
    fi
    die "$device is neither a paired iPhone nor an available simulator. Paired iPhones: $(printf '%s\n' "$devices" | sed '/^$/d' | cut -f2 | paste -sd, - | sed 's/,/, /g; s/^$/none/'). Simulators: xcrun simctl list devices available."
  fi
else
  ids=() kinds=() labels=()
  if [ -n "$default_sim" ]; then
    IFS=$'\t' read -r udid name os state <<<"$default_sim"
    ids+=("$udid") kinds+=(simulator)
    labels+=("iOS Simulator: $name  ${dim}iOS $os · ${state} · default${reset}")
  fi
  while IFS=$'\t' read -r udid name model os via _; do
    [ -n "$udid" ] || continue
    ids+=("$udid") kinds+=(iphone)
    labels+=("$name  ${dim}$model · iOS $os · $via${reset}")
  done <<<"$devices"
  if [ "${#ids[@]}" -eq 0 ]; then
    no_simulator
  fi
  choice=0
  if [ "${#ids[@]}" -gt 1 ]; then
    [ -t 0 ] || [ "${kinds[0]}" = simulator ] || die "No terminal to show the menu: pass --device <UDID> or --simulator."
    if [ -t 0 ]; then
      echo
      if [ "${kinds[0]}" = simulator ]; then echo "Install on (Enter keeps the iOS Simulator):"; else echo "Pick the iPhone:"; fi
      pf_pick "${labels[@]}"
    fi
  fi
  kind="${kinds[choice]}"
  if [ "$kind" = simulator ]; then
    target_line="$default_sim"
  else
    target_line="$(printf '%s\n' "$devices" | awk -F'\t' -v d="${ids[choice]}" '$1 == d' | head -1)"
  fi
fi
device="$(printf '%s' "$target_line" | cut -f1)"
[ -z "$untrusted" ] || [ "$kind" != iphone ] || echo "  ${yellow}! Also connected but not trusting this Mac: $untrusted${reset}"
if [ "$kind" = simulator ]; then
  echo "  Target: ${cyan}iOS Simulator, $(printf '%s' "$target_line" | cut -f2) (iOS $(printf '%s' "$target_line" | cut -f3))${reset}"
else
  echo "  Target: ${cyan}iPhone $(printf '%s' "$target_line" | cut -f2)${reset}"
fi

if ! $check_only; then
  pf_npm_install
  if $clean; then
    echo "${bold}→ expo prebuild --clean (regenerates ios/)${reset}"
    npx expo prebuild --platform ios --clean
  elif [ ! -d ios ]; then
    # A fresh clone has no ios/ yet; generate it now so the profile check sees the project's signing team and the
    # Node path below lands in the project.
    echo "${bold}→ expo prebuild (generates ios/)${reset}"
    npx expo prebuild --platform ios
  fi
  # Xcode's "Bundle React Native code and images" phase runs the node named in ios/.xcode.env.local, which prebuild
  # wrote once. After a Node upgrade or an nvm switch that path is gone or another major, and the build fails late.
  if [ -d ios ]; then
    printf 'export NODE_BINARY=%q\n' "$(command -v node)" >ios/.xcode.env.local
  fi
fi

if $checks && [ "$kind" = iphone ]; then
  pf_begin
  check_signing
  check_iphone "$target_line"
  pf_finish
fi
$check_only && exit 0

echo
if [ "$kind" = simulator ]; then
  echo "${bold}→ Build Release and install on the iOS Simulator ($(printf '%s' "$target_line" | cut -f2))${reset}"
  # Boot it and bring Simulator.app up first, so the app appears there when the build finishes.
  xcrun simctl boot "$device" 2>/dev/null || true
  open -a Simulator --args -CurrentDeviceUDID "$device" 2>/dev/null || true
else
  echo "${bold}→ Build Release and install on $device${reset}"
  echo "  ${dim}Keep the iPhone unlocked when the build finishes so the app opens; a locked iPhone still gets the app but reports an error on launch.${reset}"
fi
npx expo run:ios --device "$device" --configuration Release --no-bundler
