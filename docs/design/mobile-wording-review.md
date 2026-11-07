# Mobile wording review

**Status:** proposal; no Product Owner approval has been recorded. Checked against `frontend/mobile` on `staging` on 2026-10-04: 40 of the 46 proposed strings are already in the code; the fourth tab uses `Quản lý` instead of `Tiện ích`. The code is the source for the current wording; the table below is kept as a record of the proposal. The changes below only shorten the interface language; they do not change `BO/BR → FR/NFR → AC`, data, or business logic.

**Verified source:** the interface in `frontend/mobile` at the time of the update. Brand names, routes, and API identifiers are kept unchanged. The UI strings in the table are Vietnamese product copy and stay in Vietnamese; the headers and rationale are in English, and the Location column names screens by their UI labels.

## Wording mapping

| Current | New proposal | Location / function | Short rationale |
|---|---|---|---|
| `Xin chào!` | `Đăng nhập` | Phone number sign-in screen | States the purpose of the screen accurately. |
| `Nhập số điện thoại để bắt đầu bán hàng cùng Sổ Nghe Lời` | `Dùng số điện thoại để vào sổ bán hàng.` | Sign-in description | Shorter and more direct. |
| `Đăng nhập bằng email và mật khẩu` | `Dùng email` | Email sign-in link | Avoids repeating information that is already clear on the next screen. |
| `Cách đăng nhập khác` | `Hoặc tiếp tục với` | Separator for social sign-in | More natural in the context of a choice. |
| None | `Vào app` | Button that skips sign-in in development | Lets developers get in quickly; not rendered in production. |
| `Sổ bán hàng thông minh — chỉ cần nói` | `Bán hàng gọn hơn mỗi ngày` | Splash | Fewer claims and a less promotional tone. |
| `Bán hàng chỉ cần nói` | `Sổ bán hàng của bạn` | Logo tagline | Covers manual entry, POS, and voice. |
| `Chọn cách lên đơn` | `Đơn hàng mới` | Tổng quan, sales CTA group | Short and result-oriented. |
| `Nói để lên đơn` / `Nói đơn` | `Đọc đơn` | Tổng quan and the collapsed header | Short, natural, paired with the mic icon. |
| `Bán hàng Giọng nói` | `Đọc đơn` | Title of the voice screen | Consistent with the entry point name. |
| `Nhấn & Giữ để nói` | `Giữ để đọc đơn` | Mic CTA | Drops a redundant word and describes the gesture accurately. |
| `Đang nghe… Thả tay để chốt đơn` | `Đang nghe… Thả để xử lý` | Mic state | The AI/parser creates a draft; the transaction is not finalized. |
| `Nhập tên hàng + giá (hoặc nhấn giữ mic)` | `Nhập món, số lượng hoặc giá` | Đọc đơn composer | Easier to scan and covers every kind of data. |
| `Chưa có đơn để thanh toán` | `Chưa có đơn` | Payment empty state | Short title; the instruction goes in the secondary line. |
| `Hãy nói hoặc chọn hàng trước` | `Đọc đơn hoặc chọn hàng trước` | Payment empty state | Consistent with the new feature name. |
| `Quét mã vạch` | `Quét mã` | Add an item during payment | The camera/barcode icon complements the label. |
| `Tạo đơn mới` | `Đơn mới` | Completion screen | Short CTA that is still clear in context. |
| `Về trang chủ` | `Về Tổng quan` | Completion screen | Matches the name of the target tab. |
| `Khác` | `Tiện ích` | Fourth tab and tab title | More meaningful, avoids a generic label. |
| `Phân tích bán hàng` | `Báo cáo` | Tiện ích menu and report title | Short and familiar to sellers. |
| `Doanh thu, chi phí và bán chạy` | `Doanh thu, chi phí, bán chạy` | Báo cáo description | Drops an unnecessary conjunction. |
| `Hàng hoá & Kho hàng` | `Hàng hoá` | Tiện ích menu | Inventory is already described in the secondary line. |
| `Quản lý nợ` | `Công nợ` | Menu and the debt screen | A short, consistent business term. |
| `Theo dõi khách chưa thanh toán` | `Các khoản khách chưa trả` | Công nợ description | More everyday language. |
| `Diễn biến doanh thu` | `Doanh thu theo ngày` | Report | States the chart content clearly. |
| `Trợ lý AI` | `Trợ lý` | FAB and the Q&A screen | The function matters more than the technology. |
| `Hỏi về doanh thu, hàng hoá và công nợ` | `Hỏi về bán hàng, kho và công nợ` | Trợ lý description | Short and close to everyday speech. |
| `Chatbot` | `Hỏi đáp` | Mascot menu | Describes the action instead of the technology type. |
| `Giọng nói` | `Đọc đơn` | Mascot menu | Consistent with the sales entry point. |
| `Gợi ý` | `Báo cáo` | Mascot menu | The route currently opens today's figures and does not create new suggestions. |
| `Gợi ý AI` | `Gợi ý` | Notification group | Removes an unnecessary technology label. |
| `Giữ để nói` | `Giữ để đọc đơn` | Hint next to the mascot | States the result of the hold gesture. |
| `Mascot trợ lý AI` | `Trợ lý bán hàng` | Accessibility label of the mascot | Describes the role instead of the technology. |
| `Bắt đầu dùng` | `Bắt đầu` | Final CTA of the quick guide | Shorter, and the context is clear enough. |
| `Tab Khác gom các công cụ…` | `Tiện ích gom hàng hoá, chi phí, công nợ và báo cáo vào một chỗ.` | Quick guide | Matches the new tab name and drops the long explanatory sentence. |
| `Chọn một hoặc nhiều ngành — AI sẽ gợi ý danh mục phù hợp` | `Chọn một hoặc nhiều ngành để gợi ý danh mục phù hợp` | Shop setup | Focuses on the benefit and does not emphasize the technology. |
| `AI gợi ý · hàng bán chậm` | `Hàng bán chậm` | Best-seller list | The data already explains its own source; the new label is easier to scan. |
| `sản phẩm` | `mặt hàng` | Count and object in Hàng hoá | Distinguishes the `Hàng hoá` area from each object the seller manages. |
| `Không có sản phẩm` | `Chưa có mặt hàng` | Hàng hoá empty state | More natural and does not read as an error. |
| `Bấm + để thêm sản phẩm mới` | `Nhấn Thêm để tạo mặt hàng đầu tiên` | Hàng hoá empty state | Matches the button label actually displayed. |
| `Cấu hình sản phẩm` | `Thêm mặt hàng` | Scanned code not yet in the catalog | Uses a familiar verb and drops the technical term. |
| `Chụp ảnh (AI)` | `Chụp ảnh` | Way to enter item information | The camera icon and context are meaningful enough. |
| `Chụp bao bì hoặc bảng giá — AI sẽ điền tên, giá giúp bạn` | `Chụp bao bì hoặc bảng giá để điền nhanh thông tin. Hãy kiểm tra trước khi lưu.` | Hint for entering by photo | Short, neutral, and reminds the user to confirm the data. |
| `Tạo đơn · [tổng tiền]` | `Thanh toán · [tổng tiền]` | CTA after Đọc đơn | The button only opens the payment step; no official record is created yet. |
| `Đơn tạo bằng giọng nói` / `Đơn chọn từ POS` / `Đơn nhập tay` | `Nguồn: Đọc đơn` / `Nguồn: Bán hàng` / `Nguồn: Nhập tay` | Thanh toán subtitle | One structure, short and consistent. |
| `Sản phẩm này chưa có trong danh mục…` | `Mặt hàng này chưa có trong danh mục. Hãy thêm trước khi bán.` | Đọc đơn warning | Drops the `Core` implementation detail and keeps the remedy. |
| `Mình chưa hiểu câu hỏi này 😅…` | `Chưa hiểu câu hỏi. Hãy thử hỏi về…` | Trợ lý, not-understood state | Drops the emoji and the unnecessary personified tone. |
| Sổ Nghe Lời đã ghi được | Đơn đang đọc | Title of the list of items recognized from voice | Drops the proper name and the personified tone. |
| Bạn đã đọc hết thông báo | Không có thông báo mới | Subtitle of the notification list | Short, neutral, easy to scan. |
| Xoá giỏ trực tiếp | Confirmation dialog Xoá giỏ hàng? | Cart in Bán hàng (POS) | Protects the action of discarding the whole temporary cart against accidental taps. |
| Thêm nhân viên mới | Thêm nhân viên | Staff screen | Concise and in the standard action form. |
| Bạn sẽ cần nhập số điện thoại và mã OTP để đăng nhập lại. | Bạn sẽ cần đăng nhập lại để tiếp tục quản lý sổ. | Đăng xuất dialog | Fits both email and phone number sign-in. |
| [số lượng] sp | [số lượng] phần | Best-seller list in Tổng quan | Consistent with how items are named in retail. |

## Icon conventions

- Use `Feather` for all functional icons in the app because the current code already uses this set on most screens.
- Keep `FontAwesome` only for the sign-in provider logos (`Google`, `Facebook`, `Apple`), because these are brand marks rather than functional icons.
- An icon next to text must add meaning: mic + `Đọc đơn`, barcode/camera + `Quét mã`, chart + `Báo cáo`.
- Do not add decorative icons to titles or figures when the icon does not help distinguish an action or state.

## Motion and feedback conventions

| Group | Motion | Feedback |
|---|---|---|
| Frequent tab navigation | The indicator moves with a spring, content fades quickly | No vibration or sound. |
| Primary CTA | A clearer slight shrink on press | Vibrate only when the business action completes. |
| Secondary / ghost button | Opacity change, a very slight scale or no scale | No vibration. |
| Successful barcode scan | The existing bounding box/flash plus immediate feedback | A beep on web and one short vibration. |
| Add/update a product | Toast plus success feedback | One success vibration. |
| Payment completed | Spring checkmark plus the amount | A two-phase success vibration. |
| Error/warning | Toast or inline state | Vibrate only for errors that block the flow; no vibration for ordinary validation. |
