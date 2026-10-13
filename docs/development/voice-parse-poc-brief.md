# Brief: Voice Parse PoC (hotword + ITN + CRF + n-gram linker)

Brief này là đầu vào cho một session tự chạy từ lúc research cho tới khi train xong CRF và hoàn thành PoC. Mọi thứ cần biết đều nằm trong file. Phần đánh dấu **[đã kiểm chứng]** là đã đọc code hoặc đã chạy thật trong session trước. Phần **[suy luận]** phải tự kiểm chứng lại trước khi dựa vào.

File kèm theo trong `docs/development/voice-parse-poc/`:
- `bench.mts`: baseline 10 câu chạy trên `parseOrder.ts` của repo. Chạy từ root repo: `node --experimental-strip-types --no-warnings docs/development/voice-parse-poc/bench.mts`.
- `cascade-options.html`: phân tích các phương án cascade và trade-off (mở bằng trình duyệt).
- `poc-proposal.html`: đề xuất PoC, có ví dụ đi qua từng lớp.
- `agent-prompt.md`: prompt goal để giao cho agent.
- `report.md`: báo cáo kết quả PoC (bảng chỉ số, những gì đã và chưa kiểm chứng).

---

## 1. Goal và điều kiện dừng

**Goal:** chủ shop nói một câu tiếng Việt về đơn bán, và app tạo đúng các dòng nháp `{product_id, qty}`. Việc parse chạy hoàn toàn trên máy với độ trễ thấp. LLM chỉ dùng làm đường dự phòng.

**Done khi có đủ các mục sau:**
1. Có bộ eval (§6) và script eval chạy được bằng một lệnh, in ra các chỉ số §7 cho **baseline** và cho **PoC**.
2. CRF đã train xong, trọng số đã xuất ra JSON, có decoder Viterbi bằng TypeScript chạy được trên máy (không phụ thuộc native).
3. PoC parser (L1–L4 ở §4) đạt các mục tiêu ở §7 trên bộ eval, hoặc có báo cáo trung thực là chưa đạt kèm lý do.
4. Có báo cáo cuối gồm: bảng so sánh baseline với PoC, độ trễ, những gì đã và chưa kiểm chứng (đặc biệt là L0 hotword trên máy thật), và bước tiếp theo.

**Điều kiện dừng sớm (YAGNI):** sau mỗi bước ở §5, nếu PoC đã đạt mục tiêu §7 thì dừng; không làm tiếp bước sau chỉ vì nó có trong plan. Ví dụ: linker trigram đã đủ tốt thì CRF chỉ train để so sánh, không bắt buộc phải tích hợp.

**Blocker bên ngoài được chấp nhận:** không có máy Android hoặc emulator để đo L0 và độ trễ thật. Khi gặp trường hợp này, ghi ranh giới cuối cùng đã kiểm chứng vào `BLOCKERS.md` rồi làm tiếp L1–L4.

---

## 2. Quy tắc repo (bắt buộc)

- Đọc `AGENTS.md`, `CONTRIBUTING.md` và `docs/README.md` trước khi sửa. **Không sửa `backend/core`** (Java).
- Ưu tiên mobile (`frontend/mobile`, Expo/React Native). Web admin không thuộc scope.
- Branch: làm trên `feat/voice-parse-poc` (đã tạo từ `staging` và đã push, có sẵn brief này). PR sau này nhắm vào `staging`. Commit theo Conventional Commits tiếng Anh, chữ thường, ≤ 72 ký tự, không ghi metadata AI.
- `PROGRESS.md` chỉ được thêm, không sửa entry cũ. Blocker chưa giải quyết thì ghi vào `BLOCKERS.md` (theo format có sẵn trong file).
- Trước khi push, mở PR hay tạo bất kỳ side effect nào ra bên ngoài: hỏi owner.
- **Không thêm logging transcript của người dùng thật vào production** khi chưa được duyệt, vì liên quan quyền riêng tư và cần xin đồng ý. PoC chỉ dùng dữ liệu synthetic và bộ câu tự soạn.
- Nếu phải động vào `backend/ai` (fallback LLM): test bằng cách chạy lại process uvicorn trỏ vào Supabase staging, không dùng Docker hay Postgres local.
- Review và tóm tắt PR viết bằng tiếng Việt.

---

## 3. Hiện trạng **[đã kiểm chứng]**

### Pipeline đang chạy ở màn voice
- `frontend/mobile/app/voice.tsx` → `src/lib/speech` (`index.native.ts` → `sherpaEngine.ts`) → STT trên máy bằng **sherpa-onnx**, `react-native-sherpa-onnx@0.4.4`.
  - Model: Zipformer transducer streaming, fp16 (`encoder/decoder/joiner-epoch-31-avg-11-chunk-32-left-128.fp16.onnx` cộng `tokens.txt`, tổng khoảng 51 MB), khai báo trong `src/lib/speech/core.ts` (`STT_MODEL_FILES`, `STT_MODEL_VERSION = 'v1'`).
  - `createStreamingSTT({ modelType: 'transducer', enableEndpoint: true, decodingMethod: 'greedy_search', numThreads: 2 })`.
  - **Chưa dùng hotword.** Comment trong `core.ts` ghi: `bpe.model`/`bpe.vocab` chỉ cần cho hotword, app chưa dùng nên không tải.
- Transcript đi vào **`src/lib/parseOrder.ts`** (621 dòng, rule thuần TS, không phụ thuộc React Native) qua `parseOrder(text, products)`. Kết quả gồm `items`, `unknown`, `missingQuantityItems`, `disambiguations`, `expenses`. `app/expenses.tsx` cũng dùng file này. Sau đó tạo sale draft ở Core (`src/lib/salesApi.ts`, `/sale-drafts`).
- Các hàm chính trong `parseOrder.ts`: `fold`/`normalize` (bỏ dấu, từ đệm), `parseSpokenRun` và `convertSpokenMoney` (ITN), `tokenize`, `splitClauses`, `parseQty`, `productKeys` (tên + aliases), `matchProduct`, `findProductHits` (**khớp chính xác** theo word n-gram, ưu tiên cụm dài, không chồng nhau), `chunkByCatalog`, `splitByPrice`, `findExpense`.
- **LLM `draft_parse`** nằm ở `backend/ai/src/prompt_templates/draft_parse.py` và `backend/ai/src/drafts/` (AI-008). **Màn voice không gọi tới nó.** Đây là ứng viên làm fallback.
- **`frontend/mobile/src/sst/`** (khoảng 1.500 dòng: `engine.ts`, `order_parser/*`, `asr/*` có `HotwordBiasingTrie`) **không được import ở đâu cả**, và phần ASR trong đó là stub (`processAudioSamples` không chạy inference). Chỉ tham khảo ý tưởng (ví dụ `fuzzy_matcher.ts` dùng Levenshtein và token-sort), **không nối module này vào app**. Việc dọn nó là task riêng, không thuộc scope.
- Mobile không có test runner. Có script `typecheck` (`tsc --noEmit`). File TS thuần chạy trực tiếp được bằng `node --experimental-strip-types` (Node v26 trên máy dev).

### Baseline đã đo (10 câu, catalog 6 món, chạy trên Node)
Đúng 6/10. Mất khoảng **0.05 ms** mỗi lần parse.

| Câu | Kết quả `parseOrder` | Đúng? |
|---|---|---|
| hai bao gạo st hai lăm | Gạo ST25 × 2 | ✓ |
| hai ký gạo với một chai nước mắm | Nước mắm × 1, unknown: Gạo | ✗ khớp chính xác: "gạo" ≠ alias "gạo st25" |
| ban 3 goi mi hao hao | Mì Hảo Hảo × 3 | ✓ |
| bán một vỉ trứng và hai lon coca | Trứng × 1, Coca × 2 | ✓ |
| gạo hai bao nước mắm một chai | Nước mắm × 2, gạo bị mất | ✗ nói tên trước, số sau |
| cho chị ba gói mì hảo hảo nha | Mì × 3 | ✓ |
| hai nước mắm nam ngư | Nước mắm × 2 | ✓ |
| một đường | unknown: Đường | ✗ "Đường trắng 1kg" không có alias "đường" |
| mì hảo hão hai gói | Mì × 2 | ✓ |
| chi năm trăm nghìn tiền điện | Khoản chi 500000, mục "khac" | ~ (mục chi chưa đúng) |

Script để chạy lại (catalog lấy từ đây):

```ts
// docs/development/voice-parse-poc/bench.mts (bản đầy đủ có 10 câu thử)
const products = [
  { id: 1, name: 'Gạo ST25 5kg', price: 180000, aliases: ['gạo st25', 'gạo st hai lăm'] },
  { id: 2, name: 'Nước mắm Nam Ngư 500ml', price: 35000, aliases: ['nước mắm'] },
  { id: 3, name: 'Mì Hảo Hảo tôm chua cay', price: 4500, aliases: ['mì hảo hảo'] },
  { id: 4, name: 'Trứng gà (vỉ 10)', price: 32000, aliases: ['trứng'] },
  { id: 5, name: 'Đường trắng 1kg', price: 25000 },
  { id: 6, name: 'Coca-Cola lon 330ml', price: 10000, aliases: ['coca', 'coca lon'] },
];
```

### Đo nhanh khớp bằng character trigram (đệm 2 khoảng trắng đầu, 1 cuối, sau khi bỏ dấu)
- "gạo" so với "Gạo ST25 5kg": Dice **0.47**, containment **1.00**.
- "gạo" so với "Gạo tám thơm": Dice 0.47, containment 1.00. Hai món cùng điểm, nên phải hỏi người dùng chọn.
- "đường" so với "Đường trắng 1kg": Dice 0.57, containment 1.00.
- "mì hảo hão" so với "Mì Hảo Hảo tôm chua cay": Dice 0.55, containment 1.00.

Kết luận: chấm chính bằng **containment** (tỉ lệ trigram của span nằm trong tên), dùng Dice để xếp hạng phụ. Chỉ dùng Dice thì span ngắn bị loại.

---

## 4. Các phương án đã loại (đừng research lại)

| Phương án | Lý do loại | Nguồn |
|---|---|---|
| **NeuDecide** (neuphonic/neudecide) | Chỉ hỗ trợ tiếng Anh. Kiến trúc là encoder của `nvidia/stt_en_fastconformer_hybrid_medium_streaming_80ms` ghép với decoder khởi tạo từ Needle, train end-to-end. Muốn tiếng Việt phải thay encoder và train lại toàn bộ; repo không có code train. Không cắm ChunkFormer vào được vì không có transcript ở giữa | README, mục Acknowledgements |
| **Cascade dịch** VN → EN | Tên hàng bị dịch hỏng, lỗi cộng dồn qua nhiều model, còn phải map ngược về catalog tiếng Việt | Suy luận |
| **Jev (TypeSafe)** | Là classifier qua API ngoài, không chạy offline. Chỉ điền được enum/boolean. Chưa rõ có hỗ trợ tiếng Việt không | Docs của Composio, bài viết của Deepgram |
| **Needle 3 chưa fine-tune** (cactus-compute/needle) | Đã test trên sandbox WASM với tool `add_sale_line(product enum, qty)`: **mọi câu tiếng Việt đều sai** (sai tool, bịa số lượng, lý giải bị lặp). Cùng bộ tool đó bằng tiếng Anh thì đúng | Đã test |
| **PhoBERT NER** | Khoảng 135M tham số, quá nặng để chạy trên máy. Nếu chạy server thì dùng LLM có sẵn còn hơn | Suy luận |

Needle fine-tune bằng LoRA trên text (`needle finetune data.jsonl`) là hướng **để sau**, khi đã có vài nghìn câu thật. Không thuộc PoC này.

---

## 5. Kiến trúc PoC

```
audio ─► L0 sherpa STT (+hotwords từ catalog) ─► transcript
      ─► L1 normalize + ITN        (có sẵn trong parseOrder.ts)
      ─► L2 gazetteer n-gram        (exact word n-gram có sẵn + char-trigram containment MỚI) → feature
      ─► L3 CRF BIO tagger          (MỚI: QTY UNIT ITEM AMT EXP O) → ghép thành {qty, unit, item_span}
      ─► L4 linker + gate           (MỚI: top-k trigram; nhận / hỏi chọn biến thể / gửi LLM)
      ─► draft (chủ shop xác nhận, NFR-006)
```

- **L0 [suy luận, phải kiểm chứng]:** sherpa-onnx hỗ trợ hotwords cho transducer khi `decodingMethod: 'modified_beam_search'`, cần thêm `bpe.model` cùng `modelingUnit`/`bpeVocab` tuỳ phiên bản. Cần kiểm tra wrapper `react-native-sherpa-onnx@0.4.4` có expose tham số hotwords không: đọc source trong `node_modules` sau khi chạy `npm ci` ở `frontend/mobile` (worktree hiện chưa có `node_modules`). Nếu wrapper không hỗ trợ, ghi vào BLOCKERS và bỏ qua L0. Endpoint: cân nhắc chốt câu khi người dùng thả nút mic, thay vì chờ khoảng lặng (thời gian chờ endpoint mới là phần trễ người dùng thấy rõ nhất).
- **L2/L4 linker:** inverted index trigram → `product_id`. Score = containment, phân thứ hạng bằng Dice. Khớp chính xác tên hoặc alias thì lên 1.0. Gate: nhận khi top1 ≥ τ **và** top1 − top2 ≥ δ **và** có số lượng. Nếu có ≥ 2 ứng viên sát nhau thì trả về `disambiguations` (UI đã có). τ và δ tune trên phần dev của bộ eval, không tune trên phần test.
- **L3 CRF:** linear-chain CRF, nhãn BIO. Feature gồm: token đã bỏ dấu, token gốc, có phải chữ số không, có phải từ số đếm không (dùng từ điển trong `parseOrder`), có trong danh sách đơn vị không, nhãn gazetteer (exact/trigram, B/I), token ±1 và ±2, bigram, vị trí đầu hoặc cuối câu.
  - Train offline bằng Python (`python-crfsuite` hoặc `sklearn-crfsuite`), xuất `state_features` và `transition_features` ra JSON.
  - Decoder Viterbi bằng TS tự viết (khoảng 60 dòng). **Kiểm tra parity:** TS và Python phải ra cùng chuỗi nhãn trên toàn bộ bộ eval.
  - Đặt script train ở `frontend/mobile/scripts/voice-crf/` hoặc chỗ hợp với convention của repo; xem `scripts/` ở root và `backend/ai` (đang dùng `uv`). Không thêm dependency Python vào runtime của `backend/ai`.
- **Ghép slot:** mỗi `ITEM` gắn với `QTY`/`UNIT` gần nhất cùng mệnh đề, xét cả trước và sau, để xử lý được câu "gạo hai bao". Không có QTY thì giữ hành vi `missingQuantityItems` hiện tại.
- **Fallback LLM:** khi tỉ lệ token nhãn `O` > X% hoặc không ra item nào, gọi `draft_parse`. Trong PoC chỉ cần **đếm** số câu sẽ fallback; việc nối API thật là tuỳ chọn và phải hỏi owner trước khi sửa `backend/ai` hoặc contract.
- **Giữ nguyên interface** `parseOrder(text, products): ParsedOrder`, để `voice.tsx` và `expenses.tsx` không phải sửa. Bản PoC có thể nằm sau một flag hoặc trong file mới, rồi swap vào khi đạt mục tiêu.

---

## 6. Dữ liệu

- **Synthetic train set (5–10k câu):** sinh từ template, nhãn có sẵn.
  - Template: `[từ mở]? [QTY] [UNIT]? [ITEM] ([nối] …)*`, `[ITEM] [QTY] [UNIT]?`, các câu nói liền không có từ nối, các câu khoản chi `[chi|trả] [AMT] [tiền]? [mô tả]`.
  - Biến thể: có dấu và không dấu, số viết bằng chữ và bằng chữ số, alias, từ đệm ("cho chị", "lấy", "nha", "à", "ờ"), lỗi STT giả lập (bỏ hoặc sai dấu, dính hoặc tách từ).
  - Dùng nhiều catalog (tạp hoá, quán cà phê, quán cơm) để CRF học **cấu trúc câu** thay vì học thuộc tên hàng.
- **Bộ eval gold (≥ 200 câu, tự soạn):** câu nói tự nhiên, **khác template** dùng cho synthetic. Phải có đủ các nhóm: khớp một phần tên, đảo thứ tự, không có từ nối, từ đệm, món ngoài catalog, câu mơ hồ, khoản chi, câu lẫn cả bán và chi, câu không có món. Chia **dev/test** (ví dụ 40/60). Gắn nhãn kỳ vọng ở mức draft: `[{product_id|null, qty}]`, `expenses`, `disambiguation?`. Ghi rõ trong báo cáo đây là câu tự soạn, chưa phải câu thật.
- Đặt eval set và script ở chỗ commit được (ví dụ `frontend/mobile/scripts/voice-crf/eval/`). Không chứa dữ liệu thật của người dùng.

---

## 7. Chỉ số và mục tiêu

| Chỉ số | Mục tiêu | Ghi chú |
|---|---|---|
| Exact match theo món (product + qty), trên tập test | ≥ 90% | So với baseline `parseOrder` |
| Exact match theo câu | Báo cáo | Câu chỉ tính đúng khi mọi món đều đúng |
| Sai mà vẫn tự nhận (gate để lọt) | ≤ 2% | Chỉ số quan trọng nhất cho niềm tin người dùng |
| Tỉ lệ fallback hoặc hỏi lại | ≤ 15% | |
| Độ trễ parse L1–L4 | P95 < 5 ms | Đo trên Node, catalog 1.000 món; trên máy thật nếu có |
| Không làm hỏng câu đang đúng | 0 câu từ đúng thành sai | So từng câu với baseline |
| L0 hotword | WER trên tên hàng giảm, độ trễ chấp nhận được | Chỉ khi có máy hoặc emulator |

---

## 8. Plan

1. **Orient:** `git status`, đọc các file ở §2, đọc `parseOrder.ts`, `sherpaEngine.ts`, `core.ts`, `voice.tsx` (đoạn gọi `parseOrder`). Checkout `feat/voice-parse-poc`. Cân nhắc dùng skill `long-horizon-state` để lưu state chịu được crash nếu việc kéo qua nhiều session. → verify: nêu lại được luồng ở §3.
2. **Eval harness + baseline:** soạn bộ gold, viết script eval, chạy baseline. → verify: ra bảng chỉ số baseline, kết quả 10 câu ở §3 khớp lại.
3. **Linker trigram + gate (không train):** → verify: chạy eval, so với baseline, không có câu nào từ đúng thành sai.
4. **Synthetic generator + CRF:** train, xuất JSON, viết Viterbi TS, test parity. → verify: parity 100%, có chỉ số trên dev/test.
5. **Tích hợp L1–L4** sau interface `parseOrder`, tune τ/δ trên dev. → verify: chỉ số trên test, độ trễ P95, `npm run typecheck` pass.
6. **L0 hotword:** kiểm tra khả năng của wrapper; nếu được thì nối hotwords sinh từ catalog và đo trên máy. → verify: WER và độ trễ, hoặc ghi BLOCKERS.
7. **Báo cáo + log:** thêm entry vào `PROGRESS.md`, viết báo cáo cuối (§1, mục 4). Commit theo từng bước logic. **Không push, không mở PR khi owner chưa đồng ý.**

---

## 9. Rủi ro và câu hỏi mở

- Wrapper RN có thể không expose hotwords: khi đó phải patch native hoặc bỏ qua L0.
- CRF có thể overfit theo template synthetic. Giảm thiểu bằng nhiều catalog, nhiễu STT giả lập, và bộ eval soạn khác template.
- Catalog thay đổi thì phải dựng lại index trigram và gazetteer. Rẻ, nhưng phải có chỗ trigger, ví dụ khi danh sách sản phẩm trong store đổi.
- Shop có nhiều món tên gần giống nhau sẽ làm tỉ lệ hỏi lại tăng; xem đây là đánh đổi chấp nhận được.
- Câu hỏi cho owner, chỉ hỏi khi thật sự cần: có muốn nối fallback LLM thật trong PoC không? Ngưỡng hỏi lại bao nhiêu thì chấp nhận được với UX?
