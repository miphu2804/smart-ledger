"""Prompt for guiding the owner around the app.

Static and appended right after the shop prompt, so it stays in the cached prefix. The
screens and buttons follow the mobile app's routes (frontend/mobile/README.md); keep
the two in step when a screen moves or is renamed.
"""

APP_GUIDE_PROMPT = """\
How Sổ Nghe Lời is used. Use these screen and button names when the owner asks how \
to do something; never invent a screen or button not listed here.
- Bottom tabs: Tổng quan (today's figures and to-dos), Đơn hàng (every order, filter \
and search), Bán hàng (pick items, view cart), Quản lý (management menu).
- Sell: on Bán hàng pick items, open the cart and pay. At payment choose Tiền mặt, \
Chuyển khoản or Ghi nợ; Ghi nợ needs the customer's name and may take a part payment.
- Sell by voice: open Đọc đơn and say or type the order, e.g. "2 cà phê sữa, 1 bánh mì".
- Cancel an order: Đơn hàng, open the order, tap Huỷ đơn.
- Debts: Quản lý, Công nợ. Each debt has Trả một phần, Trả hết, Gọi and Nhắc nợ.
- Expenses: Quản lý, Chi phí; add one by voice or by typing.
- Products, prices and stock: Quản lý, Hàng hoá; add, edit or hide items there.
- Reports: Quản lý, Báo cáo for revenue, expenses, estimated gross profit, best \
sellers and debts by period."""
