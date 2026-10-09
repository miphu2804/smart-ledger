#!/usr/bin/env bash
# Build bản Release app mobile (frontend/mobile) từ code đang checkout và cài lên iPhone thật đang cắm vào Mac (hoặc ghép qua Wi-Fi), để test nhanh.
#
#   ./scripts/ios-device-release.sh                  chọn máy bằng menu (↑/↓ hoặc j/k, Enter; q để thoát)
#   ./scripts/ios-device-release.sh --device <UDID>  bỏ qua menu (UDID hoặc tên máy)
#   ./scripts/ios-device-release.sh --clean          sinh lại ios/ từ app.json trước khi build (sau khi đổi plugin/config native)
#
# Bản Release nhúng sẵn JS nên mở app không cần Metro. Luôn tắt mock (Firebase + Core thật); Core mặc định là staging,
# đổi bằng EXPO_PUBLIC_API_ENDPOINT trong .env hoặc trên dòng lệnh. Muốn build nhánh khác thì git checkout trước.
# Lần đầu build Expo hỏi chọn Apple Development Team để ký app; iPhone cần bật Developer Mode.
# Chỉ chạy trên macOS có Xcode (xcrun devicectl cần Xcode 15+).
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

# Mỗi dòng: udid<TAB>tên<TAB>model<TAB>iOS<TAB>kết nối. Chỉ lấy iPhone/iPad thật đã ghép đôi (paired) với Mac.
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

# Menu chọn bằng phím mũi tên; ghi index được chọn vào biến `choice`. Viết cho bash 3.2 mặc định của macOS.
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

# Code sẽ được build: nhắc nếu có thay đổi chưa commit để người test biết bản trên máy không khớp hẳn với commit.
branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
commit="$(git log -1 --format='%h %s' 2>/dev/null || echo '?')"
echo "${bold}Sổ Nghe Lời — build Release lên iPhone${reset}"
echo "  Nhánh:  ${cyan}$branch${reset}"
echo "  Commit: $commit"
[ -z "$(git status --porcelain -- . 2>/dev/null)" ] || echo "  ${yellow}! Có thay đổi chưa commit trong frontend/mobile — vẫn được build vào app.${reset}"
# Bản test trên máy thật luôn dùng Firebase và Core thật. Biến môi trường của shell được ưu tiên hơn .env, nên các cờ mock
# trong .env không bật lại được. Core lấy từ EXPO_PUBLIC_API_ENDPOINT (shell hoặc .env), không có thì dùng Core staging.
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

# Cài lại node_modules khi package-lock.json mới hơn lần cài gần nhất (vừa pull/checkout code khác).
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
