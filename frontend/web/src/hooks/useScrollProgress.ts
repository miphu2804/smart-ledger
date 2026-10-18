import { useEffect } from 'react'

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/**
 * Gắn biến CSS `--p` (0 → 1) cho mọi phần tử có `data-scroll`, để CSS tự dựng hiệu ứng theo vị trí cuộn.
 *
 * - `data-scroll="pin"`: mục cao hơn màn hình có con `position: sticky`; 0 khi mép trên chạm đỉnh màn hình,
 *   1 khi mép dưới chạm đáy. Có `data-steps="n"` thì thêm `data-step` (0…n-1) để đổi nội dung theo bước;
 *   `data-steps-start` (0…1) dành phần đầu quãng cuộn cho cảnh mở đầu trước bước 0.
 *   Có con `[data-track]` thì thêm `--shift` (px) là phần dải ngang còn tràn ra ngoài màn hình.
 * - `data-scroll="view"`: 0 khi mép trên vừa ló ở đáy màn hình, 1 khi mép trên chạm đỉnh.
 * - `data-scroll="exit"`: 0 khi mép trên ở đỉnh màn hình, 1 khi phần tử đã cuộn hết lên trên.
 *
 * Người dùng bật giảm chuyển động thì không gắn gì; CSS khi đó hiển thị bố cục tĩnh.
 */
export function useScrollProgress() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-scroll]'))
    let frame = 0

    const update = () => {
      frame = 0
      const vh = window.innerHeight
      for (const el of els) {
        const r = el.getBoundingClientRect()
        if (r.bottom < -vh || r.top > vh * 2) continue
        const mode = el.dataset.scroll
        const p =
          mode === 'pin' ? clamp01(-r.top / Math.max(1, r.height - vh)) : mode === 'view' ? clamp01((vh - r.top) / vh) : clamp01(-r.top / r.height)
        el.style.setProperty('--p', p.toFixed(4))
        const steps = Number(el.dataset.steps)
        if (steps) {
          // Bước đổi ở giữa mỗi lần chuyển màn (1/8 bước trước mốc), không đợi màn mới trượt xong
          const start = Number(el.dataset.stepsStart ?? 0)
          const q = clamp01((p - start) / (1 - start))
          el.dataset.step = String(Math.min(steps - 1, Math.floor(q * steps + 0.125)))
        }
        const track = el.querySelector<HTMLElement>('[data-track]')
        if (track) el.style.setProperty('--shift', `${Math.max(0, track.scrollWidth - document.documentElement.clientWidth)}px`)
      }
    }
    const request = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }

    document.documentElement.classList.add('has-scroll-fx')
    update()
    window.addEventListener('scroll', request, { passive: true })
    window.addEventListener('resize', request)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', request)
      window.removeEventListener('resize', request)
      document.documentElement.classList.remove('has-scroll-fx')
    }
  }, [])
}
