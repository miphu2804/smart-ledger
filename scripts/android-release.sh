#!/usr/bin/env bash
# Build a Release of the Android app (frontend/mobile) from the current checkout and print where its size goes. The same
# script runs on a developer machine and in .github/workflows/mobile-release.yml, so a local build matches CI.
#
#   ./scripts/android-release.sh                         APK with the release ABIs: armeabi-v7a,arm64-v8a
#   ./scripts/android-release.sh --abis arm64-v8a        one ABI, faster (most phones)
#   ./scripts/android-release.sh --install               also install the APK on the phone that adb sees
#   ./scripts/android-release.sh --aab                   Android App Bundle for Google Play instead of an APK
#   ./scripts/android-release.sh --out <file>            copy the APK or AAB to <file>
#   ./scripts/android-release.sh --check                 only run the preflight checks
#   ./scripts/android-release.sh --skip-preflight        build even if a check fails
#
# Before building it checks the machine (Node, JDK, Android SDK packages pinned at the top of mobile-release.yml, the
# Firebase file, the phone for --install) and, in a terminal, offers to open or run the fix for what is missing.
# Locally, like scripts/ios-device-release.sh: mocks are off (real Firebase and Core) and Core defaults to staging,
# overridable with EXPO_PUBLIC_API_ENDPOINT in .env or the shell. In GitHub Actions every EXPO_PUBLIC_* value comes from
# the environment as given. Signs with RELEASE_KEYSTORE, KEYSTORE_PASSWORD and RELEASE_KEY_ALIAS when RELEASE_KEYSTORE
# is set, otherwise with the template's public debug key.
set -euo pipefail

abis="armeabi-v7a,arm64-v8a"
format=apk
install=false
out=""
preflight=true
check_only=false
while [ $# -gt 0 ]; do
  case "$1" in
    --abis) abis="${2:?--abis needs a value}"; shift 2 ;;
    --aab) format=aab; shift ;;
    --install) install=true; shift ;;
    --out) out="${2:?--out needs a value}"; shift 2 ;;
    --check) check_only=true; shift ;;
    --skip-preflight) preflight=false; shift ;;
    -h | --help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $1 (see --help)" >&2; exit 2 ;;
  esac
done
if $install && [ "$format" = aab ]; then
  echo "--install works with an APK, not with --aab." >&2
  exit 2
fi

root="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib/preflight.sh
. "$root/scripts/lib/preflight.sh"
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

firebase_project="$(sed -n 's/^EXPO_PUBLIC_FIREBASE_PROJECT_ID=//p' .env 2>/dev/null | tail -1 || true)"
firebase_url="https://console.firebase.google.com/${firebase_project:+project/$firebase_project/settings/general}"

run_checks() {
  local node_found java_found major what sm="" missing pkgs adb devices

  pf_section "Toolchain (pinned in .github/workflows/mobile-release.yml)"
  if ! command -v node >/dev/null; then
    if has_brew; then
      pf_fail "Node.js is not installed" "Install Node $node_major." "Install Node $node_major with Homebrew" "brew install node@$node_major"
    else
      pf_fail "Node.js is not installed" "Install Node $node_major from nodejs.org." "Open the Node.js download page" "pf_open https://nodejs.org/en/download"
    fi
  else
    node_found="$(node -p 'process.versions.node')"
    if [ "${node_found%%.*}" = "$node_major" ]; then
      pf_ok "Node $node_found"
    elif has_brew; then
      pf_fail "Node $node_major required, found $node_found" "Install Node $node_major and put it first on PATH (or switch with nvm or fnm)." \
        "Install Node $node_major with Homebrew" "brew install node@$node_major && brew link --overwrite --force node@$node_major"
    else
      pf_fail "Node $node_major required, found $node_found" "Install Node $node_major (nodejs.org, nvm or fnm)." \
        "Open the Node.js download page" "pf_open https://nodejs.org/en/download"
    fi
  fi

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

  if $install; then
    pf_section "Phone (--install)"
    adb="${sdk:+$sdk/platform-tools/adb}"
    if [ -z "$adb" ] || [ ! -x "$adb" ]; then
      if [ -n "$sm" ]; then
        pf_fail "adb not found" "It comes with the SDK's platform-tools package." \
          "Install platform-tools with sdkmanager" "yes | '$sm' --sdk_root='$sdk' platform-tools"
      else
        pf_fail "adb not found" "Install Platform-Tools in Android Studio › Settings › Android SDK › SDK Tools."
      fi
    else
      devices="$("$adb" devices 2>/dev/null | sed '1d;/^$/d' || true)"
      if printf '%s\n' "$devices" | grep -q $'\tdevice$'; then
        pf_ok "Phone connected: $(printf '%s\n' "$devices" | grep $'\tdevice$' | head -1 | cut -f1)"
      elif printf '%s\n' "$devices" | grep -q $'\tunauthorized$'; then
        pf_fail "The phone has not allowed USB debugging from this computer" "Unlock the phone and tap Allow on the \"Allow USB debugging?\" prompt."
      else
        pf_fail "No Android phone found by adb" "Connect the phone by cable and turn on USB debugging: Settings › About phone › tap Build number 7 times,\nthen Settings › System › Developer options › USB debugging."
      fi
    fi
  fi
}

branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
commit="$(git log -1 --format='%h %s' 2>/dev/null || echo '?')"
echo "${bold}Sổ Nghe Lời: Android Release build${reset}"
echo "  Branch: ${cyan}$branch${reset}"
echo "  Commit: $commit"
echo "  Output: ${cyan}$format${reset}, ABIs ${cyan}$abis${reset}"
[ -z "$(git status --porcelain -- . 2>/dev/null)" ] || echo "  ${yellow}! Uncommitted changes in frontend/mobile are built into the app.${reset}"

if $preflight || $check_only; then
  run_checks
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
  export EXPO_PUBLIC_API_ENDPOINT="${api:-https://core-staging-01d2.up.railway.app}"
fi
echo
echo "  Core: ${cyan}${EXPO_PUBLIC_API_ENDPOINT:-?}${reset} (mock: ${EXPO_PUBLIC_USE_MOCK:-?})"
echo

if $ci; then
  echo "${bold}→ npm ci${reset}"
  npm ci
elif [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  # Reinstall when package-lock.json is newer than the last install (after a pull or a branch switch).
  echo "${bold}→ npm install${reset}"
  npm install
fi
mark install

# --clean every time: android/ comes from app.json and the config plugins (APK size settings included), so a leftover
# folder, from an older checkout or a previous build on a self-hosted machine, could build with stale settings.
echo "${bold}→ expo prebuild --clean (regenerates android/)${reset}"
npx expo prebuild --platform android --no-install --clean
mark prebuild

task=assembleRelease built="$PWD/android/app/build/outputs/apk/release/app-release.apk"
if [ "$format" = aab ]; then
  task=bundleRelease built="$PWD/android/app/build/outputs/bundle/release/app-release.aab"
fi
echo "${bold}→ gradlew $task${reset}"
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
    bash "$root/scripts/apk-contents.sh" "$built" | tee -a "$GITHUB_STEP_SUMMARY"
  else
    bash "$root/scripts/apk-contents.sh" "$built"
  fi
fi

if $install; then
  echo "${bold}→ adb install${reset}"
  echo "  If the phone has a build signed with another key (the one from the landing page), Android refuses it: uninstall that first."
  "$sdk/platform-tools/adb" install -r "$built"
fi
