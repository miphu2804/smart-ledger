# ADR-0010: Đo cách dùng app mobile bằng Google Analytics 4, chỉ khi người dùng đồng ý

- **Trạng thái:** Proposed. Code nằm trong nhánh `feat/mobile-ga4-analytics`, chưa merge và chưa build ra máy thật. Cần chủ sản phẩm duyệt `BR-026`, `FR-039`, `NFR-011`, và người đứng tên pháp lý xác nhận căn cứ đồng ý trước khi phát hành.
- **Ngày:** 2026-11-06
- **Owner:** chủ sản phẩm giữ danh mục sự kiện và cách đọc chỉ số; owner mobile giữ code và test; người đứng tên pháp lý giữ khai báo Data safety và trang chính sách.
- **Liên quan:** [`BR-026`](../../product/business-requirements.md), [`FR-039`, `NFR-011`, `AC-119`–`AC-121`](../../product/product-requirements.md), [ADR-0003](0003-product-analytics-grafana.md), [Data safety](../../product/google-play-data-safety.md), [`analyticsEvents.ts`](../../../frontend/mobile/src/lib/analyticsEvents.ts), [`analytics.ts`](../../../frontend/mobile/src/lib/analytics.ts).

## 1. Bối cảnh

[ADR-0003](0003-product-analytics-grafana.md) đếm người dùng và thao tác bằng SQL trên dữ liệu Core trong Grafana. Cách đó chỉ thấy những gì đã ghi xuống cơ sở dữ liệu: không thấy màn nào được mở, người dùng dừng ở bước nào trước khi lưu đơn, hay đọc đơn bằng giọng nói được dùng bao nhiêu so với bán bằng máy bán hàng. Mỗi biểu đồ mới lại cần một câu SQL và người biết đọc nó.

Các app thanh toán và bán lẻ ở Việt Nam như MoMo cài sẵn Firebase Analytics (bản quét Exodus Privacy), và GA4 cho sẵn DAU/WAU/MAU, giữ chân theo nhóm ngày cài, phễu và so sánh phiên bản app mà không phải tự dựng. App đã có Firebase cho đăng nhập (`@react-native-firebase/app` 26.4.0), nên thêm Analytics chỉ là một gói cùng phiên bản và một file cấu hình. Nhóm muốn chuyển việc đo hành vi người dùng của cả team sang GA4.

## 2. Quyết định

### 2.1. Chỉ gửi khi người dùng đồng ý

- `frontend/mobile/firebase.json` tắt thu thập từ lúc mở app (`analytics_auto_collection_enabled: false`), tắt ID quảng cáo, SSAID, IDFV, đăng ký với mạng quảng cáo, tự ghi màn, và đặt mặc định không cho lưu hay dùng dữ liệu cho quảng cáo.
- Android chặn quyền `com.google.android.gms.permission.AD_ID` (`android.blockedPermissions` trong `app.json`); iOS build Analytics không có hỗ trợ IDFA (plugin `@react-native-firebase/analytics` với `withoutAdIdSupport`).
- `AnalyticsConsentPrompt` hỏi một lần trên máy ngay sau khi đăng nhập, trước bước tạo tiệm để đo được cả lúc bắt đầu dùng app. Đóng hộp thoại tính là "Không". Cài đặt có công tắc "Gửi số liệu sử dụng". Lựa chọn lưu trong `AppSettings` (`analytics`, `analyticsAsked`) trên máy, không theo tài khoản.
- `setAnalyticsConsent(true)` bật thu thập và gắn `user_id`; rút lại đồng ý thì tắt thu thập và gọi `resetAnalyticsData` để xoá dữ liệu còn trên máy và ID cài đặt app.
- Bản web chỉ để thử app, nên `analytics.web.ts` không gửi gì và không hỏi.

### 2.2. Danh mục sự kiện

Danh mục đầy đủ, kèm mỗi sự kiện đo gì, là `ANALYTICS_EVENTS` trong [`analyticsEvents.ts`](../../../frontend/mobile/src/lib/analyticsEvents.ts); TypeScript bắt thêm mô tả khi thêm sự kiện mới, và test kiểm tên theo luật của GA4. Nguyên tắc:

- Dùng sự kiện khuyến nghị của GA4 khi có (`login` với `method`). Không dùng `purchase` cho đơn bán, vì đó là doanh thu của tiệm chứ không phải của app, và GA4 sẽ cộng nó vào báo cáo doanh thu.
- Tham số chỉ là giá trị liệt kê hoặc số đếm. Không gửi tên, số điện thoại, email, tên tiệm, tên món, số tiền hay nội dung chat.
- `user_id` là ID tài khoản Core, để GA4 đếm một người trên nhiều máy. Không dùng Firebase UID hay email.
- `screen_view` ghi tên màn từ `useSegments()` của expo-router, bỏ nhóm như `(tabs)` và giữ `[id]` thay cho mã thật, nên mọi hoá đơn gộp về `invoice/[id]`.
- Gọi SDK không chặn luồng chính; lỗi chỉ ghi `debugLog`, vì mất một sự kiện không được làm hỏng thao tác bán hàng.

### 2.3. Đọc chỉ số trong GA4

| Câu hỏi | Cách đọc |
|---|---|
| Bao nhiêu chủ tiệm dùng app mỗi ngày, tuần, tháng | Báo cáo người dùng, theo `user_id` |
| Người mới có quay lại không | Báo cáo giữ chân theo nhóm ngày dùng đầu tiên |
| Người mới tới được đơn đầu tiên không | Phễu `login` → `shop_created` (`via=onboarding`) → `sale_completed` |
| Cách bán nào được dùng | `sale_completed` chia theo `source` và `payment` |
| Đọc đơn bằng giọng nói có tới được thanh toán không | `voice_order_reviewed` so với `sale_completed` có `source=voice` |
| Trợ lý AI có được dùng lại không | `ai_message_sent` theo `conversation` và số người dùng |

### 2.4. Việc làm trên Firebase và GA4 Console

1. Mỗi môi trường gửi vào property GA4 riêng: project Firebase `smart-ledger-production` (bản `android-production`, APK/AAB phát hành) vào property `smart-ledger-production` (ID 562874077), còn project staging `smart-ledger-c2892` (bản `android-dev`, `android-staging`) vào property `smart-ledger-c2892` (ID 554910244). Chỉ số sản phẩm đọc ở property production; property staging dùng để kiểm sự kiện trước khi phát hành. iOS chưa phát hành nên chưa đo.
2. Đặt lưu dữ liệu sự kiện và dữ liệu người dùng 14 tháng (mặc định 2 tháng làm mất báo cáo giữ chân dài).
3. Tắt Google signals, không liên kết Google Ads, và tắt các chia sẻ dữ liệu với sản phẩm Google, để Google chỉ là bên xử lý.
4. Bật xuất BigQuery khi cần truy vấn ngoài báo cáo có sẵn.
5. Kiểm bằng DebugView của property staging: `adb shell setprop debug.firebase.analytics.app vn.teamhexa.songheloi` trên bản `android-staging`.

## 3. Phương án đã loại

| Phương án | Vì sao không chọn |
|---|---|
| Chỉ dùng Grafana trên dữ liệu Core ([ADR-0003](0003-product-analytics-grafana.md)) | Không thấy màn hay các bước chưa ghi xuống Core; mỗi chỉ số cần SQL riêng |
| Mixpanel, Amplitude hoặc PostHog | Phễu và phân nhóm tốt hơn, nhưng thêm một SDK và một bên xử lý mới; app đã có Firebase, và GA4 đủ cho các câu hỏi ở mục 2.3 |
| Bật thu thập tự động như mặc định của SDK | Gửi dữ liệu trước khi người dùng đồng ý và mang theo ID quảng cáo |
| Gửi số tiền đơn hoặc dùng sự kiện `purchase` | Là dữ liệu kinh doanh của tiệm; GA4 sẽ coi là doanh thu của app |

## 4. Hệ quả

- Số liệu GA4 chỉ gồm người đã đồng ý, nên thấp hơn thực tế và không thay ngày hoạt động của `BR-023`. Lần đăng nhập đầu tiên trên máy không được đếm, vì hộp thoại hỏi sau khi đăng nhập.
- Các panel người dùng trong dashboard Grafana của ADR-0003 sẽ bỏ ở một thay đổi khác, sau khi GA4 có đủ dữ liệu để so.
- Data safety phải khai thêm ID thiết bị và lượt tương tác qua Google Analytics; trang chính sách phải nêu Google Analytics và cách rút lại đồng ý. Dữ liệu đi ra máy chủ của Google ngoài Việt Nam, nên người đứng tên pháp lý cần xác nhận hồ sơ chuyển dữ liệu ra nước ngoài theo Luật Bảo vệ dữ liệu cá nhân 2025 trước khi phát hành.
- Thêm sự kiện mới chỉ cần một dòng trong `AnalyticsEventParams` và `ANALYTICS_EVENTS`, rồi một lời gọi `track` ở chỗ thao tác thành công.
