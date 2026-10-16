import { useEffect, useRef, useState } from 'react';

// Phần chữ còn thiếu giảm một nửa sau mỗi chừng này ms, nên tốc độ hiện không phụ thuộc số khung hình/giây:
// máy chậm khung vẫn đuổi kịp, và khi stream dừng phần dồn lại hết trong chưa tới nửa giây.
const HALF_LIFE_MS = 80;
// Khung hình bị treo lâu (chuyển tab, JS bận) không được nuốt luôn cả phần còn thiếu trong một bước.
const MAX_FRAME_MS = 100;

/** Số ký tự hiện sau `elapsedMs` kể từ lần trước: tiến thêm một phần của phần còn thiếu, tối thiểu 1. */
export function nextRevealLength(shown: number, target: number, elapsedMs: number): number {
  if (shown >= target) return target;
  const share = 1 - 0.5 ** (Math.min(elapsedMs, MAX_FRAME_MS) / HALF_LIFE_MS);
  return Math.min(target, shown + Math.max(1, Math.ceil((target - shown) * share)));
}

/** Chữ đang stream, hiện dần theo từng khung hình thay vì nhảy cả cụm token một lúc. */
export function useSmoothText(target: string): string {
  const [shown, setShown] = useState(0);
  const targetRef = useRef(target);
  targetRef.current = target;

  useEffect(() => {
    // `reset` hoặc câu mới ngắn hơn phần đã hiện: bắt đầu lại từ đầu.
    setShown((current) => Math.min(current, target.length));
  }, [target]);

  useEffect(() => {
    let last = Date.now();
    let frame = requestAnimationFrame(function tick() {
      const now = Date.now();
      const elapsed = now - last;
      last = now;
      setShown((current) => nextRevealLength(current, targetRef.current.length, elapsed));
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return target.slice(0, shown);
}
