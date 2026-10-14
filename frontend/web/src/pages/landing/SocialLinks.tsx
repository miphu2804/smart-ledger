import { FacebookMonoIcon, InstagramIcon, TiktokIcon } from '../../components/BrandIcons'
import { FACEBOOK_URL, INSTAGRAM_URL, TIKTOK_URL } from '../../config'

const LINKS = [
  { href: FACEBOOK_URL, label: 'Facebook của Sổ Nghe Lời', Icon: FacebookMonoIcon },
  { href: TIKTOK_URL, label: 'TikTok của Sổ Nghe Lời', Icon: TiktokIcon },
  { href: INSTAGRAM_URL, label: 'Instagram của Sổ Nghe Lời', Icon: InstagramIcon },
].filter((l) => l.href)

/** Icon kênh Facebook/TikTok/Instagram; không có kênh nào trong `site.yaml` thì không hiện gì. */
export default function SocialLinks() {
  if (LINKS.length === 0) return null
  return (
    <div className="lp-social">
      {LINKS.map(({ href, label, Icon }) => (
        <a key={href} href={href} className="icon-btn" target="_blank" rel="noopener noreferrer" aria-label={label} title={label}>
          <Icon size={19} />
        </a>
      ))}
    </div>
  )
}
