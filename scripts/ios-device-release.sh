#!/usr/bin/env bash
# Build a Release of the mobile app (frontend/mobile) from the current checkout and install it on a real iPhone paired
# with this Mac (cable or Wi-Fi), for quick testing.
#
#   ./scripts/ios-device-release.sh                  pick the device from a menu (up/down or j/k, Enter; q to quit)
#   ./scripts/ios-device-release.sh --device <UDID>  skip the menu (UDID or device name)
#   ./scripts/ios-device-release.sh --clean          regenerate ios/ from app.json first (after native config changes)
#   ./scripts/ios-device-release.sh --skip-preflight build even if no signing profile for this iPhone is found
#
# The Release build embeds the JS bundle, so the app runs without Metro. Mocks are always off (real Firebase and Core);
# Core defaults to staging and can be overridden with EXPO_PUBLIC_API_ENDPOINT in .env or the shell. To build another
# branch, git checkout it first. Requires macOS with Xcode 15+ (xcrun devicectl) and Developer Mode on the iPhone.
set -euo pipefail

device=""
clean=false
preflight=true
while [ $# -gt 0 ]; do
  case "$1" in
    -d | --device) device="${2:?thiếu giá trị cho --device}"; shift 2 ;;
    --clean) clean=true; shift ;;
    --skip-preflight) preflight=false; shift ;;
    -h | --help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
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

# Signing preflight. `expo run:ios` does not let Xcode create profiles (no -allowProvisioningUpdates), so the build only
# signs when this Mac already holds a valid profile for the app's bundle ID, from the project's team, that lists this
# iPhone. Without one, xcodebuild fails after bundling with "No profiles for '<bundle>' were found"; check it first.
# A free Personal Team cannot get a profile for a bundle ID that another team registered.
signing_preflight() {
  local bundle team pbx now f plist appid pteam exp name devices seen="" ok=""
  bundle="$(node -p "require('./app.json').expo.ios.bundleIdentifier")"
  pbx="$(ls ios/*.xcodeproj/project.pbxproj 2>/dev/null | head -1 || true)"
  team=""
  [ -z "$pbx" ] || team="$(sed -n 's/.*DEVELOPMENT_TEAM = \([A-Z0-9]*\);.*/\1/p' "$pbx" | head -1)"
  echo "${bold}→ Kiểm tra ký app${reset} ${dim}(bundle $bundle, team ${team:-chưa đặt}, iPhone $device)${reset}"

  security find-identity -v -p codesigning 2>/dev/null | grep -q '"Apple Development' ||
    die "Keychain chưa có certificate Apple Development. Xcode › Settings › Accounts › chọn Apple ID › Manage Certificates › + Apple Development."

  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  for f in "$HOME/Library/MobileDevice/Provisioning Profiles"/*.mobileprovision \
    "$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"/*.mobileprovision; do
    [ -f "$f" ] || continue
    plist="$(security cms -D -i "$f" 2>/dev/null)" || continue
    appid="$(plutil -extract Entitlements.application-identifier raw -o - - <<<"$plist" 2>/dev/null || true)"
    pteam="$(plutil -extract TeamIdentifier.0 raw -o - - <<<"$plist" 2>/dev/null || true)"
    exp="$(plutil -extract ExpirationDate raw -o - - <<<"$plist" 2>/dev/null || true)"
    name="$(plutil -extract Name raw -o - - <<<"$plist" 2>/dev/null || true)"
    # application-identifier is "<team prefix>.<bundle ID or wildcard>"; the unquoted pattern matches "*" wildcards.
    # shellcheck disable=SC2053
    [[ "$bundle" == ${appid#*.} ]] || continue
    [ -z "$team" ] || [ "$pteam" = "$team" ] || { seen="$seen\n    - $name: team $pteam, không phải $team"; continue; }
    [[ "$exp" > "$now" ]] || { seen="$seen\n    - $name: hết hạn $exp"; continue; }
    if [ "$(plutil -extract ProvisionsAllDevices raw -o - - <<<"$plist" 2>/dev/null || true)" != true ]; then
      devices="$(plutil -extract ProvisionedDevices json -o - - <<<"$plist" 2>/dev/null || true)"
      # A device name passed to --device cannot be matched against UDIDs, so only a UDID is checked.
      if [[ "$device" =~ ^[0-9A-Fa-f-]{24,40}$ ]] && ! grep -qi "\"$device\"" <<<"$devices"; then
        seen="$seen\n    - $name: không có iPhone này"
        continue
      fi
    fi
    ok="$name"
    break
  done

  if [ -n "$ok" ]; then
    echo "  Profile: $ok"
    return 0
  fi
  echo "${red}✗ Không có provisioning profile dùng được cho $bundle${team:+ (team $team)} và iPhone này; xcodebuild sẽ báo \"No profiles for '$bundle' were found\".${reset}" >&2
  [ -z "$seen" ] || printf '  Profile có nhưng không dùng được:%b\n' "$seen" >&2
  cat >&2 <<EOF
  Cách sửa:
    1. Xcode › Settings › Accounts: thêm Apple ID thuộc team sở hữu bundle $bundle (Personal Team miễn phí không tạo
       được profile cho bundle đã đăng ký ở team khác).
    2. Mở frontend/mobile/ios/*.xcworkspace › target › Signing & Capabilities: chọn team đó, bật "Automatically manage
       signing", cắm iPhone và đợi Xcode tạo profile (iPhone mới phải được đăng ký vào team).
    3. Chạy lại script. --clean sinh lại ios/ và đặt lại team; muốn giữ team thì khai ios.appleTeamId trong app.json.
  Bỏ qua bước kiểm tra: --skip-preflight.
EOF
  exit 1
}
if $preflight; then signing_preflight; fi

echo "${bold}→ Build Release và cài lên $device${reset}"
echo "  ${dim}Giữ iPhone mở khoá khi build xong để app tự mở; máy đang khoá thì app vẫn được cài nhưng báo lỗi lúc mở.${reset}"
npx expo run:ios --device "$device" --configuration Release --no-bundler
