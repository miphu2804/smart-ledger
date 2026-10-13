# Báo cáo: Voice Parse PoC (ITN + n-gram linker + CRF + gate)

Báo cáo kết quả của PoC theo [brief](../voice-parse-poc-brief.md). Nhánh `feat/voice-parse-poc`, chưa mở PR. Nhãn **[đã kiểm chứng]** là đã chạy hoặc đã đọc code; **[suy luận]** là chưa chạy được.

## 1. Kết luận

PoC L1–L4 đạt mọi mục tiêu §7 đo được trên Node, trên tập test của bộ câu tự soạn **[đã kiểm chứng]**. L0 (hotword) chưa kiểm chứng: không có máy Android, và wrapper `react-native-sherpa-onnx@0.4.4` cần vá native mới bật được hotword cho STT streaming (xem [BLOCKERS.md](../../../BLOCKERS.md)).

PoC nằm ở `frontend/mobile/src/lib/voiceParse/`, giữ nguyên interface `parseOrder(text, products): ParsedOrder`, **chưa nối vào màn voice**: `app/voice.tsx` chưa hiển thị `disambiguations` (mục 6), nên thay vào lúc này là đổi hành vi sản phẩm và cần owner quyết.

Bộ eval là **câu tự soạn, chưa phải câu thật** của người dùng. Con số dưới đây cho biết PoC tốt hơn baseline nhiều trên cùng bộ câu, không phải độ chính xác ngoài thực tế.

## 2. Bảng chỉ số §7 (tập test, 156 câu, 162 dòng vàng)

| Chỉ số | Baseline `parseOrder` | PoC (tagger luật, mặc định) | PoC + CRF | Mục tiêu | Đạt |
|---|---|---|---|---|---|
| Exact match theo món (mọi dòng) | 41.4% | **96.3%** | 96.3% | ≥ 90% | ✓ |
| — chỉ món trong danh mục | 39.9% | 96.4% | 95.7% | | |
| Exact match theo câu | 34.6% | **95.5%** | 96.2% | báo cáo | |
| Sai mà vẫn tự nhận (dòng tự nhận sai / dòng tự nhận) | 17.9% (12/67) | **0.7% (1/134)** | 0.8% (1/133) | ≤ 2% | ✓ |
| Fallback hoặc hỏi lại (câu) | 0.0% | **7.7%** | 8.3% | ≤ 15% | ✓ |
| Khoản chi đúng số tiền | 71.4% | 100% | 100% | | |
| Câu từ đúng thành sai so với baseline | — | **0** | 0 | 0 | ✓ |
| Câu từ sai thành đúng | — | 95 | 96 | | |
| Độ trễ L1–L4, catalog 1.000 món, P95 (ổn định / lượt đầu) | 15.9 / 20.4 ms | **1.8 / 2.5 ms** | 2.3 / 2.8 ms | < 5 ms | ✓ |
| L0 hotword: WER tên hàng | — | chưa đo | | giảm | ✗ blocker |

Tập dev (104 câu, dùng để soát lỗi và tune): PoC 98.2% theo món, 98.1% theo câu, 0/90 tự nhận sai, hỏi lại 9.6%, 0 câu hỏng; PoC + CRF 96.4% theo món và **2 câu hỏng** trên dev.

Theo nhóm (exact theo câu, test): mơ hồ 0% → 100%, khoản chi 50% → 100%, nói liền 33% → 100%, tên một phần 4.8% → 100%, đảo thứ tự 53% → 100%, câu không có món 0% → 100%, từ đệm 33% → 87%, món ngoài danh mục 83% → 92%, lỗi STT 28% → 78%.

Độ trễ đo trên Node v22.22 (container 4 vCPU), không phải máy thật. P95 dao động giữa các lần chạy: ổn định 1.7–2.5 ms, lượt đầu (mỗi câu chạy một lần, bộ nhớ đệm còn lạnh) 2.2–3.5 ms. Dựng chỉ mục cho 1.000 món mất ~80 ms một lần mỗi khi danh sách sản phẩm đổi (màn voice giữ mảng sản phẩm bằng `useMemo`, chỉ mục cache theo mảng).

## 3. Chạy lại

Trong `frontend/mobile` (Node có `--experimental-strip-types`; Python qua `uv`, không đụng `backend/ai`):

```bash
npm run voice:eval                       # bảng §7 cho baseline, PoC, PoC + CRF trên dev và test, kèm độ trễ
npm run voice:eval -- --failures dev     # câu sai của dev (soát lỗi chỉ trên dev)
npm run voice:tune                       # dò τ/δ chỉ trên dev
npm run voice:synth                      # 8.000 câu train + 1.000 câu dev synthetic, đặc trưng ra .data/
npm run voice:train                      # train CRF (python-crfsuite), xuất src/lib/voiceParse/crf-model.json
npm run voice:parity                     # so Viterbi TS với CRFsuite trên bộ eval và synthetic dev
npm run typecheck
```

`node scripts/voice-crf/...` chạy thẳng mã TS của app nhờ `scripts/voice-crf/ts-resolve.mjs` (thêm đuôi `.ts` và thuộc tính JSON như Metro), không đổi `tsconfig`.

## 4. Đã làm

| Lớp | File | Nội dung |
|---|---|---|
| L1 normalize + ITN | `text.ts` | Token giữ dạng có dấu, bỏ dấu và vị trí ký tự; gộp số tiền đọc hoặc viết (`20k`, `hai chục nghìn`, `một triệu hai` = 1.200.000); từ số có dấu sai cách viết thì không phải số ("cơm tấm"); tách chữ-số dính (`st25`). Dùng lại `parseSpokenRun` của `parseOrder.ts`. |
| L2 gazetteer + chỉ mục | `catalog.ts` | Biến thể đọc được của tên (`Gạo ST25 5kg` → `gao st hai lam nam ky`), n-gram gazetteer, chỉ mục trigram, cache theo mảng sản phẩm. |
| L3 tagger | `tagger.ts` (luật), `features.ts` + `crf.ts` (CRF) | Nhãn BIO QTY UNIT ITEM AMT EXP O. Mặc định tagger luật; CRF dùng qua `parseOrderDetailed(text, products, { tagger: crfTagger(model) })`. |
| Ghép slot | `index.ts` | Mỗi ITEM lấy QTY/UNIT cùng mệnh đề; câu nói tên trước ("gạo hai bao") thì lấy số đứng sau. |
| L4 linker + gate | `catalog.ts`, `index.ts` | Căn chỉnh từ theo thứ tự với tên món (không phải túi trigram), trọng số IDF theo danh mục; từ sai dấu 0.9, gần âm s/x, gi/d/r, ch/tr 0.8, gần giống chính tả theo Dice trigram, dính/tách từ. Nhận khi điểm ≥ τ = 0.72 và cách ứng viên 2 ≥ δ = 0.12; nhiều ứng viên sát nhau thì trả `disambiguations` (tối đa 6); dưới τ là món ngoài danh mục. |
| Fallback | `index.ts` | `parseOrderDetailed().fallback = true` khi câu có số hoặc nhãn khác O nhưng không ra dòng nào. Chỉ đếm, chưa gọi `draft_parse`. |

Vì sao bỏ chấm điểm bằng túi trigram (brief §3, containment): "xôi gà" chứa đủ trigram của "Cơm gà xối mỡ" (containment 1.0) nên sẽ bị tự nhận sai; căn chỉnh theo thứ tự cho 0.54 (dưới τ). **[đã kiểm chứng]** trên bộ eval.

τ và δ dò trên dev (`voice:tune`): mọi cặp τ ∈ [0.64, 0.80] cho cùng kết quả tốt nhất trên dev; chọn τ = 0.72, δ = 0.12 ở giữa vùng (cả 25 cặp lân cận cũng tốt nhất). Dev quá nhỏ để phân biệt δ.

## 5. CRF

- Dữ liệu train: 8.000 câu synthetic (+1.000 câu dev) sinh từ mẫu trên 8 danh mục train (tạp hoá khác, quán nhậu, trà sữa, tiệm bánh, bún phở, trái cây, văn phòng phẩm, phụ kiện điện thoại), **không trùng** danh mục eval. Có câu bán (số trước/sau tên, nói liền, chỉ đơn vị), món ngoài danh mục, khoản chi, câu lẫn bán và chi, câu chuyện phiếm; biến thể không dấu, số đọc/viết, tên một phần, đổi dấu thanh, gần âm, dính/tách từ.
- Đặc trưng chỉ tính bằng TS (`features.ts`) rồi xuất cho Python, nên train và chạy trên máy dùng đúng một bộ đặc trưng.
- `python-crfsuite==0.9.11`, L-BFGS, c1 = 0.05, c2 = 0.01, 300 vòng: 9 nhãn, 2.947 trọng số khác 0, JSON 63 KB.
- F1 theo cụm trên synthetic dev (cùng phân phối với train, nên lạc quan): ITEM 0.980, QTY 0.994, UNIT 0.997, AMT 0.994, EXP 0.999.
- **Parity Viterbi TS so với CRFsuite: 100%** — 260/260 câu eval (1.698 token) và 1.000/1.000 câu synthetic dev (9.016 token) **[đã kiểm chứng]**. Decoder (`crf.ts`, ~60 dòng) cộng điểm và phá hoà đúng như `crf1dc_viterbi`; 0.15 ms/câu.
- Đầu-cuối: ngang tagger luật trên test, kém hơn trên dev. Hai câu dev CRF làm hỏng là chỗ synthetic thiếu mẫu: bổ ngữ sau tên món ("trà tắc **không đường**") và câu chỉ có tên món ngoài danh mục ("gỏi cuốn cho chị"). Theo YAGNI của brief, CRF chỉ train để so sánh; tagger mặc định chọn theo dev là tagger luật.

## 6. Kiểm chứng lại các phần của brief

| Nội dung brief | Kết quả |
|---|---|
| Luồng `voice.tsx` → `speech` → `parseOrder` (§3) | Đúng **[đã kiểm chứng]**. |
| `disambiguations`: "UI đã có" (§5) | **Sai trên staging mới nhất.** `voice.tsx` chỉ đọc `items`, `unknown`, `missingQuantityItems`, `expenses`; `parseOrder` luôn trả `disambiguations: []`. Thay PoC vào thì câu mơ hồ sẽ không hiện gì ngoài "chưa nhận diện được món". |
| Bench 10 câu, catalog có `aliases` (§3) | Bench chạy lại đúng 6/10 **[đã kiểm chứng]**, 0.19 ms/lần trên máy này. Nhưng app thật truyền `{ id, name, price }`, **không có `aliases`** (Core `ProductView` không có trường này), nên bench đánh giá baseline cao hơn thực tế. Bộ eval dùng danh mục chỉ có tên. |
| Baseline ~0.05 ms | Đúng với 6 món; với 1.000 món baseline mất P95 ~16 ms (dựng lại khoá tên mỗi lần gọi). |
| Wrapper có hotword? (§5 L0, [suy luận]) | Có tham số `hotwordsFile`, `hotwordsScore`, `createStream(hotwords)` cho streaming, nhưng phần online (Android và iOS) không truyền `modelingUnit`/`bpeVocab`. Với sherpa-onnx v1.12.35: `modelingUnit` rỗng → `EncodeHotwords` gọi `exit(-1)`; hotwords cùng `greedy_search` → `exit(-1)` lúc decode **[đã kiểm chứng trên mã nguồn]**. Chưa chạy được trên máy. AAR dựng sẵn `com.xdcobra.sherpa:sherpa-onnx` không tải được qua proxy nên giả định giống mã upstream **[suy luận]**. |
| Node v26 trên máy dev | Container dùng Node v22.22; `--experimental-strip-types` vẫn chạy. TS 6 mặc định `types: []`, nên script dùng API Node khai báo `/// <reference types="node" />`. |

## 7. Đã kiểm chứng và chưa kiểm chứng

**Đã kiểm chứng:** bảng §7 trên dev/test bằng `npm run voice:eval`; parity 100% bằng `npm run voice:parity`; `npm run typecheck` pass; 0 câu đúng→sai trên dev và test; mã wrapper và mã sherpa-onnx upstream về hotword.

**Chưa kiểm chứng:** L0 hotword (WER tên hàng, độ trễ beam search); độ trễ trên máy Android thật (mới đo trên Node); độ chính xác với catalog 1.000 món (mới đo độ trễ: món gần giống tăng thì tỉ lệ hỏi lại có thể tăng); câu thật của người dùng; fallback LLM thật (`draft_parse` chưa được gọi); UX hỏi chọn biến thể.

**Cách làm bộ eval và giới hạn của nó:** 260 câu do một sub-agent viết nháp theo quy tắc gắn nhãn, không xem code parser; tôi soát lại toàn bộ nhãn. Chia dev/test 40/60 phân tầng theo 11 nhóm, seed cố định, đóng băng trước khi viết PoC. Lỗi được soát trên dev; tập test chỉ xem số tổng, trừ một lần bảng eval in ra ID 4 câu test bị hỏng ở phiên bản đầu (đã tắt ngay, các sửa sau đều xuất phát từ câu dev). Tôi đã đọc mọi câu eval khi soát nhãn, nên danh sách từ đệm/từ chuyện phiếm có thể vô tình hợp với bộ câu này hơn câu thật. Lỗi trên test chỉ được xem sau khi chốt PoC, để viết mục 8.

## 8. Lỗi còn lại trên test (PoC mặc định)

| Câu | Lỗi | Nguyên nhân |
|---|---|---|
| "ờ để chị xem à có đường không, hai ký đường nha" | Tự nhận Đường × 3 (đúng là × 2) | Câu hỏi còn hàng "có … không" bị tính là bán thêm 1. Đây là dòng tự nhận sai duy nhất. |
| "chin su một chai" | Món lạ "Su" × 9 | Gõ không dấu: "chin" bị đọc là số chín. |
| "ừm à cho anh một bún bò huế nha chủ quán" | Thừa món lạ "Chủ" | "chủ quán" chưa có trong danh sách xưng hô. |
| "hai cây kem que nha em, thêm hai lon coca" | Món lạ "Que" chưa có số lượng | "kem" có trong "Kem đánh răng" nên bị tách khỏi "que". |
| "bia tigơ", "chôcô pai", "xì dầu maggi" | Không nhận ra món | Lỗi STT nặng hoặc từ đồng nghĩa; cần hotword (L0) hoặc LLM. |

## 9. Rủi ro

- Bộ câu tự soạn; câu thật có thể dài hơn, nhiều tiếng địa phương và lỗi STT khác. Cần đo lại trên câu thật (có xin đồng ý, không log transcript ở production khi chưa duyệt).
- Danh mục lớn có nhiều món gần giống làm tăng tỉ lệ hỏi lại; chưa có bộ eval cho trường hợp này.
- Danh sách từ đệm/chuyện phiếm là luật viết tay; CRF có thể thay khi synthetic đủ mẫu.
- Bật hotword khi chưa vá wrapper sẽ làm app thoát (`exit(-1)`).
- PoC đọc "chín", "năm", "tám" gõ không dấu là số khi không nằm trong tên món.

## 10. Bước tiếp theo

1. Owner quyết UX hỏi chọn biến thể: `voice.tsx` hiển thị `disambiguations` (chọn món, giữ số lượng), rồi đổi import `parseOrder` sang `src/lib/voiceParse`; cập nhật PRD/AC nếu thay đổi hành vi.
2. Owner quyết có nối fallback `draft_parse` (backend/ai) cho câu `fallback = true` hay không.
3. L0: vá wrapper bằng `patch-package` (`modelingUnit = "bpe"`, `bpeVocab`, `modified_beam_search` khi có hotword), thêm `bpe.vocab` vào `STT_MODEL_FILES`, sinh hotword từ danh mục, đo WER tên hàng và độ trễ trên máy Android thật.
4. Thu bộ câu thật (có đồng ý) để đo lại; thêm bộ eval cho danh mục lớn có món gần giống.
5. Nếu cần CRF: thêm vào synthetic bổ ngữ sau tên món, câu chỉ có tên món, câu hỏi còn hàng ("có … không"), rồi so lại với tagger luật trên dev.
