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

The release helper in `.github/scripts/stt-model.mjs` checks the required versioned model files and can publish missing files during an explicitly authorized release. A download build needs a valid public model base URL; local/native embedding is a separate path below.

Destinations, publication credentials, access policy and retention configuration belong to the private operations knowledge base. Keep older model versions available while supported APKs reference them; never apply a build-artifact cleanup rule to active model files.

## Embed the model in the APK

The plugin `plugins/withBundledSttModel.js` (registered in `app.json`) copies the 4 required files in this folder into `android/app/src/main/assets/models/stt-model-<STT_MODEL_VERSION>/` on every `expo prebuild`. If the `android/` folder is already generated, run `node plugins/withBundledSttModel.js`, then build. The app detects the embedded model and skips the download; the embedded model adds about 49 MB to the APK. If the build machine lacks the model files, the plugin only warns, the APK still builds and falls back to the download above.
