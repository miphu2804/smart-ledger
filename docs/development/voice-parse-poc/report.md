# Báo cáo: Voice Parse PoC (ITN + n-gram linker + CRF + gate)

Báo cáo kết quả của PoC theo [brief](../voice-parse-poc-brief.md). Nhánh `feat/voice-parse-poc`, chưa mở PR. Nhãn **[đã kiểm chứng]** là đã chạy hoặc đã đọc code; **[suy luận]** là chưa chạy được.

## 1. Kết luận

- **Câu đặt hàng thông thường:** PoC L1–L4 đạt mọi mục tiêu §7 đo được trên Node, trên tập test của bộ câu tự soạn **[đã kiểm chứng]**.
- **Câu cấu trúc tự do** ("mỗi thứ một cái", "pepsi cũng vậy", "à không, ba gói", "bàn năm hai cà phê", câu dài lồng nhau): lần đo giữ kín duy nhất (100 câu, giai đoạn 2) cho 70.8% theo món, 7.0% tự nhận sai, 25% hỏi lại, **chưa đạt mục tiêu**. Giai đoạn 3 đưa bộ đó lên 83.9% / 0.7% / 17%; giai đoạn 4 (dò lưới, nhãn sửa lời EDIT, chọn đơn hàng qua gate trong n-best, bỏ tagger luật dự phòng) lên 96.4% / 0 dòng sai / 4%, nhưng bộ này đã được xem lỗi nên đó là số dev. **Bộ giữ kín thứ hai** (120 câu, sub-agent viết, chấm một lần với parser đã chốt, mục 3.4) cho **44.2% theo món, 6.4% tự nhận sai, 59.2% hỏi lại**; giai đoạn 3 trên cùng bộ: 42.6% / 7.7% / 60.0%. Phần lớn mức tăng của giai đoạn 4 là học các biến thể đã thấy; với câu tự do chưa gặp, PoC chỉ tự xử lý được khoảng 4 câu trong 10 và vẫn tự nhận sai quá ngưỡng 2%. Câu tự do cần LLM dự phòng; parser trên máy hợp với câu đặt hàng thông thường.
- **Gate câu tự do** (giai đoạn 5, mục 3.5, mặc định bật): câu phức có khung câu chưa gặp khi train, hoặc có món không nhận được số trong câu có nói số, thì gửi LLM. Trên bộ giữ kín thứ hai (chấm lần hai, chỉ số tổng): **tự nhận sai 0/41 dòng** (gate cũ 7/109), máy tự xử lý 20.8% số câu và **80.0% số câu đó đúng hết** (gate cũ 51.7%, 66.1%). Mục tiêu 95% đúng khi tự xử lý **chưa đạt** theo câu; theo dòng món tự nhận thì đạt (100%). Cái giá trên câu thường: test chính hỏi lại 14.1% (trước 10.9%), theo món 90.7% (trước 95.1%), 0 dòng sai.
- **Phụ thuộc phần viết tay** (mục 3.2): sau khi train, tắt gate dấu hiệu viết tay (`findMarkers`) không đổi dòng nào trên bộ câu người viết; tắt luật số bàn/giờ làm sai 1 dòng. Các danh sách từ viết tay còn lại chủ yếu nằm ở bộ sinh câu train và ở đặc trưng CRF (bỏ đặc trưng từ điển: vẫn 0 dòng sai nhưng hỏi lại nhiều hơn).
- **"System 1" router quyết định escalate sang LLM** (mục 3.3): router học (logistic) từ đặc trưng của lượt parse tốt hơn ngưỡng θ trên synthetic nhưng **không hơn trên câu người viết**, nên chưa dùng; giữ ngưỡng θ cho tới khi có kết quả thật (có đồng ý) để học.
- **STT:** eval chấm được transcript của từng hệ STT (`--asr`), có script cho ChunkFormer (greedy, beam + KenLM, hotword) và Zipformer đang dùng. **Chưa có số ASR thật**: cần audio người đọc các câu eval và model tải từ Hugging Face (mục 12).
- **L0 (hotword):** chưa kiểm chứng. Không có máy Android, và wrapper `react-native-sherpa-onnx@0.4.4` cần vá native mới bật được hotword cho STT streaming (xem [BLOCKERS.md](../../../BLOCKERS.md)).

PoC nằm ở `frontend/mobile/src/lib/voiceParse/`, giữ nguyên interface `parseOrder(text, products): ParsedOrder`, **chưa nối vào màn voice**: `app/voice.tsx` chưa hiển thị `disambiguations` (mục 7), nên thay vào lúc này là đổi hành vi sản phẩm và cần owner quyết.

Bộ eval là **câu tự soạn, chưa phải câu thật** của người dùng. Các con số cho biết PoC so với baseline trên cùng bộ câu, không phải độ chính xác ngoài thực tế.

## 2. Bảng chỉ số §7: bộ chính (tập test, 156 câu, 162 dòng vàng)

Cột "PoC" là chế độ mặc định từ giai đoạn 5: chỉ CRF, chọn đơn hàng qua gate trong 32 chuỗi nhãn tốt nhất (mục 3.2), thêm gate câu tự do (mục 3.5). "PoC, gate cũ" là mặc định của giai đoạn 4 (tắt gate câu tự do). "PoC + luật" thêm tagger luật gắn lại câu CRF bỏ (mặc định của giai đoạn 3, chỉ để so sánh). Giai đoạn 3 trên cùng tập: 96.3% theo món, 0/132 tự nhận sai, 9.6% hỏi lại, P95 4.5 / 5.3 ms.

| Chỉ số | Baseline `parseOrder` | **PoC (mặc định)** | PoC, gate cũ | PoC + luật | Chỉ tagger luật | Mục tiêu | Đạt |
|---|---|---|---|---|---|---|---|
| Exact match theo món (mọi dòng) | 41.4% | **90.7%** | 95.1% | 92.6% | 95.1% | ≥ 90% | ✓ |
| — chỉ món trong danh mục | 39.9% | 92.0% | 95.7% | 92.8% | 94.9% | | |
| Exact match theo câu | 34.6% | **91.7%** | 94.9% | 93.6% | 95.5% | báo cáo | |
| Sai mà vẫn tự nhận (dòng tự nhận sai / dòng tự nhận) | 17.9% (12/67) | **0.0% (0/127)** | 0.0% (0/132) | 0.0% (0/128) | 0.0% (0/131) | ≤ 2% | ✓ |
| Fallback hoặc hỏi lại (câu) | 0.0% | **14.1%** | 10.9% | 12.2% | 10.3% | ≤ 15% | ✓ |
| Câu xử lý trên máy, đúng hết trong số đó | 100%, 34.6% | **92.3%, 98.6%** | 95.5%, 98.7% | 95.5%, 98.0% | 97.4%, 98.0% | ≥ 95% đúng | ✓ |
| Khoản chi đúng số tiền | 71.4% | 90.5% | 100% | 90.5% | 100% | | |
| Câu từ đúng thành sai so với baseline (trong đó tự nhận sai) | — | **2 (0)** | 0 (0) | 2 (0) | 0 (0) | 0 | ~ |
| Câu từ sai thành đúng | — | 91 | 94 | 94 | 95 | | |
| Độ trễ L1–L4, catalog 1.000 món, P95 (ổn định / lượt đầu) | 17.8 / 17.0 ms | **12.1 / 12.2 ms** | 11.8 / 14.0 ms | 12.1 / 13.1 ms | 2.1 / 3.1 ms | < 5 ms (brief); vài trăm ms (đã thống nhất cho giai đoạn 4) | ~ |
| L0 hotword: WER tên hàng | — | chưa đo | | | | giảm | ✗ blocker |

Hai câu baseline đúng mà PoC mặc định không đúng đều là câu PoC gửi LLM, không phải tự nhận sai; `voice:eval` chỉ trả mã lỗi khi PoC tự nhận sai một câu baseline đúng.

Tập dev (104 câu, dùng để soát lỗi và tune): PoC mặc định 87.3% theo món, 91.3% theo câu, 0/86 tự nhận sai, hỏi lại 16.3% (quá mục tiêu 15%); gate cũ 96.4% / 96.2% / 0/90 / 10.6%. Gate câu tự do gửi LLM thêm 6 câu dev, 5 câu là câu có món ngoài danh mục ("hai con cá basa với năm bó hành lá", "một bánh mì, thêm hai nước dừa tươi"): tên món mới là từ chưa gặp nên khung câu lạ. Trong 6 câu này gate cũ tự nhận đúng 5, sai 1.

Theo nhóm (exact theo câu, test, PoC mặc định): mơ hồ 0% → 83%, khoản chi 50% → 100%, nói liền 33% → 100%, tên một phần 4.8% → 100%, đảo thứ tự 53% → 93%, câu không có món 0% → 100%, món ngoài danh mục 83% → 100%, từ đệm 33% → 100%, câu đơn giản 50% → 94%, lỗi STT 28% → 78%.

**Vì sao bỏ tagger luật dự phòng dù nó thêm 3 dòng đúng trên test:** trên câu synthetic dùng từ vựng chưa gặp (mục 3.2), thêm tagger luật chỉ tăng 1 điểm đúng nhưng tăng tự nhận sai từ 6.5% lên 14.2%: tagger luật biến từ lạ ("thím", "xin lỗi", "dãy 3", "lên đơn") thành món. Câu nó cứu trên bộ người viết đều là câu mà PoC mặc định hỏi lại chứ không tự nhận sai.

Độ trễ đo trên Node v22.22 (container 4 vCPU), không phải máy thật; P95 dao động khoảng ±1 ms giữa các lần chạy. Giai đoạn 4 chậm hơn (P95 11.5 so với 4.5 ms) vì câu nào CRF chưa chắc hoặc không qua gate thì tính 32 chuỗi nhãn tốt nhất và ghép slot cho từng chuỗi. Người dùng đồng ý đổi vài trăm ms độ trễ nếu tốt hơn gửi LLM, nên không tối ưu thêm. Dựng chỉ mục cho 1.000 món mất 50–90 ms, một lần mỗi khi danh sách sản phẩm đổi.

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

### 3.2 Giai đoạn 4: dò lưới tự động (`voice:grid`)

**Cách đo.** Mỗi cấu hình (model × cách giải mã × ngưỡng × tagger dự phòng) chạy trên mọi tập và in một dòng *exact theo món / tự nhận sai / hỏi lại*. Chọn trên **pool** = dev chính + free-dev + free-test (236 câu, đều đã soát lỗi); test chính chỉ xem số tổng làm chốt chặn. Vì pool đã bị xem, thêm một phép đo không dựa vào câu đã xem: `voice:synth --holdout 1` giữ lại 1/3 mỗi danh sách từ vựng của bộ sinh câu (xưng hô, lời mở/kết, từ sửa lời, "mỗi …", "y chang", từ chỉ số tham chiếu, cụm tổng), model "H" train không có phần đó, và **lexout** là 1.000 câu chỉ dùng từ giữ lại (đơn hàng vàng ghép từ nhãn vàng; 79 câu nhãn vàng không ghép được bị bỏ). Lexout vẫn là câu synthetic cùng bộ sinh, nên không thay được bộ giữ kín người viết; nó đo khi gặp từ chưa thấy.

**1. Giải mã lại không đủ.** Với model giai đoạn 3, ở 17 câu pool bị fallback, đơn hàng đúng đứng hạng 1 trong các đơn ứng viên (k = 256) ở 4 câu, hạng 2–3 ở 3, thấp hơn ở 4, và không có ở 6 (`voice:grid --oracle`). Lưới 172 cấu hình giải mã trên model cũ chỉ đổi được vài câu, đổi lại tự nhận sai tăng. 12/23 câu sai của pool là **sửa lời**: CRF chưa từng thấy "ờ sai", "khoan", "à mà nhầm", sửa lời đổi món hoặc nói lại món với số mới.

**2. Học sửa lời thay vì viết luật.** Nhãn CRF mới **EDIT** cho cụm sửa lời. Khi ghép slot, món nói ngay sau EDIT (cùng mệnh đề) thay cho món nói trước: cùng món thì thay lần nói trước của món đó ("ba trà đá à không năm trà đá"), khác món thì thay món ngay trước EDIT ("hai phở gà, à nhầm phở bò"), món mới chưa có số thì giữ số cũ; dấu câu quanh EDIT không cắt mệnh đề; EDIT không thay món nào và không sửa số nào thì gate `marker`. Bộ sinh câu ghép sửa lời theo mọi kiểu câu (sửa số, sửa số trước khi nói món, nói lại món, đổi món giữ hoặc đổi số, nói lại một món trước đó) với 46 cụm sửa lời, thêm từ vựng rộng cho xưng hô, lời mở/kết, "mỗi <đơn vị>", "y chang", số tham chiếu ("quầy số hai", "kệ số bốn", "bàn bốn có hai người"), cụm tổng ("chia ra:"). Đặc trưng v2 thêm "từ này có được nói lại ở sau / đã nói ở trước". Train 16.000 câu.

| Model (cùng cách giải mã mặc định / cách của giai đoạn 3) | pool | free-test | test chính |
|---|---|---|---|
| Giai đoạn 3 | 87.9/1.1/15.3 · 90.9/0.3/11.9 | 81.0/2.2/20.0 · 83.9/0.7/17.0 | 95.1/0/11.5 · 96.3/0/9.6 |
| + EDIT, sửa lời tổ hợp (8% câu) | 91.2/1.0/12.7 · 94.4/1.0/8.5 | 88.1/2.0/13.0 · 90.5/1.9/9.0 | 97.5/0/9.6 · 96.3/0/9.6 |
| + từ vựng rộng | 93.2/0.7/8.9 · 92.0/1.0/8.5 | 92.3/0.6/7.0 · 88.7/1.3/9.0 | 95.7/0/9.6 · 96.3/0/9.6 |
| + vá 4 chỗ thiếu của bộ sinh câu (số bàn liền số lượng, "cho chị" ở cuối, "thôi", "số bàn") | 93.8/0/10.2 · 95.0/0.7/7.6 | 94.6/0/6.0 · 91.7/1.3/7.0 | 95.7/0/10.9 · 96.3/0/9.6 |
| + đặc trưng lặp lại (v2) | 94.7/0/9.3 · 96.8/0.6/6.8 | 95.8/0/5.0 · 95.2/1.2/5.0 | 95.7/0/10.9 · 96.3/0/9.6 |
| **+ 16.000 câu (mặc định)** | **96.5/0/7.6** · 96.2/0.6/6.8 | **96.4/0/4.0** · 94.0/1.3/5.0 | **95.1/0/10.9** · 96.3/0/9.6 |

Ô: exact theo món / tự nhận sai / hỏi lại (%). Đổi seed sinh dữ liệu (7, 11, 23, 37) ở cùng một cấu hình cho pool 97.6–98.2%, nên chênh lệch khoảng 1 điểm giữa các biến thể gần nhau là nhiễu. F1 theo cụm của model mặc định trên synthetic dev: ITEM 0.989, QTY 0.992, EDIT 0.976, QTYC 0.947, QTYD 0.993, QTYP 0.984, COPY 1.000. Model H trên lexout (từ chưa gặp): EDIT 0.743 (nhận ra 69% cụm sửa lời chưa gặp), QTYP 0.751, COPY 0.814, QTYD 0.938.

**3. Giải mã `valid` (mặc định).** Khi chuỗi Viterbi chưa chắc (< θ) hoặc không qua gate, gộp 32 chuỗi nhãn tốt nhất theo đơn hàng, chỉ giữ các đơn qua gate cấu trúc, chọn đơn có tổng xác suất lớn nhất; độ tin cậy = xác suất đơn đó / tổng xác suất các chuỗi qua gate (phần ngoài 32 chuỗi tính là không qua). Khi tổng xác suất các chuỗi qua gate < ν = 0.1 thì không tin. k = 32, 64, 128 cho cùng kết quả.

**4. Tên món mới không tính vào độ tin cậy.** Món ngoài danh mục và khoản chi luôn qua hộp thoại cho người dùng sửa tên/giá (`voice.tsx`), chỉ món trong danh mục được ghi thẳng; nên "nước dừa" hay "nước dừa tươi" được tính là cùng đơn hàng. Chỉ CRF: dev chính 91.8% → 95.5%, không thêm dòng sai nào.

**5. Bỏ tagger luật dự phòng.** Trên lexout:

| Cách | Đúng | Tự nhận sai | Hỏi lại |
|---|---|---|---|
| Giai đoạn 3 (model gđ 3, Viterbi + luật) | 45.3% | 21.4% | 33.3% |
| Model H, Viterbi + luật (cách gđ 3) | 53.1% | 15.2% | 31.7% |
| Model H, `valid` + luật | 69.5% | 14.2% | 16.3% |
| **Model H, `valid`, chỉ CRF (mặc định)** | **68.5%** | **6.5%** | 25.0% |
| Model H, Viterbi, chỉ CRF | 51.8% | 4.6% | 43.6% |

Tagger luật thêm 1 điểm đúng nhưng hơn gấp đôi tự nhận sai. Đã thử giữ tagger luật nhưng để CRF kiểm (bác khi CRF chắc P(O) ≥ 0.9 ở cả cụm luật gán món/số, hoặc khi CRF cho đơn của luật xác suất < 0.02): lexout còn 9.8–10.1% tự nhận sai, dev chính mất 2 dòng; vẫn kém chỉ CRF.

**Ngưỡng θ** (chỉ CRF, `valid`, ν = 0.1; pool · test chính · lexout của model H):

| θ | pool | test chính | lexout |
|---|---|---|---|
| 0.7 | 97.6/0/5.9 | 95.7/0/10.9 | 76.4/10.1/13.5 |
| 0.8 | 96.8/0/7.2 | 95.7/0/10.9 | 73.5/8.8/17.7 |
| **0.9** | **96.5/0/7.6** | **95.1/0/10.9** | **68.5/6.5/25.0** |
| 0.95 | 94.7/0/9.7 | 95.1/0/10.9 | 63.7/5.2/31.1 |

Trên câu người viết, mọi θ đều 0 dòng tự nhận sai (`voice:tune` chọn θ = 0.8 vì nó chỉ thấy dev chính + free-dev); lexout là bằng chứng duy nhất phân biệt được, nên giữ θ = 0.9. `voice:tune`: vùng τ/δ tốt nhất vẫn phẳng (τ ∈ [0.64, 0.90], δ ∈ [0.02, 0.30]), giữ τ = 0.72, δ = 0.12; ràng buộc "0 câu hỏng so với baseline" thành tiêu chí xếp hạng vì hai câu hỏng trên dev là hỏi lại chứ không phải tự nhận sai.

**6. Ablation: còn phụ thuộc phần viết tay không** (`voice:grid --ablate`, model mặc định, θ = 0.9):

| Tắt | pool | test chính | lexout (model H) |
|---|---|---|---|
| Không tắt | 96.5/0/7.6 | 95.1/0/10.9 | 68.5/6.5/25.0 |
| Gate dấu hiệu viết tay (`findMarkers`: "mỗi thứ", "cũng vậy", "à không", "ba ly:") | 96.5/0/7.6 | 95.1/0/10.9 | 66.9/6.9/26.2 |
| Luật số bàn/phòng/giờ (`isReferenceNumber`) | 96.5/0.3/7.2 | 95.1/0/10.9 | 68.1/7.4/24.5 |
| Cả hai | 96.5/0.3/7.2 | 95.1/0/10.9 | 66.4/7.8/25.7 |
| Đặc trưng CRF từ danh sách từ viết tay (đơn vị, từ đệm, động từ bán, từ nối, từ chi; train lại) | 92.0/0/12.3 | 93.2/0/12.8 | 63.3/5.1/31.6 |

Sau khi train, quyết định gần như không dựa vào hai lưới an toàn viết tay (bỏ cả hai: 1 dòng sai ở free-dev, +1.3 điểm sai trên lexout). Đặc trưng từ danh sách từ giúp CRF chắc hơn (ít hỏi lại hơn) nhưng không phải nguồn đúng/sai chính. Phần viết tay còn lại: ITN số/tiền (`text.ts`), quy tắc ghép slot thành đơn hàng (tất định), và bộ sinh câu train, nơi tri thức về cách nói giờ nằm ở dạng mẫu câu và danh sách từ.

**Đã thử và loại:** chèn âm tiết giả gán O vào 5% ranh giới (test chính tự nhận sai 0 → 1.5%); trung bình trọng số model của 4 seed (không hơn một model 16k); 32.000 câu (không hơn 16.000); c2 = 0.1 (kém); c1 0.02/0.15, c2 0.001 (như mặc định trong nhiễu); 12% câu sửa lời (0 dòng sai nhưng dev mất 2 dòng); chọn đơn có tổng xác suất lớn nhất kể cả đơn không qua gate (không hơn Viterbi).

### 3.3 "System 1" router: quyết định tự nhận hay escalate sang LLM

Câu hỏi: một model nhỏ, nhanh có quyết định tốt hơn ngưỡng θ không? `voice:router` xuất 25 đặc trưng của mỗi lượt parse (độ tin cậy, tổng xác suất các chuỗi qua gate, khoảng cách đơn 1–2, entropy các đơn ứng viên, xác suất biên nhỏ nhất của nhãn đã chọn, tỉ lệ từ không có trong danh mục và chưa gặp khi train, tỉ lệ từ không dấu, điểm khớp danh mục thấp nhất và khoảng cách ứng viên 1–2, số món / món mới / khoản chi / cụm EDIT…) và nhãn "đơn hàng ứng viên có đúng không". `router.py` học hồi quy logistic (~30 trọng số, chạy micro-giây trên máy) và gradient boosting (để xem trần), trên 5.649 câu synthetic sinh bằng seed khác (một nửa dùng từ vựng giữ lại), chấm bằng model H; ngưỡng chọn trên tập train sao cho rủi ro (câu tự nhận mà sai / câu tự nhận) ≤ 2%.

| Tập | θ (hiện tại) | Logistic | Boosting |
|---|---|---|---|
| synthetic, từ đã gặp: tự nhận / sai / AURC | 89.3% / 0.5% / 0.0029 | 92.4% / 0.4% / 0.0017 | 96.5% / 1.2% / 0.0020 |
| synthetic, từ chưa gặp | 48.1% / 6.3% / 0.0959 | 54.7% / 6.0% / 0.0696 | 76.3% / 9.5% / 0.0596 |
| người viết, pool (model mặc định) | 82.6% / 1.0% / 0.0057 | 90.3% / 1.4% / 0.0095 | 96.6% / 2.2% / 0.0191 |
| người viết, test chính (model mặc định) | 92.3% / 0.7% / 0.0014 | 92.3% / 0.7% / 0.0013 | 96.8% / 1.3% / 0.0012 |

Ở đây "sai" là câu tự nhận mà không đúng cả câu (chặt hơn "dòng tự nhận sai" của eval, vì tính cả món mới thiếu). AURC: diện tích dưới đường rủi ro–độ phủ, thấp là tốt. Router học tốt hơn θ trên synthetic (cả câu có từ chưa gặp) nhưng **không hơn trên câu người viết**: test chính ngang nhau, pool tệ hơn (AURC 0.0095 so với 0.0057, tự nhận sai 1.4% so với 1.0%). Nó học kiểu lỗi của bộ sinh câu. Thêm một đặc trưng vào θ (xác suất biên nhỏ nhất, tỉ lệ từ lạ, khoảng cách khớp danh mục) cũng không trội hơn θ trên mọi tập. Kết luận: độ tin cậy theo đơn hàng của CRF (một mô hình năng lượng log-tuyến tính) đã là "System 1" hợp lý; muốn router học được thì cần nhãn từ phân phối thật, ví dụ ghi đặc trưng (không ghi transcript) cùng kết quả người dùng xác nhận hoặc kết quả LLM ở chế độ chạy song song, khi owner duyệt. Đặc trưng chất lượng giọng nói (xác suất token của STT) chưa có vì chưa chạy STT trên audio (mục 12); `voice:router` sẵn chỗ để thêm. Một verifier kiểu JEPA (so khớp embedding của câu và của đơn hàng) cần encoder tiếng Việt huấn luyện sẵn (PhoBERT…, tải từ Hugging Face đang bị chặn ở đây) và vài chục đến vài trăm MB trên máy, nên chưa thử.

### 3.4 Bộ giữ kín thứ hai (giai đoạn 4)

120 câu tự do (`eval/holdout.jsonl`, split `hold-test`), 10 nhóm, 40 câu mỗi danh mục, 251 dòng vàng (238 món trong danh mục, 5 món mơ hồ, 8 món ngoài danh mục) và 15 khoản chi. Sub-agent viết chỉ đọc `catalogs.json` và `score.ts`; không đọc code parser, bộ sinh câu, câu eval cũ hay báo cáo. Tôi chỉ kiểm máy móc (JSON, ID, danh mục, số lượng) rồi chạy eval **một lần** với parser đã chốt ở `64e8d48`; không đọc câu nào và không sửa parser theo kết quả. `voice:eval --failures hold-test` bị chặn.

| Cấu hình | Theo món | Tự nhận sai (dòng) | Hỏi lại (câu) |
|---|---|---|---|
| Baseline `parseOrder` | 34.3% | 42.6% (58/136) | 0% |
| Giai đoạn 3 (CRF trước, luật dự phòng) | 42.6% | 7.7% (8/104) | 60.0% |
| **Giai đoạn 4 mặc định** | **44.2%** | **6.4% (7/109)** | **59.2%** |
| Giai đoạn 4 + luật dự phòng | 53.0% | 9.0% (12/134) | 47.5% |
| Giai đoạn 4, θ = 0.8 | 49.0% | 10.9% (14/128) | 52.5% |
| Giai đoạn 4, θ = 0.7 | 53.0% | 12.7% (18/142) | 47.5% |

Mục tiêu: theo món ≥ 90%, tự nhận sai ≤ 2%, hỏi lại ≤ 15%; không cấu hình nào đạt. Theo nhóm (exact theo câu, PoC mặc định): câu thường 83%, "mỗi thứ" 58%, "cũng vậy" 50%, số không phải số lượng 42%, lỗi STT 42%, kể theo tên trước 25%, tổng rồi kể 18%, tiếng địa phương 17%, sửa lời 15%, câu dài lồng nhau 0%. Khoản chi đúng 28.6%. Câu hỏi lại: 55/71 vì độ tin cậy dưới 0.9; kết quả tạm của 16 câu trong số đó đúng.

**Đọc kết quả:**
- Số free-test của giai đoạn 4 (96.4%) chủ yếu là học thuộc biến thể đã thấy: bộ sinh câu được mở rộng sau khi xem lỗi của chính bộ đó. Trên câu chưa gặp, giai đoạn 4 chỉ hơn giai đoạn 3 khoảng 1.6 điểm.
- Phép đo bằng từ vựng giữ lại (lexout) dự đoán đúng tỉ lệ tự nhận sai (6.5% so với 6.4%) nhưng đoán thiếu tỉ lệ hỏi lại (25% so với 59%): câu người viết khác bộ sinh câu ở cả cấu trúc, không chỉ ở từ.
- Hạ θ hay thêm tagger luật làm tăng số đúng nhưng tăng tự nhận sai nhanh hơn; θ = 0.9 vẫn là điểm an toàn nhất trong các cấu hình đã chốt.
- Hệ quả cho kiến trúc: parser trên máy làm "System 1" cho câu đặt hàng thông thường (test chính 95.1%, 0 dòng sai); câu tự do là việc của LLM (`draft_parse`), và cần gate chặt hơn nữa vì 6.4% tự nhận sai vẫn quá ngưỡng. Muốn parser trên máy khá hơn với câu tự do thì cần câu thật để train, không phải thêm mẫu tự soạn.
- Bộ này đã được chấm; nếu dùng để sửa parser thì nó thành dev và cần bộ giữ kín khác.

### 3.5 Gate câu tự do (giai đoạn 5)

Mục tiêu: câu nào máy tự xử lý (không gửi LLM) thì ít nhất 95% đúng hết. Gate thiết kế và chọn ngưỡng chỉ trên dev và synthetic; bộ giữ kín thứ hai chấm một lần sau khi chốt (lần chấm thứ hai của bộ này), chỉ xem số tổng.

**Phép đo kiểu câu chưa gặp.** `voice:synth --famout <kiểu>` bỏ hẳn một kiểu câu khỏi train (mỗi thứ, cũng vậy, sửa lời, số bàn/giờ/người, tổng rồi kể, kể theo tên trước) và sinh 1.000 câu kiểu đó; train 12 model (6 kiểu × có/không giữ lại 1/3 từ vựng). Với gate cũ, model tự nhận 19–44% số câu kiểu chưa gặp và chỉ đúng 6–48% số câu đó (riêng "kể theo tên trước": tự nhận 60–73%, đúng 91–99%): độ tin cậy CRF không báo được câu có cấu trúc lạ, nên θ cao hơn không cứu được (θ = 0.99 vẫn chỉ đúng 5–63%).

**Tín hiệu đã thử** (`voice:gate`, trên bộ người viết dev/free và synthetic): θ 0.95–0.99; từ CRF chưa gặp; có sửa lời / số lượng quan hệ / nhiều dòng; tagger luật cùng ý; model thứ hai (bỏ đặc trưng từ điển) cùng ý; đơn hàng giữ nguyên khi bỏ dấu thanh, bỏ dấu câu, bỏ từ lạ; món lấy số 1 ngầm; độ lạ của khung câu; logistic regression và gradient boosting trên mọi tín hiệu. Model học trên một loại proxy không chuyển sang loại kia (học trên lexout: 100% trên lexout nhưng 64% trên kiểu câu chưa gặp; học trên kiểu câu chưa gặp: câu thường mất 20–40 điểm độ phủ), model thứ hai gần như luôn cùng ý với model chính (học cùng dữ liệu nên sai cùng chỗ), tagger luật cùng ý thì mất hết câu quan hệ. Hai tín hiệu có ích:
- **Món lấy số 1 ngầm** (`implicit`, trước chỉ áp cho tagger luật): món trong danh mục không nhận được số nào trong câu có nói số lượng. Đây là dấu vết của "mỗi thứ", "cũng vậy"… mà CRF bỏ sót. Riêng tín hiệu này đưa tự nhận trên kiểu "mỗi thứ" chưa gặp từ 22% (đúng 11%) xuống 3%; câu thường gần như không đổi.
- **Khung câu lạ** (`novel`): mỗi token thành một lớp (`#` số, `U` đơn vị, `I` chữ của tên món trong danh mục, `,` dấu câu, `$` tiền; từ khác giữ nguyên), rồi so các cặp lớp liền nhau với tập cặp có trong câu train (5.378 cặp, ghi vào `crf-model.json`). Chỉ áp cho câu phức (từ hai số hoặc hai dòng, có số lượng quan hệ, sửa lời hay dấu hiệu quan hệ): áp cho mọi câu thì test chính mất 22 điểm độ phủ. Cặp 3 lớp chặt hơn trên lexout (97.5% so với 95.4%) nhưng mất thêm 15 điểm độ phủ trên synthetic cùng phân phối và cần 19k mục; gán lớp `I` theo nhãn CRF (cho tên món mới) lấy lại 1–3 điểm câu thường nhưng lọt câu lạ (kiểu câu chưa gặp đúng 58–74% thay vì 81–85%), vì CRF hay gán từ lạ của cấu trúc mới vào tên món.

**Gate đã chọn:** θ = 0.9 như cũ, thêm `implicit` và `novel` (`freeFormGate`, mặc định bật; `false` để so). Kết quả trên synthetic (`voice:grid --gate --lexout`, model của từng proxy):

| Tập (1.000 câu) | Gate cũ: đúng / tự nhận sai / hỏi lại | Gate câu tự do | Đúng khi tự nhận: cũ → mới |
|---|---|---|---|
| Từ vựng giữ lại (lexout) | 68.5 / 6.5 / 25.0 | 11.3 / 0.5 / 88.2 | 91.3% → 95.4% |
| Kiểu câu chưa gặp + từ vựng giữ lại (6 kiểu) | tự nhận sai 9.7–33.4 | tự nhận sai 0.1–2.7 | |
| Kiểu câu chưa gặp, đủ từ vựng (6 kiểu) | tự nhận sai 4.8–39.9 | tự nhận sai 0.3–6.9 | |

Trên bộ người viết: test chính 90.7% theo món / 0/127 dòng sai / 14.1% hỏi lại (gate cũ 95.1 / 0 / 10.9); dev 87.3 / 0 / 16.3 (cũ 96.4 / 0 / 10.6); free-test (dev) 59.5 / 0 / 37 (cũ 96.4 / 0 / 4). P95 12.1 ms.

**Bộ giữ kín thứ hai** (120 câu, chấm sau khi chốt gate, chỉ số tổng):

| Cấu hình | Theo món | Tự nhận sai (dòng) | Câu có tự nhận sai | Máy tự xử lý (câu) | Đúng hết trong số đó | Hỏi lại |
|---|---|---|---|---|---|---|
| Gate cũ (giai đoạn 4) | 44.2% | 6.4% (7/109) | 5.0% | 51.7% | 66.1% | 59.2% |
| **Gate câu tự do** | 17.9% | **0.0% (0/41)** | **0.0%** | 20.8% | **80.0%** | 85.0% |
| Gate câu tự do + luật dự phòng | 17.9% | 0.0% (0/41) | 0.0% | 21.7% | 76.9% | 84.2% |

**Đọc kết quả:**
- Mục tiêu 2% tự nhận sai đạt trên bộ giữ kín: không dòng món nào bị ghi sai. Mục tiêu 95% đúng hết khi máy tự xử lý **chưa đạt**: 20/25 câu. 5 câu còn lại không có dòng món tự nhận sai, nên lỗi của chúng nằm ở loại khác (thiếu món, món ngoài danh mục, hỏi chọn biến thể hay khoản chi); không xem câu nên chưa biết loại nào. Trên lexout gate đạt 95.4% (chỉ khoảng 110 câu được tự nhận); trên kiểu câu chưa gặp, câu còn được tự nhận đúng 70–95% với số bàn/giờ/người, "cũng vậy", kể theo tên trước, còn "tổng rồi kể" và sửa lời thì rất ít câu được tự nhận nhưng phần lớn số đó sai. Proxy đã báo trước là 95% theo câu chưa chắc.
- Đổi lại, máy chỉ tự xử lý 1/5 câu tự do; 85% câu tự do cần LLM hoặc hỏi lại. Câu thường mất 3–6 điểm độ phủ, chủ yếu câu có món ngoài danh mục.
- Bộ giữ kín này đã chấm hai lần và tôi đã thấy số theo nhóm của lần đầu; muốn sửa tiếp theo kết quả thì cần bộ giữ kín thứ ba (sub-agent viết như mục 3.4) để đo sạch.

## 4. Chạy lại

Trong `frontend/mobile` (Node có `--experimental-strip-types`; Python qua `uv`, không đụng `backend/ai`):

```bash
npm run voice:eval                            # bảng §7: bộ chính dev/test, câu tự do free-dev/free-test, độ trễ
npm run voice:eval -- --failures dev          # câu sai của một tập (dev, free-dev, …); thêm --parser poc+luat
npm run voice:tune                            # dò τ/δ và ngưỡng tin cậy CRF chỉ trên dev
npm run voice:synth                           # 16.000 câu train + 1.000 câu dev synthetic, đặc trưng ra .data/
npm run voice:train                           # train CRF (python-crfsuite), xuất src/lib/voiceParse/crf-model.json
npm run voice:parity                          # so Viterbi và xác suất biên TS với CRFsuite
npm run voice:grid                            # lưới θ × ν × tagger dự phòng × cách tính tên (mục 3.2)
npm run typecheck

# biến thể model và câu dùng từ vựng chưa gặp (mục 3.2)
npm run voice:synth -- --out /tmp/h --holdout 1
uv run scripts/voice-crf/train.py --data /tmp/h --model /tmp/h/model.json
npm run voice:grid -- --compact --lexout /tmp/h --model /tmp/h/model.json
npm run voice:grid -- --ablate                # tắt gate dấu hiệu / luật số tham chiếu

# gate câu tự do (mục 3.5): bỏ một kiểu câu khỏi train, rồi so gate mới / cũ
npm run voice:synth -- --out /tmp/f --famout repair --holdout 1   # kiểu: dist, copy, repair, ref, total, topic
uv run scripts/voice-crf/train.py --data /tmp/f --model /tmp/f/model.json
npm run voice:grid -- --gate --lexout /tmp/f/famout.jsonl --model /tmp/f/model.json --only model
npm run voice:grid -- --gate                  # bộ người viết
npm run voice:gate -- --set repair=/tmp/f/model.json=/tmp/f/famout.jsonl   # so mọi tín hiệu / chính sách gate

# router (mục 3.3): đặc trưng từ synthetic seed khác (train) và từ bộ eval, rồi học và so với θ
npm run voice:synth -- --out /tmp/r --holdout 1 --seed 101 --train 10 --dev 3000 --lexout 3000
npm run voice:router -- /tmp/h/model.json /tmp/r/train.jsonl synth-dev:/tmp/r/dev.jsonl synth-lexout:/tmp/r/lexout.jsonl
npm run voice:router -- /tmp/h/model.json /tmp/r/eval.jsonl synth-dev:/tmp/h/dev.jsonl synth-lexout:/tmp/h/lexout.jsonl
npm run voice:router -- src/lib/voiceParse/crf-model.json /tmp/r/human.jsonl human
uv run scripts/voice-crf/router.py /tmp/r/train.jsonl /tmp/r/eval.jsonl /tmp/r/human.jsonl
```

`node scripts/voice-crf/...` chạy thẳng mã TS của app nhờ `scripts/voice-crf/ts-resolve.mjs` (thêm đuôi `.ts` và thuộc tính JSON như Metro), không đổi `tsconfig`.

## 5. Đã làm

| Lớp | File | Nội dung |
|---|---|---|
| L1 normalize + ITN | `text.ts` | Token giữ dạng có dấu, bỏ dấu và vị trí ký tự; gộp số tiền đọc hoặc viết (`20k`, `hai chục nghìn`, `một triệu hai` = 1.200.000); từ số có dấu sai cách viết thì không phải số ("cơm tấm"); tách chữ-số dính (`st25`). Dùng lại `parseSpokenRun` của `parseOrder.ts`. |
| L2 gazetteer + chỉ mục | `catalog.ts` | Biến thể đọc được của tên (`Gạo ST25 5kg` → `gao st hai lam nam ky`), n-gram gazetteer, chỉ mục trigram, cache theo mảng sản phẩm. |
| L3 tagger | `tagger.ts` (luật), `features.ts` + `crf.ts` (CRF) | Nhãn BIO QTY UNIT ITEM AMT EXP O, cộng QTYP QTYD QTYC COPY EDIT (chỉ CRF gán). Mặc định (giai đoạn 4): chỉ CRF; tagger luật còn là tuỳ chọn (`tagger`, `fallbackTagger`) để so sánh. CRF trả thêm P(chuỗi Viterbi), 32 chuỗi tốt nhất (tính khi cần) và P(O) từng token. Model ghi bộ đặc trưng nó được train (`features: "v2"`), nạp qua import JSON. |
| Ghép slot | `index.ts` | QTY thường lấy theo mệnh đề (số trước tên, hoặc số sau tên khi nói tên trước); nhãn quan hệ xét cả câu (món trước, cả danh sách, sửa lời, chép số). Món nói ngay sau cụm EDIT thay món nói trước (mục 3.2). Sửa ranh giới cụm tên bằng linker: bỏ đơn vị đứng đầu, cắt bổ ngữ cuối ("không đường"), nối hai cụm cùng chỉ một món. Giải mã `valid`: chọn đơn hàng qua gate có tổng xác suất lớn nhất trong 32 chuỗi nhãn tốt nhất. |
| L4 linker + gate | `catalog.ts`, `index.ts` | Căn chỉnh từ theo thứ tự với tên món (không phải túi trigram), trọng số IDF theo danh mục; từ sai dấu 0.9, gần âm s/x, gi/d/r, ch/tr 0.8 (chỉ khi cùng dấu thanh: "bàn" ≠ "bánh"), gần giống chính tả theo Dice trigram, dính/tách từ. Nhận khi điểm ≥ τ = 0.72 và cách ứng viên 2 ≥ δ = 0.12; nhiều ứng viên sát nhau thì trả `disambiguations` (tối đa 6); dưới τ là món ngoài danh mục. |
| Fallback | `index.ts` | `fallback = true` khi gate không hiểu câu (`unattached`, `marker`, `duplicate`, `implicit`, `confidence`; mục 3, 3.1), câu phức có khung câu chưa gặp (`novel`, mục 3.5) hoặc câu có số/nhãn mà không ra dòng nào (`empty`); kết quả cục bộ nằm ở `tentative`, các mảng kết quả rỗng. Chỉ đếm, chưa gọi `draft_parse`. |

Vì sao bỏ chấm điểm bằng túi trigram (brief §3, containment): "xôi gà" chứa đủ trigram của "Cơm gà xối mỡ" (containment 1.0) nên sẽ bị tự nhận sai; căn chỉnh theo thứ tự cho 0.54 (dưới τ). **[đã kiểm chứng]** trên bộ eval.

Ngưỡng dò trên dev (`voice:tune`): mọi cặp τ ∈ [0.64, 0.80] cho cùng kết quả tốt nhất; chọn τ = 0.72, δ = 0.12 ở giữa vùng. Ngưỡng tin cậy CRF: mọi θ từ 0 đến 0.9 cho cùng kết quả trên dev + free-dev (12 câu dev đi qua CRF, câu đúng đều ≥ 0.98), chọn θ = 0.9 (cao nhất chưa làm giảm kết quả dev) để ưu tiên không tự nhận sai. Dev quá nhỏ để phân biệt δ và θ.

## 6. CRF

- Dữ liệu train (giai đoạn 4): 16.000 câu synthetic (+1.000 câu dev); thêm sửa lời tổ hợp có nhãn EDIT (8% câu) và từ vựng rộng (mục 3.2). Giai đoạn 1–3: 8.000 câu sinh từ mẫu trên 8 danh mục train (tạp hoá khác, quán nhậu, trà sữa, tiệm bánh, bún phở, trái cây, văn phòng phẩm, phụ kiện điện thoại), **không trùng** danh mục eval. Có câu bán (số trước/sau tên, nói liền, chỉ đơn vị, chỉ tên món, bổ ngữ sau tên), món ngoài danh mục, khoản chi, câu lẫn bán và chi, chuyện phiếm, và các câu có quan hệ số lượng (mỗi thứ, cũng vậy, sửa lời, số bàn/giờ, cho N người, tổng rồi kể, kể theo tên trước); biến thể không dấu, số đọc/viết, tên một phần, đổi dấu thanh, gần âm, dính/tách từ.
- Đặc trưng chỉ tính bằng TS (`features.ts`) rồi xuất cho Python, nên train và chạy trên máy dùng đúng một bộ đặc trưng.
- `python-crfsuite==0.9.11`, L-BFGS, c1 = 0.05, c2 = 0.01, 300 vòng: 19 nhãn, 9.691 trọng số khác 0, JSON 251 KB gồm 5.378 cặp lớp khung câu cho gate câu tự do (giai đoạn 4: 199 KB; giai đoạn 3: 17 nhãn, 5.158 trọng số, 107 KB). Train lại cho ra đúng file đã commit.
- F1 theo cụm trên synthetic dev (cùng phân phối với train, nên lạc quan): ITEM 0.989, QTY 0.992, UNIT 0.995, AMT 0.997, EXP 1.000, EDIT 0.976, QTYD 0.993, QTYC 0.947, COPY 1.000, QTYP 0.984.
- **Parity TS so với CRFsuite** **[đã kiểm chứng]**: nhãn Viterbi trùng 100% trên 392/392 câu eval (3.161 token, gồm bộ chính và câu tự do) và 1.000/1.000 câu synthetic dev (10.929 token). Xác suất biên (forward-backward TS) lệch tối đa 3.9e-6 so với CRFsuite. Viterbi không dùng hàm mũ nên trùng tuyệt đối; độ lệch của xác suất biên có lẽ do CRFsuite tính `exp` xấp xỉ khi build có SSE **[suy luận]**, không ảnh hưởng ngưỡng 0.9. Viterbi + xác suất biên mất 0.5–0.8 ms/câu.
- **n-best:** list Viterbi giữ k đường mỗi ô (t, nhãn) (giai đoạn 3: k = 16, giai đoạn 4: k = 32), ghép bằng trộn các danh sách đã sắp xếp; 0.2–0.6 ms/câu với k = 16. `voice:parity` kiểm tra trên 392 câu eval và 1.000 câu synthetic: chuỗi đầu có cùng xác suất với chuỗi Viterbi, xác suất giảm dần, tổng ≤ 1, không trùng chuỗi **[đã kiểm chứng]**.

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

**Đã kiểm chứng:** bảng §7 và bảng câu tự do bằng `npm run voice:eval`; lưới, ablation, lexout và router bằng `voice:grid` / `voice:router` / `router.py` (mục 3.2, 3.3); gate câu tự do bằng `voice:gate` / `voice:grid --gate` trên 12 model bỏ một kiểu câu (mục 3.5); parity bằng `npm run voice:parity`; `npm run typecheck` pass; 0 câu baseline đúng mà PoC tự nhận sai trên dev và test của bộ chính (5 câu dev và 2 câu test baseline đúng nay gửi LLM); mã wrapper và mã sherpa-onnx upstream về hotword và LM (mục 12); chế độ `--asr` của eval (transcript trùng chữ vàng cho đúng số của eval chữ); `voice:asr prompts` và `voice:asr lm` chạy được, file ARPA nạp được bằng KenLM 0.3.0.

**Chưa kiểm chứng:** L0 hotword (WER tên hàng, độ trễ beam search); mọi số ASR (ChunkFormer, KenLM, Zipformer trên audio: chưa có audio, Hugging Face bị chặn trong môi trường này); `voice:asr chunkformer` và `voice:asr zipformer` chưa chạy lần nào; độ trễ trên máy Android thật (mới đo trên Node); độ chính xác với catalog 1.000 món (mới đo độ trễ); câu thật của người dùng; fallback LLM thật; UX hỏi chọn biến thể; số giữ kín cho giai đoạn 3 (giai đoạn 4 đã có, mục 3.4); số giữ kín sạch cho gate câu tự do (bộ thứ hai đã chấm lần hai, mục 3.5); router trên dữ liệu thật; độ trễ giai đoạn 4 trên máy (Hermes chậm hơn Node).

**Cách làm bộ eval và giới hạn:**
- **Bộ chính (260 câu):** một sub-agent viết nháp theo quy tắc gắn nhãn, không xem code parser; tôi soát lại toàn bộ nhãn. Chia dev/test 40/60 phân tầng theo 11 nhóm, seed cố định, đóng băng trước khi viết PoC. Lỗi được soát trên dev; tập test chỉ xem số tổng, trừ một lần bảng eval in ra ID 4 câu test bị hỏng ở phiên bản đầu (đã tắt ngay). Tôi đã đọc mọi câu khi soát nhãn, nên danh sách từ đệm có thể vô tình hợp với bộ câu này hơn câu thật.
- **Câu tự do:** free-dev là 32 câu tôi tự viết để thử, sau đó dùng để phát triển; free-test là 100 câu giữ kín như mục 3.

## 9. Lỗi còn lại trên test của bộ chính (PoC mặc định)

Bảng từ giai đoạn 2–3. Giai đoạn 4 chỉ xem số tổng của test (95.1% theo món, 0 dòng sai, 10.9% hỏi lại), không xem câu nào sai.

| Câu | Lỗi | Nguyên nhân |
|---|---|---|
| "ờ để chị xem à có đường không, hai ký đường nha" | Giai đoạn 2 tự nhận Đường × 3 (đúng là × 2); giai đoạn 3 hỏi lại (gate `duplicate`) | Câu hỏi còn hàng "có … không" bị tính là bán thêm 1. |
| "lấy hai hộp chocopie mười hai cái" | Không tự nhận (fallback) | "mười hai cái" là quy cách hộp; gate thấy số chưa gắn vào món nên hỏi lại thay vì đoán. |
| "chin su một chai" | Không tự nhận (fallback) | Gõ không dấu: "chin" có thể là số chín; gate chặn thay vì tạo món lạ như bản trước. |
| "bia tigơ", "chôcô pai", "xì dầu maggi" | Không nhận ra món | Lỗi STT nặng hoặc từ đồng nghĩa; cần hotword (L0) hoặc LLM. |

## 10. Rủi ro

- Bộ câu tự soạn; câu thật có thể dài hơn, nhiều tiếng địa phương và lỗi STT khác. Cần đo lại trên câu thật (có xin đồng ý, không log transcript ở production khi chưa duyệt).
- Câu nói tự do: luật và CRF học từ mẫu tự soạn đều chỉ phủ các biến thể đã gặp (mục 3); tagger luật không nhận ra biến thể lạ thì vẫn có thể tự nhận sai.
- Fallback (4–11% câu trên bộ tự soạn, 25% trên câu synthetic có từ chưa gặp) chỉ an toàn khi có đường dự phòng thật (LLM hoặc hỏi lại trên UI); hiện app chưa có.
- Câu tự do chưa gặp: bộ giữ kín thứ hai cho 6.4% tự nhận sai và 59% hỏi lại (mục 3.4). Số 0 dòng sai trên pool lạc quan vì bộ sinh câu được mở rộng sau khi xem lỗi của pool.
- Model CRF 251 KB (giai đoạn 4: 199 KB, giai đoạn 3: 107 KB) nằm trong bundle JS.
- Gate câu tự do đẩy 85% câu tự do và 14% câu thường sang LLM/hỏi lại; chưa có `draft_parse` thì các câu đó chỉ có thể hỏi lại người dùng.
- Danh mục lớn có nhiều món gần giống làm tăng tỉ lệ hỏi lại; chưa có bộ eval cho trường hợp này.
- Bật hotword khi chưa vá wrapper sẽ làm app thoát (`exit(-1)`).

## 11. Bước tiếp theo

1. **Câu tự do sang LLM:** gate câu tự do (mục 3.5) đưa tự nhận sai trên bộ giữ kín về 0 dòng, nhưng máy chỉ tự xử lý 1/5 câu tự do và 80% (chưa tới 95%) số câu đó đúng hết. Ưu tiên endpoint `draft_parse`. Muốn đẩy lên 95%: viết bộ giữ kín thứ ba (sub-agent), tìm loại lỗi của câu tự xử lý mà không sai dòng món (thiếu món, món mới, khoản chi) trên dev/synthetic, đo lại một lần.
2. **Thu âm các câu eval** (người trong nhóm đọc, có đồng ý, không commit audio) rồi chạy `voice:asr` cho Zipformer hiện tại (greedy như app, beam + hotword) và ChunkFormer (greedy, beam + KenLM, + hotword), chấm bằng `voice:eval --asr` (mục 12). Đây là cách duy nhất để biết LM/hotword có đáng làm trên máy.
3. Owner quyết làm endpoint `draft_parse` (AI + Core proxy) cho câu `fallback` (4–11% trên bộ tự soạn).
4. **Router học từ phân phối thật** (mục 3.3): khi owner duyệt, ghi đặc trưng của `voice:router` (không ghi transcript) cùng kết quả người dùng xác nhận hoặc kết quả LLM chạy song song; thêm xác suất token của STT làm đặc trưng chất lượng giọng nói; học lại `router.py` và so với θ.
5. Owner quyết UX hỏi chọn biến thể và hỏi lại: `voice.tsx` hiển thị `disambiguations` và xử lý `fallback`, rồi đổi import `parseOrder` sang `src/lib/voiceParse`; cập nhật PRD/AC nếu thay đổi hành vi.
6. L0: vá wrapper bằng `patch-package` (`modelingUnit = "bpe"`, `bpeVocab`, `modified_beam_search` khi có hotword), thêm `bpe.vocab` vào `STT_MODEL_FILES`, sinh hotword từ danh mục, đo trên máy Android thật.
7. Thu bộ câu thật (có đồng ý) để đo lại và để train/fine-tune; thêm bộ eval cho danh mục lớn có món gần giống.

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
