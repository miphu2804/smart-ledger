import { Mic } from 'lucide-react'

interface Props {
  size?: 'sm' | 'md'
  tagline?: boolean
  inverted?: boolean
}

export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <span className="logo-mark" style={{ width: size, height: size, borderRadius: size * 0.3 }} aria-hidden="true">
      <Mic size={size * 0.52} strokeWidth={2.4} />
      <span className="logo-mark-dot" />
    </span>
  )
}

export default function Logo({ size = 'md', tagline = false, inverted = false }: Props) {
  return (
    <span className={`logo logo-${size}${inverted ? ' logo-inverted' : ''}`}>
      <LogoMark size={size === 'sm' ? 30 : 38} />
      <span className="logo-text">
        <span className="logo-name">
          Sổ Nghe <b>Lời</b>
        </span>
        {tagline && <span className="logo-tagline">Bán hàng chỉ cần nói</span>}
      </span>
    </span>
  )
}
