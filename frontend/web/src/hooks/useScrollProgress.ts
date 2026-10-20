import { useEffect } from 'react'

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/**
 * Gắn biến CSS `--p` (0 → 1) cho mọi phần tử có `data-scroll`, để CSS tự dựng hiệu ứng theo vị trí cuộn.
 *
 * - `data-scroll="pin"`: mục cao hơn màn hình có con `position: sticky`; 0 khi mép trên chạm đỉnh màn hình,
 *   1 khi mép dưới chạm đáy. Có con `[data-track]` thì thêm `--shift` (px) là phần dải ngang còn tràn ra
 *   ngoài màn hình, và `data-active` là chỉ số phần tử của dải đang được nhấn mạnh theo tiến độ cuộn.
 * - `data-scroll="view"`: 0 khi mép trên vừa ló ở đáy màn hình, 1 khi mép trên chạm đỉnh.
 * - `data-scroll="exit"`: 0 khi mép trên ở đỉnh màn hình, 1 khi phần tử đã cuộn hết lên trên.
 *
 * Người dùng bật giảm chuyển động thì không gắn gì; CSS khi đó hiển thị bố cục tĩnh.
 */
export function useScrollProgress() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-scroll]'))
    const tracks = new Map<HTMLElement, HTMLElement>()
    for (const el of els) {
      const track = el.querySelector<HTMLElement>('[data-track]')
      if (track) tracks.set(el, track)
    }
    let frame = 0
    let resized = false

    const update = () => {
      frame = 0
      const vh = window.innerHeight
      const vw = document.documentElement.clientWidth
      // Đọc hết vị trí trước rồi mới ghi, để trình duyệt không phải tính lại layout sau từng lần ghi
      const rects = els.map((el) => el.getBoundingClientRect())
      const remeasure: [HTMLElement, HTMLElement][] = []
      if (resized) {
        resized = false
        tracks.forEach((_, el) => el.style.removeProperty('--shift'))
      }
      els.forEach((el, i) => {
        const r = rects[i]
        if (r.bottom < -vh || r.top > vh * 2) return
        const mode = el.dataset.scroll
        // Mục ghim đo theo chiều cao khung sticky (svh, cố định), không theo innerHeight vốn đổi khi thanh địa chỉ co giãn
        const pinH = el.firstElementChild?.clientHeight || vh
        const p =
          mode === 'pin' ? clamp01(-r.top / Math.max(1, r.height - pinH)) : mode === 'view' ? clamp01((vh - r.top) / vh) : clamp01(-r.top / r.height)
        el.style.setProperty('--p', p.toFixed(4))
        const track = tracks.get(el)
        if (track) {
          // Dải được đệm hai đầu nên màn thứ i dừng giữa khung nhìn khi tiến độ là i/(n-1)
          // Giữ máy đầu và máy cuối đứng yên một đoạn cuộn, để vuốt nhanh không trôi tuột qua mục
          const held = clamp01((p - 0.06) / 0.88)
          const active = Math.round(held * (track.children.length - 1))
          el.dataset.active = String(active)
          el.style.setProperty('--a', String(active))
          // Điện thoại: tiêu đề nhường chỗ cho dòng tính năng khi qua mốc này (CSS chỉ đổi độ mờ, không đổi bố cục)
          el.dataset.settled = p > 0.05 ? '1' : '0'
          if (!el.style.getPropertyValue('--shift')) {
            remeasure.push([el, track])
          }
        }
      })
      // Độ tràn của dải phụ thuộc khoảng cách giữa các máy (--focus), nên đo sau khi đã ghi và chỉ khi bố cục đổi
      for (const [el, track] of remeasure) {
        el.style.setProperty('--shift', `${Math.max(0, track.scrollWidth - vw)}px`)
      }
    }
    const request = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }

    document.documentElement.classList.add('has-scroll-fx')
    for (const [el, track] of tracks) el.style.setProperty('--n', String(track.children.length))
    update()
    window.addEventListener('scroll', request, { passive: true })
    const onResize = () => {
      resized = true
      request()
    }
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', request)
      window.removeEventListener('resize', onResize)
      document.documentElement.classList.remove('has-scroll-fx')
    }
  }, [])
}
