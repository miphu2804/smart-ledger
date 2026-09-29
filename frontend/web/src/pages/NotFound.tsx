import { Compass } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function NotFound({ inAdmin = false }: { inAdmin?: boolean }) {
  return (
    <div className={inAdmin ? 'notfound notfound-admin' : 'notfound'}>
      <span className="notfound-code">404</span>
      <span className="notfound-icon">
        <Compass size={28} />
      </span>
      <h1>Không tìm thấy trang</h1>
      <p>Đường dẫn này không tồn tại hoặc đã được chuyển đi nơi khác.</p>
      <Link className="btn btn-primary" to={inAdmin ? '/admin' : '/'}>
        {inAdmin ? 'Về Tổng quan' : 'Về trang chủ'}
      </Link>
    </div>
  )
}
