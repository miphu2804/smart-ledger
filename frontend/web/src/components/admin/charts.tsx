import { useEffect, useRef, useState, type PointerEvent } from 'react'

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(600)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

function niceMax(v: number) {
  if (v <= 4) return 4
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  return Math.ceil(v / p) * p
}

export interface Series {
  key: string
  label: string
  color: string
  values: number[]
}

const shortDate = (k: string) => {
  const [, m, d] = k.split('-')
  return `${Number(d)}/${Number(m)}`
}

/** Biểu đồ đường nhiều series, 1 trục, crosshair + tooltip, nhãn trực tiếp ở cuối, có bảng thay thế. */
export function LineChart({ labels, series, height = 220, unit = '' }: { labels: string[]; series: Series[]; height?: number; unit?: string }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const [table, setTable] = useState(false)
  const pad = { l: 32, r: 96, t: 12, b: 26 }
  const iw = width - pad.l - pad.r
  const ih = height - pad.t - pad.b
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)))
  const x = (i: number) => pad.l + (labels.length > 1 ? (i / (labels.length - 1)) * iw : iw / 2)
  const y = (v: number) => pad.t + ih - (v / max) * ih
  const ticks = [0, max / 2, max]
  const every = Math.ceil(labels.length / Math.max(2, Math.floor(iw / 56)))

  function onMove(e: PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    const i = Math.round((px / rect.width) * (labels.length - 1))
    setHover(Math.max(0, Math.min(labels.length - 1, i)))
  }

  // Nhãn cuối: tránh chồng nhau
  const ends = series.map((s) => ({ s, y: y(s.values[s.values.length - 1] ?? 0) })).sort((a, b) => a.y - b.y)
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14

  return (
    <div className="chart-wrap" ref={ref}>
      <div className="row-between" style={{ marginBottom: 8 }}>
        <div className="chart-legend" aria-hidden="true">
          {series.map((s) => (
            <span key={s.key}>
              <i className="line-key" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
        <button type="button" className="table-toggle" onClick={() => setTable((v) => !v)} aria-expanded={table}>
          {table ? 'Xem biểu đồ' : 'Xem dạng bảng'}
        </button>
      </div>
      {table ? (
        <div className="mini-table-wrap">
          <table className="mini-table">
            <thead>
              <tr>
                <th>Ngày</th>
                {series.map((s) => (
                  <th key={s.key}>{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {labels.map((l, i) => (
                <tr key={l}>
                  <td>{shortDate(l)}</td>
                  {series.map((s) => (
                    <td key={s.key}>{s.values[i]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart">
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={series.map((s) => `${s.label}: tổng ${s.values.reduce((a, b) => a + b, 0)}${unit}`).join('; ')}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line className="grid-line" x1={pad.l} x2={pad.l + iw} y1={y(t)} y2={y(t)} />
                <text className="axis" x={pad.l - 8} y={y(t) + 4} textAnchor="end">
                  {Math.round(t)}
                </text>
              </g>
            ))}
            {labels.map((l, i) =>
              i % every === 0 || i === labels.length - 1 ? (
                <text key={l} className="axis" x={x(i)} y={height - 6} textAnchor="middle">
                  {shortDate(l)}
                </text>
              ) : null,
            )}
            {series.map((s) => (
              <polyline
                key={s.key}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
              />
            ))}
            {ends.map(({ s, y: ly }) => (
              <text key={s.key} className="end-label" x={pad.l + iw + 8} y={ly + 4}>
                {s.label.split(' ').slice(0, 2).join(' ')} · {s.values[s.values.length - 1]}
              </text>
            ))}
            {hover !== null && (
              <g>
                <line className="xhair" x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} />
                {series.map((s) => (
                  <circle key={s.key} cx={x(hover)} cy={y(s.values[hover])} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
                ))}
              </g>
            )}
            <rect
              x={pad.l}
              y={pad.t}
              width={iw}
              height={ih}
              fill="transparent"
              onPointerMove={onMove}
              onPointerLeave={() => setHover(null)}
              tabIndex={0}
              aria-label="Di chuyển để xem số liệu từng ngày"
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') setHover((h) => Math.min(labels.length - 1, (h ?? -1) + 1))
                if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? labels.length) - 1))
              }}
              onBlur={() => setHover(null)}
            />
          </svg>
          {hover !== null && (
            <div className="chart-tip" style={{ left: x(hover), top: Math.min(...series.map((s) => y(s.values[hover]))) }}>
              <div className="muted" style={{ color: 'inherit', opacity: 0.75 }}>
                Ngày {shortDate(labels[hover])}
              </div>
              {series.map((s) => (
                <div key={s.key} className="tip-row">
                  <i style={{ background: s.color }} />
                  <b>{s.values[hover]}</b> <span style={{ opacity: 0.8 }}>{s.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Cột nhỏ theo ngày, mỗi cột có tooltip riêng. */
export function MiniBars({ labels, values, label, height = 72 }: { labels: string[]; values: number[]; label: string; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...values)
  const gap = 2
  const bw = Math.max(4, (width - gap * (values.length - 1)) / values.length)
  return (
    <div className="chart-wrap chart" ref={ref}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${label}: tổng ${values.reduce((a, b) => a + b, 0)}`}
      >
        {values.map((v, i) => {
          const h = v ? Math.max(4, (v / max) * (height - 4)) : 2
          return (
            <rect
              key={labels[i]}
              className="bar-mark"
              x={i * (bw + gap)}
              y={height - h}
              width={bw}
              height={h}
              rx={Math.min(4, bw / 2)}
              tabIndex={0}
              aria-label={`${shortDate(labels[i])}: ${v}`}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              opacity={v ? 1 : 0.35}
            />
          )
        })}
      </svg>
      {hover !== null && (
        <div className="chart-tip" style={{ left: hover * (bw + gap) + bw / 2, top: 0 }}>
          <b>{values[hover]}</b> {label} · {shortDate(labels[hover])}
        </div>
      )}
    </div>
  )
}
