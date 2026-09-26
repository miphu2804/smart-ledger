import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react'
import { subscribeScenario } from '../mocks/scenario'

export interface AsyncState<T> {
  data: T | null
  error: Error | null
  loading: boolean
  /** Gọi lại request (nút "Thử lại") */
  reload: () => void
}

/**
 * Chạy một hàm async và theo dõi 3 trạng thái đang tải / lỗi / có dữ liệu.
 * Dùng chung cho mọi trang quản trị. Tự tải lại khi đổi tình huống giả lập API.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList): AsyncState<T> {
  const [state, setState] = useState<{ data: T | null; error: Error | null; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  })
  const [tick, setTick] = useState(0)
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => subscribeScenario(() => setTick((t) => t + 1)), [])

  useEffect(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true, error: null }))
    fnRef
      .current()
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((e: unknown) =>
        alive && setState({ data: null, error: e instanceof Error ? e : new Error('Đã có lỗi xảy ra'), loading: false }),
      )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { ...state, reload }
}
