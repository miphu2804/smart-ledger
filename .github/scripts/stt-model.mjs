// Keeps the speech model on R2 in step with the app. The model version and file sizes come from
// frontend/mobile/src/lib/speech/core.ts, the same list the app checks after downloading, so there is one source of truth.
//
//   node stt-model.mjs check        HEAD every file under $STT_MODEL_BASE_URL/stt-model/<version>/ and compare sizes.
//                                    Prints `EXPO_PUBLIC_STT_MODEL_URL=<url>` when all match, else errors and exits 1.
//   node stt-model.mjs fetch <dir>  Download the model from HuggingFace at a pinned revision into <dir>, write tokens.txt,
//                                    check sizes against core.ts and print the version, for the workflow to upload.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// The upstream repository has no tokens.txt, so it is rebuilt from bpe.model. Pinning the revision keeps a re-upload
// byte-identical to what core.ts expects even if the author pushes new files.
const SOURCE_REPO = "hynt/Zipformer-30M-RNNT-Streaming-6000h";
const SOURCE_REVISION = "c122fdc21cea4894fd775e9d3fe66ebbc787e26b";

const core = readFileSync(new URL("../../frontend/mobile/src/lib/speech/core.ts", import.meta.url), "utf8");
const version = /export const STT_MODEL_VERSION = '([^']+)'/.exec(core)?.[1];
const files = [...core.matchAll(/\{ name: '([^']+)', bytes: (\d+) \}/g)].map(([, name, bytes]) => ({
  name,
  bytes: Number(bytes),
}));
if (!version || files.length === 0) fail("Could not read STT_MODEL_VERSION and STT_MODEL_FILES from core.ts; update this script's patterns.");

const [command, dir] = process.argv.slice(2);
if (command === "check") await check();
else if (command === "fetch" && dir) await fetchModel(dir);
else fail("Usage: stt-model.mjs check | fetch <dir>");

async function check() {
  const base = (process.env.STT_MODEL_BASE_URL ?? "").replace(/\/+$/, "");
  if (!base) fail("STT_MODEL_BASE_URL is not set.");
  const modelUrl = `${base}/stt-model/${version}/`;
  const errors = [];
  for (const { name, bytes } of files) {
    try {
      const res = await fetch(modelUrl + encodeURIComponent(name), { method: "HEAD" });
      const size = Number(res.headers.get("content-length"));
      if (!res.ok) errors.push(`${name}: HTTP ${res.status}`);
      else if (size !== bytes) errors.push(`${name}: ${size} bytes on R2, core.ts expects ${bytes}`);
    } catch (e) {
      errors.push(`${name}: ${e.cause?.message ?? e.message}`);
    }
  }
  if (errors.length > 0) fail(...errors.map((message) => `Speech model ${version} at ${modelUrl}: ${message}`));
  console.log(`EXPO_PUBLIC_STT_MODEL_URL=${modelUrl}`);
}

async function fetchModel(dir) {
  mkdirSync(dir, { recursive: true });
  const errors = [];
  for (const { name, bytes } of files) {
    const data = name === "tokens.txt" ? tokensFromBpe(await download("bpe.model")) : await download(name);
    writeFileSync(join(dir, name), data);
    if (data.length !== bytes) errors.push(`${name}: ${data.length} bytes from ${SOURCE_REPO}, core.ts expects ${bytes}`);
  }
  if (errors.length > 0) fail(...errors, "core.ts no longer matches the pinned source; update SOURCE_REVISION or the file list.");
  console.log(version);
}

async function download(name) {
  const url = `https://huggingface.co/${SOURCE_REPO}/resolve/${SOURCE_REVISION}/${name}`;
  const res = await fetch(url);
  if (!res.ok) fail(`Download ${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// sherpa-onnx reads `<piece> <id>` per line. The team's original file had CRLF line endings, and core.ts pins that size.
function tokensFromBpe(model) {
  return Buffer.from(sentencePieces(model).map((piece, id) => `${piece} ${id}\r\n`).join(""), "utf8");
}

// bpe.model is a SentencePiece ModelProto: field 1 repeats a SentencePiece message whose field 1 is the piece text.
function sentencePieces(buf) {
  const pieces = [];
  for (const { field, value } of protoFields(buf)) {
    if (field !== 1) continue;
    const piece = protoFields(value).find((f) => f.field === 1);
    pieces.push(piece.value.toString("utf8"));
  }
  return pieces;
}

function protoFields(buf) {
  const fields = [];
  let pos = 0;
  const varint = () => {
    let result = 0n;
    for (let shift = 0n; ; shift += 7n) {
      const byte = buf[pos++];
      result |= BigInt(byte & 0x7f) << shift;
      if (byte < 0x80) return result;
    }
  };
  while (pos < buf.length) {
    const tag = Number(varint());
    const field = tag >> 3;
    const wireType = tag & 7;
    if (wireType === 0) fields.push({ field, value: varint() });
    else if (wireType === 1) pos += 8;
    else if (wireType === 5) pos += 4;
    else if (wireType === 2) {
      const length = Number(varint());
      fields.push({ field, value: buf.subarray(pos, pos + length) });
      pos += length;
    } else throw new Error(`Unsupported protobuf wire type ${wireType}`);
  }
  return fields;
}

function fail(...messages) {
  for (const message of messages) console.log(`::error::${message}`);
  process.exit(1);
}
