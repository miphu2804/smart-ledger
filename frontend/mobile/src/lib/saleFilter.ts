/**
 * Bộ lọc thời gian của màn Đơn hàng: một kỳ có sẵn (hàng nút dưới ô tìm) hoặc một khoảng ngày tự chọn (bảng chọn khoảng
 * ngày). Core lọc theo khoảng thời gian trước khi chia trang (`saleFilterWindow`); số tổng của các kỳ có sẵn lấy từ báo cáo
 * của Core (`saleFilterReportPeriod`). Phần thuần nằm ở đây để kiểm tra được mà không cần giao diện.
 */
import type { ReportPeriod } from '../data/types';
import { dayKey, ddmm, ddmmyyyy, parseDayKey } from './format';
import { periodLabel, type Period } from './stats';

export interface SaleFilter {
  /** Một kỳ có sẵn, hoặc 'custom' = khoảng ngày tự chọn (`from`, `to`) */
  time: Period | 'custom';
  /** Ngày đầu và ngày cuối của khoảng tự chọn, dạng `yyyy-mm-dd` theo giờ máy, tính cả hai ngày */
  from: string | null;
  to: string | null;
}

export const DEFAULT_SALE_FILTER: SaleFilter = { time: 'all', from: null, to: null };

/** Các khoảng "N ngày gần nhất" có sẵn trong bảng chọn khoảng ngày. */
export const RANGE_PRESETS = [7, 15, 30] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

/** N ngày gần nhất, tính cả hôm nay: 7 ngày vào 13/10 là 07/10 – 13/10. */
export function lastDaysRange(days: number, now = new Date()): { from: string; to: string } {
  return { from: dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1))), to: dayKey(now) };
}

/** Khoảng ngày có trùng một khoảng có sẵn không: để tô nút tương ứng và gọi tên là "N ngày gần nhất". */
export function matchingPreset(from: string | null, to: string | null, now = new Date()): RangePreset | null {
  if (!from || !to) return null;
  return (
    RANGE_PRESETS.find((days) => {
      const range = lastDaysRange(days, now);
      return range.from === from && range.to === to;
    }) ?? null
  );
}

/** Đầu ngày (giờ máy) cách `day` một số ngày; tạo bằng năm/tháng/ngày nên ngày đổi giờ mùa hè vẫn đúng. */
function shiftDay(day: Date, days: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + days);
}

/**
 * Khoảng thời gian gửi lên Core (`GET /sales?from=&to=`): đơn có soldAt trong `[from, to)`, mốc là ISO 8601 (UTC) của đầu
 * ngày theo giờ máy. Ngày cuối của khoảng tự chọn được tính trọn nên `to` là đầu ngày hôm sau. "Tất cả" không gửi mốc nào.
 */
export function saleFilterWindow(f: SaleFilter, now = new Date()): { from?: string; to?: string } {
  const today = shiftDay(now, 0);
  const tomorrow = shiftDay(now, 1);
  const window = (from: Date | null, to: Date | null) => ({
    ...(from ? { from: from.toISOString() } : {}),
    ...(to ? { to: to.toISOString() } : {}),
  });
  switch (f.time) {
    case 'all':
      return {};
    case 'today':
      return window(today, tomorrow);
    case 'yesterday':
      return window(shiftDay(now, -1), today);
    case 'thisWeek':
      // Tuần lịch bắt đầu từ thứ Hai
      return window(shiftDay(now, -((now.getDay() + 6) % 7)), tomorrow);
    case 'week':
      return window(shiftDay(now, -6), tomorrow);
    case 'month':
      return window(new Date(now.getFullYear(), now.getMonth(), 1), tomorrow);
    case 'custom':
      return window(f.from ? parseDayKey(f.from) : null, f.to ? shiftDay(parseDayKey(f.to), 1) : null);
  }
}

/**
 * Kỳ báo cáo của Core trùng với bộ lọc, để lấy số tổng (doanh thu, số đơn từng ngày) tính trên toàn tiệm. `null` khi
 * không có kỳ tương ứng ("Tất cả", khoảng tự chọn): khi đó màn hình chỉ hiện số đơn.
 */
export function saleFilterReportPeriod(f: SaleFilter): ReportPeriod | null {
  switch (f.time) {
    case 'today':
    case 'yesterday':
    case 'week':
    case 'month':
      return f.time;
    case 'thisWeek':
      return 'this_week';
    default:
      return null;
  }
}

/** Bộ lọc có đang thu hẹp danh sách không. */
export function isSaleFilterActive(f: SaleFilter): boolean {
  return f.time !== 'all';
}

/** Ngày ngắn cho chỗ hẹp: "13/10", kèm năm hai số khi không phải năm nay. */
function shortDay(key: string, now: Date): string {
  const d = parseDayKey(key);
  return d.getFullYear() === now.getFullYear() ? ddmm(d) : `${ddmm(d)}/${String(d.getFullYear()).slice(-2)}`;
}

function rangeLabel(from: string | null, to: string | null, day: (key: string) => string): string {
  if (from && to) return from === to ? day(from) : `${day(from)} – ${day(to)}`;
  if (from) return `Từ ${day(from)}`;
  if (to) return `Đến ${day(to)}`;
  return periodLabel.all;
}

/** Tên khoảng thời gian đang lọc: "Tháng này", "30 ngày gần nhất", "01/10/2026 – 13/10/2026". */
export function saleFilterTimeLabel(f: SaleFilter, now = new Date()): string {
  if (f.time !== 'custom') return periodLabel[f.time];
  const preset = matchingPreset(f.from, f.to, now);
  if (preset) return `${preset} ngày gần nhất`;
  return rangeLabel(f.from, f.to, (key) => ddmmyyyy(parseDayKey(key)));
}

/** Bản ngắn của `saleFilterTimeLabel` cho nút kỳ và ô hẹp: "30 ngày", "01/10 – 13/10". */
export function saleFilterTimeShort(f: SaleFilter, now = new Date()): string {
  if (f.time !== 'custom') return periodLabel[f.time];
  const preset = matchingPreset(f.from, f.to, now);
  if (preset) return `${preset} ngày`;
  return rangeLabel(f.from, f.to, (key) => shortDay(key, now));
}
