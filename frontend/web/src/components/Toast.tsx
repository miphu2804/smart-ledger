import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

type Tone = 'success' | 'error' | 'info'
interface ToastItem {
  id: number
  tone: Tone
  title: string
  message?: string
}

interface ToastApi {
  show: (tone: Tone, title: string, message?: string) => void
  success: (title: string, message?: string) => void
  error: (title: string, message?: string) => void
  info: (title: string, message?: string) => void
}

const Ctx = createContext<ToastApi | null>(null)
let seq = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), [])

  const show = useCallback(
    (tone: Tone, title: string, message?: string) => {
      const id = ++seq
      setItems((l) => [...l.slice(-3), { id, tone, title, message }])
      setTimeout(() => dismiss(id), tone === 'error' ? 6000 : 3800)
    },
    [dismiss],
  )

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (t, m) => show('success', t, m),
      error: (t, m) => show('error', t, m),
      info: (t, m) => show('info', t, m),
    }),
    [show],
  )

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            <span className="toast-icon">
              {t.tone === 'success' ? <CheckCircle2 size={18} /> : t.tone === 'error' ? <TriangleAlert size={18} /> : <Info size={18} />}
            </span>
            <div className="toast-text">
              <strong>{t.title}</strong>
              {t.message && <span>{t.message}</span>}
            </div>
            <button type="button" className="toast-x" onClick={() => dismiss(t.id)} aria-label="Đóng thông báo">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastApi {
  const v = useContext(Ctx)
  if (!v) throw new Error('useToast phải dùng bên trong ToastProvider')
  return v
}
