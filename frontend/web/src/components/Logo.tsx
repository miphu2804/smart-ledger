/** Logo Sổ Nghe Lời: cuốn sổ + sóng âm, cùng hình với icon ứng dụng (frontend/mobile/assets/brand-logo.png). */
export function LogoMark({ size = 40 }: { size?: number }) {
  return <img className="logo-mark-sm" src="/brand/logo.webp" alt="" width={size} height={Math.round(size * 0.886)} />
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
