---
type: Guide
title: "Speech recognition model (sherpa-onnx)"
description: "Which on-device speech model files the app needs, how to fetch them and how releases serve them."
owner: FE owner
status: stable
generated: { by: human:miphu2804, at: 2026-11-06T22:18:48+07:00 }
stale_after: 2027-01-05T22:18:48+07:00
---
# Speech recognition model (sherpa-onnx)

This folder holds the Vietnamese speech recognition model that runs on the device (streaming Zipformer / transducer, used through `react-native-sherpa-onnx`). The model files (about 49 MB) are **not in git** (see `.gitignore`) so they do not bloat the history of the public repo. Only this README is tracked.

## Required files

| File | Purpose | Required |
|---|---|---|
| `encoder-epoch-31-avg-11-chunk-32-left-128.fp16.onnx` | encoder (46.2 MB) | yes |
| `decoder-epoch-31-avg-11-chunk-32-left-128.fp16.onnx` | decoder (2.6 MB) | yes |
| `joiner-epoch-31-avg-11-chunk-32-left-128.fp16.onnx` | joiner (2.1 MB) | yes |
| `tokens.txt` | table of 2,000 BPE tokens | yes |
| `bpe.model`, `bpe.vocab` | needed only for hotwords | no (the app does not use them yet) |

The library finds files by name prefix (`encoder`, `decoder`, `joiner`) and the name `tokens.txt`, so keep the names above. The file list and expected sizes are in `src/lib/speech/core.ts` (`STT_MODEL_FILES`).

## Get the model

From the repo root, download the model into this folder:

```bash
node .github/scripts/stt-model.mjs fetch frontend/mobile/assets/models
```

The script downloads from [`hynt/Zipformer-30M-RNNT-Streaming-6000h`](https://huggingface.co/hynt/Zipformer-30M-RNNT-Streaming-6000h) (the `chunk-32` variant, pinned to the commit in `SOURCE_REVISION`) and compares sizes with `STT_MODEL_FILES`. That repo has no `tokens.txt`, so the script rebuilds it from `bpe.model`: one `<piece> <id>` per line, with CRLF line endings like the team's original file. The model license is `cc-by-nc-nd-4.0`: non-commercial use only, and modified versions must not be distributed.

## How the app gets the model

By default the app does **not bundle** the model in the APK. The first time the Đọc đơn screen opens, the app downloads the 4 required files into app storage and reuses them (checked by file size). To make an APK work offline (for example a prototype build), embed the model in the APK; see "Embed the model in the APK" at the end. The download address is set in `.env`:

```
EXPO_PUBLIC_STT_MODEL_URL=http://<computer IP>:8090/
```

During development, run a small static server for this folder:

```
node scripts/serve-stt-model.js
```

The script prints the addresses to put in `EXPO_PUBLIC_STT_MODEL_URL` (the Android emulator uses `http://10.0.2.2:8090/`, a real phone uses the Wi-Fi IP). The script serves only the files in this folder, read-only, and should only run on a trusted network. For a real phone, the Windows firewall must allow port 8090.

To skip the server, point straight at R2: `EXPO_PUBLIC_STT_MODEL_URL=https://pub-<hash>.r2.dev/stt-model/v1/`. Release builds get this address from CI; see below.

## Put the model on R2

Release builds download the model from the public R2 bucket the APK already uses (see "Publish the APK for the landing page" in [`docs/development/ci-cd.md`](../../../../docs/development/ci-cd.md#publish-the-apk-for-the-landing-page)), under the prefix `stt-model/<STT_MODEL_VERSION>/`. The bucket is shared because the app downloads the model without signing in, so the bucket must be public like the APK. The model has nothing to hide either: anyone can unpack a model embedded in an APK. DVC is not needed: the repo does not train models, and DVC stores files by hash so the app could not download them by name.

No manual upload is needed. The "Resolve the speech model URL" step of `mobile-release.yml` runs `.github/scripts/stt-model.mjs`:

1. `check`: reads `STT_MODEL_VERSION` and `STT_MODEL_FILES` from `core.ts`, sends `HEAD` to each file under `<STT_MODEL_BASE_URL>/stt-model/<version>/` and compares sizes.
2. If a file is missing or differs and this is a release build (`publish=true`): `fetch` downloads the model as above, `aws s3 sync --size-only` uploads it to R2 with the APK bucket's token (only missing or differing files), then `check` runs again.
3. When every file is present, the build gets `EXPO_PUBLIC_STT_MODEL_URL=<STT_MODEL_BASE_URL>/stt-model/<version>/`.

Test builds (dev, staging) have no R2 token. If the model is not on R2 yet, such a build only warns; it still builds but speech input does not work. The GitHub variable `STT_MODEL_BASE_URL` is the bucket's public address, for example `https://pub-<hash>.r2.dev`. Without it a release build is refused. Check R2 from your machine:

```bash
STT_MODEL_BASE_URL=https://pub-<hash>.r2.dev node .github/scripts/stt-model.mjs check
```

To change the model: bump `STT_MODEL_VERSION`, update `STT_MODEL_FILES`, then change `SOURCE_REPO` and `SOURCE_REVISION` in the script. The next release uploads the model under the new prefix. Do not delete old versions, because old APKs still download from their own path. The bucket's optional lifecycle rule may only delete under `android/production/builds/` and must not touch `stt-model/`.

- `r2.dev` addresses are rate-limited and uncached; each new user downloads about 51 MB. When the project has a domain on Cloudflare, only `STT_MODEL_BASE_URL` needs to change.

## Embed the model in the APK

The plugin `plugins/withBundledSttModel.js` (registered in `app.json`) copies the 4 required files in this folder into `android/app/src/main/assets/models/stt-model-<STT_MODEL_VERSION>/` on every `expo prebuild`. If the `android/` folder is already generated, run `node plugins/withBundledSttModel.js`, then build. The app detects the embedded model and skips the download; the embedded model adds about 49 MB to the APK. If the build machine lacks the model files, the plugin only warns, the APK still builds and falls back to the download above.
