import { CaretDown } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import '@fontsource-variable/geist'
import FlowCanvas from './FlowCanvas'
import { FLOWS, type Flow } from './flows'
import NodeSheet from './NodeSheet'
import './userflow.css'

/**
 * Sơ đồ luồng người dùng của app mobile, cho cả nhóm xem màn nào dẫn tới màn nào.
 * Luồng và nút đang chọn nằm trên URL (`?flow=sales&node=checkout`) để gửi đường dẫn cho nhau.
 * Trang dành cho màn hình máy tính, không có bản cho điện thoại.
 */
export default function UserflowPage() {
  const [params, setParams] = useState(() => new URLSearchParams(window.location.search))
  const flow = FLOWS.find((f) => f.id === params.get('flow')) ?? FLOWS[0]
  const selected = flow.nodes.find((n) => n.id === params.get('node')) ?? null
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null)

  useEffect(() => {
    document.title = `${flow.title} | Userflow Sổ Nghe Lời`
  }, [flow])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && open(flow.id, null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function open(flowId: string, nodeId: string | null) {
    const next = new URLSearchParams({ flow: flowId })
    if (nodeId) next.set('node', nodeId)
    window.history.replaceState(null, '', `?${next}`)
    setParams(next)
  }

  function jump(flowId: string, nodeId: string) {
    open(flowId, nodeId)
    setFocus((f) => ({ id: nodeId, n: (f?.n ?? 0) + 1 }))
  }

  const counts = {
    screens: flow.nodes.filter((n) => n.kind === 'screen').length,
    decisions: flow.nodes.filter((n) => n.kind === 'decision').length,
    fails: flow.edges.filter((e) => e.fail).length,
  }

  return (
    <div className="uf">
      <header className="uf-bar">
        <FlowMenu flow={flow} onPick={(id) => open(id, null)} />
        <p className="uf-meta num">
          {counts.screens} màn, {counts.decisions} điểm rẽ{counts.fails > 0 ? `, ${counts.fails} nhánh lỗi` : ''}
        </p>
        <p className="uf-stamp">Ảnh chụp từ staging, tiệm thử</p>
      </header>

      <p className="uf-summary">{flow.summary}</p>

      <main className={`uf-main${selected ? ' has-sheet' : ''}`}>
        <FlowCanvas flow={flow} selectedId={selected?.id ?? null} focus={focus} onSelect={(id) => open(flow.id, id)} />
        {selected && (
          <NodeSheet
            key={`${flow.id}-${selected.id}`}
            flow={flow}
            node={selected}
            onSelect={(id) => jump(flow.id, id)}
            onOpenFlow={jump}
            onClose={() => open(flow.id, null)}
          />
        )}
      </main>
    </div>
  )
}

function FlowMenu({ flow, onPick }: { flow: Flow; onPick: (id: string) => void }) {
  const [openMenu, setOpenMenu] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openMenu) return
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpenMenu(false)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [openMenu])

  return (
    <div className="uf-menu" ref={ref}>
      <h1>
        <button type="button" aria-haspopup="true" aria-expanded={openMenu} onClick={() => setOpenMenu((o) => !o)}>
          {flow.title}
          <CaretDown size={14} />
        </button>
      </h1>
      {openMenu && (
        <ul className="uf-menu-list">
          {FLOWS.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                aria-current={f.id === flow.id ? 'true' : undefined}
                onClick={() => {
                  setOpenMenu(false)
                  onPick(f.id)
                }}
              >
                <span>{f.title}</span>
                <span className="uf-menu-count num">{f.nodes.filter((n) => n.kind === 'screen').length} màn</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
