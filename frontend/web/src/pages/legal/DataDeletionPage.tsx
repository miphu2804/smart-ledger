import { Info } from 'lucide-react'
import { Link } from 'react-router-dom'
import LegalLayout, { ContactEmail, type TocItem } from './LegalLayout'
import { DELETION_DAYS } from './legalConfig'

const TOC: TocItem[] = [
  { id: 'cac-buoc', label: 'Cách xoá tài khoản và dữ liệu' },
  { id: 'bi-xoa', label: 'Dữ liệu nào sẽ bị xoá' },
  { id: 'con-lai', label: 'Dữ liệu có thể còn lại' },
  { id: 'luu-y', label: 'Lưu ý' },
]

export default function DataDeletionPage() {
  return (
    <LegalLayout
      title="Xoá dữ liệu người dùng"
      toc={TOC}
      lead="Bạn có thể yêu cầu xoá tài khoản Sổ Nghe Lời và dữ liệu cửa hàng đã nhập, kể cả khi bạn đăng nhập bằng Facebook. Hiện ứng dụng chưa có nút “Xoá tài khoản”, nên việc xoá do nhóm thực hiện sau khi bạn gửi yêu cầu theo các bước dưới đây."
    >
      <section className="lp-legal-sec" id="cac-buoc">
        <h2>Cách xoá tài khoản và dữ liệu</h2>
        <ol className="lp-legal-steps">
          <li>
            <h3>Gỡ Sổ Nghe Lời khỏi Facebook (nếu bạn đăng nhập bằng Facebook)</h3>
            <p>
              Mở Facebook, vào <strong>Cài đặt và quyền riêng tư → Cài đặt</strong>, tìm mục <strong>Ứng dụng và trang web</strong> (tên mục có thể
              khác đôi chút tuỳ phiên bản), chọn <strong>Sổ Nghe Lời</strong> rồi bấm <strong>Gỡ</strong>. Bước này thu hồi quyền của ứng dụng với
              tài khoản Facebook của bạn, nhưng chưa xoá dữ liệu chúng tôi đang lưu.
            </p>
          </li>
          <li>
            <h3>Gửi yêu cầu xoá dữ liệu</h3>
            <p>
              Gửi email tới <ContactEmail /> với nội dung sau:
            </p>
            <dl className="lp-legal-mail">
              <dt>Tiêu đề</dt>
              <dd>Yêu cầu xoá dữ liệu Sổ Nghe Lời</dd>
              <dt>Nội dung</dt>
              <dd>
                Cách bạn đăng nhập (Facebook, email…), tên hiển thị hoặc email và số điện thoại đã dùng, tên cửa hàng, và câu “Tôi yêu cầu xoá tài
                khoản và toàn bộ dữ liệu của tôi”.
              </dd>
            </dl>
          </li>
          <li>
            <h3>Xác minh và xử lý</h3>
            <p>
              Chúng tôi chỉ xử lý yêu cầu sau khi xác minh bạn là chủ tài khoản (ví dụ: yêu cầu bạn trả lời từ email đã đăng ký hoặc xác nhận thông tin
              cửa hàng). Việc xoá hoàn tất trong vòng <strong>{DELETION_DAYS} ngày</strong> kể từ khi xác minh xong; chúng tôi gửi email xác nhận khi
              xong.
            </p>
          </li>
        </ol>
      </section>

      <section className="lp-legal-sec" id="bi-xoa">
        <h2>Dữ liệu nào sẽ bị xoá</h2>
        <ul>
          <li>Tài khoản đăng nhập (Firebase) và các liên kết đăng nhập như Facebook.</li>
          <li>Hồ sơ cá nhân: tên hiển thị, email, số điện thoại, ảnh đại diện.</li>
          <li>Cửa hàng và dữ liệu bạn đã nhập: hàng hoá, đơn bán, thanh toán, chi phí, khách hàng và sổ nợ.</li>
          <li>Lịch sử trò chuyện với trợ lý AI.</li>
        </ul>
      </section>

      <section className="lp-legal-sec" id="con-lai">
        <h2>Dữ liệu có thể còn lại</h2>
        <ul>
          <li>
            Nhật ký thao tác được thiết kế chỉ-thêm để bảo mật và đối soát. Khi xử lý yêu cầu, chúng tôi xoá tên và thông tin liên hệ khỏi hồ sơ người
            dùng mà các dòng nhật ký tham chiếu tới; bản thân dòng nhật ký (không còn nhận ra bạn) có thể được giữ lại.
          </li>
          <li>Bản sao lưu của nhà cung cấp hạ tầng tự hết hạn theo chu kỳ của họ.</li>
          <li>
            Nếu pháp luật yêu cầu giữ một loại dữ liệu nào đó, chúng tôi sẽ nói rõ loại dữ liệu và lý do trong email trả lời.
          </li>
        </ul>
      </section>

      <section className="lp-legal-sec" id="luu-y">
        <h2>Lưu ý</h2>
        <div className="lp-legal-callout">
          <Info size={18} />
          <span>
            Xoá dữ liệu không thể hoàn tác. Nếu bạn chỉ muốn ngừng dùng ứng dụng, vào <strong>Quản lý → Đăng xuất</strong>; cách này không xoá dữ
            liệu.
          </span>
        </div>
        <p>
          Xem thêm cách chúng tôi xử lý dữ liệu tại <Link to="/privacy">Chính sách quyền riêng tư</Link>. Câu hỏi khác: <ContactEmail />.
        </p>
      </section>
    </LegalLayout>
  )
}
