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

/** Giờ Việt Nam (UTC+07, không đổi giờ mùa hè): kỳ báo cáo của Core tính theo lịch này. */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Ngày lịch Việt Nam của một thời điểm, dạng năm/tháng (0–11)/ngày/thứ (0 = Chủ nhật). */
function vnCalendar(at: Date) {
  const shifted = new Date(at.getTime() + VN_OFFSET_MS);
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth(), d: shifted.getUTCDate(), weekday: shifted.getUTCDay() };
}

/** Nửa đêm Việt Nam của một ngày lịch (tháng 0–11; ngày tràn hoặc âm tự lùi/tiến tháng), dạng ISO 8601 UTC. */
function vnMidnight(y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m, d) - VN_OFFSET_MS).toISOString();
}

/**
 * Khoảng thời gian gửi lên Core (`GET /sales?from=&to=`): đơn có soldAt trong `[from, to)`, mốc là nửa đêm theo lịch Việt
 * Nam như các kỳ báo cáo của Core, kể cả khi máy đặt múi giờ khác. Ngày cuối của khoảng tự chọn được tính trọn nên `to` là
 * nửa đêm ngày hôm sau. "Tất cả" không gửi mốc nào.
 */
export function saleFilterWindow(f: SaleFilter, now = new Date()): { from?: string; to?: string } {
  const { y, m, d, weekday } = vnCalendar(now);
  const tomorrow = vnMidnight(y, m, d + 1);
  switch (f.time) {
    case 'all':
      return {};
    case 'today':
      return { from: vnMidnight(y, m, d), to: tomorrow };
    case 'yesterday':
      return { from: vnMidnight(y, m, d - 1), to: vnMidnight(y, m, d) };
    case 'thisWeek':
      // Tuần lịch bắt đầu từ thứ Hai
      return { from: vnMidnight(y, m, d - ((weekday + 6) % 7)), to: tomorrow };
    case 'week':
      return { from: vnMidnight(y, m, d - 6), to: tomorrow };
    case 'month':
      return { from: vnMidnight(y, m, 1), to: tomorrow };
    case 'custom': {
      // Ngày của khoảng tự chọn là ngày lịch (`yyyy-mm-dd`), không phụ thuộc múi giờ máy
      const day = (key: string, offset: number) => {
        const [ky, km, kd] = key.split('-').map(Number);
        return vnMidnight(ky, km - 1, kd + offset);
      };
      return { ...(f.from ? { from: day(f.from, 0) } : {}), ...(f.to ? { to: day(f.to, 1) } : {}) };
    }
  }
}

/**
 * Kỳ báo cáo của Core trùng với bộ lọc, để lấy số tổng (doanh thu, số đơn từng ngày) tính trên toàn tiệm. `null` khi
 * không có kỳ tương ứng ("Tất cả", khoảng tự chọn): khi đó màn hình chỉ hiện số đơn.
 */
export function saleFilterReportPeriod(f: SaleFilter): ReportPeriod | null {
  return f.time === 'custom' ? null : reportPeriodOf(f.time);
}

/** Kỳ báo cáo của Core cho một kỳ của app; "Tất cả" không có kỳ tương ứng. */
export function reportPeriodOf(p: Period): ReportPeriod | null {
  switch (p) {
    case 'today':
    case 'yesterday':
    case 'week':
    case 'month':
      return p;
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

/**
 * Khoảng ngày lịch Việt Nam (`yyyy-mm-dd`, tính cả hai đầu) để cộng doanh thu từ chuỗi ngày của năm nay
 * (`/reports/sales-series?period=year`) khi bộ lọc không có kỳ báo cáo riêng: "Tất cả" là từ 01/01 tới hôm nay (Core không có
 * tổng toàn thời gian), khoảng tự chọn phải bắt đầu trong năm nay. `null` khi không cộng được: kỳ có sẵn (đã có báo cáo riêng)
 * hoặc khoảng lấn sang năm trước.
 */
export function saleFilterYearDays(f: SaleFilter, now = new Date()): { from: string; to: string } | null {
  const { y, m, d } = vnCalendar(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  const yearStart = `${y}-01-01`;
  const today = `${y}-${pad(m + 1)}-${pad(d)}`;
  if (f.time === 'all') return { from: yearStart, to: today };
  if (f.time !== 'custom' || !f.from || f.from < yearStart) return null;
  return { from: f.from, to: f.to && f.to < today ? f.to : today };
}
