/**
 * Giả lập tình huống cho chế độ mock — để kiểm tra trạng thái đang tải / rỗng / lỗi
 * mà không cần backend.
 *
 * Cách bật:
 *  - Thêm `?mock=slow|empty|error` vào URL bất kỳ trang admin (được nhớ trong phiên), hoặc
 *  - Chọn trong ô "Giả lập API" ở cuối sidebar.
 *  `?mock=normal` để tắt.
 */
import { MOCK_DELAY_MS } from '../config'
import { readJSON, writeJSON } from '../utils/storage'

export type MockScenario = 'normal' | 'slow' | 'empty' | 'error'

export const SCENARIO_LABEL: Record<MockScenario, string> = {
  normal: 'Bình thường',
  slow: 'Chậm (3 giây)',
  empty: 'Không có dữ liệu',
  error: 'Lỗi máy chủ',
}

const KEY = 'snl_mock_scenario'
const listeners = new Set<() => void>()

function fromUrl(): MockScenario | null {
  try {
    const v = new URLSearchParams(window.location.search).get('mock')
    return v && v in SCENARIO_LABEL ? (v as MockScenario) : null
  } catch {
    return null
  }
}

export function getScenario(): MockScenario {
  const url = fromUrl()
  if (url) {
    writeJSON(KEY, url, 'session')
    return url
  }
  return readJSON<MockScenario>(KEY, 'session') ?? 'normal'
}

export function setScenario(s: MockScenario) {
  writeJSON(KEY, s, 'session')
  listeners.forEach((l) => l())
}

export function subscribeScenario(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export class MockServerError extends Error {
  status = 500
  constructor() {
    super('Máy chủ không phản hồi (giả lập lỗi 500). Vui lòng thử lại sau.')
  }
}

/**
 * Chờ như một lời gọi mạng rồi áp tình huống đang bật.
 * Trả về `true` nếu nơi gọi nên trả dữ liệu rỗng.
 */
export async function simulate(ms = MOCK_DELAY_MS): Promise<{ empty: boolean }> {
  const s = getScenario()
  await new Promise((r) => setTimeout(r, s === 'slow' ? 3000 : ms))
  if (s === 'error') throw new MockServerError()
  return { empty: s === 'empty' }
}
