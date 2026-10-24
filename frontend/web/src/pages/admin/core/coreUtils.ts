/** Hàm dùng chung cho các trang quản trị đọc dữ liệu thật từ Core. */
import { useEffect, useState } from 'react'

/** Giá trị trễ một nhịp (gõ tìm kiếm không gọi Core theo từng phím) */
export function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

/** Tên hiển thị, Core có thể trả null khi chủ tiệm chưa đặt tên */
export function nameOf(displayName: string | null | undefined, fallback = 'Chưa đặt tên'): string {
  return displayName?.trim() || fallback
}
