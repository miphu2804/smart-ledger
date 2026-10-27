#!/usr/bin/env bash
# Build a Release of the Android app (frontend/mobile) from the current checkout and print where its size goes. The same
# script runs on a developer machine and in .github/workflows/mobile-release.yml, so a local build matches CI.
#
#   ./scripts/release/android-release.sh                         locally: APK for the emulator's ABI, installed and opened on an
#                                                        Android emulator (a running one, else it starts an AVD)
#   ./scripts/release/android-release.sh --emulator              the same, explicitly (also with --abis or --device emulator-5554)
#   ./scripts/release/android-release.sh --build-only            APK with the release ABIs (armeabi-v7a,arm64-v8a), no install;
#                                                        the default in GitHub Actions and with --aab or --out
#   ./scripts/release/android-release.sh --abis arm64-v8a        one ABI, faster (most phones)
#   ./scripts/release/android-release.sh --install               install the APK on a phone connected over adb (menu if several)
#   ./scripts/release/android-release.sh --install --device <serial>   pick the phone without the menu (serial from `adb devices`)
#   ./scripts/release/android-release.sh --aab                   Android App Bundle for Google Play instead of an APK
#   ./scripts/release/android-release.sh --out <file>            copy the APK or AAB to <file>
#   ./scripts/release/android-release.sh --check                 only run the preflight checks
#   ./scripts/release/android-release.sh --skip-preflight        build even if a check fails
#
# Before building it checks the machine (Node, JDK, Android SDK packages pinned at the top of mobile-release.yml, the
# Firebase file), then the target: for the emulator the Emulator package and an AVD (it offers to create one); for
# --install the phone (USB debugging allowed, an ABI this build contains, Android new enough, an older install signed
# with another key). In a terminal it offers to open or run the fix for what is missing. When another Node than the
# pinned one is first on PATH, it uses the pinned one if installed.
# Locally, like scripts/release/ios-device-release.sh: mocks are off (real Firebase and Core) and Core defaults to staging,
# overridable with EXPO_PUBLIC_API_ENDPOINT in .env or the shell. In GitHub Actions every EXPO_PUBLIC_* value comes from
# the environment as given. Signs with RELEASE_KEYSTORE, KEYSTORE_PASSWORD and RELEASE_KEY_ALIAS when RELEASE_KEYSTORE
# is set, otherwise with the template's public debug key.
set -euo pipefail

# pf_finish runs the script again with these arguments after a fix it started has succeeded.
pf_rerun=("$(cd "$(dirname "$0")" && pwd)/$(basename "$0")" "$@")
abis="armeabi-v7a,arm64-v8a"
abis_set=false
format=apk
target="" # build (no install), phone (--install) or emulator
out=""
serial=""
preflight=true
check_only=false
while [ $# -gt 0 ]; do
  case "$1" in
    --abis) abis="${2:?--abis needs a value}"; abis_set=true; shift 2 ;;
    --aab) format=aab; shift ;;
    --install) target=phone; shift ;;
    --emulator) target=emulator; shift ;;
    --build-only) target=build; shift ;;
    --device) serial="${2:?--device needs a value}"; shift 2 ;;
    --out) out="${2:?--out needs a value}"; shift 2 ;;
    --check) check_only=true; shift ;;
    --skip-preflight) preflight=false; shift ;;
    -h | --help) sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $1 (see --help)" >&2; exit 2 ;;
  esac
done
if [ -z "$target" ]; then
  if [ -n "$serial" ]; then
    target=phone
  elif [ "${GITHUB_ACTIONS:-}" = true ] || [ "$format" = aab ] || [ -n "$out" ]; then
    target=build
  else
    target=emulator
  fi
fi
install=false
[ "$target" = build ] || install=true
if $install && [ "$format" = aab ]; then
  echo "--install and --emulator work with an APK, not with --aab (add --build-only)." >&2
  exit 2
fi

root="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=lib/preflight.sh
. "$root/scripts/release/lib/preflight.sh"
cd "$root/frontend/mobile"
ci=false
pf_ci && ci=true
bold="$pf_bold" cyan=$'\033[36m' yellow="$pf_yellow" red="$pf_red" reset="$pf_reset"
[ -t 1 ] || cyan=""
die() {
  $ci && echo "::error::$*"
  echo "${red}✗ $*${reset}" >&2
  exit 1
}
# CI times each phase from these marks (TIMINGS, read by .github/scripts/android-summary.mjs).
mark() { [ -z "${TIMINGS:-}" ] || echo "$1=$(date +%s)" >>"$TIMINGS"; }
has_brew() { command -v brew >/dev/null; }

# Versions pinned in the workflow's top-level env: block, the single source for CI and laptops.
pinned() { sed -n "s/^  $1: *\"\{0,1\}\([^\" ]*\)\"\{0,1\} *$/\1/p" "$root/.github/workflows/mobile-release.yml"; }
node_major="$(pinned NODE_MAJOR)" java_major="$(pinned JAVA_MAJOR)" platform="$(pinned ANDROID_PLATFORM)"
build_tools="$(pinned ANDROID_BUILD_TOOLS)" ndk="$(pinned ANDROID_NDK)"
# Put the pinned Node first on PATH when another one is (also with --skip-preflight, so the build uses it).
pf_use_node "$node_major"

# JDK: JAVA_HOME, else the pinned major version if macOS has it installed (/usr/libexec/java_home), else the one bundled
# with Android Studio, else java on PATH. Android Studio bundles a newer JDK than the pinned one, so it comes last.
studio_app="/Applications/Android Studio.app"
studio_jbr="$studio_app/Contents/jbr/Contents/Home"
if [ -z "${JAVA_HOME:-}" ] && [ -x /usr/libexec/java_home ] && pinned_jdk="$(/usr/libexec/java_home -v "$java_major" 2>/dev/null)"; then
  export JAVA_HOME="$pinned_jdk"
elif [ -z "${JAVA_HOME:-}" ] && [ -d "$studio_jbr" ]; then
  export JAVA_HOME="$studio_jbr"
fi
java_bin="${JAVA_HOME:+$JAVA_HOME/bin/}java"

# SDK: ANDROID_HOME / ANDROID_SDK_ROOT, else the usual install folders (Android Studio, Homebrew), else the folder
# that holds adb or sdkmanager on PATH.
find_sdk() {
  local d tool
  for d in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}" "$HOME/Library/Android/sdk" "$HOME/Android/Sdk" \
    /opt/homebrew/share/android-commandlinetools /usr/local/share/android-commandlinetools; do
    [ -n "$d" ] && [ -d "$d/platforms" ] && { echo "$d"; return 0; }
  done
  for tool in adb sdkmanager; do
    tool="$(command -v "$tool" 2>/dev/null)" || continue
    d="$(cd "$(dirname "$(readlink -f "$tool" 2>/dev/null || echo "$tool")")/.." && pwd)"
    [ -d "$d/platforms" ] && { echo "$d"; return 0; }
    [ -d "$d/../platforms" ] && { (cd "$d/.." && pwd); return 0; }
  done
  return 1
}
sdk="$(find_sdk || true)"
[ -z "$sdk" ] || export ANDROID_HOME="$sdk"

app_id="$(sed -n 's/.*"package": *"\([^"]*\)".*/\1/p' app.json | head -1)"
# The lowest Android version the app runs on: React Native's minSdk unless app.json overrides it.
min_sdk="$(sed -n 's/.*"minSdkVersion": *\([0-9]*\).*/\1/p' app.json | head -1)"
[ -n "$min_sdk" ] || min_sdk="$(sed -n 's/^minSdk = "\([0-9]*\)"/\1/p' node_modules/react-native/gradle/libs.versions.toml 2>/dev/null || true)"
min_sdk="${min_sdk:-24}"

firebase_project="$(sed -n 's/^EXPO_PUBLIC_FIREBASE_PROJECT_ID=//p' .env 2>/dev/null | tail -1 || true)"
firebase_url="https://console.firebase.google.com/${firebase_project:+project/$firebase_project/settings/general}"

# The phone for --install: exactly one ready phone (or the --device / menu choice), allowed to debug, with an ABI this
# build contains and an Android version at or above minSdk. Sets `serial`.
check_phone() {
  local adb="${sdk:+$sdk/platform-tools/adb}" sm="" lines ready others serials labels line state model abilist api release
  pf_section "Phone (--install)"
  [ -z "$sdk" ] || sm="$(ls "$sdk"/cmdline-tools/*/bin/sdkmanager 2>/dev/null | head -1 || true)"
  if [ -z "$adb" ] || [ ! -x "$adb" ]; then
    if [ -n "$sm" ]; then
      pf_fail "adb not found" "It comes with the SDK's platform-tools package." \
        "Install platform-tools with sdkmanager" "yes | '$sm' --sdk_root='$sdk' platform-tools"
    else
      pf_fail "adb not found" "Install Platform-Tools in Android Studio › Settings › Android SDK › SDK Tools."
    fi
    return 0
  fi

  # `adb devices -l`: "<serial> <state> ... model:<model> ...", one line per phone or emulator.
  lines="$("$adb" devices -l 2>/dev/null | sed '1d;/^[[:space:]]*$/d' || true)"
  if [ -n "$serial" ]; then
    lines="$(printf '%s\n' "$lines" | awk -v s="$serial" '$1 == s')"
    [ -n "$lines" ] || { pf_fail "No phone with serial $serial (see adb devices)" ""; return 0; }
  fi
  ready="$(printf '%s\n' "$lines" | awk '$2 == "device"')"
  others="$(printf '%s\n' "$lines" | awk 'NF && $2 != "device"')"
  while read -r line; do
    [ -n "$line" ] || continue
    state="$(echo "$line" | awk '{ print $2 }')"
    case "$state" in
      unauthorized) pf_fail "$(echo "$line" | awk '{ print $1 }') has not allowed USB debugging from this computer" "Unlock the phone and tap Allow on the \"Allow USB debugging?\" prompt (tick \"Always allow\")." ;;
      offline) pf_fail "$(echo "$line" | awk '{ print $1 }') is offline" "Unplug and plug the cable back in, or restart adb." "Restart adb" "'$adb' kill-server && '$adb' start-server" ;;
      no) pf_fail "This computer has no permission to talk to $(echo "$line" | awk '{ print $1 }')" "On Linux add a udev rule for the phone's vendor (see developer.android.com/studio/run/device), then replug." ;;
      *) pf_warn "$(echo "$line" | awk '{ print $1 }') is $state" ;;
    esac
  done <<<"$others"
  if [ -z "$ready" ]; then
    [ -n "$others" ] || pf_fail "No Android phone found by adb" "Connect the phone by cable and turn on USB debugging: Settings › About phone › tap Build number 7 times,\nthen Settings › System › Developer options › USB debugging. Some phones also need the USB mode set to File transfer."
    return 0
  fi
  serials=() labels=()
  while read -r line; do
    serials+=("$(echo "$line" | awk '{ print $1 }')")
    model="$(echo "$line" | sed -n 's/.*model:\([^ ]*\).*/\1/p' | tr _ ' ')"
    labels+=("${model:-unknown model}  ${pf_dim}$(echo "$line" | awk '{ print $1 }')${pf_reset}")
  done <<<"$ready"
  if [ "${#serials[@]}" -eq 1 ]; then
    serial="${serials[0]}"
  elif [ -t 0 ] && [ -t 1 ] && ! $ci; then
    echo "  Several phones are connected; pick one:"
    pf_pick "${labels[@]}"
    serial="${serials[choice]}"
  else
    pf_fail "${#serials[@]} phones are connected" "Pick one with --device <serial>: ${serials[*]}"
    return 0
  fi

  # getprop answers with a trailing \r.
  model="$("$adb" -s "$serial" shell getprop ro.product.model 2>/dev/null | tr -d '\r')"
  release="$("$adb" -s "$serial" shell getprop ro.build.version.release 2>/dev/null | tr -d '\r')"
  api="$("$adb" -s "$serial" shell getprop ro.build.version.sdk 2>/dev/null | tr -d '\r')"
  abilist="$("$adb" -s "$serial" shell getprop ro.product.cpu.abilist 2>/dev/null | tr -d '\r')"
  pf_ok "${model:-Phone} ($serial), Android ${release:-?}"
  if [ -n "$api" ] && [ "$api" -lt "$min_sdk" ]; then
    pf_fail "${model:-The phone} runs Android API $api; the app needs API $min_sdk (Android 7.0) or newer" "Use a newer phone or emulator."
  fi
  if [ -n "$abilist" ]; then
    if printf '%s\n' "${abilist//,/$'\n'}" | grep -qxF -f <(printf '%s\n' "${abis//,/$'\n'}"); then
      pf_ok "ABI: the phone runs ${abilist%%,*}; this build has $abis"
    else
      pf_fail "${model:-The phone} runs $abilist, which this build ($abis) does not contain" "Build with --abis ${abilist%%,*}. Release builds carry armeabi-v7a and arm64-v8a only, so x86 emulators need an\narm64 emulator image (Apple Silicon) or --abis x86_64 for a local test build."
    fi
  fi
  if "$adb" -s "$serial" shell pm list packages "$app_id" 2>/dev/null | tr -d '\r' | grep -qx "package:$app_id"; then
    pf_warn "$app_id is already installed on ${model:-the phone}" "If that copy was signed with another key (e.g. the APK from the landing page), Android refuses the update:\nuninstall it first with: $adb -s $serial uninstall $app_id (deletes the app's data on the phone)."
  fi
}

# The emulator target: a running emulator (the --device serial, else the first one), else an AVD to start. Sets
# `serial` for a running one, `avd` for one to start, and `emu_abi`; without --abis the build carries only that ABI.
avd="" emu_abi=""
check_emulator() {
  local adb="${sdk:+$sdk/platform-tools/adb}" emu="${sdk:+$sdk/emulator/emulator}" sm="" avdm="" running names avds
  local line name host_abi image avd_home
  pf_section "Android emulator (the default target; --build-only builds without installing)"
  if [ -z "$sdk" ]; then
    pf_fail "No Android SDK, so no emulator" "Install the SDK first (see above)."
    return 0
  fi
  sm="$(ls "$sdk"/cmdline-tools/*/bin/sdkmanager 2>/dev/null | head -1 || true)"
  avdm="$(ls "$sdk"/cmdline-tools/*/bin/avdmanager 2>/dev/null | head -1 || true)"
  if [ ! -x "$adb" ] || [ ! -x "$emu" ]; then
    if [ -n "$sm" ]; then
      pf_fail "The Android Emulator or adb is not installed" "Both come as SDK packages (emulator, platform-tools)." \
        "Install the emulator and platform-tools with sdkmanager" "yes | '$sm' --sdk_root='$sdk' emulator platform-tools"
    else
      pf_fail "The Android Emulator or adb is not installed" "Android Studio › Settings › Android SDK › SDK Tools: tick Android Emulator and Android SDK Platform-Tools." \
        "Open Android Studio" "pf_open -a 'Android Studio'"
    fi
    return 0
  fi

  running="$("$adb" devices 2>/dev/null | awk '$1 ~ /^emulator-/ && $2 == "device" { print $1 }' || true)"
  if [ -n "$serial" ]; then
    if ! grep -qxF "$serial" <<<"$running"; then
      pf_fail "No running emulator $serial (see adb devices)" "Start it, or leave out --device to let the script start one."
      return 0
    fi
  elif [ -n "$running" ]; then
    serial="$(head -1 <<<"$running")"
  fi
  if [ -n "$serial" ]; then
    name="$("$adb" -s "$serial" emu avd name 2>/dev/null | head -1 | tr -d '\r' || true)"
    emu_abi="$("$adb" -s "$serial" shell getprop ro.product.cpu.abi 2>/dev/null | tr -d '\r' || true)"
    pf_ok "Running emulator ${name:-$serial} ($serial, ${emu_abi:-unknown ABI})"
  else
    # Recent emulators print INFO lines before the AVD names.
    avds="$("$emu" -list-avds 2>/dev/null | grep -v '^INFO' | sed '/^[[:space:]]*$/d' || true)"
    if [ -z "$avds" ]; then
      case "$(uname -m)" in arm64 | aarch64) host_abi=arm64-v8a ;; *) host_abi=x86_64 ;; esac
      image="system-images;android-$platform;google_apis;$host_abi"
      if [ -n "$sm" ] && [ -n "$avdm" ]; then
        pf_fail "No Android Virtual Device (AVD) exists" "Create one in Android Studio › Device Manager, or let the script create SmartLedger_API_$platform\n(downloads the $image system image, about 1.5 GB)." \
          "Create the SmartLedger_API_$platform emulator with sdkmanager and avdmanager" \
          "yes | '$sm' --sdk_root='$sdk' emulator '$image' && echo no | '$avdm' create avd -n SmartLedger_API_$platform -k '$image' -d pixel_7"
      else
        pf_fail "No Android Virtual Device (AVD) exists" "Android Studio › Device Manager › Create Virtual Device (a Pixel with a recent system image)." \
          "Open Android Studio" "pf_open -a 'Android Studio'"
      fi
      return 0
    fi
    names=()
    while IFS= read -r line; do names+=("$line"); done <<<"$avds"
    avd="${names[0]}"
    if [ "${#names[@]}" -gt 1 ] && [ -t 0 ] && [ -t 1 ] && ! $ci; then
      echo "  Several emulators exist; pick one to start:"
      pf_pick "${names[@]}"
      avd="${names[choice]}"
    fi
    avd_home="${ANDROID_AVD_HOME:-${ANDROID_USER_HOME:-$HOME/.android}/avd}"
    emu_abi="$(sed -n 's/^abi\.type *= *//p' "$avd_home/$avd.avd/config.ini" 2>/dev/null | head -1 | tr -d '\r' || true)"
    pf_ok "Emulator $avd (${emu_abi:-unknown ABI}); it starts in the background before the build"
  fi
  if ! $abis_set && [ -n "$emu_abi" ]; then
    abis="$emu_abi"
  elif [ -n "$emu_abi" ] && ! printf '%s\n' "${abis//,/$'\n'}" | grep -qxF "$emu_abi"; then
    pf_fail "The emulator runs $emu_abi, which this build ($abis) does not contain" "Leave out --abis, or add $emu_abi to it."
  fi
}

run_checks() {
  local java_found major what sm="" missing pkgs

  pf_section "Toolchain (pinned in .github/workflows/mobile-release.yml)"
  pf_check_node "$node_major"

  # `java -version` prints to stderr, e.g. `openjdk version "17.0.20" ...`.
  java_found="$("$java_bin" -version 2>&1 || true)"
  major="$(printf '%s' "$java_found" | sed -n 's/.*version "\(1\.\)\{0,1\}\([0-9]*\).*/\2/p' | head -1)"
  if [ "$major" = "$java_major" ]; then
    pf_ok "JDK $major ($java_bin)"
  else
    what="JDK $java_major is not installed"
    [ -z "$major" ] || what="JDK $java_major required, found JDK $major ($java_bin)"
    if has_brew; then
      pf_fail "$what" "Install JDK $java_major (Temurin); the script finds it through /usr/libexec/java_home." \
        "Install JDK $java_major (Temurin) with Homebrew" "brew install --cask temurin@$java_major"
    else
      pf_fail "$what" "Install JDK $java_major and set JAVA_HOME to it." \
        "Open the Temurin $java_major download page" "pf_open 'https://adoptium.net/temurin/releases/?version=$java_major'"
    fi
  fi

  if [ -z "$sdk" ]; then
    if [ -d "$studio_app" ]; then
      pf_fail "Android SDK not found" "Open Android Studio once and finish the setup wizard (it installs the SDK in ~/Library/Android/sdk),\nor set ANDROID_HOME to an existing SDK." \
        "Open Android Studio" "pf_open -a 'Android Studio'"
    elif has_brew; then
      pf_fail "Android Studio and the Android SDK are not installed" "Install Android Studio, open it once and finish the setup wizard." \
        "Install Android Studio with Homebrew" "brew install --cask android-studio && open -a 'Android Studio'"
    else
      pf_fail "Android Studio and the Android SDK are not installed" "Install Android Studio, open it once and finish the setup wizard." \
        "Open the Android Studio download page" "pf_open https://developer.android.com/studio"
    fi
  else
    pf_ok "Android SDK at $sdk"
    sm="$(ls "$sdk"/cmdline-tools/*/bin/sdkmanager 2>/dev/null | head -1 || true)"
    missing="" pkgs=""
    [ -d "$sdk/platforms/android-$platform" ] || { missing="$missing platform android-$platform,"; pkgs="$pkgs 'platforms;android-$platform'"; }
    [ -d "$sdk/build-tools/$build_tools" ] || { missing="$missing build-tools $build_tools,"; pkgs="$pkgs 'build-tools;$build_tools'"; }
    [ -d "$sdk/ndk/$ndk" ] || { missing="$missing NDK $ndk,"; pkgs="$pkgs 'ndk;$ndk'"; }
    if [ -z "$missing" ]; then
      pf_ok "SDK platform $platform, build-tools $build_tools, NDK $ndk"
    elif [ -n "$sm" ]; then
      pf_fail "Missing SDK packages:${missing%,}" "Install them with sdkmanager (the NDK is about 1 GB)." \
        "Install the missing SDK packages with sdkmanager" "yes | '$sm' --sdk_root='$sdk'$pkgs"
    else
      pf_fail "Missing SDK packages:${missing%,}" "Android Studio › Settings › Languages & Frameworks › Android SDK: tick them under SDK Platforms and,\nwith \"Show Package Details\" on, under SDK Tools (NDK (Side by side))." \
        "Open Android Studio" "pf_open -a 'Android Studio'"
    fi
  fi

  pf_section "Project files"
  if [ -n "${GOOGLE_SERVICES_JSON:-}" ]; then
    if [ -f "$GOOGLE_SERVICES_JSON" ]; then
      pf_ok "Firebase config: $GOOGLE_SERVICES_JSON"
    else
      pf_fail "GOOGLE_SERVICES_JSON points to a missing file: $GOOGLE_SERVICES_JSON" ""
    fi
  elif [ -f google-services.json ]; then
    pf_ok "Firebase config: frontend/mobile/google-services.json"
  else
    pf_fail "frontend/mobile/google-services.json is missing" "Firebase Console › Project settings › Your apps › Android app vn.teamhexa.songheloi › download\ngoogle-services.json into frontend/mobile/ (it is gitignored)." \
      "Open the Firebase Console" "pf_open '$firebase_url'"
  fi
  if ! $ci; then
    if [ -f .env ]; then
      pf_ok "frontend/mobile/.env"
    else
      pf_warn "No frontend/mobile/.env" "Copy .env.example to .env and fill it in; without it the Firebase web keys and the speech model URL are empty."
    fi
    if [ -z "${EXPO_PUBLIC_STT_MODEL_URL:-}$(sed -n 's/^EXPO_PUBLIC_STT_MODEL_URL=//p' .env 2>/dev/null | tail -1 || true)" ]; then
      pf_warn "EXPO_PUBLIC_STT_MODEL_URL is not set" "Voice ordering cannot download its speech model in this build (see frontend/mobile/assets/models/README.md)."
    fi
  fi
  if [ -z "${RELEASE_KEYSTORE:-}" ]; then
    pf_ok "Signing with the template's debug key (fine for testing, never for publishing)"
  elif [ ! -f "$RELEASE_KEYSTORE" ]; then
    pf_fail "RELEASE_KEYSTORE points to a missing file: $RELEASE_KEYSTORE" ""
  elif [ -z "${KEYSTORE_PASSWORD:-}" ]; then
    pf_fail "RELEASE_KEYSTORE is set but KEYSTORE_PASSWORD is empty" ""
  else
    pf_ok "Signing with the release keystore $RELEASE_KEYSTORE"
  fi

  if [ "$target" = phone ]; then
    check_phone
  elif [ "$target" = emulator ]; then
    check_emulator
  fi
}

branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
commit="$(git log -1 --format='%h %s' 2>/dev/null || echo '?')"
echo "${bold}Sổ Nghe Lời: Android Release build${reset}"
echo "  Branch: ${cyan}$branch${reset}"
echo "  Commit: $commit"
case "$target" in
  emulator) echo "  Output: ${cyan}$format${reset}, installed and opened on an ${cyan}Android emulator${reset} (--build-only to skip)" ;;
  phone) echo "  Output: ${cyan}$format${reset}, installed on a connected phone" ;;
  *) echo "  Output: ${cyan}$format${reset}, ABIs ${cyan}$abis${reset}" ;;
esac
[ -z "$(git status --porcelain -- . 2>/dev/null)" ] || echo "  ${yellow}! Uncommitted changes in frontend/mobile are built into the app.${reset}"

if $preflight || $check_only; then
  run_checks
  pf_finish
elif [ "$target" = emulator ]; then
  # Without an emulator there is nothing to install on, so this part is checked even with --skip-preflight.
  pf_begin
  check_emulator
  pf_finish
fi
$check_only && exit 0
[ -n "$sdk" ] || die "No Android SDK found; set ANDROID_HOME."

signing=()
if [ -n "${RELEASE_KEYSTORE:-}" ]; then
  # `expo prebuild --clean` rewrites build.gradle on every run, so the keystore goes through the Android Gradle
  # plugin's injected signing properties, which override the signing config of the built variant. The keystore is
  # PKCS12, so the key shares the store password.
  signing=(
    "-Pandroid.injected.signing.store.file=$RELEASE_KEYSTORE"
    "-Pandroid.injected.signing.store.password=${KEYSTORE_PASSWORD:-}"
    "-Pandroid.injected.signing.key.alias=${RELEASE_KEY_ALIAS:-smart-ledger}"
    "-Pandroid.injected.signing.key.password=${KEYSTORE_PASSWORD:-}"
  )
fi

if ! $ci; then
  # Expo does not override shell variables with .env values, so the exported mock flags cannot be turned back on by .env.
  export EXPO_PUBLIC_USE_MOCK=false EXPO_PUBLIC_MOCK_CORE=false EXPO_PUBLIC_MOCK_SHOPS=false
  api="${EXPO_PUBLIC_API_ENDPOINT:-$(sed -n 's/^EXPO_PUBLIC_API_ENDPOINT=//p' .env 2>/dev/null | tail -1 || true)}"
  export EXPO_PUBLIC_API_ENDPOINT="${api:-https://103-162-31-93.sslip.io}"
fi
echo
echo "  Core: ${cyan}${EXPO_PUBLIC_API_ENDPOINT:-?}${reset} (mock: ${EXPO_PUBLIC_USE_MOCK:-?})"
echo

# A release must never ship mock data or an emulator/localhost API, whatever the shell or the environment variables say.
if [ "${EXPO_PUBLIC_USE_MOCK:-}" = true ] || [ "${EXPO_PUBLIC_MOCK_CORE:-}" = true ] || [ "${EXPO_PUBLIC_MOCK_SHOPS:-}" = true ]; then
  die "A mock flag (EXPO_PUBLIC_USE_MOCK / MOCK_CORE / MOCK_SHOPS) is true; a release build needs all three false."
fi
case "${EXPO_PUBLIC_API_ENDPOINT:-}" in *10.0.2.2* | *localhost* | *127.0.0.1*) die "EXPO_PUBLIC_API_ENDPOINT points at this machine: $EXPO_PUBLIC_API_ENDPOINT" ;; esac

adb="${sdk:+$sdk/platform-tools/adb}"
emu_pid=""
emu_log=""
if [ "$target" = emulator ] && [ -z "$serial" ]; then
  # Boot the AVD while the app builds; it is waited for only before the install. The port fixes its adb serial.
  port=5554
  while "$adb" devices 2>/dev/null | awk '{ print $1 }' | grep -qx "emulator-$port"; do port=$((port + 2)); done
  serial="emulator-$port"
  emu_log="${TMPDIR:-/tmp}/emulator-$avd.log"
  echo "${bold}→ Starting emulator $avd ($serial) in the background${reset} ${pf_dim}log: $emu_log${pf_reset}"
  nohup "$sdk/emulator/emulator" -avd "$avd" -port "$port" >"$emu_log" 2>&1 &
  emu_pid=$!
fi

if $ci; then
  echo "${bold}→ npm ci${reset}"
  npm ci
else
  pf_npm_install
fi
mark install

# --clean every time: android/ comes from app.json and the config plugins (APK size settings included), so a leftover
# folder, from an older checkout or a previous build on a self-hosted machine, could build with stale settings.
echo "${bold}→ expo prebuild --clean (regenerates android/)${reset}"
npx expo prebuild --platform android --no-install --clean
mark prebuild

# Metro's transform cache is keyed on file contents, not on EXPO_PUBLIC_* values, so a cache left by an earlier build
# with other values (a local test build on the same machine) would bake those values into the release bundle.
rm -rf "${TMPDIR:-/tmp}/metro-cache" .expo/metro

task=assembleRelease built="$PWD/android/app/build/outputs/apk/release/app-release.apk"
if [ "$format" = aab ]; then
  task=bundleRelease built="$PWD/android/app/build/outputs/bundle/release/app-release.aab"
fi
echo "${bold}→ gradlew $task${reset} ${pf_dim}(ABIs $abis)${pf_reset}"
start=$(date +%s)
(cd android && ./gradlew "$task" "-PreactNativeArchitectures=$abis" \
  "-Dorg.gradle.jvmargs=${GRADLE_JVM_ARGS:--Xmx6g -XX:MaxMetaspaceSize=1g}" ${signing[@]+"${signing[@]}"})
mark gradle
[ -f "$built" ] || die "Gradle finished but $built does not exist."
echo "  Done in $(($(date +%s) - start)) s: $built"
if [ -n "$out" ]; then
  mkdir -p "$(dirname "$out")"
  cp "$built" "$out"
  built="$out"
  echo "  Copied to $out"
fi
mark package
echo

if [ "$format" = apk ]; then
  # Where the APK size goes (native libraries per ABI, dex, assets); in CI also on the run page.
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    bash "$root/scripts/release/apk-contents.sh" "$built" | tee -a "$GITHUB_STEP_SUMMARY"
  else
    bash "$root/scripts/release/apk-contents.sh" "$built"
  fi
fi

if [ -n "$emu_pid" ]; then
  echo "${bold}→ Waiting for $serial to finish booting${reset}"
  booted=""
  for _ in $(seq 1 90); do
    if ! kill -0 "$emu_pid" 2>/dev/null; then
      tail -5 "$emu_log" >&2
      die "The emulator stopped while booting (last lines of $emu_log above)."
    fi
    booted="$("$adb" -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
    [ "$booted" != 1 ] || break
    sleep 2
  done
  [ "$booted" = 1 ] || die "$serial did not finish booting in 3 minutes (see $emu_log)."
fi

if $install; then
  echo "${bold}→ adb install on ${serial:-the connected phone}${reset}"
  if result="$("$adb" ${serial:+-s "$serial"} install -r "$built" 2>&1)"; then
    printf '%s\n' "$result"
    if [ "$target" = emulator ]; then
      if "$adb" -s "$serial" shell monkey -p "$app_id" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1; then
        echo "  Opened $app_id on $serial."
      else
        echo "  ${yellow}Installed; open the app on the emulator yourself.${reset}"
      fi
    fi
  else
    printf '%s\n' "$result"
    # adb's install errors, in words.
    case "$result" in
      *INSTALL_FAILED_UPDATE_INCOMPATIBLE*) die "The installed $app_id is signed with another key. Uninstall it (its data goes with it): $adb ${serial:+-s $serial }uninstall $app_id" ;;
      *INSTALL_FAILED_NO_MATCHING_ABIS*) die "The phone's CPU is not in this build ($abis). Build again with --abis matching the phone." ;;
      *INSTALL_FAILED_OLDER_SDK*) die "The phone's Android is older than the app's minimum (API $min_sdk)." ;;
      *INSTALL_FAILED_VERSION_DOWNGRADE*) die "The phone has a newer versionCode of the app. Uninstall it first: $adb ${serial:+-s $serial }uninstall $app_id" ;;
      *INSTALL_FAILED_INSUFFICIENT_STORAGE*) die "Not enough free storage on the phone." ;;
      *INSTALL_FAILED_USER_RESTRICTED* | *INSTALL_CANCELED_BY_USER*) die "The phone blocked the install. Accept the prompt on the phone; on Xiaomi/Redmi also turn on Developer options › Install via USB." ;;
      *) die "adb install failed (see the output above)." ;;
    esac
  fi
fi
