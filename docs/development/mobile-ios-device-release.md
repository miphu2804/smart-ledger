# Install a Release Build on a Physical iPhone

This guide builds the current `frontend/mobile` workspace in the Xcode `Release` configuration, installs it on a connected iPhone, and opens the app. It covers direct installation for device validation; it does not upload a build to TestFlight or the App Store.

## Prerequisites

- Xcode and the mobile project dependencies are installed on the Mac.
- The iPhone is connected, unlocked, trusted by the Mac, and available to Xcode.
- Xcode has an Apple Development signing identity and a provisioning profile that can install `vn.teamhexa.songheloi` on the device.
- The local `.env` contains the values intended for this build. Expo public environment variables are included in the JavaScript bundle at build time.
- If Firebase-backed authentication is enabled, provide the matching `GoogleService-Info.plist` at `frontend/mobile/GoogleService-Info.plist` before generating or updating the native iOS project. The path is declared in `app.json`; a successful native build alone does not verify Firebase authentication.

## 1. Find the device identifier used by Expo

Run this from the mobile project directory. It lists available physical iOS devices and their Xcode identifiers:

```sh
cd frontend/mobile
xcrun xcdevice list | python3 -c 'import json,sys; [print("%s | %s | %s" % (d.get("name"), d.get("modelName"), d.get("identifier"))) for d in json.load(sys.stdin) if d.get("platform") == "com.apple.platform.iphoneos" and d.get("available")]'
```

Copy the identifier for the target iPhone. Use the identifier from `xcdevice` with Expo's `--device` option. `xcrun devicectl list devices` reports a separate CoreDevice identifier; Expo does not accept that identifier here.

## 2. Build, install, and open the app

Replace the placeholder with the `xcdevice` identifier:

```sh
npx expo run:ios --configuration Release --device "<XCDEVICE_IDENTIFIER>"
```

Expo builds the iOS app in Release configuration, signs it with the available Xcode signing setup, installs it on the selected iPhone, and launches it. A successful run exits with status `0` and reports `Build Succeeded` followed by `Installing`.

## 3. Verify the installation

Confirm that **Sổ Nghe Lời** opens on the iPhone. To inspect installed apps from Terminal, get the CoreDevice identifier from `xcrun devicectl list devices` and run:

```sh
xcrun devicectl device info apps --device "<COREDEVICE_IDENTIFIER>"
```

The app bundle identifier is `vn.teamhexa.songheloi`. The displayed app version and build number come from `app.json`; rebuilding the same source does not increment them automatically.

## Troubleshooting

- **Expo says no device matches the identifier:** use the physical device's `identifier` from `xcrun xcdevice list`, not the identifier from `xcrun devicectl list devices`.
- **Signing or provisioning fails:** verify that Xcode has a valid Apple Development identity and provisioning profile for bundle identifier `vn.teamhexa.songheloi` and the connected device. If needed, sign in to the Apple Developer account associated with the team in Xcode's Accounts settings.
- **Firebase authentication fails:** confirm that the matching `GoogleService-Info.plist` is present at the path configured in `app.json`, then rebuild. Installing and opening the app does not prove that Firebase authentication is configured correctly.
