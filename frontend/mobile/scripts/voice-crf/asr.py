# /// script
# requires-python = ">=3.10,<3.13"
# dependencies = [
#   "numpy<2",
#   "onnxruntime>=1.17",
#   "kaldi-native-fbank>=1.20",
#   "soundfile>=0.12",
#   "pyctcdecode==0.5.0",
#   "kenlm==0.3.0",
#   "sherpa-onnx>=1.12.35",
# ]
# ///
"""Chạy STT trên audio của các câu eval để chấm STT + parser bằng `npm run voice:eval -- --asr …`.

Bộ eval là chữ; muốn so các hệ STT thì phải có người đọc các câu vàng thành file
`<thư mục audio>/<id>.wav` (16 kHz mono). Audio là giọng người nên không commit
(`.data/` đã bị bỏ qua). Các lệnh:

    uv run scripts/voice-crf/asr.py prompts       # .data/asr/prompts.tsv: câu cần đọc
    uv run scripts/voice-crf/asr.py lm            # .data/asr/lm-<danh mục>.arpa: LM n-gram miền cho từng danh mục
    uv run scripts/voice-crf/asr.py chunkformer --onnx-dir <dir> --chunkformer-repo <dir> --audio-dir <dir> \
        [--lm '.data/asr/lm-{catalog}.arpa'] [--hotwords]
    uv run scripts/voice-crf/asr.py zipformer --model-dir <dir> --audio-dir <dir> [--beam] [--hotwords]

Mỗi câu eval thuộc một danh mục (`eval/catalogs.json`); LM (`{catalog}` trong đường dẫn) và
hotword lấy theo danh mục của câu, như trên máy mỗi shop dùng danh mục của mình.

`chunkformer` cần thư mục ONNX xuất bằng `tools/export_onnx.py` của repo
khanld/chunkformer (model `khanhld/chunkformer-rnnt-small-vie-stream-dct` có nhánh
CTC và chạy streaming; `khanhld/chunkformer-ctc-large-vie` là CTC lớn). Đầu ra CTC
được giải mã greedy (như ONNX runtime của ChunkFormer) và, khi có `--lm`, beam search
với KenLM qua pyctcdecode; `--hotwords` thêm tên món làm hotword của pyctcdecode.
`zipformer` chạy model đang dùng trong app (`hynt/Zipformer-30M-RNNT-Streaming-6000h`,
thư mục có encoder/decoder/joiner/tokens như `src/lib/speech/core.ts`) bằng sherpa-onnx.

Mỗi lệnh decode ghi `.data/asr/<tên hệ>.jsonl`, mỗi dòng {"id", "text"}.
"""

import argparse
import json
import math
import re
import shutil
import subprocess
import sys
import time
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
EVAL = HERE / "eval"
OUT = HERE / ".data" / "asr"


def gold_rows():
    rows = []
    for name in ("gold.jsonl", "free.jsonl", "free2.jsonl"):
        with open(EVAL / name, encoding="utf-8") as f:
            rows += [json.loads(line) for line in f if line.strip()]
    return rows


def catalogs():
    with open(EVAL / "catalogs.json", encoding="utf-8") as f:
        return json.load(f)


def catalog_names(catalog):
    all_catalogs = catalogs()
    if catalog not in all_catalogs:
        sys.exit(f"không có danh mục {catalog!r}; có: {', '.join(all_catalogs)}")
    return [p["name"] for p in all_catalogs[catalog]]


def catalog_of():
    return {r["id"]: r["catalog"] for r in gold_rows()}


# ─── Chuẩn hoá chữ như đầu ra STT: chữ thường, đọc số bằng chữ, bỏ dấu câu ──────
ONES = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"]


def spoken(n):
    """Đọc số nguyên 0..999 999 (đủ cho số lượng, quy cách, số tiền ngắn)."""
    if n < 10:
        return ONES[n]
    if n < 20:
        u = n % 10
        return "mười" + ("" if u == 0 else " lăm" if u == 5 else f" {ONES[u]}")
    if n < 100:
        t, u = divmod(n, 10)
        unit = "" if u == 0 else " lăm" if u == 5 else " mốt" if u == 1 else f" {ONES[u]}"
        return f"{ONES[t]} mươi{unit}"
    if n < 1000:
        h, r = divmod(n, 100)
        if r == 0:
            return f"{ONES[h]} trăm"
        return f"{ONES[h]} trăm " + (f"linh {ONES[r]}" if r < 10 else spoken(r))
    if n < 1_000_000:
        k, r = divmod(n, 1000)
        tail = "" if r == 0 else " " + (f"không trăm {spoken(r)}" if r < 100 else spoken(r))
        return f"{spoken(k)} nghìn{tail}"
    return str(n)


def stt_style(text):
    text = unicodedata.normalize("NFC", text).lower()
    text = re.sub(r"(\d+)k\b", lambda m: f"{m.group(1)} nghìn", text)
    text = re.sub(r"\d+", lambda m: f" {spoken(int(m.group(0)))} ", text)
    text = re.sub(r"[^\w\s]", " ", text)
    return " ".join(text.split())


# ─── prompts ──────────────────────────────────────────────────────────────────
def cmd_prompts(args):
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / "prompts.tsv"
    rows = [r for r in gold_rows() if not args.split or r["split"] in args.split]
    with open(path, "w", encoding="utf-8") as f:
        # cột wav/txt theo định dạng `chunkformer-decode --audio_list`
        f.write("id\twav\ttxt\n")
        f.writelines(f"{r['id']}\t{r['id']}.wav\t{r['text']}\n" for r in rows)
    print(f"{len(rows)} câu → {path}")


# ─── lm: LM n-gram miền, định dạng ARPA ───────────────────────────────────────
def lm_corpus(catalog, synthetic_limit):
    """Câu synthetic (danh mục train, `npm run voice:synth`) + tên món của danh mục cần chấm."""
    lines = []
    synth = HERE / ".data" / "train.jsonl"
    if synth.exists():
        with open(synth, encoding="utf-8") as f:
            for line in f:
                text = json.loads(line)["text"]
                # câu gõ không dấu không giống đầu ra STT
                if any(ord(c) > 127 for c in text):
                    lines.append(stt_style(text))
                if len(lines) >= synthetic_limit:
                    break
    else:
        print("chưa có .data/train.jsonl (chạy npm run voice:synth): LM chỉ có tên món", file=sys.stderr)
    if catalog:
        lines += [stt_style(n) for n in catalog_names(catalog)]
    return [line for line in lines if line]


def kneser_ney_arpa(sentences, order, path):
    """Interpolated Kneser-Ney (một discount mỗi bậc, Chen & Goodman), ghi ARPA mà KenLM đọc được.

    Bậc cao nhất dùng số đếm thật; bậc thấp hơn dùng số ngữ cảnh trái khác nhau, trừ n-gram mở đầu
    bằng <s> (không có ngữ cảnh trái) dùng số đếm thật, như `lmplz`.
    """
    raw = [Counter() for _ in range(order + 1)]
    for s in sentences:
        words = ["<s>"] + s.split() + ["</s>"]
        for n in range(1, order + 1):
            for i in range(len(words) - n + 1):
                gram = tuple(words[i : i + n])
                if gram != ("<s>",):
                    raw[n][gram] += 1
    adj = [Counter() for _ in range(order + 1)]
    adj[order] = raw[order]
    for n in range(order - 1, 0, -1):
        left = Counter(g[1:] for g in raw[n + 1])
        for g, c in raw[n].items():
            adj[n][g] = c if g[0] == "<s>" else left[g]
    vocab = sorted({g[0] for g in raw[1]} | {"<unk>"})

    discount, ctx_total, ctx_types = {}, {}, {}
    for n in range(1, order + 1):
        freq = Counter(adj[n].values())
        n1, n2 = freq[1], freq[2]
        discount[n] = min(max(n1 / (n1 + 2 * n2), 0.1), 0.9) if n1 else 0.5
        total, types = defaultdict(float), defaultdict(int)
        for g, c in adj[n].items():
            total[g[:-1]] += c
            types[g[:-1]] += 1
        ctx_total[n], ctx_types[n] = total, types

    def gamma(n, ctx):
        return discount[n] * ctx_types[n][ctx] / ctx_total[n][ctx]

    prob = [{} for _ in range(order + 1)]
    uniform = 1 / len(vocab)  # gồm </s> và <unk>; <s> không được sinh ra nên không có trong vocab
    for w in vocab:
        if w == "<s>":
            continue
        c = adj[1].get((w,), 0)
        prob[1][(w,)] = max(c - discount[1], 0) / ctx_total[1][()] + gamma(1, ()) * uniform

    def lower(n, gram):
        """P_{n}(w | h) của mô hình nội suy cho n-gram có thể chưa gặp."""
        if n == 1:
            return prob[1].get(gram, prob[1]["<unk>",])
        if gram in prob[n]:
            return prob[n][gram]
        ctx = gram[:-1]
        bow = gamma(n, ctx) if ctx in ctx_total[n] else 1.0
        return bow * lower(n - 1, gram[1:])

    for n in range(2, order + 1):
        for g, c in adj[n].items():
            ctx = g[:-1]
            prob[n][g] = max(c - discount[n], 0) / ctx_total[n][ctx] + gamma(n, ctx) * lower(n - 1, g[1:])

    def log10(p):
        return math.log10(p) if p > 0 else -99.0

    with open(path, "w", encoding="utf-8") as f:
        f.write("\\data\\\n")
        counts = [len(prob[1]) + 1] + [len(prob[n]) for n in range(2, order + 1)]
        for n, c in enumerate(counts, start=1):
            f.write(f"ngram {n}={c}\n")
        for n in range(1, order + 1):
            f.write(f"\n\\{n}-grams:\n")
            grams = sorted(prob[n]) if n > 1 else [("<s>",)] + sorted(prob[1])
            for g in grams:
                p = -99.0 if g == ("<s>",) else log10(prob[n][g])
                line = f"{p:.6f}\t{' '.join(g)}"
                if n < order and g in ctx_total[n + 1]:
                    line += f"\t{log10(gamma(n + 1, g)):.6f}"
                f.write(line + "\n")
        f.write("\n\\end\\\n")
    return counts


def cmd_lm(args):
    OUT.mkdir(parents=True, exist_ok=True)
    lmplz = shutil.which("lmplz")
    for catalog in args.catalog or list(catalogs()):
        corpus = lm_corpus(catalog, args.synthetic)
        text_path = OUT / f"lm-{catalog}.txt"
        text_path.write_text("\n".join(corpus) + "\n", encoding="utf-8")
        arpa = OUT / f"lm-{catalog}.arpa"
        if lmplz and not args.builtin:
            with open(text_path, "rb") as src, open(arpa, "wb") as dst:
                subprocess.run([lmplz, "-o", str(args.order), "--discount_fallback"], stdin=src, stdout=dst, check=True)
            print(f"lmplz: {len(corpus)} câu → {arpa}")
        else:
            counts = kneser_ney_arpa(corpus, args.order, arpa)
            print(f"Kneser-Ney bậc {args.order} (không có lmplz): {len(corpus)} câu, n-gram {counts} → {arpa}")


# ─── decode ───────────────────────────────────────────────────────────────────
def read_wav(path):
    import numpy as np
    import soundfile as sf

    samples, rate = sf.read(path, dtype="float32", always_2d=True)
    samples = samples.mean(axis=1)
    if rate != 16000:
        sys.exit(f"{path}: cần 16 kHz, file là {rate} Hz")
    return np.ascontiguousarray(samples)


def audio_files(audio_dir):
    ids = {r["id"] for r in gold_rows()}
    files = sorted(p for p in Path(audio_dir).glob("*.wav") if p.stem in ids)
    if not files:
        sys.exit(f"không có file <id>.wav nào của bộ eval trong {audio_dir}")
    return files


def write_jsonl(name, results):
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{name}.jsonl"
    with open(path, "w", encoding="utf-8") as f:
        f.writelines(json.dumps({"id": rid, "text": text}, ensure_ascii=False) + "\n" for rid, text in results)
    print(f"{len(results)} câu → {path}")


def fbank(samples, meta):
    """Fbank kaldi như `OnnxAsrModel.extract_features` (biên độ thang int16, không dither)."""
    import kaldi_native_fbank as knf
    import numpy as np

    feat = meta.get("feature", {})
    opts = knf.FbankOptions()
    opts.frame_opts.samp_freq = int(feat.get("sample_rate", 16000))
    opts.frame_opts.frame_length_ms = float(feat.get("frame_length", 25))
    opts.frame_opts.frame_shift_ms = float(feat.get("frame_shift", 10))
    opts.frame_opts.dither = 0.0
    opts.frame_opts.snip_edges = True
    opts.energy_floor = 0.0
    opts.mel_opts.num_bins = int(feat.get("num_mel_bins", meta["feat_dim"]))
    fb = knf.OnlineFbank(opts)
    fb.accept_waveform(opts.frame_opts.samp_freq, (samples * 32768.0).tolist())
    fb.input_finished()
    return np.stack([fb.get_frame(i) for i in range(fb.num_frames_ready)])[None].astype(np.float32)


def cmd_chunkformer(args):
    # chỉ nạp phần ONNX runtime (numpy + onnxruntime), không nạp model PyTorch
    import importlib.util

    import numpy as np

    spec = importlib.util.spec_from_file_location(
        "chunkformer_onnx_runtime", Path(args.chunkformer_repo) / "chunkformer" / "onnx" / "runtime.py"
    )
    runtime = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(runtime)
    asr = runtime.OnnxAsrModel(args.onnx_dir)
    streaming = asr.encoder_chunk is not None and not args.full
    if not asr.char_dict:
        sys.exit(f"không có vocab.txt trong {args.onnx_dir}")
    size = max(int(asr.meta.get("vocab_size", 0)), max(asr.char_dict) + 1)
    # nhãn theo chỉ số cho pyctcdecode: blank là chuỗi rỗng, chỉ số không có trong vocab thì đặt tên riêng để không trùng
    labels = [asr.char_dict.get(i, f"<{i}>") for i in range(size)]
    labels[asr.blank_id] = ""

    use_beam = bool(args.lm or args.hotwords)
    decoders = {}

    def decoder_for(catalog):
        # một decoder cho mỗi danh mục (LM theo danh mục nếu đường dẫn có {catalog})
        key = catalog if args.lm and "{catalog}" in args.lm else ""
        if key not in decoders:
            from pyctcdecode import build_ctcdecoder

            lm = args.lm.replace("{catalog}", catalog) if args.lm else None
            decoders[key] = build_ctcdecoder(labels, kenlm_model_path=lm, alpha=args.alpha, beta=args.beta)
        return decoders[key]

    hotwords = {c: [stt_style(n) for n in catalog_names(c)] for c in catalogs()} if args.hotwords else {}
    catalog = catalog_of()

    base = f"chunkformer-{'stream' if streaming else 'full'}"
    greedy, beam, times = [], [], []
    for path in audio_files(args.audio_dir):
        feats = fbank(read_wav(path), asr.meta)
        t0 = time.perf_counter()
        if streaming:
            enc = asr.encode_streaming(feats)
            enc_len = enc.shape[1]
        else:
            enc, enc_lens = asr.encode_full(feats, np.array([feats.shape[1]], dtype=np.int64))
            enc_len = int(enc_lens[0])
        log_probs = asr.ctc_logprobs(enc)[0][:enc_len]
        times.append(time.perf_counter() - t0)
        hyp = runtime.remove_duplicates_and_blank(log_probs.argmax(axis=-1).tolist(), asr.blank_id)
        greedy.append((path.stem, asr.tokens_to_text(hyp)))
        if use_beam:
            c = catalog[path.stem]
            text = decoder_for(c).decode(
                log_probs, beam_width=args.beam, hotwords=hotwords.get(c), hotword_weight=args.hotword_weight
            )
            beam.append((path.stem, " ".join(text.split())))
    write_jsonl(f"{base}-greedy", greedy)
    if use_beam:
        tags = (["lm"] if args.lm else []) + (["hw"] if args.hotwords else [])
        write_jsonl(f"{base}-{'-'.join(tags)}", beam)
    print(f"encoder + CTC: trung bình {1000 * sum(times) / len(times):.0f} ms/câu (CPU máy này, chưa tính beam search)")


def cmd_zipformer(args):
    import sherpa_onnx

    d = Path(args.model_dir)

    def find(prefix):
        found = sorted(d.glob(f"{prefix}*.onnx"))
        if not found:
            sys.exit(f"không thấy {prefix}*.onnx trong {d}")
        return str(found[0])

    if args.offline:
        return zipformer_offline(sherpa_onnx, d, find, args)
    if args.hotwords and not (d / "bpe.vocab").exists():
        sys.exit("--hotwords cần bpe.vocab trong thư mục model (app hiện không tải file này)")
    rec = sherpa_onnx.OnlineRecognizer.from_transducer(
        tokens=str(d / "tokens.txt"),
        encoder=find("encoder"),
        decoder=find("decoder"),
        joiner=find("joiner"),
        num_threads=2,
        decoding_method="modified_beam_search" if args.hotwords or args.beam else "greedy_search",
        hotwords_score=args.hotwords_score,
        modeling_unit="bpe" if args.hotwords else "",
        bpe_vocab=str(d / "bpe.vocab") if args.hotwords else "",
    )
    # hotword theo danh mục của từng câu; model xuất chữ HOA nên hotword cũng viết HOA
    hotwords = {c: "/".join(stt_style(n).upper() for n in catalog_names(c)) for c in catalogs()}
    catalog = catalog_of()
    results = []
    for path in audio_files(args.audio_dir):
        stream = rec.create_stream(hotwords=hotwords[catalog[path.stem]]) if args.hotwords else rec.create_stream()
        stream.accept_waveform(16000, read_wav(path))
        # như app (`src/lib/speech/sherpaEngine.ts`): đệm 0,5 giây im lặng để model nhả nốt token cuối
        stream.accept_waveform(16000, [0.0] * 8000)
        stream.input_finished()
        while rec.is_ready(stream):
            rec.decode_stream(stream)
        # model xuất chữ HOA, app đưa về chữ thường (`src/lib/speech/core.ts`)
        results.append((path.stem, " ".join(rec.get_result(stream).lower().split())))
    method = "hw" if args.hotwords else "beam" if args.beam else "greedy"
    write_jsonl(f"zipformer-{method}", results)


def zipformer_offline(sherpa_onnx, d, find, args):
    """Zipformer không streaming (vd. gipformer): giải mã cả câu một lần, ghi `.data/asr/<tên thư mục model>-<cách giải mã>`."""
    if args.hotwords and not (d / "bpe.vocab").exists():
        sys.exit("--hotwords cần bpe.vocab trong thư mục model")
    rec = sherpa_onnx.OfflineRecognizer.from_transducer(
        tokens=str(d / "tokens.txt"),
        encoder=find("encoder"),
        decoder=find("decoder"),
        joiner=find("joiner"),
        num_threads=2,
        decoding_method="modified_beam_search" if args.hotwords or args.beam else "greedy_search",
        hotwords_score=args.hotwords_score,
        modeling_unit="bpe" if args.hotwords else "",
        bpe_vocab=str(d / "bpe.vocab") if args.hotwords else "",
    )
    hotwords = {c: "/".join(stt_style(n).upper() for n in catalog_names(c)) for c in catalogs()}
    catalog = catalog_of()
    results = []
    for path in audio_files(args.audio_dir):
        stream = rec.create_stream(hotwords=hotwords[catalog[path.stem]]) if args.hotwords else rec.create_stream()
        stream.accept_waveform(16000, read_wav(path))
        rec.decode_stream(stream)
        results.append((path.stem, " ".join(stream.result.text.lower().split())))
    method = "hw" if args.hotwords else "beam" if args.beam else "greedy"
    write_jsonl(f"{d.name}-{method}", results)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("prompts", help="xuất danh sách câu cần thu âm")
    s.add_argument("--split", nargs="*", help="chỉ các tập này (dev test free-dev free-test); mặc định mọi tập")
    s.set_defaults(func=cmd_prompts)

    s = sub.add_parser("lm", help="dựng LM n-gram miền (ARPA)")
    s.add_argument("--catalog", nargs="*", help="danh mục (eval/catalogs.json); mặc định mọi danh mục")
    s.add_argument("--order", type=int, default=3)
    s.add_argument("--synthetic", type=int, default=8000, help="số câu synthetic tối đa")
    s.add_argument("--builtin", action="store_true", help="dùng Kneser-Ney viết sẵn kể cả khi có lmplz")
    s.set_defaults(func=cmd_lm)

    s = sub.add_parser("chunkformer", help="giải mã bằng ChunkFormer ONNX (CTC greedy, beam + KenLM)")
    s.add_argument("--onnx-dir", required=True)
    s.add_argument(
        "--chunkformer-repo", required=True, help="bản clone khanld/chunkformer (để nạp chunkformer/onnx/runtime.py)"
    )
    s.add_argument("--audio-dir", required=True)
    s.add_argument("--full", action="store_true", help="dùng encoder không streaming kể cả khi có encoder_chunk.onnx")
    s.add_argument("--lm", help="file ARPA hoặc KenLM binary; {catalog} được thay bằng danh mục của câu")
    s.add_argument("--hotwords", action="store_true", help="tên món trong danh mục của câu làm hotword")
    s.add_argument("--alpha", type=float, default=0.5, help="trọng số LM")
    s.add_argument("--beta", type=float, default=1.0, help="thưởng mỗi từ")
    s.add_argument("--beam", type=int, default=32)
    s.add_argument("--hotword-weight", type=float, default=10.0)
    s.set_defaults(func=cmd_chunkformer)

    s = sub.add_parser("zipformer", help="giải mã bằng model Zipformer đang dùng trong app (sherpa-onnx)")
    s.add_argument("--model-dir", required=True)
    s.add_argument("--audio-dir", required=True)
    s.add_argument("--beam", action="store_true", help="modified_beam_search thay vì greedy như app")
    s.add_argument("--hotwords", action="store_true", help="tên món trong danh mục của câu làm hotword (cần bpe.vocab)")
    s.add_argument("--hotwords-score", type=float, default=1.5)
    s.add_argument("--offline", action="store_true", help="model không streaming (vd. gipformer)")
    s.set_defaults(func=cmd_zipformer)

    args = p.parse_args()
    args.func(args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
