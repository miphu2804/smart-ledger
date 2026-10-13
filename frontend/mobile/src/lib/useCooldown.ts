import { useCallback, useEffect, useState } from 'react';

/** Đếm ngược theo giây để chặn bấm "Gửi lại" liên tục (Firebase giới hạn số email gửi mỗi giờ). */
export function useCooldown(seconds: number) {
  const [left, setLeft] = useState(0);

  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((x) => x - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  const start = useCallback(() => setLeft(seconds), [seconds]);
  return { left, start };
}
