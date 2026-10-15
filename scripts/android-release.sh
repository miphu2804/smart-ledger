#!/usr/bin/env bash
# Build a Release of the Android app (frontend/mobile) from the current checkout and print where its size goes. The same
# script runs on a developer machine and in .github/workflows/mobile-release.yml, so a local build matches CI.
#
#   ./scripts/android-release.sh                         APK with the release ABIs: armeabi-v7a,arm64-v8a
#   ./scripts/android-release.sh --abis arm64-v8a        one ABI, faster (most phones)
#   ./scripts/android-release.sh --install               also install the APK on the phone that adb sees
#   ./scripts/android-release.sh --aab                   Android App Bundle for Google Play instead of an APK
#   ./scripts/android-release.sh --out <file>            copy the APK or AAB to <file>
#
# Locally, like scripts/ios-device-release.sh: mocks are off (real Firebase and Core), Core defaults to staging and can
# be overridden with EXPO_PUBLIC_API_ENDPOINT in .env or the shell; the Firebase web keys and EXPO_PUBLIC_STT_MODEL_URL
# come from .env. In GitHub Actions every EXPO_PUBLIC_* value comes from the environment as given. Needs
# frontend/mobile/google-services.json (or GOOGLE_SERVICES_JSON), Node, JDK 17 and the Android SDK with the NDK (see
# docs/development/ci-cd.md#runners). Signs with RELEASE_KEYSTORE, KEYSTORE_PASSWORD and RELEASE_KEY_ALIAS when
# RELEASE_KEYSTORE is set, otherwise with the template's public debug key.
set -euo pipefail

abis="armeabi-v7a,arm64-v8a"
format=apk
install=false
out=""
while [ $# -gt 0 ]; do
  case "$1" in
    --abis) abis="${2:?thiếu giá trị cho --abis}"; shift 2 ;;
    --aab) format=aab; shift ;;
    --install) install=true; shift ;;
    --out) out="${2:?thiếu giá trị cho --out}"; shift 2 ;;
    -h | --help) sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Không hiểu tham số: $1 (xem --help)" >&2; exit 2 ;;
  esac
done
$install && [ "$format" = aab ] && { echo "--install chỉ dùng với APK, không dùng với --aab." >&2; exit 2; }

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root/frontend/mobile"
ci=false
[ "${GITHUB_ACTIONS:-}" = true ] && ci=true

bold=$'\033[1m' cyan=$'\033[36m' yellow=$'\033[33m' red=$'\033[31m' reset=$'\033[0m'
die() {
  $ci && echo "::error::$*"
  echo "${red}✗ $*${reset}" >&2
  exit 1
}
# CI times each phase from these marks (TIMINGS, read by .github/scripts/android-summary.mjs).
mark() { [ -z "${TIMINGS:-}" ] || echo "$1=$(date +%s)" >>"$TIMINGS"; }

command -v node >/dev/null || die "Không thấy node."

# JDK: JAVA_HOME, else the one bundled with Android Studio on macOS, else java on PATH.
studio_jbr="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
if [ -z "${JAVA_HOME:-}" ] && [ -d "$studio_jbr" ]; then export JAVA_HOME="$studio_jbr"; fi
java_bin="${JAVA_HOME:+$JAVA_HOME/bin/}java"
command -v "$java_bin" >/dev/null || die "Không thấy JDK — cài JDK 17 hoặc Android Studio, hoặc đặt JAVA_HOME."

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
sdk="$(find_sdk)" || die "Không thấy Android SDK (thư mục có platforms/). Đặt ANDROID_HOME=<đường dẫn SDK> rồi chạy lại."
export ANDROID_HOME="$sdk"

if [ -z "${GOOGLE_SERVICES_JSON:-}" ] && [ ! -f google-services.json ]; then
  die "Thiếu frontend/mobile/google-services.json (Firebase Console → Project settings → app Android)."
fi

signing=() signer="key debug của template (không dùng để phát hành)"
if [ -n "${RELEASE_KEYSTORE:-}" ]; then
  signer="keystore $RELEASE_KEYSTORE"
  [ -f "$RELEASE_KEYSTORE" ] || die "RELEASE_KEYSTORE trỏ tới file không tồn tại: $RELEASE_KEYSTORE"
  [ -n "${KEYSTORE_PASSWORD:-}" ] || die "Có RELEASE_KEYSTORE nhưng thiếu KEYSTORE_PASSWORD."
  key_alias="${RELEASE_KEY_ALIAS:-smart-ledger}"
  # `expo prebuild --clean` rewrites build.gradle on every run, so the keystore goes through the Android Gradle
  # plugin's injected signing properties, which override the signing config of the built variant. The keystore is
  # PKCS12, so the key shares the store password.
  signing=(
    "-Pandroid.injected.signing.store.file=$RELEASE_KEYSTORE"
    "-Pandroid.injected.signing.store.password=$KEYSTORE_PASSWORD"
    "-Pandroid.injected.signing.key.alias=$key_alias"
    "-Pandroid.injected.signing.key.password=$KEYSTORE_PASSWORD"
  )
fi

branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
commit="$(git log -1 --format='%h %s' 2>/dev/null || echo '?')"
echo "${bold}Sổ Nghe Lời — build Android Release${reset}"
echo "  Nhánh:  ${cyan}$branch${reset}"
echo "  Commit: $commit"
echo "  Ra:     ${cyan}$format${reset}, ABI ${cyan}$abis${reset}"
echo "  SDK:    $sdk"
echo "  Ký:     $signer"
[ -z "$(git status --porcelain -- . 2>/dev/null)" ] || echo "  ${yellow}! Có thay đổi chưa commit trong frontend/mobile — vẫn được build vào app.${reset}"
if ! $ci; then
  # Expo does not override shell variables with .env values, so the exported mock flags cannot be turned back on by .env.
  export EXPO_PUBLIC_USE_MOCK=false EXPO_PUBLIC_MOCK_CORE=false EXPO_PUBLIC_MOCK_SHOPS=false
  api="${EXPO_PUBLIC_API_ENDPOINT:-$(sed -n 's/^EXPO_PUBLIC_API_ENDPOINT=//p' .env 2>/dev/null | tail -1 || true)}"
  export EXPO_PUBLIC_API_ENDPOINT="${api:-https://core-staging-01d2.up.railway.app}"
fi
echo "  Core:   ${cyan}${EXPO_PUBLIC_API_ENDPOINT:-?}${reset} (mock: ${EXPO_PUBLIC_USE_MOCK:-?})"
stt="${EXPO_PUBLIC_STT_MODEL_URL:-$(sed -n 's/^EXPO_PUBLIC_STT_MODEL_URL=//p' .env 2>/dev/null | tail -1 || true)}"
[ -n "$stt" ] || echo "  ${yellow}! Không có EXPO_PUBLIC_STT_MODEL_URL: Đọc đơn bằng giọng nói không tải được model.${reset}"
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
echo "${bold}→ expo prebuild --clean (sinh lại android/)${reset}"
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
[ -f "$built" ] || die "Gradle chạy xong nhưng không thấy $built."
echo "  Xong sau $(($(date +%s) - start)) giây: $built"
if [ -n "$out" ]; then
  mkdir -p "$(dirname "$out")"
  cp "$built" "$out"
  built="$out"
  echo "  Đã chép ra $out"
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
  adb="$sdk/platform-tools/adb"
  [ -x "$adb" ] || die "Không thấy adb ở $adb."
  echo "${bold}→ adb install${reset}"
  echo "  Máy đã cài bản ký bằng key khác (bản tải từ landing page) thì Android từ chối; gỡ bản đó trước."
  "$adb" install -r "$built"
fi
