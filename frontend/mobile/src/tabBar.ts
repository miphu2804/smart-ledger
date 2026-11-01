/**
 * Kích thước thanh tab dưới cùng, dùng chung cho thanh tab và các màn nằm trong tab.
 *
 * Thanh tab vẽ sát đáy màn hình và luôn cao TAB_BAR_HEIGHT, không đổi theo vùng an toàn dưới (`insets.bottom`); phần lồi ở giữa
 * và nút Tạo đơn nhô lên thêm khoảng 14px. Vì vậy phần cuối nội dung cuộn và các thanh nổi trong màn tab phải chừa
 * TAB_BAR_CLEARANCE tính từ đáy, không cộng `insets.bottom`.
 */
export const TAB_BAR_HEIGHT = 100;

/** Khoảng chừa ở cuối màn tab: cao hơn thanh tab, phần lồi và bóng đổ để dòng cuối không bị che. */
export const TAB_BAR_CLEARANCE = TAB_BAR_HEIGHT + 24;
