/** Logo Sổ Nghe Lời: Bobi ló ra từ cuốn sổ, cùng hình với frontend/mobile/assets/bubblelogo.png. */
export function LogoMark({ size = 40 }: { size?: number }) {
  return <img className="logo-mark-sm" src="/brand/logo.webp" alt="" width={size} height={Math.round(size * 0.959)} />
}

export default function Logo() {
  return (
    <>
      <LogoMark />
      <span>
        Sổ Nghe <b>Lời</b>
      </span>
    </>
  )
}
