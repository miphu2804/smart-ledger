#!/usr/bin/env bash
# Build a Release of the mobile app (frontend/mobile) from the current checkout and install it on a real iPhone paired
# with this Mac (cable or Wi-Fi), for quick testing.
#
#   ./scripts/ios-device-release.sh                  pick the device from a menu (up/down or j/k, Enter; q to quit)
#   ./scripts/ios-device-release.sh --device <UDID>  skip the menu (UDID or device name)
#   ./scripts/ios-device-release.sh --clean          regenerate ios/ from app.json first (after native config changes)
#
# The Release build embeds the JS bundle, so the app runs without Metro. Mocks are always off (real Firebase and Core);
# Core defaults to staging and can be overridden with EXPO_PUBLIC_API_ENDPOINT in .env or the shell. To build another
# branch, git checkout it first. Requires macOS with Xcode 15+ (xcrun devicectl) and Developer Mode on the iPhone.
set -euo pipefail

device=""
clean=false
while [ $# -gt 0 ]; do
  case "$1" in
    -d | --device) device="${2:?thiếu giá trị cho --device}"; shift 2 ;;
    --clean) clean=true; shift ;;
    -h | --help) sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Không hiểu tham số: $1 (xem --help)" >&2; exit 2 ;;
  esac
done

cd "$(dirname "$0")/../frontend/mobile"

bold=$'\033[1m' dim=$'\033[2m' cyan=$'\033[36m' yellow=$'\033[33m' red=$'\033[31m' reset=$'\033[0m'
die() { echo "${red}✗ $*${reset}" >&2; exit 1; }

command -v xcrun >/dev/null || die "Không thấy xcrun — cần macOS có Xcode."
command -v node >/dev/null || die "Không thấy node."

# One line per device: udid<TAB>name<TAB>model<TAB>iOS<TAB>connection. Only real iPhones/iPads paired with this Mac.
# xcodebuild needs hardwareProperties.udid, not the CoreDevice identifier.
list_devices() {
  local json
  json="$(mktemp)"
  xcrun devicectl list devices --quiet --json-output "$json" >/dev/null 2>&1 || { rm -f "$json"; return 1; }
  node -e '
    const { result } = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    for (const d of result.devices) {
      const hw = d.hardwareProperties, conn = d.connectionProperties;
      if (hw.platform !== "iOS" || hw.reality !== "physical" || conn.pairingState !== "paired") continue;
      const via = conn.transportType === "wired" ? "cáp" : "Wi-Fi";
      console.log([hw.udid, d.deviceProperties.name, hw.marketingName, d.deviceProperties.osVersionNumber, via].join("\t"));
    }' "$json"
  rm -f "$json"
}

# Arrow-key menu; stores the selected index in `choice`. Written for the bash 3.2 that ships with macOS.
pick() {
  local -a items=("$@")
  local n=${#items[@]} cur=0 key rest i
  tput civis 2>/dev/null || true
  trap 'tput cnorm 2>/dev/null || true' EXIT
  while true; do
    for ((i = 0; i < n; i++)); do
      if [ "$i" -eq "$cur" ]; then
        printf '\033[2K  %s❯ %s%s\n' "$cyan$bold" "${items[i]}" "$reset"
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
      '') choice=$cur; return 0 ;;
      q | Q) echo; exit 130 ;;
    esac
    printf '\033[%dA' "$n"
  done
}

# Show what is being built, and warn when uncommitted changes make the installed app differ from the commit.
branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
commit="$(git log -1 --format='%h %s' 2>/dev/null || echo '?')"
echo "${bold}Sổ Nghe Lời — build Release lên iPhone${reset}"
echo "  Nhánh:  ${cyan}$branch${reset}"
echo "  Commit: $commit"
[ -z "$(git status --porcelain -- . 2>/dev/null)" ] || echo "  ${yellow}! Có thay đổi chưa commit trong frontend/mobile — vẫn được build vào app.${reset}"
# Device builds always use real Firebase and Core. Expo does not override shell variables with .env values, so the
# exported mock flags cannot be turned back on by .env.
export EXPO_PUBLIC_USE_MOCK=false EXPO_PUBLIC_MOCK_CORE=false EXPO_PUBLIC_MOCK_SHOPS=false
api="${EXPO_PUBLIC_API_ENDPOINT:-$(sed -n 's/^EXPO_PUBLIC_API_ENDPOINT=//p' .env 2>/dev/null | tail -1 || true)}"
export EXPO_PUBLIC_API_ENDPOINT="${api:-https://core-staging-01d2.up.railway.app}"
echo "  Chế độ: thật (mock tắt), Core ${cyan}$EXPO_PUBLIC_API_ENDPOINT${reset}"
echo

if [ -z "$device" ]; then
  devices="$(list_devices)" || die "Không đọc được danh sách thiết bị (xcrun devicectl)."
  [ -n "$devices" ] || die "Không thấy iPhone nào. Cắm cáp, mở khoá máy, bấm \"Tin cậy\" rồi chạy lại."
  [ -t 0 ] || die "Không có terminal để hiện menu — truyền --device <UDID>."

  udids=() labels=()
  while IFS=$'\t' read -r udid name model os via; do
    udids+=("$udid")
    labels+=("$name  ${dim}$model · iOS $os · $via${reset}")
  done <<<"$devices"

  echo "Chọn thiết bị:"
  pick "${labels[@]}"
  device="${udids[choice]}"
  echo
fi

# Reinstall when package-lock.json is newer than the last install (after a pull or a branch switch).
if [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  echo "${bold}→ npm install${reset}"
  npm install
fi

if $clean; then
  echo "${bold}→ expo prebuild --clean (sinh lại ios/)${reset}"
  npx expo prebuild --platform ios --clean
fi

echo "${bold}→ Build Release và cài lên $device${reset}"
echo "  ${dim}Giữ iPhone mở khoá khi build xong để app tự mở; máy đang khoá thì app vẫn được cài nhưng báo lỗi lúc mở.${reset}"
npx expo run:ios --device "$device" --configuration Release --no-bundler
