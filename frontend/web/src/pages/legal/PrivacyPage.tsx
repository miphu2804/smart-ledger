import { Info } from 'lucide-react'
import { Link } from 'react-router-dom'
import LegalLayout, { ContactEmail, type TocItem } from './LegalLayout'
import { CONTROLLER, DELETION_DAYS } from './legalConfig'

const TOC: TocItem[] = [
  { id: 'pham-vi', label: 'Phạm vi và đơn vị chịu trách nhiệm' },
  { id: 'du-lieu', label: 'Dữ liệu chúng tôi thu thập' },
  { id: 'facebook', label: 'Đăng nhập bằng Facebook' },
  { id: 'muc-dich', label: 'Mục đích sử dụng' },
  { id: 'chia-se', label: 'Chia sẻ dữ liệu và bên xử lý' },
  { id: 'luu-tru', label: 'Thời gian lưu trữ' },
  { id: 'bao-mat', label: 'Bảo mật' },
  { id: 'quyen', label: 'Quyền của bạn' },
  { id: 'tre-em', label: 'Trẻ em' },
  { id: 'thay-doi', label: 'Thay đổi chính sách' },
  { id: 'lien-he', label: 'Liên hệ' },
]

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="Chính sách quyền riêng tư"
      toc={TOC}
      lead="Sổ Nghe Lời là ứng dụng ghi sổ bán hàng cho cửa hàng nhỏ. Trang này giải thích chúng tôi thu thập dữ liệu gì khi bạn dùng ứng dụng, dùng để làm gì, chia sẻ với ai và bạn có thể làm gì với dữ liệu của mình."
    >
      <section className="lp-legal-sec" id="pham-vi">
        <h2>1. Phạm vi và đơn vị chịu trách nhiệm</h2>
        <p>
          Chính sách áp dụng cho ứng dụng di động Sổ Nghe Lời (hiện là bản thử nghiệm trên Android), trang quản trị web dành cho nhân sự của nhóm và
          trang giới thiệu này. Đơn vị chịu trách nhiệm về dữ liệu: <strong>{CONTROLLER}</strong>.
        </p>
        <p>
          Ứng dụng đang ở giai đoạn thử nghiệm của một dự án sinh viên, vì vậy cách xử lý dữ liệu có thể thay đổi. Mọi thay đổi đáng kể sẽ được cập nhật
          tại trang này.
        </p>
      </section>

      <section className="lp-legal-sec" id="du-lieu">
        <h2>2. Dữ liệu chúng tôi thu thập</h2>
        <p>Chúng tôi chỉ xử lý dữ liệu cần để ứng dụng hoạt động. Phần lớn dữ liệu do chính bạn nhập vào sổ.</p>
        <table className="lp-legal-table">
          <thead>
            <tr>
              <th scope="col">Nhóm dữ liệu</th>
              <th scope="col">Gồm những gì</th>
              <th scope="col">Khi nào</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Tài khoản</th>
              <td>
                Mã định danh đăng nhập (Firebase UID), tên hiển thị bạn nhập, email hoặc số điện thoại nếu bạn dùng cách đăng nhập tương ứng, ảnh đại
                diện nếu có.
              </td>
              <td>Khi bạn đăng ký hoặc đăng nhập</td>
            </tr>
            <tr>
              <th scope="row">Thông tin cửa hàng</th>
              <td>Tên, ngành hàng, số điện thoại và địa chỉ cửa hàng.</td>
              <td>Bạn nhập khi thiết lập</td>
            </tr>
            <tr>
              <th scope="row">Sổ bán hàng</th>
              <td>Danh mục hàng hoá, giá, tồn kho; đơn bán, thanh toán, hoàn tiền; các khoản chi.</td>
              <td>Bạn nhập khi dùng</td>
            </tr>
            <tr>
              <th scope="row">Sổ nợ và khách hàng</th>
              <td>Tên khách, số điện thoại (nếu bạn nhập), số tiền nợ và lịch sử thu nợ.</td>
              <td>Bạn nhập khi ghi nợ</td>
            </tr>
            <tr>
              <th scope="row">Giọng nói và văn bản</th>
              <td>Văn bản câu bạn nói hoặc gõ khi lên đơn, ghi chi; câu hỏi và câu trả lời khi trò chuyện với trợ lý AI.</td>
              <td>Khi bạn dùng chức năng tương ứng</td>
            </tr>
            <tr>
              <th scope="row">Nhật ký thao tác</th>
              <td>Ai đã làm gì, trên cửa hàng nào, vào lúc nào. Không ghi mật khẩu hay mã đăng nhập.</td>
              <td>Tự động khi có thao tác ghi dữ liệu</td>
            </tr>
            <tr>
              <th scope="row">Thông tin kỹ thuật</th>
              <td>Thông tin tối thiểu như địa chỉ IP, loại thiết bị mà các nhà cung cấp ở mục 5 ghi theo mặc định.</td>
              <td>Tự động</td>
            </tr>
          </tbody>
        </table>

        <h3>Micro và camera</h3>
        <ul>
          <li>
            <strong>Micro</strong> chỉ dùng khi bạn nhấn nút ghi âm để đọc đơn. Âm thanh được chuyển thành văn bản ngay trên điện thoại bằng mô hình
            nhận dạng chạy trên máy; ứng dụng không tải bản ghi âm lên máy chủ của chúng tôi.
          </li>
          <li>
            <strong>Camera</strong> chỉ dùng khi bạn quét mã vạch hoặc mã QR của mặt hàng. Hình ảnh từ camera không được lưu và không được gửi đi.
          </li>
        </ul>

        <h3>Ảnh minh hoạ hàng hoá</h3>
        <p>
          Ảnh minh hoạ của một số mặt hàng được tải từ dịch vụ ảnh công khai Unsplash (images.unsplash.com). Khi đó nhà cung cấp ảnh nhận được địa
          chỉ IP của thiết bị, giống mọi trang web hay ứng dụng tải ảnh từ bên ngoài.
        </p>

        <h3>Không dùng cho quảng cáo</h3>
        <p>
          Chúng tôi không dùng dữ liệu bán hàng của bạn để quảng cáo và không bán dữ liệu cho bên thứ ba. Bộ công cụ Facebook trong ứng dụng được cấu
          hình tắt việc tự ghi sự kiện và tắt thu thập mã quảng cáo.
        </p>
      </section>

      <section className="lp-legal-sec" id="facebook">
        <h2>3. Đăng nhập bằng Facebook</h2>
        <p>
          Khi bạn chọn đăng nhập bằng Facebook, ứng dụng chỉ xin quyền <strong>public_profile</strong> (tên và ảnh đại diện công khai). Chúng tôi{' '}
          <strong>không</strong> yêu cầu email, danh sách bạn bè, bài đăng hay bất kỳ quyền nào khác.
        </p>
        <p>
          Việc xác thực do Meta thực hiện; Meta trả mã đăng nhập về ứng dụng, ứng dụng đổi mã đó lấy một tài khoản Firebase của Google. Chúng tôi không
          nhận mật khẩu Facebook của bạn. Bạn có thể thu hồi quyền của ứng dụng bất cứ lúc nào trong cài đặt Facebook; cách làm có ở trang{' '}
          <Link to="/data-deletion">Xoá dữ liệu người dùng</Link>.
        </p>
      </section>

      <section className="lp-legal-sec" id="muc-dich">
        <h2>4. Mục đích sử dụng</h2>
        <ul>
          <li>Xác thực bạn và cho bạn vào đúng cửa hàng của mình.</li>
          <li>Lưu và hiển thị sổ bán hàng, tồn kho, chi phí, công nợ và báo cáo.</li>
          <li>Tạo bản nháp đơn từ câu bạn nói hoặc gõ. Bản nháp chỉ được ghi vào sổ khi bạn xác nhận.</li>
          <li>Trả lời câu hỏi của bạn về số liệu của chính cửa hàng bạn (trợ lý AI).</li>
          <li>Hỗ trợ kỹ thuật, bảo mật và phát hiện lạm dụng.</li>
        </ul>
      </section>

      <section className="lp-legal-sec" id="chia-se">
        <h2>5. Chia sẻ dữ liệu và bên xử lý</h2>
        <p>
          Chúng tôi dùng các dịch vụ bên thứ ba dưới đây để vận hành ứng dụng. Danh sách phản ánh cấu hình hiện tại và có thể thay đổi; chúng tôi sẽ
          cập nhật tại đây.
        </p>
        <table className="lp-legal-table">
          <thead>
            <tr>
              <th scope="col">Dịch vụ</th>
              <th scope="col">Dùng để</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Google Firebase Authentication</th>
              <td>Đăng nhập và quản lý tài khoản.</td>
            </tr>
            <tr>
              <th scope="row">Meta (Facebook Login)</th>
              <td>Xác thực khi bạn chọn đăng nhập bằng Facebook.</td>
            </tr>
            <tr>
              <th scope="row">Supabase (PostgreSQL)</th>
              <td>Lưu cơ sở dữ liệu: tài khoản, cửa hàng, sổ bán hàng, lịch sử trò chuyện với trợ lý.</td>
            </tr>
            <tr>
              <th scope="row">Railway, Redis Cloud</th>
              <td>Chạy máy chủ xử lý nghiệp vụ và AI, bộ nhớ đệm.</td>
            </tr>
            <tr>
              <th scope="row">Vercel</th>
              <td>Phục vụ bản web.</td>
            </tr>
            <tr>
              <th scope="row">Nhà cung cấp mô hình ngôn ngữ (cấu hình hiện tại: OpenAI)</th>
              <td>Chỉ khi bạn dùng trợ lý AI: nội dung câu hỏi và dữ liệu cửa hàng liên quan được gửi tới để tạo câu trả lời.</td>
            </tr>
            <tr>
              <th scope="row">Unsplash</th>
              <td>Cung cấp ảnh minh hoạ hàng hoá (xem mục 2).</td>
            </tr>
          </tbody>
        </table>
        <p>
          Vị trí máy chủ phụ thuộc cấu hình của các nhà cung cấp trên và có thể nằm ngoài Việt Nam. Nhân sự quản trị của nhóm chỉ xem thông tin hồ sơ
          cơ sở và lịch sử hỗ trợ ở mức cần thiết để giúp bạn; mọi lần xem đều được ghi nhật ký và quản trị viên không sửa được sổ bán hàng của bạn.
          Ngoài các trường hợp trên, chúng tôi chỉ cung cấp dữ liệu khi có yêu cầu hợp lệ của cơ quan nhà nước có thẩm quyền.
        </p>
      </section>

      <section className="lp-legal-sec" id="luu-tru">
        <h2>6. Thời gian lưu trữ</h2>
        <p>Dữ liệu được giữ trong thời gian bạn dùng ứng dụng.</p>
        <p>
          Một số bản ghi được thiết kế chỉ-thêm và không bị xoá cứng để đối soát: đơn đã chốt (khi huỷ, đơn chuyển sang trạng thái huỷ kèm lý do), lịch
          sử thanh toán và nhật ký thao tác. Khi bạn yêu cầu xoá, chúng tôi xử lý theo mục 8 và trang <Link to="/data-deletion">Xoá dữ liệu người dùng</Link>.
          Bản sao lưu của nhà cung cấp hạ tầng sẽ hết hạn theo chu kỳ của họ.
        </p>
      </section>

      <section className="lp-legal-sec" id="bao-mat">
        <h2>7. Bảo mật</h2>
        <ul>
          <li>Mật khẩu và mã đăng nhập do Firebase quản lý; máy chủ của chúng tôi không lưu mật khẩu.</li>
          <li>Mỗi yêu cầu gửi lên máy chủ phải kèm mã xác thực hợp lệ, và dữ liệu luôn được tách theo từng cửa hàng.</li>
          <li>Nhật ký thao tác không thể sửa hay xoá qua ứng dụng.</li>
        </ul>
        <p>Không có hệ thống nào an toàn tuyệt đối. Nếu phát hiện sự cố liên quan đến dữ liệu của bạn, hãy báo ngay cho chúng tôi (mục 11).</p>
      </section>

      <section className="lp-legal-sec" id="quyen">
        <h2>8. Quyền của bạn</h2>
        <ul>
          <li>
            <strong>Xem và chỉnh sửa</strong>: bạn xem và sửa phần lớn dữ liệu trực tiếp trong ứng dụng (hồ sơ, cửa hàng, hàng hoá, khách hàng).
          </li>
          <li>
            <strong>Xoá hoặc ẩn danh</strong>: gửi yêu cầu theo hướng dẫn tại <Link to="/data-deletion">Xoá dữ liệu người dùng</Link>. Chúng tôi xử lý
            trong vòng {DELETION_DAYS} ngày kể từ khi xác minh được yêu cầu.
          </li>
          <li>
            <strong>Rút lại sự cho phép</strong>: gỡ Sổ Nghe Lời khỏi cài đặt Facebook, thu hồi quyền micro hoặc camera trong cài đặt điện thoại.
          </li>
          <li>
            <strong>Phản hồi và khiếu nại</strong>: liên hệ chúng tôi ở mục 11. Bạn cũng có quyền khiếu nại tới cơ quan có thẩm quyền theo quy định
            pháp luật Việt Nam về bảo vệ dữ liệu cá nhân.
          </li>
        </ul>
        <div className="lp-legal-callout">
          <Info size={18} />
          <span>
            Nếu bạn nhập thông tin của khách hàng (tên, số điện thoại) vào sổ nợ, hãy bảo đảm bạn được phép làm vậy. Bạn là người quyết định nhập những
            thông tin đó, còn chúng tôi chỉ lưu giúp bạn.
          </span>
        </div>
      </section>

      <section className="lp-legal-sec" id="tre-em">
        <h2>9. Trẻ em</h2>
        <p>Sổ Nghe Lời dành cho người kinh doanh, không hướng đến trẻ em. Nếu biết trẻ em đã tạo tài khoản, chúng tôi sẽ xoá tài khoản đó khi được báo.</p>
      </section>

      <section className="lp-legal-sec" id="thay-doi">
        <h2>10. Thay đổi chính sách</h2>
        <p>
          Khi chính sách thay đổi, ngày cập nhật ở đầu trang sẽ được đổi. Với thay đổi ảnh hưởng đến cách xử lý dữ liệu của bạn, chúng tôi sẽ thông
          báo trong ứng dụng hoặc tại trang này.
        </p>
      </section>

      <section className="lp-legal-sec" id="lien-he">
        <h2>11. Liên hệ</h2>
        <p>
          Mọi câu hỏi, yêu cầu về dữ liệu cá nhân: <ContactEmail />. Đơn vị chịu trách nhiệm: {CONTROLLER}.
        </p>
      </section>
    </LegalLayout>
  )
}
