# Báo cáo: Voice Parse PoC (ITN + n-gram linker + CRF + gate)

Báo cáo kết quả của PoC theo [brief](../voice-parse-poc-brief.md). Nhánh `feat/voice-parse-poc`, chưa mở PR. Nhãn **[đã kiểm chứng]** là đã chạy hoặc đã đọc code; **[suy luận]** là chưa chạy được.

## 1. Kết luận

- **Câu đặt hàng thông thường:** PoC L1–L4 đạt mọi mục tiêu §7 đo được trên Node, trên tập test của bộ câu tự soạn **[đã kiểm chứng]**.
- **Câu cấu trúc tự do** ("mỗi thứ một cái", "pepsi cũng vậy", "à không, ba gói", "bàn năm hai cà phê", câu dài lồng nhau): lần đo giữ kín duy nhất (100 câu, giai đoạn 2) cho 70.8% theo món, 7.0% tự nhận sai, 25% hỏi lại, **chưa đạt mục tiêu**. Giai đoạn 3 (CRF chạy trước, độ tin cậy theo đơn hàng) đưa bộ đó lên 83.9% / 0.7% / 17%, nhưng bộ này đã được xem lỗi nên **không còn là số giữ kín** (mục 3.1). Cần một bộ giữ kín mới để có số trung thực.
- **STT:** eval chấm được transcript của từng hệ STT (`--asr`), có script cho ChunkFormer (greedy, beam + KenLM, hotword) và Zipformer đang dùng. **Chưa có số ASR thật**: cần audio người đọc các câu eval và model tải từ Hugging Face (mục 12).
- **L0 (hotword):** chưa kiểm chứng. Không có máy Android, và wrapper `react-native-sherpa-onnx@0.4.4` cần vá native mới bật được hotword cho STT streaming (xem [BLOCKERS.md](../../../BLOCKERS.md)).

PoC nằm ở `frontend/mobile/src/lib/voiceParse/`, giữ nguyên interface `parseOrder(text, products): ParsedOrder`, **chưa nối vào màn voice**: `app/voice.tsx` chưa hiển thị `disambiguations` (mục 7), nên thay vào lúc này là đổi hành vi sản phẩm và cần owner quyết.

Bộ eval là **câu tự soạn, chưa phải câu thật** của người dùng. Các con số cho biết PoC so với baseline trên cùng bộ câu, không phải độ chính xác ngoài thực tế.

## 2. Bảng chỉ số §7: bộ chính (tập test, 156 câu, 162 dòng vàng)

Cột "PoC" là chế độ mặc định từ giai đoạn 3: CRF trước, câu nào CRF không tự nhận được thì tagger luật gắn nhãn lại (mục 5). Hai cột sau chỉ dùng một tagger, để so sánh. Giai đoạn 2 (luật trước) trên cùng tập: 96.3% theo món, 0.8% (1/133) tự nhận sai, 9.0% hỏi lại, P95 2.3 / 3.3 ms.

| Chỉ số | Baseline `parseOrder` | **PoC (mặc định)** | Chỉ tagger luật | Chỉ CRF | Mục tiêu | Đạt |
|---|---|---|---|---|---|---|
| Exact match theo món (mọi dòng) | 41.4% | **96.3%** | 95.1% | 93.2% | ≥ 90% | ✓ |
| — chỉ món trong danh mục | 39.9% | 95.7% | 94.9% | 93.5% | | |
| Exact match theo câu | 34.6% | **96.2%** | 95.5% | 92.9% | báo cáo | |
| Sai mà vẫn tự nhận (dòng tự nhận sai / dòng tự nhận) | 17.9% (12/67) | **0.0% (0/132)** | 0.0% (0/131) | 0.0% (0/129) | ≤ 2% | ✓ |
| Fallback hoặc hỏi lại (câu) | 0.0% | **9.6%** | 10.3% | 14.1% | ≤ 15% | ✓ |
| Khoản chi đúng số tiền | 71.4% | 100% | 100% | 100% | | |
| Câu từ đúng thành sai so với baseline | — | **0** | 0 | 1 | 0 | ✓ |
| Câu từ sai thành đúng | — | 96 | 95 | 92 | | |
| Độ trễ L1–L4, catalog 1.000 món, P95 (ổn định / lượt đầu) | 14.4 / 18.5 ms | **4.5 / 5.3 ms** | 2.0 / 2.0 ms | 4.0 / 4.0 ms | < 5 ms | ~ |
| L0 hotword: WER tên hàng | — | chưa đo | | | giảm | ✗ blocker |

Tập dev (104 câu, dùng để soát lỗi và tune): PoC mặc định 98.2% theo món, 98.1% theo câu, 0/90 tự nhận sai, hỏi lại 8.7%, 0 câu hỏng.

Theo nhóm (exact theo câu, test): mơ hồ 0% → 100%, khoản chi 50% → 100%, nói liền 33% → 100%, tên một phần 4.8% → 100%, đảo thứ tự 53% → 100%, câu không có món 0% → 100%, món ngoài danh mục 83% → 100%, từ đệm 33% → 93%, câu đơn giản 50% → 94%, lỗi STT 28% → 78%.

Độ trễ đo trên Node v22.22 (container 4 vCPU), không phải máy thật; P95 dao động khoảng ±1 ms giữa các lần chạy. Giai đoạn 3 chậm hơn giai đoạn 2 (P95 4.5 so với 2.3 ms) vì mọi câu chạy CRF, câu CRF chưa chắc thì tính thêm 16 chuỗi nhãn tốt nhất và câu CRF không nhận được thì chạy thêm tagger luật; lượt đầu P95 5.3 ms, sát ngưỡng 5 ms. Dựng chỉ mục cho 1.000 món mất 50–90 ms, một lần mỗi khi danh sách sản phẩm đổi (màn voice giữ mảng sản phẩm bằng `useMemo`, chỉ mục cache theo mảng).

## 3. Câu cấu trúc tự do (`eval/free.jsonl`)

Sau khi bộ chính đạt, PoC được thử với câu không theo mẫu "số + đơn vị + món". Bản đầu tự nhận sai 23.6% vì không hiểu số đi với món nào mà vẫn đoán số lượng = 1. Giai đoạn 2 thêm:

- **Gate "không hiểu thì không đoán"**: số lượng chưa gắn được vào món, số bị bỏ sót, dấu hiệu "mỗi thứ / cũng vậy / à không / tổng rồi kể" mà tagger không giải thích, hoặc CRF kém tự tin (xác suất biên < 0.9) → không tự nhận, trả `fallback = true` (gửi LLM hoặc hỏi lại).
- **CRF học quan hệ số lượng**: nhãn mới QTYP (số của món trước), QTYD (một số cho cả danh sách), QTYC (sửa số vừa nói), COPY ("cũng vậy"); số bàn/giờ và số tổng gán O. Synthetic thêm các cấu trúc này.

| Chỉ số | Baseline | **PoC (mặc định)** | Chỉ tagger luật | Chỉ CRF | Mục tiêu |
|---|---|---|---|---|---|
| **free-test** (100 câu giữ kín, 168 dòng): exact theo món | 28.6% | **70.8%** | 29.8% | 61.9% | ≥ 90% ✗ |
| free-test: exact theo câu | 8.0% | 62.0% | 27.0% | 58.0% | |
| free-test: tự nhận sai | 42.0% (34/81) | **7.0% (9/128)** | 12.3% (7/57) | 1.9% (2/106) | ≤ 2% ✗ |
| free-test: hỏi lại / fallback | 0% | **25.0%** | 62.0% | 40.0% | ≤ 15% ✗ |
| free-test: câu từ đúng thành sai | — | 1 | 2 | 3 | 0 ✗ |
| free-dev (32 câu dùng để phát triển): exact theo món | 18.0% | 96.7% | 59.0% | 95.1% | |
| free-dev: tự nhận sai / hỏi lại | 21.4% / 0% | 0% / 6.3% | 0% / 37.5% | 0% / 9.4% | |

Theo nhóm trên free-test (exact theo câu, PoC mặc định): kể theo tên trước ("nước mắm thì hai chai, còn maggi một") 100%, "cũng vậy" 92%, "mỗi thứ" 85%, câu thường 80%, sửa lời 42%, số không phải số lượng 33%, câu dài lồng nhau 25%, tổng rồi kể 0%.

**Đọc kết quả:** free-dev (96.7%) và free-test (70.8%) chênh nhiều vì mẫu synthetic được viết sau khi đã xem 32 câu dev, nên CRF học thuộc các biến thể đó. Trên câu giữ kín, lỗi chủ yếu là biến thể chưa gặp: "mỗi **tô** ba", "bạc xỉu **y chang**" (không có "cũng"), "ờ **sai**", "**khoan**", "**làm ơn**", "tớ", sửa lời đổi luôn món ("à nhầm phở bò tái"), câu dài có nhiều quan hệ. Tagger luật không nhận ra các biến thể này nên không kích gate và tự nhận sai. CRF đơn lẻ thận trọng hơn (tự nhận sai 1.9%) nhưng hỏi lại 40%. Kết luận: luật + CRF học từ mẫu tự soạn chưa đủ cho câu nói tự do; phần còn lại cần LLM dự phòng và câu thật.

Bộ free-test do sub-agent viết theo 8 nhóm, tôi không đọc câu nào và chỉ kiểm tra máy móc (ID hợp lệ) trước khi chốt parser ở commit `1fe0c7b`; chạy lần đầu sau đó và không sửa parser theo kết quả. Nếu dùng bộ này để sửa tiếp thì nó thành dev và cần một bộ giữ kín mới.

### 3.1 Giai đoạn 3: CRF trước, độ tin cậy theo đơn hàng

Soát lỗi giai đoạn 2 trên free-test (bộ này vì vậy đã thành dev) cho thấy một nguyên nhân chung chứ không phải từng mẫu câu: **tagger luật biến từ lạ thành món** ("làm **ơn**", "cho **tớ**", "**e** ơi", "bàn hai **ăn**", "mỗi **tô** ba") và món giả đó lấy mất số lượng của món thật; món thật còn lại nhận số lượng 1 và được tự nhận. Tagger luật không có độ tin cậy nên gate không biết nó sai. CRF gán O cho chính các từ đó với xác suất biên ≈ 1.00. Ở 4 câu cả hai tagger đều qua gate mà kết quả khác nhau, CRF đúng cả 4. Ngoài ra 16 câu bị chặn `unattached` có kết quả tạm đúng: CRF đã gán O đúng cho "ngày mười lăm", "số 0909", "hoá đơn số 88", "tổng cộng năm món", nhưng gate chỉ tin danh sách cứng "bàn/phòng/lúc/giờ".

Thay đổi (commit `ce848e1`), không thêm từ vựng hay mẫu câu nào:

- **CRF trước, luật dự phòng:** câu nào CRF không qua gate (bất kỳ lý do) thì tagger luật gắn lại; cả hai không qua thì `fallback`.
- **Độ tin cậy theo đơn hàng** thay cho xác suất biên nhỏ nhất của từng token: P(đơn hàng) = tổng xác suất các chuỗi nhãn trong 16 chuỗi tốt nhất (list Viterbi) ghép ra cùng đơn hàng và cùng kết quả gate. "vỉ" là UNIT hay O không đổi kết quả nên không còn làm câu bị hỏi lại. Chỉ tính khi riêng chuỗi Viterbi chưa đạt 0.9.
- **Số CRF chắc không phải số lượng** (P(O) ≥ 0.9) không còn bị coi là số bị bỏ sót.
- **Sửa lời:** số nằm giữa món và số sửa (QTYC) là số đã bị sửa, không còn là số chưa gắn.
- **Gate mới:** `duplicate` (một món nói hai lần, thường là sửa lời mà tagger không hiểu: "à nhầm", "khoan") và, chỉ với tagger luật, `implicit` (món trong danh mục không có số lượng trong câu có nói số lượng).

| Chỉ số | Giai đoạn 2 | **Giai đoạn 3** | Chỉ tagger luật | Chỉ CRF | Mục tiêu |
|---|---|---|---|---|---|
| free-test (đã xem lỗi, không còn giữ kín): exact theo món | 70.8% | **83.9%** | 29.2% | 76.2% | ≥ 90% ✗ |
| free-test: exact theo câu | 62.0% | 80.0% | 27.0% | 74.0% | |
| free-test: tự nhận sai | 7.0% (9/128) | **0.7% (1/142)** | 7.5% (4/53) | 0.0% (0/128) | ≤ 2% ✓ |
| free-test: hỏi lại / fallback | 25.0% | **17.0%** | 64.0% | 26.0% | ≤ 15% ✗ |
| free-test: khoản chi đúng | 62.5% | 37.5% | 25.0% | 25.0% | |
| free-dev: exact theo món / tự nhận sai / hỏi lại | 96.7% / 0% / 6.3% | 96.7% / 0% / 6.3% | | | |

Theo nhóm trên free-test (exact theo câu): kể theo tên trước 100%, "mỗi thứ" 90%, câu thường 90%, "cũng vậy" 92%, số không phải số lượng 83% (trước 33%), tổng rồi kể 75% (trước 0%), sửa lời 50%, câu dài lồng nhau 50%.

Khoản chi giảm vì hai câu dài (sửa lời đổi luôn số lượng) giờ bị gate `duplicate` chặn cả câu, trong khi trước đó tự nhận sai món; khoản chi trong kết quả tạm vẫn đúng. Dòng tự nhận sai còn lại: "lấy cho **tớ** ba cái bánh flan…": CRF chưa chắc, tagger luật nhận "tớ" gần "tố" (sinh tố) và gán "ba" cho nó.

`voice:tune` (chỉ dev) vẫn chọn θ = 0.9; vùng τ/δ tốt nhất giờ rộng hơn (τ ∈ [0.64, 0.90], δ ∈ [0.02, 0.30] cho cùng kết quả), nên giữ τ = 0.72, δ = 0.12. Bỏ gate `implicit` cho CRF vì nó hỏi lại một câu đúng của free-dev ("…với gạo st25", nói không kèm số là 1).

Các số giai đoạn 3 trên free-test là **số dev**, lạc quan. Đã thử và loại "chỉ tự nhận khi luật và CRF ra cùng kết quả" (bước 3 cũ): free-test tự nhận sai 0% nhưng hỏi lại 81%, vì tagger luật hỏng ở phần lớn câu tự do.

## 4. Chạy lại

Trong `frontend/mobile` (Node có `--experimental-strip-types`; Python qua `uv`, không đụng `backend/ai`):

```bash
npm run voice:eval                            # bảng §7: bộ chính dev/test, câu tự do free-dev/free-test, độ trễ
npm run voice:eval -- --failures dev          # câu sai của một tập (dev, free-dev, …); thêm --parser poc-crf
npm run voice:tune                            # dò τ/δ và ngưỡng tin cậy CRF chỉ trên dev
npm run voice:synth                           # 8.000 câu train + 1.000 câu dev synthetic, đặc trưng ra .data/
npm run voice:train                           # train CRF (python-crfsuite), xuất src/lib/voiceParse/crf-model.json
npm run voice:parity                          # so Viterbi và xác suất biên TS với CRFsuite
npm run typecheck
```

`node scripts/voice-crf/...` chạy thẳng mã TS của app nhờ `scripts/voice-crf/ts-resolve.mjs` (thêm đuôi `.ts` và thuộc tính JSON như Metro), không đổi `tsconfig`.

## 5. Đã làm

| Lớp | File | Nội dung |
|---|---|---|
| L1 normalize + ITN | `text.ts` | Token giữ dạng có dấu, bỏ dấu và vị trí ký tự; gộp số tiền đọc hoặc viết (`20k`, `hai chục nghìn`, `một triệu hai` = 1.200.000); từ số có dấu sai cách viết thì không phải số ("cơm tấm"); tách chữ-số dính (`st25`). Dùng lại `parseSpokenRun` của `parseOrder.ts`. |
| L2 gazetteer + chỉ mục | `catalog.ts` | Biến thể đọc được của tên (`Gạo ST25 5kg` → `gao st hai lam nam ky`), n-gram gazetteer, chỉ mục trigram, cache theo mảng sản phẩm. |
| L3 tagger | `tagger.ts` (luật), `features.ts` + `crf.ts` (CRF) | Nhãn BIO QTY UNIT ITEM AMT EXP O, cộng QTYP QTYD QTYC COPY (chỉ CRF gán). Mặc định (giai đoạn 3): CRF, câu CRF không qua gate thì tagger luật gắn lại (`fallbackTagger`). CRF trả thêm P(chuỗi Viterbi), 16 chuỗi tốt nhất (tính khi cần) và P(O) từng token. Model CRF nạp qua import JSON. |
| Ghép slot | `index.ts` | QTY thường lấy theo mệnh đề (số trước tên, hoặc số sau tên khi nói tên trước); nhãn quan hệ xét cả câu (món trước, cả danh sách, sửa lời, chép số). Sửa ranh giới cụm tên bằng linker: bỏ đơn vị đứng đầu, cắt bổ ngữ cuối ("không đường"), nối hai cụm cùng chỉ một món. |
| L4 linker + gate | `catalog.ts`, `index.ts` | Căn chỉnh từ theo thứ tự với tên món (không phải túi trigram), trọng số IDF theo danh mục; từ sai dấu 0.9, gần âm s/x, gi/d/r, ch/tr 0.8 (chỉ khi cùng dấu thanh: "bàn" ≠ "bánh"), gần giống chính tả theo Dice trigram, dính/tách từ. Nhận khi điểm ≥ τ = 0.72 và cách ứng viên 2 ≥ δ = 0.12; nhiều ứng viên sát nhau thì trả `disambiguations` (tối đa 6); dưới τ là món ngoài danh mục. |
| Fallback | `index.ts` | `fallback = true` khi gate không hiểu câu (`unattached`, `marker`, `duplicate`, `implicit`, `confidence`; mục 3, 3.1) hoặc câu có số/nhãn mà không ra dòng nào (`empty`); kết quả cục bộ nằm ở `tentative`, các mảng kết quả rỗng. Chỉ đếm, chưa gọi `draft_parse`. |

Vì sao bỏ chấm điểm bằng túi trigram (brief §3, containment): "xôi gà" chứa đủ trigram của "Cơm gà xối mỡ" (containment 1.0) nên sẽ bị tự nhận sai; căn chỉnh theo thứ tự cho 0.54 (dưới τ). **[đã kiểm chứng]** trên bộ eval.

Ngưỡng dò trên dev (`voice:tune`): mọi cặp τ ∈ [0.64, 0.80] cho cùng kết quả tốt nhất; chọn τ = 0.72, δ = 0.12 ở giữa vùng. Ngưỡng tin cậy CRF: mọi θ từ 0 đến 0.9 cho cùng kết quả trên dev + free-dev (12 câu dev đi qua CRF, câu đúng đều ≥ 0.98), chọn θ = 0.9 (cao nhất chưa làm giảm kết quả dev) để ưu tiên không tự nhận sai. Dev quá nhỏ để phân biệt δ và θ.

## 6. CRF

- Dữ liệu train: 8.000 câu synthetic (+1.000 câu dev) sinh từ mẫu trên 8 danh mục train (tạp hoá khác, quán nhậu, trà sữa, tiệm bánh, bún phở, trái cây, văn phòng phẩm, phụ kiện điện thoại), **không trùng** danh mục eval. Có câu bán (số trước/sau tên, nói liền, chỉ đơn vị, chỉ tên món, bổ ngữ sau tên), món ngoài danh mục, khoản chi, câu lẫn bán và chi, chuyện phiếm, và các câu có quan hệ số lượng (mỗi thứ, cũng vậy, sửa lời, số bàn/giờ, cho N người, tổng rồi kể, kể theo tên trước); biến thể không dấu, số đọc/viết, tên một phần, đổi dấu thanh, gần âm, dính/tách từ.
- Đặc trưng chỉ tính bằng TS (`features.ts`) rồi xuất cho Python, nên train và chạy trên máy dùng đúng một bộ đặc trưng.
- `python-crfsuite==0.9.11`, L-BFGS, c1 = 0.05, c2 = 0.01, 300 vòng: 17 nhãn, 5.158 trọng số khác 0, JSON 107 KB. Train lại cho ra đúng file đã commit.
- F1 theo cụm trên synthetic dev (cùng phân phối với train, nên lạc quan): ITEM 0.975, QTY 0.991, UNIT 0.996, AMT 0.994, EXP 0.999, QTYD 0.993, QTYC 0.981, COPY 0.967, QTYP 0.926.
- **Parity TS so với CRFsuite** **[đã kiểm chứng]**: nhãn Viterbi trùng 100% trên 392/392 câu eval (3.161 token, gồm bộ chính và câu tự do) và 1.000/1.000 câu synthetic dev (9.703 token). Xác suất biên (forward-backward TS) lệch tối đa 1.3e-6 so với CRFsuite. Viterbi không dùng hàm mũ nên trùng tuyệt đối; độ lệch của xác suất biên có lẽ do CRFsuite tính `exp` xấp xỉ khi build có SSE **[suy luận]**, không ảnh hưởng ngưỡng 0.9. Viterbi + xác suất biên mất 0.5–0.8 ms/câu.
- **n-best (giai đoạn 3):** list Viterbi giữ 16 đường mỗi ô (t, nhãn), ghép bằng trộn các danh sách đã sắp xếp; 0.2–0.6 ms/câu. `voice:parity` kiểm tra trên 392 câu eval và 1.000 câu synthetic: chuỗi đầu có cùng xác suất với chuỗi Viterbi, xác suất giảm dần, tổng ≤ 1, không trùng chuỗi **[đã kiểm chứng]**.

## 7. Kiểm chứng lại các phần của brief

| Nội dung brief | Kết quả |
|---|---|
| Luồng `voice.tsx` → `speech` → `parseOrder` (§3) | Đúng **[đã kiểm chứng]**. |
| `disambiguations`: "UI đã có" (§5) | **Sai trên staging mới nhất.** `voice.tsx` chỉ đọc `items`, `unknown`, `missingQuantityItems`, `expenses`; `parseOrder` luôn trả `disambiguations: []`. Thay PoC vào thì câu mơ hồ sẽ không hiện gì ngoài "chưa nhận diện được món". |
| Bench 10 câu, catalog có `aliases` (§3) | Bench chạy lại đúng 6/10 **[đã kiểm chứng]**, 0.19 ms/lần trên máy này. Nhưng app thật truyền `{ id, name, price }`, **không có `aliases`** (Core `ProductView` không có trường này), nên bench đánh giá baseline cao hơn thực tế. Bộ eval dùng danh mục chỉ có tên. |
| Baseline ~0.05 ms | Đúng với 6 món; với 1.000 món baseline mất P95 ~16 ms (dựng lại khoá tên mỗi lần gọi). |
| Wrapper có hotword? (§5 L0, [suy luận]) | Có tham số `hotwordsFile`, `hotwordsScore`, `createStream(hotwords)` cho streaming, nhưng phần online (Android và iOS) không truyền `modelingUnit`/`bpeVocab`. Với sherpa-onnx v1.12.35: `modelingUnit` rỗng → `EncodeHotwords` gọi `exit(-1)`; hotwords cùng `greedy_search` → `exit(-1)` lúc decode **[đã kiểm chứng trên mã nguồn]**. Chưa chạy được trên máy. AAR dựng sẵn `com.xdcobra.sherpa:sherpa-onnx` không tải được qua proxy nên giả định giống mã upstream **[suy luận]**. |
| LLM `draft_parse` làm dự phòng | Prompt có trong `backend/ai` (trả `qty`, `product_id`, `confidence`, `ambiguous`), nhưng `/internal/v1/drafts/parse` và `/api/v1/ai/drafts` còn ở trạng thái "Đích" trong API contract: chưa có endpoint, Core chưa proxy. |
| Node v26 trên máy dev | Container dùng Node v22.22; `--experimental-strip-types` vẫn chạy. TS 6 mặc định `types: []`, nên script dùng API Node khai báo `/// <reference types="node" />`. |

## 8. Đã kiểm chứng và chưa kiểm chứng

**Đã kiểm chứng:** bảng §7 và bảng câu tự do bằng `npm run voice:eval`; parity bằng `npm run voice:parity`; `npm run typecheck` pass; 0 câu đúng→sai trên dev và test của bộ chính; mã wrapper và mã sherpa-onnx upstream về hotword và LM (mục 12); chế độ `--asr` của eval (transcript trùng chữ vàng cho đúng số của eval chữ); `voice:asr prompts` và `voice:asr lm` chạy được, file ARPA nạp được bằng KenLM 0.3.0.

**Chưa kiểm chứng:** L0 hotword (WER tên hàng, độ trễ beam search); mọi số ASR (ChunkFormer, KenLM, Zipformer trên audio: chưa có audio, Hugging Face bị chặn trong môi trường này); `voice:asr chunkformer` và `voice:asr zipformer` chưa chạy lần nào; độ trễ trên máy Android thật (mới đo trên Node); độ chính xác với catalog 1.000 món (mới đo độ trễ); câu thật của người dùng; fallback LLM thật; UX hỏi chọn biến thể; số giữ kín cho giai đoạn 3.

**Cách làm bộ eval và giới hạn:**
- **Bộ chính (260 câu):** một sub-agent viết nháp theo quy tắc gắn nhãn, không xem code parser; tôi soát lại toàn bộ nhãn. Chia dev/test 40/60 phân tầng theo 11 nhóm, seed cố định, đóng băng trước khi viết PoC. Lỗi được soát trên dev; tập test chỉ xem số tổng, trừ một lần bảng eval in ra ID 4 câu test bị hỏng ở phiên bản đầu (đã tắt ngay). Tôi đã đọc mọi câu khi soát nhãn, nên danh sách từ đệm có thể vô tình hợp với bộ câu này hơn câu thật.
- **Câu tự do:** free-dev là 32 câu tôi tự viết để thử, sau đó dùng để phát triển; free-test là 100 câu giữ kín như mục 3.

## 9. Lỗi còn lại trên test của bộ chính (PoC mặc định)

| Câu | Lỗi | Nguyên nhân |
|---|---|---|
| "ờ để chị xem à có đường không, hai ký đường nha" | Giai đoạn 2 tự nhận Đường × 3 (đúng là × 2); giai đoạn 3 hỏi lại (gate `duplicate`) | Câu hỏi còn hàng "có … không" bị tính là bán thêm 1. |
| "lấy hai hộp chocopie mười hai cái" | Không tự nhận (fallback) | "mười hai cái" là quy cách hộp; gate thấy số chưa gắn vào món nên hỏi lại thay vì đoán. |
| "chin su một chai" | Không tự nhận (fallback) | Gõ không dấu: "chin" có thể là số chín; gate chặn thay vì tạo món lạ như bản trước. |
| "bia tigơ", "chôcô pai", "xì dầu maggi" | Không nhận ra món | Lỗi STT nặng hoặc từ đồng nghĩa; cần hotword (L0) hoặc LLM. |

## 10. Rủi ro

- Bộ câu tự soạn; câu thật có thể dài hơn, nhiều tiếng địa phương và lỗi STT khác. Cần đo lại trên câu thật (có xin đồng ý, không log transcript ở production khi chưa duyệt).
- Câu nói tự do: luật và CRF học từ mẫu tự soạn đều chỉ phủ các biến thể đã gặp (mục 3); tagger luật không nhận ra biến thể lạ thì vẫn có thể tự nhận sai.
- Fallback 25% ở câu tự do chỉ an toàn khi có đường dự phòng thật (LLM hoặc hỏi lại trên UI); hiện app chưa có.
- Danh mục lớn có nhiều món gần giống làm tăng tỉ lệ hỏi lại; chưa có bộ eval cho trường hợp này.
- Bật hotword khi chưa vá wrapper sẽ làm app thoát (`exit(-1)`).

## 11. Bước tiếp theo

1. **Bộ giữ kín mới (≥ 100 câu tự do)** do người hoặc sub-agent chưa xem code viết, để có số trung thực cho giai đoạn 3; free-test hiện là dev.
2. **Thu âm các câu eval** (người trong nhóm đọc, có đồng ý, không commit audio) rồi chạy `voice:asr` cho Zipformer hiện tại (greedy như app, beam + hotword) và ChunkFormer (greedy, beam + KenLM, + hotword), chấm bằng `voice:eval --asr` (mục 12). Đây là cách duy nhất để biết LM/hotword có đáng làm trên máy.
3. Owner quyết làm endpoint `draft_parse` (AI + Core proxy) cho 17% câu `fallback`; LLM là đường duy nhất cho sửa lời đổi món và câu dài nhiều quan hệ.
4. Owner quyết UX hỏi chọn biến thể và hỏi lại: `voice.tsx` hiển thị `disambiguations` và xử lý `fallback`, rồi đổi import `parseOrder` sang `src/lib/voiceParse`; cập nhật PRD/AC nếu thay đổi hành vi.
5. L0: vá wrapper bằng `patch-package` (`modelingUnit = "bpe"`, `bpeVocab`, `modified_beam_search` khi có hotword), thêm `bpe.vocab` vào `STT_MODEL_FILES`, sinh hotword từ danh mục, đo trên máy Android thật.
6. Thu bộ câu thật (có đồng ý) để đo lại và để train/fine-tune; thêm bộ eval cho danh mục lớn có món gần giống.

## 12. LM n-gram (KenLM) và ChunkFormer cho STT

### 12.1 Repo `NhoNhoNh/vn-ngram-language-model`

Đã đọc code (commit `1c264ab`) **[đã kiểm chứng]**: LM n-gram bằng Python thuần (dict đếm, lưu `pickle.gz`), học trên Wikipedia tiếng Việt (50.000 bài, 1,1 triệu câu), tách từ ghép bằng PyVi (`học_sinh`), dùng cho gợi ý từ tiếp theo. **Không dùng trực tiếp được:**

- không phát hành model (thư mục `data/`, `*.pkl`, `*.gz` bị `.gitignore`), không xuất ARPA/KenLM;
- "Kneser-Ney" trong `ngram_model.py` đếm `continuation_counts[target] += 1` cho mỗi lần xuất hiện, tức là tần suất unigram chứ không phải số ngữ cảnh khác nhau, và chỉ lùi về unigram (không lùi trigram → bigram);
- tách từ PyVi không có trên React Native, còn đầu ra STT là âm tiết;
- văn phong bách khoa, khác câu nói ở quầy; README của repo tự ghi lỗi văn phong ("thỏa_mãn nhu_cầu").

Ý tưởng dùng lại được là LM n-gram miền. Repo này dùng làm tài liệu tham khảo về smoothing, không phải nguồn model hay dữ liệu.

### 12.2 Đặt LM n-gram ở đâu

- **Trong decoder STT đang dùng (sherpa-onnx, Zipformer transducer):** sherpa-onnx v1.12.35 chỉ có LM nơ-ron (`OnlineLMConfig.model` là RNN-LM ONNX, shallow fusion hoặc rescore khi `modified_beam_search`); FST n-gram LODR chỉ đi kèm RNN-LM, `OnlineLM::Create` luôn tạo `OnlineRnnLM` **[đã kiểm chứng trên mã nguồn]**. Không nạp ARPA/KenLM. Wrapper `react-native-sherpa-onnx@0.4.4` không có cấu hình LM cho STT **[đã kiểm chứng trên gói npm]**. Muốn dùng phải vá native như hotword (BLOCKERS) và train một RNN-LM.
- **Sau STT, trên chữ:** n-gram chỉ chấm được câu STT đưa ra (sherpa không trả n-best), nên chỉ sửa được bằng cách tự sinh biến thể (dấu, gần âm) rồi chấm. Linker (L4) đã làm việc này cho tên món theo danh mục; lỗi còn lại của PoC là quan hệ số lượng mà n-gram không biểu diễn. Không đáng làm trước khi có số ASR.
- **Trong decoder CTC:** chỗ KenLM làm việc tự nhiên là beam search trên đầu ra CTC (pyctcdecode), như ChunkFormer dưới đây. sherpa-onnx cũng có `OnlineCtcFstDecoderConfig` (đồ thị HLG, G là n-gram) cho model CTC streaming.

### 12.3 ChunkFormer (`khanld/chunkformer`, commit `24b1258`)

**[đã kiểm chứng trên mã nguồn và README]**, trừ khi ghi khác:

- Model tiếng Việt: `khanhld/chunkformer-ctc-large-vie` (CTC), `khanhld/chunkformer-rnnt-large-vie` (RNN-T), `khanhld/chunkformer-rnnt-small-vie-stream-dct` (RNN-T nhỏ, streaming cache-aware, có nhánh CTC). Kích thước, giấy phép model và WER trên model card **chưa đọc được** vì `huggingface.co` bị chặn trong môi trường này; code là CC BY 4.0.
- Repo không có KenLM: PyTorch có `ctc_prefix_beam_search` và attention rescoring không LM; ONNX (thêm 2026-06, chưa có trên PyPI 1.2.2) chỉ có greedy, nhưng xuất `ctc.onnx` trả `log_probs [B, T, V]`, đủ để beam search ngoài bằng pyctcdecode + KenLM như cách đã thử năm ngoái.
- Streaming: `encoder_chunk.onnx` (cache attention + conv) và `StreamingSession` đẩy audio từng đoạn; chunk/left/right phải đúng cấu hình đã train.
- Lên máy: không có trong sherpa-onnx và wrapper RN. Cần onnxruntime cho React Native, tự tính fbank, tự làm vòng streaming và CTC beam search + n-gram bằng TS/C++, và một LM nhỏ theo danh mục **[suy luận]**. Đây là đổi engine STT, việc lớn hơn vá hotword.

### 12.4 Chấm STT trong eval

Commit `dc55a31` đưa STT vào eval mà không đổi bộ câu vàng:

```bash
npm run voice:asr -- prompts      # .data/asr/prompts.tsv (id, wav, txt): đọc từng câu thành <id>.wav, 16 kHz mono
npm run voice:asr -- lm           # .data/asr/lm-<danh mục>.arpa: câu synthetic (danh mục train) + tên món của danh mục
npm run voice:asr -- chunkformer --onnx-dir <export> --chunkformer-repo <clone> --audio-dir <wav> \
    --lm '.data/asr/lm-{catalog}.arpa' --hotwords          # ghi chunkformer-stream-greedy.jsonl và -lm-hw.jsonl
npm run voice:asr -- zipformer --model-dir <model app> --audio-dir <wav> [--beam] [--hotwords]
npm run voice:eval -- --asr scripts/voice-crf/.data/asr/chunkformer-stream-lm-hw.jsonl --asr …/zipformer-greedy.jsonl
```

Mỗi `--asr` in WER, CER (âm tiết có dấu) và các chỉ số §7 của parser khi chạy trên transcript, đặt cạnh chính các chỉ số đó khi chạy trên chữ vàng của cùng các câu. LM và hotword lấy theo danh mục của từng câu, như mỗi shop dùng danh mục của mình. `voice:asr lm` gọi `lmplz` nếu có, không thì tự ghi ARPA Kneser-Ney nội suy bậc 3.

Đã chạy được: `prompts`, `lm` (ARPA nạp được bằng KenLM; "hai gói mì hảo hảo" −10.9 so với "hai gói mì hão hảo" −16.6), pyctcdecode + LM trên một ma trận CTC giả lập sửa được "hão" thành "hảo" (chỉ kiểm tra đường ống), và `--asr` với transcript trùng chữ vàng (ra đúng số của eval chữ). **Chưa chạy:** `chunkformer` và `zipformer` trên audio thật. LM miền học từ câu synthetic nên vẫn là "mẫu câu tự soạn"; nên thêm câu thật hoặc corpus hội thoại khi có.
