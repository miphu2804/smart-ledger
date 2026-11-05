#!/usr/bin/env bash
# Usage: scripts/ai/fetch-embedding-model.sh
# Downloads agent memory's default embedding model into backend/ai/models/static-mrl-int8, where the AI service looks
# for it when run from backend/ai (AGENT_MEMORY_EMBEDDING_MODEL=models/static-mrl-int8). The revision and checksums are
# the ones backend/ai/Dockerfile pins; change both together. A file already present with the right checksum is kept.
set -euo pipefail

source_url="https://huggingface.co/sentence-transformers/static-similarity-mrl-multilingual-v1/resolve/b68f4122911bcffcd6e1f695f2d99cd6788972d8"
target="$(git rev-parse --show-toplevel)/backend/ai/models/static-mrl-int8"
mkdir -p "$target"

fetch() {
  local remote="$1" name="$2" sha256="$3" file="$target/$2"
  if [ -f "$file" ] && echo "$sha256  $file" | shasum -a 256 -c --status; then
    echo "fetch-embedding-model: $name is up to date"
    return
  fi
  curl -fsSL --retry 3 -o "$file.part" "$source_url/$remote"
  echo "$sha256  $file.part" | shasum -a 256 -c --status || { rm -f "$file.part"; echo "fetch-embedding-model: $name checksum mismatch" >&2; exit 1; }
  mv "$file.part" "$file"
  echo "fetch-embedding-model: fetched $name"
}

fetch onnx/model_int8.onnx model.onnx 9eaf678438a0c2669e7388e90fd8ef25c3138dd3155cb0d62fd8114760405a3a
fetch 0_StaticEmbedding/tokenizer.json tokenizer.json 11aaf894a4ccf3d95e8830e27c0f8152791fbbff2b988e29a265580b86edd216
