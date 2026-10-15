#!/usr/bin/env bash
# Build a Release APK of the mobile app (frontend/mobile) from the current checkout on this machine, without CI, and
# print where its size goes. Optionally install it on an Android phone connected over adb.
#
#   ./scripts/android-local-release.sh                         ABIs of a release: armeabi-v7a,arm64-v8a
#   ./scripts/android-local-release.sh --abis arm64-v8a        one ABI, faster (most phones)
#   ./scripts/android-local-release.sh --install               also install on the phone that adb sees
#
# Like scripts/ios-device-release.sh: mocks are off (real Firebase and Core), Core defaults to staging and can be
# overridden with EXPO_PUBLIC_API_ENDPOINT in .env or the shell; the Firebase web keys and EXPO_PUBLIC_STT_MODEL_URL
# come from .env. Needs frontend/mobile/google-services.json (or GOOGLE_SERVICES_JSON), Node, JDK 17 and the Android
# SDK with the NDK (see docs/development/ci-cd.md#runners). The APK is signed with the template's debug key.
set -euo pipefail

abis="armeabi-v7a,arm64-v8a"
install=false
while [ $# -gt 0 ]; do
  case "$1" in
    --abis) abis="${2:?thiếu giá trị cho --abis}"; shift 2 ;;
    --install) install=true; shift ;;
    -h | --help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Không hiểu tham số: $1 (xem --help)" >&2; exit 2 ;;
  esac
done

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root/frontend/mobile"

bold=$'\033[1m' cyan=$'\033[36m' yellow=$'\033[33m' red=$'\033[31m' reset=$'\033[0m'
die() { echo "${red}✗ $*${reset}" >&2; exit 1; }

command -v node >/dev/null || die "Không thấy node."

# JDK: JAVA_HOME, else the one bundled with Android Studio on macOS, else java on PATH.
studio_jbr="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
if [ -z "${JAVA_HOME:-}" ] && [ -d "$studio_jbr" ]; then export JAVA_HOME="$studio_jbr"; fi
java_bin="${JAVA_HOME:+$JAVA_HOME/bin/}java"
command -v "$java_bin" >/dev/null || die "Không thấy JDK — cài JDK 17 hoặc Android Studio, hoặc đặt JAVA_HOME."

sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
[ -d "$sdk" ] || die "Không thấy Android SDK ở $sdk — cài qua Android Studio hoặc đặt ANDROID_HOME."
export ANDROID_HOME="$sdk"

if [ -z "${GOOGLE_SERVICES_JSON:-}" ] && [ ! -f google-services.json ]; then
  die "Thiếu frontend/mobile/google-services.json (Firebase Console → Project settings → app Android)."
fi

branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
commit="$(git log -1 --format='%h %s' 2>/dev/null || echo '?')"
echo "${bold}Sổ Nghe Lời — build APK Release trên máy này${reset}"
echo "  Nhánh:  ${cyan}$branch${reset}"
echo "  Commit: $commit"
echo "  ABI:    ${cyan}$abis${reset}"
[ -z "$(git status --porcelain -- . 2>/dev/null)" ] || echo "  ${yellow}! Có thay đổi chưa commit trong frontend/mobile — vẫn được build vào app.${reset}"
# Expo does not override shell variables with .env values, so the exported mock flags cannot be turned back on by .env.
export EXPO_PUBLIC_USE_MOCK=false EXPO_PUBLIC_MOCK_CORE=false EXPO_PUBLIC_MOCK_SHOPS=false
api="${EXPO_PUBLIC_API_ENDPOINT:-$(sed -n 's/^EXPO_PUBLIC_API_ENDPOINT=//p' .env 2>/dev/null | tail -1 || true)}"
export EXPO_PUBLIC_API_ENDPOINT="${api:-https://core-staging-01d2.up.railway.app}"
echo "  Chế độ: thật (mock tắt), Core ${cyan}$EXPO_PUBLIC_API_ENDPOINT${reset}"
stt="${EXPO_PUBLIC_STT_MODEL_URL:-$(sed -n 's/^EXPO_PUBLIC_STT_MODEL_URL=//p' .env 2>/dev/null | tail -1 || true)}"
[ -n "$stt" ] || echo "  ${yellow}! Không có EXPO_PUBLIC_STT_MODEL_URL: Đọc đơn bằng giọng nói không tải được model.${reset}"
echo

# Reinstall when package-lock.json is newer than the last install (after a pull or a branch switch).
if [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  echo "${bold}→ npm install${reset}"
  npm install
fi

# --clean every time, as CI does: android/ comes from app.json and the config plugins (APK size settings included),
# so a leftover folder could build with stale settings.
echo "${bold}→ expo prebuild --clean (sinh lại android/)${reset}"
npx expo prebuild --platform android --no-install --clean

echo "${bold}→ gradlew assembleRelease${reset}"
start=$(date +%s)
(cd android && ./gradlew assembleRelease "-PreactNativeArchitectures=$abis" \
  "-Dorg.gradle.jvmargs=-Xmx6g -XX:MaxMetaspaceSize=1g")
apk="$PWD/android/app/build/outputs/apk/release/app-release.apk"
[ -f "$apk" ] || die "Gradle chạy xong nhưng không thấy $apk."
echo "  Xong sau $(($(date +%s) - start)) giây: $apk"
echo

bash "$root/scripts/apk-contents.sh" "$apk"

if $install; then
  adb="$sdk/platform-tools/adb"
  [ -x "$adb" ] || die "Không thấy adb ở $adb."
  echo "${bold}→ adb install${reset}"
  echo "  Máy đã cài bản ký bằng key khác (bản tải từ landing page) thì Android từ chối; gỡ bản đó trước."
  "$adb" install -r "$apk"
fi
