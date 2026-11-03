import { Minus, Plus } from '@phosphor-icons/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { DECISION, SCREEN, STEP, screenUrl, type Edge, type Flow, type FlowNode, type Side } from './flows'

type Point = [number, number]
interface View {
  x: number
  y: number
  k: number
}

const MIN_ZOOM = 0.12
const MAX_ZOOM = 2
const FIT_PAD = 64
/** Bán kính bo góc ở chỗ đường nối gấp khúc. */
const ELBOW = 8

/**
 * Canvas kéo để di chuyển, cuộn hai ngón để di chuyển, Ctrl/⌘ + cuộn (hoặc chụm trên trackpad) để phóng to.
 * Bấm một nút để chọn: đường nối của nút đó sáng lên, các đường khác mờ đi.
 */
export default function FlowCanvas({
  flow,
  selectedId,
  focus,
  onSelect,
}: {
  flow: Flow
  selectedId: string | null
  /** Đổi `n` để canvas cuộn tới nút `id` (khi chọn từ bảng chi tiết). */
  focus: { id: string; n: number } | null
  onSelect: (id: string | null) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 0.6 })
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null)

  const byId = useMemo(() => new Map(flow.nodes.map((n) => [n.id, n])), [flow])
  const routes = useMemo(() => flow.edges.map((e) => ({ edge: e, points: route(e, byId) })), [flow, byId])
  const bounds = useMemo(() => worldBounds(flow.nodes, routes.map((r) => r.points)), [flow, routes])

  const fit = useCallback(() => {
    const el = wrapRef.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const k = clamp(Math.min((width - FIT_PAD * 2) / bounds.w, (height - FIT_PAD * 2) / bounds.h), MIN_ZOOM, 1)
    setView({ k, x: (width - bounds.w * k) / 2 - bounds.x * k, y: (height - bounds.h * k) / 2 - bounds.y * k })
  }, [bounds])

  // Vừa màn hình mỗi khi đổi luồng; trước khi vẽ để không thấy canvas nhảy.
  useLayoutEffect(fit, [fit])

  useEffect(() => {
    if (!focus) return
    const el = wrapRef.current
    const node = byId.get(focus.id)
    if (!el || !node) return
    const { width, height } = el.getBoundingClientRect()
    const size = nodeSize(node)
    setView((v) => ({ ...v, x: width / 2 - (node.x + size.w / 2) * v.k, y: height / 2 - (node.y + size.h / 2) * v.k }))
  }, [focus, byId])

  // React gắn wheel ở chế độ passive, nên preventDefault phải gắn tay.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect()
        setView((v) => zoomAt(v, Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top))
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  function zoomCenter(factor: number) {
    const r = wrapRef.current?.getBoundingClientRect()
    if (r) setView((v) => zoomAt(v, factor, r.width / 2, r.height / 2))
  }

  function onPointerDown(e: ReactPointerEvent) {
    if (e.button !== 0) return
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false }
  }

  function onPointerMove(e: ReactPointerEvent) {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) < 4) return
    if (!d.moved) wrapRef.current?.setPointerCapture(e.pointerId)
    d.moved = true
    setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }))
  }

  function onPointerUp() {
    // Giữ cờ `moved` tới sau sự kiện click để cú kéo không bị tính là chọn nút.
    setTimeout(() => (drag.current = null))
  }

  function select(id: string | null) {
    if (drag.current?.moved) return
    onSelect(id)
  }

  function onKeyDown(e: KeyboardEvent) {
    const step = 60
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }
    if (moves[e.key] && e.target === e.currentTarget) {
      e.preventDefault()
      const [dx, dy] = moves[e.key]
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }))
    } else if (e.key === '+' || e.key === '=') zoomCenter(1.2)
    else if (e.key === '-') zoomCenter(1 / 1.2)
    else if (e.key === '0') fit()
  }

  const linked = (e: Edge) => selectedId !== null && (e.from === selectedId || e.to === selectedId)

  return (
    <div
      ref={wrapRef}
      className="uf-canvas"
      tabIndex={0}
      aria-label={`Sơ đồ luồng ${flow.title}. Kéo hoặc dùng phím mũi tên để di chuyển, phím cộng trừ để phóng to thu nhỏ.`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={(e) => e.target === e.currentTarget && select(null)}
      onKeyDown={onKeyDown}
    >
      <div className="uf-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }} onClick={(e) => e.target === e.currentTarget && select(null)}>
        <svg className="uf-edges" style={{ left: bounds.x, top: bounds.y }} width={bounds.w} height={bounds.h} viewBox={`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`} aria-hidden="true">
          <defs>
            {(['base', 'fail', 'on'] as const).map((tone) => (
              <marker key={tone} id={`uf-arrow-${tone}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                <path d="M1 1 7 4 1 7" className={`uf-arrow uf-arrow--${tone}`} />
              </marker>
            ))}
          </defs>
          {routes.map(({ edge, points }) => {
            const tone = linked(edge) ? 'on' : edge.fail ? 'fail' : 'base'
            return (
              <path
                key={`${edge.from}-${edge.to}`}
                d={pathOf(points)}
                className={`uf-edge uf-edge--${tone}${selectedId && !linked(edge) ? ' is-dim' : ''}`}
                markerEnd={`url(#uf-arrow-${tone})`}
              />
            )
          })}
        </svg>

        {routes.map(({ edge, points }) => {
          if (!edge.label) return null
          const [x, y] = labelPoint(points, edge.labelSeg)
          const tone = linked(edge) ? ' is-on' : edge.fail ? ' is-fail' : ''
          return (
            <span key={`${edge.from}-${edge.to}`} className={`uf-label${tone}${selectedId && !linked(edge) ? ' is-dim' : ''}`} style={{ left: x, top: y }}>
              {edge.label}
            </span>
          )
        })}

        {flow.nodes.map((node) => (
          <NodeView key={node.id} node={node} selected={node.id === selectedId} dim={selectedId !== null && !isNeighbour(flow, selectedId, node.id)} onSelect={() => select(node.id)} />
        ))}
      </div>

      <div className="uf-legend" aria-hidden="true">
        <span><i className="uf-key uf-key--edge" />Đi tiếp</span>
        <span><i className="uf-key uf-key--fail" />Nhánh lỗi</span>
        <span><i className="uf-key uf-key--decision" />Điểm rẽ</span>
        <span><i className="uf-key uf-key--step" />Bước hệ thống</span>
      </div>

      <div className="uf-zoom" role="group" aria-label="Thu phóng">
        <button type="button" onClick={() => zoomCenter(1 / 1.2)} aria-label="Thu nhỏ">
          <Minus size={16} />
        </button>
        <output className="num" aria-live="polite">{Math.round(view.k * 100)}%</output>
        <button type="button" onClick={() => zoomCenter(1.2)} aria-label="Phóng to">
          <Plus size={16} />
        </button>
        <button type="button" className="uf-zoom-fit" onClick={fit}>
          Vừa màn hình
        </button>
      </div>
    </div>
  )
}

function NodeView({ node, selected, dim, onSelect }: { node: FlowNode; selected: boolean; dim: boolean; onSelect: () => void }) {
  const cls = `uf-node uf-node--${node.kind}${selected ? ' is-selected' : ''}${dim ? ' is-dim' : ''}`
  const style = { left: node.x, top: node.y }
  if (node.kind === 'screen') {
    return (
      <button type="button" className={cls} style={style} onClick={onSelect} aria-label={`Màn ${node.title}: ${node.caption}`}>
        <span className="uf-node-title">{node.title}</span>
        <span className="uf-node-caption">{node.caption}</span>
        <img src={screenUrl(node.image)} alt="" width={SCREEN.w} height={SCREEN.img} loading="lazy" draggable={false} />
      </button>
    )
  }
  if (node.kind === 'decision') {
    return (
      <button type="button" className={cls} style={style} onClick={onSelect} aria-label={`Điểm rẽ: ${node.title}`}>
        <svg viewBox={`0 0 ${DECISION.w} ${DECISION.h}`} aria-hidden="true">
          <polygon points={`22,1 ${DECISION.w - 22},1 ${DECISION.w - 1},${DECISION.h / 2} ${DECISION.w - 22},${DECISION.h - 1} 22,${DECISION.h - 1} 1,${DECISION.h / 2}`} />
        </svg>
        <span>{node.title}</span>
      </button>
    )
  }
  return (
    <button type="button" className={`${cls}${node.link ? ' is-link' : ''}`} style={style} onClick={onSelect} aria-label={`Bước ${node.title}: ${node.caption}`}>
      <span className="uf-node-title">{node.title}</span>
      <span className="uf-node-caption">{node.caption}</span>
    </button>
  )
}

/** Phóng to quanh điểm (cx, cy) của khung, để điểm đó đứng yên dưới con trỏ. */
function zoomAt(v: View, factor: number, cx: number, cy: number): View {
  const k = clamp(v.k * factor, MIN_ZOOM, MAX_ZOOM)
  return { k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k }
}

function isNeighbour(flow: Flow, selectedId: string, id: string): boolean {
  return id === selectedId || flow.edges.some((e) => (e.from === selectedId && e.to === id) || (e.to === selectedId && e.from === id))
}

function nodeSize(node: FlowNode): { w: number; h: number } {
  if (node.kind === 'screen') return { w: SCREEN.w, h: SCREEN.h }
  return node.kind === 'decision' ? DECISION : STEP
}

/** Cổng của nút trên một cạnh; cổng trái/phải của màn nằm giữa ảnh, không phải giữa cả nút. */
function port(node: FlowNode, side: Side, shift = 0): Point {
  const { w, h } = nodeSize(node)
  const midY = node.kind === 'screen' ? node.y + SCREEN.head + SCREEN.img / 2 : node.y + h / 2
  switch (side) {
    case 'l':
      return [node.x, midY + shift]
    case 'r':
      return [node.x + w, midY + shift]
    case 't':
      return [node.x + w / 2 + shift, node.y]
    case 'b':
      return [node.x + w / 2 + shift, node.y + h]
  }
}

/** Đường gấp vuông góc: ra một cạnh, qua các điểm `via` (nếu có), vào một cạnh. */
function route(edge: Edge, byId: Map<string, FlowNode>): Point[] {
  const from = byId.get(edge.from)
  const to = byId.get(edge.to)
  if (!from || !to) throw new Error(`userflow: cạnh ${edge.from} → ${edge.to} trỏ tới nút không có`)
  const [out, inn] = (edge.sides ?? 'rl').split('') as [Side, Side]
  const s = port(from, out)
  const t = port(to, inn, edge.toShift)
  if (edge.via) return [s, ...edge.via, t]
  const horizontalOut = out === 'l' || out === 'r'
  const horizontalIn = inn === 'l' || inn === 'r'
  if (horizontalOut && horizontalIn) {
    if (s[1] === t[1]) return [s, t]
    const mx = edge.mid ?? (s[0] + t[0]) / 2
    return [s, [mx, s[1]], [mx, t[1]], t]
  }
  if (!horizontalOut && !horizontalIn) {
    if (s[0] === t[0]) return [s, t]
    const my = edge.mid ?? (s[1] + t[1]) / 2
    return [s, [s[0], my], [t[0], my], t]
  }
  return horizontalOut ? [s, [t[0], s[1]], t] : [s, [s[0], t[1]], t]
}

function pathOf(points: Point[]): string {
  let d = `M${points[0][0]} ${points[0][1]}`
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i - 1]
    const [cx, cy] = points[i]
    const [nx, ny] = points[i + 1]
    const r = Math.min(ELBOW, Math.hypot(cx - px, cy - py) / 2, Math.hypot(nx - cx, ny - cy) / 2)
    const a = toward([cx, cy], [px, py], r)
    const b = toward([cx, cy], [nx, ny], r)
    d += ` L${a[0]} ${a[1]} Q${cx} ${cy} ${b[0]} ${b[1]}`
  }
  const [lx, ly] = points[points.length - 1]
  return `${d} L${lx} ${ly}`
}

function toward([x, y]: Point, [tx, ty]: Point, r: number): Point {
  const len = Math.hypot(tx - x, ty - y) || 1
  return [x + ((tx - x) / len) * r, y + ((ty - y) / len) * r]
}

function labelPoint(points: Point[], seg?: number): Point {
  let i = seg ?? 0
  if (seg === undefined) {
    let best = -1
    for (let j = 0; j < points.length - 1; j++) {
      const len = Math.hypot(points[j + 1][0] - points[j][0], points[j + 1][1] - points[j][1])
      if (len > best) [best, i] = [len, j]
    }
  }
  const [a, b] = [points[i], points[i + 1]]
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
}

function worldBounds(nodes: FlowNode[], paths: Point[][]) {
  const xs: number[] = []
  const ys: number[] = []
  for (const n of nodes) {
    const { w, h } = nodeSize(n)
    xs.push(n.x, n.x + w)
    ys.push(n.y, n.y + h)
  }
  for (const [x, y] of paths.flat()) {
    xs.push(x)
    ys.push(y)
  }
  // Chừa chỗ cho nhãn nằm trên đường biên.
  const x = Math.min(...xs) - 40
  const y = Math.min(...ys) - 40
  return { x, y, w: Math.max(...xs) + 40 - x, h: Math.max(...ys) + 40 - y }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}
