import { ArrowRight, X } from '@phosphor-icons/react'
import { FLOWS, screenUrl, type Flow, type FlowNode } from './flows'

const REPO_BLOB = 'https://github.com/miphu2804/smart-ledger/blob/main/frontend/mobile/'
const KIND_LABEL = { screen: 'Màn', decision: 'Điểm rẽ', step: 'Bước hệ thống' } as const

/** Bảng chi tiết của nút đang chọn: ảnh lớn, tệp nguồn, mã yêu cầu, và các lối đi tiếp hoặc đến từ để nhảy sang nút khác. */
export default function NodeSheet({
  flow,
  node,
  onSelect,
  onOpenFlow,
  onClose,
}: {
  flow: Flow
  node: FlowNode
  onSelect: (id: string) => void
  onOpenFlow: (flow: string, node: string) => void
  onClose: () => void
}) {
  const title = (id: string) => flow.nodes.find((n) => n.id === id)?.title ?? id
  const outgoing = flow.edges.filter((e) => e.from === node.id)
  const incoming = flow.edges.filter((e) => e.to === node.id)
  const file = 'file' in node ? node.file : undefined
  const link = node.kind === 'step' ? node.link : undefined

  return (
    <aside className="uf-sheet" aria-labelledby="uf-sheet-title">
      <div className="uf-sheet-head">
        <h2 id="uf-sheet-title">{node.title}</h2>
        <span className="uf-chip">{KIND_LABEL[node.kind]}</span>
        <button type="button" className="uf-icon-btn" onClick={onClose} aria-label="Đóng bảng chi tiết">
          <X size={16} />
        </button>
      </div>

      {node.kind !== 'decision' && <p className="uf-sheet-caption">{node.caption}</p>}

      {link && (
        <button type="button" className="uf-primary" onClick={() => onOpenFlow(link.flow, link.node)}>
          Mở luồng {FLOWS.find((f) => f.id === link.flow)?.title}
          <ArrowRight size={16} />
        </button>
      )}

      {node.kind === 'screen' && <img className="uf-sheet-shot" src={screenUrl(node.image)} alt={`Ảnh màn ${node.title}`} width={360} height={780} />}

      {(file || node.refs) && (
        <dl className="uf-facts">
          {file && (
            <div>
              <dt>Tệp</dt>
              <dd>
                <a href={REPO_BLOB + encodeURI(file)} target="_blank" rel="noreferrer">
                  <code>{file}</code>
                </a>
              </dd>
            </div>
          )}
          {node.refs && (
            <div>
              <dt>Yêu cầu</dt>
              <dd>{node.refs.join(', ')}</dd>
            </div>
          )}
        </dl>
      )}

      {node.notes?.map((note) => (
        <p key={note} className="uf-note">
          {note}
        </p>
      ))}

      {outgoing.length > 0 && (
        <section className="uf-hops" aria-label="Đi tiếp">
          <h3>Đi tiếp</h3>
          {outgoing.map((e) => (
            <button key={e.to} type="button" className={e.fail ? 'is-fail' : undefined} onClick={() => onSelect(e.to)}>
              <span>{e.label ?? 'Tiếp'}</span>
              <span className="uf-hop-target">{title(e.to)}</span>
            </button>
          ))}
        </section>
      )}

      {incoming.length > 0 && (
        <section className="uf-hops" aria-label="Đến từ">
          <h3>Đến từ</h3>
          {incoming.map((e) => (
            <button key={e.from} type="button" className={e.fail ? 'is-fail' : undefined} onClick={() => onSelect(e.from)}>
              <span>{title(e.from)}</span>
              <span className="uf-hop-target">{e.label ?? 'Tiếp'}</span>
            </button>
          ))}
        </section>
      )}
    </aside>
  )
}
