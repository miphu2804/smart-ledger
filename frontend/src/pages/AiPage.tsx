import {
  ArrowRight,
  ClockCounterClockwise,
  Plus,
  Storefront,
  Ticket,
  WarningCircle,
} from '@phosphor-icons/react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { StatusChip } from '@/components/StatusChip'
import { Button } from '@/components/ui/button'
import { demoSupportMessage, demoUserMessage, promptTiles } from '@/mocks/ai'
import { currentAdmin } from '@/mocks/session'
import { cn } from '@/lib/utils'

const tileIcons: Record<(typeof promptTiles)[number]['id'], ReactNode> = {
  summarize: <Storefront size={16} weight="bold" />,
  draft: <Ticket size={16} weight="bold" />,
  access: <ClockCounterClockwise size={16} weight="bold" />,
  blocking: <WarningCircle size={16} weight="bold" />,
}

function Toast({ text, onGone }: { text: string; onGone: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onGone, 2200)
    return () => window.clearTimeout(t)
  }, [onGone])
  return (
    <div className="pointer-events-none fixed bottom-10 left-1/2 z-50 -translate-x-1/2 rounded-full bg-[#1A1916] px-3.5 py-2 text-[12px] font-medium text-white shadow-lg">
      {text}
    </div>
  )
}

export function AiPage() {
  const [params, setParams] = useSearchParams()
  const demo = params.get('demo') === 'chat'
  const [draft, setDraft] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [showDraft, setShowDraft] = useState(true)

  const msg = demoSupportMessage

  function send(text?: string) {
    const next = (text ?? draft).trim()
    if (!next) return
    setDraft('')
    setShowDraft(true)
    setParams({ demo: 'chat' })
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    send()
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col items-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[58%] bg-[radial-gradient(ellipse_80%_70%_at_50%_100%,rgba(255,220,70,0.5),rgba(255,236,150,0.16)_42%,transparent_72%)]"
      />

      {demo ? (
        <div className="relative flex min-h-0 w-full max-w-[640px] flex-1 flex-col gap-3 overflow-auto px-4 pt-2 pb-3">
          <p className="text-[12px] font-medium text-text-3">
            Answers are drafts. Confirm before anything is filed.
          </p>

          <div className="flex justify-end">
            <div className="max-w-[78%] rounded-2xl rounded-br-md bg-[#1A1916] px-3.5 py-2.5 text-[13px] leading-relaxed text-white">
              {demoUserMessage}
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-white px-4 py-3.5">
            <p className="text-[13.5px] leading-relaxed text-text">{msg.answer}</p>
            <p className="mt-2 text-[11.5px] text-text-3">{msg.scope}</p>

            {msg.insufficientData ? (
              <div className="mt-3 rounded-[14px] bg-[#EEEBE4] px-3 py-2.5 text-[12.5px] leading-snug text-text-2">
                Not enough shop data to answer this yet. No citations.
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {msg.citations.map((c) => (
                  <StatusChip key={c.id} tone="blue">
                    {c.label}
                  </StatusChip>
                ))}
              </div>
            )}
          </div>

          {showDraft && msg.taskDraft ? (
            <div className="rounded-2xl border border-line bg-white px-4 py-3.5">
              <p className="text-[11px] font-medium text-text-3">Task draft</p>
              <p className="mt-0.5 text-[14.5px] font-semibold tracking-tight text-text">
                {msg.taskDraft.title}
              </p>
              <p className="mt-0.5 text-[12.5px] text-text-2">
                {msg.taskDraft.shopName} · High · Due today
              </p>
              {msg.taskDraft.note ? (
                <p className="mt-2 text-[12.5px] leading-snug text-text-2">
                  {msg.taskDraft.note}
                </p>
              ) : null}
              <div className="mt-3 flex gap-2">
                <Button
                  variant="accent"
                  size="sm"
                  onClick={() => setToast('prototype — no write')}
                >
                  Confirm
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setShowDraft(false)}>
                  Discard
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="relative flex min-h-0 w-full flex-1 flex-col items-center justify-center px-4 pb-6">
          <h2 className="text-center text-[34px] font-semibold tracking-tight text-text">
            Morning, {currentAdmin.name}
          </h2>
          <div className="mt-7 grid w-full max-w-[600px] grid-cols-2 gap-2.5">
            {promptTiles.map((tile) => (
              <button
                key={tile.id}
                type="button"
                onClick={() => setDraft(tile.prompt)}
                className="flex items-center gap-3 rounded-[18px] border border-line bg-white px-3.5 py-3.5 text-left shadow-[0_1px_0_rgba(40,36,28,0.03)] hover:bg-frame"
              >
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[#F3E9A8] text-text">
                  {tileIcons[tile.id]}
                </span>
                <span className="text-[14.5px] font-semibold tracking-tight text-text">
                  {tile.title}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={onSubmit} className="relative mx-auto w-full max-w-[640px] px-4 pb-5">
        <div className="rounded-[22px] border border-line bg-white px-4 pt-3 pb-3 shadow-[0_8px_24px_-16px_rgba(40,36,28,0.35)]">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder="Ask SmartLedger"
            rows={2}
            className="w-full resize-none bg-transparent text-[14px] leading-relaxed text-text outline-none placeholder:text-text-3"
          />
          <div className="mt-1 flex items-center justify-between">
            <button
              type="button"
              aria-label="Attach"
              className="inline-flex size-8 items-center justify-center rounded-full text-text-2 hover:bg-black/5"
            >
              <Plus size={18} weight="bold" />
            </button>
            <button
              type="submit"
              aria-label="Send"
              className={cn(
                'inline-flex size-8 items-center justify-center rounded-full bg-[#3B6FCB] text-white',
                !draft.trim() && !demo && 'opacity-90',
              )}
            >
              <ArrowRight size={16} weight="bold" />
            </button>
          </div>
        </div>
      </form>

      {toast ? <Toast text={toast} onGone={() => setToast(null)} /> : null}
    </div>
  )
}
