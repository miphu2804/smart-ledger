import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import LegalLayout, { ContactEmail, type TocItem } from './LegalLayout'
import { CONTROLLER, DELETION_DAYS, POLICY_UPDATED } from './legalConfig'

const WEBSITE = 'https://songheloi.id.vn'

const TOC: TocItem[] = [
  { id: 'quyen-rieng-tu', label: 'Chính sách quyền riêng tư' },
  { id: 'dieu-khoan', label: 'Điều khoản sử dụng' },
  { id: 'thanh-toan', label: 'Thanh toán, gia hạn, huỷ và hoàn tiền' },
]

/** Thông tin chủ sản phẩm chưa chốt: hiện rõ thay vì tự điền, và phải hết trước khi gỡ nhãn "Bản nháp". */
function Pending({ children }: { children: ReactNode }) {
  return <mark className="lp-legal-pending">[Cần điền: {children}]</mark>
}

function Website() {
  return <a href={WEBSITE}>songheloi.id.vn</a>
}

function Item({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <h3>{title}</h3>
      {children}
    </>
  )
}

export default function PolicyPage() {
  return (
    <LegalLayout
      title="Chính sách của Sổ Nghe Lời"
      updated={POLICY_UPDATED}
      toc={TOC}
      lead="Trang này gồm chính sách quyền riêng tư, điều khoản sử dụng và chính sách thanh toán của ứng dụng Android Sổ Nghe Lời phân phối qua Google Play, website và các dịch vụ liên quan."
    >
      <section className="lp-legal-sec" id="quyen-rieng-tu">
        <h2>I. Chính sách quyền riêng tư</h2>

        <Item title="1. Giới thiệu">
          <p>
            Sổ Nghe Lời (“Ứng dụng”, “chúng tôi”) hỗ trợ hộ kinh doanh và cửa hàng nhỏ quản lý bán hàng, sản phẩm, khách hàng, tồn kho, công nợ, chi
            phí, báo cáo và các chức năng hỗ trợ bằng giọng nói, barcode và trí tuệ nhân tạo. Chính sách này mô tả dữ liệu chúng tôi xử lý khi bạn dùng
            ứng dụng Android, website <Website />, trang quản trị và các dịch vụ liên quan.
          </p>
          <ul>
            <li>Đơn vị vận hành: {CONTROLLER}</li>
            <li>
              Email hỗ trợ, quyền riêng tư và xoá dữ liệu: <ContactEmail />
            </li>
            <li>
              Địa chỉ liên hệ: <Pending>địa chỉ công khai</Pending>
            </li>
          </ul>
        </Item>

        <Item title="2. Dữ liệu tài khoản">
          <p>
            Khi bạn tạo hoặc đăng nhập tài khoản, chúng tôi có thể xử lý tên hiển thị, email, ảnh đại diện, mã định danh tài khoản, thông tin cửa hàng và
            dữ liệu liên quan đến phương thức đăng nhập.
          </p>
          <p>
            Sổ Nghe Lời dùng Firebase Authentication để xác thực. Khi bạn đăng nhập bằng Google, Zalo hoặc phương thức được hỗ trợ khác, chúng tôi chỉ
            nhận thông tin mà bạn hoặc nhà cung cấp đó cho phép chia sẻ. Chúng tôi không lưu mật khẩu Google hay Zalo của bạn.
          </p>
        </Item>

        <Item title="3. Dữ liệu cửa hàng và bán hàng">
          <p>
            Ứng dụng có thể lưu tên cửa hàng, sản phẩm, danh mục, mã barcode, giá bán, giá vốn nếu bạn nhập, tồn kho, đơn hàng, giao dịch, phương thức
            thanh toán, doanh thu, chi phí, công nợ, lịch sử nhập hàng và dữ liệu nghiệp vụ liên quan. Dữ liệu này được xử lý để cung cấp chức năng bán
            hàng, quản lý cửa hàng, báo cáo và đồng bộ. PostgreSQL trên Supabase là cơ sở dữ liệu chính của ứng dụng và dữ liệu AI.
          </p>
        </Item>

        <Item title="4. Dữ liệu khách hàng của cửa hàng">
          <p>
            Bạn có thể nhập tên, số điện thoại, địa chỉ, ghi chú, lịch sử mua hàng hoặc công nợ của khách hàng. Chủ cửa hàng chịu trách nhiệm bảo đảm có
            căn cứ hợp pháp để thu thập, sử dụng và nhập các dữ liệu này. Chúng tôi xử lý dữ liệu đó để cung cấp chức năng quản lý khách hàng, bán hàng
            và công nợ cho chính bạn, và không bán danh sách khách hàng cho bên thứ ba.
          </p>
        </Item>

        <Item title="5. Barcode, camera và hình ảnh">
          <p>
            Ứng dụng có thể xin quyền camera khi bạn chủ động quét barcode hoặc chụp, tải ảnh sản phẩm. Dữ liệu barcode dùng để nhận diện hoặc tra cứu
            sản phẩm. Ảnh đại diện, logo cửa hàng hoặc ảnh sản phẩm có thể được lưu qua Cloudinary.
          </p>
        </Item>

        <Item title="6. Microphone và dữ liệu giọng nói">
          <p>
            Ứng dụng chỉ truy cập microphone sau khi bạn cấp quyền và chủ động bật tính năng nhập bằng giọng nói. Trên Android, âm thanh được chuyển thành
            văn bản hoàn toàn trên thiết bị và bản ghi âm không được gửi lên máy chủ.
          </p>
        </Item>

        <Item title="7. Transcript và lệnh bằng giọng nói">
          <p>
            Văn bản sau nhận dạng có thể được dùng để xác định sản phẩm, số lượng, giá, khách hàng hoặc yêu cầu của bạn. Khi bạn xác nhận tạo đơn, dữ liệu
            tương ứng trở thành dữ liệu giao dịch. Transcript có thể được đưa vào hội thoại với trợ lý AI nếu bạn dùng chức năng đó.
          </p>
        </Item>

        <Item title="8. Hội thoại và trợ lý AI">
          <p>
            Khi bạn dùng trợ lý AI, hệ thống có thể xử lý câu hỏi, transcript, prompt, phản hồi AI và phần dữ liệu nghiệp vụ cần thiết để trả lời. Lịch sử
            hội thoại có thể được lưu trong PostgreSQL trên Supabase. Nhà cung cấp AI: <Pending>nhà cung cấp AI trên production</Pending>.
          </p>
          <p>Bạn không nên nhập mật khẩu, khoá API, thông tin thẻ thanh toán hoặc dữ liệu nhạy cảm không cần thiết vào hội thoại AI.</p>
        </Item>

        <Item title="9. Dữ liệu kỹ thuật, bảo mật và nhật ký">
          <p>
            Chúng tôi có thể xử lý địa chỉ IP, thời gian truy cập, phiên bản ứng dụng, loại thiết bị, hệ điều hành, nhật ký API, mã lỗi, dữ liệu chẩn đoán
            và nhật ký kiểm toán để bảo vệ tài khoản, chống lạm dụng, xử lý lỗi và duy trì hệ thống.
          </p>
        </Item>

        <Item title="10. Mục đích xử lý">
          <p>
            Dữ liệu được xử lý để xác thực và bảo vệ tài khoản; cung cấp chức năng bán hàng; quản lý sản phẩm, khách hàng, giao dịch, công nợ và chi phí;
            nhận dạng giọng nói; cung cấp AI; tạo báo cáo; đồng bộ dữ liệu; hỗ trợ người dùng; phát hiện gian lận, lạm dụng và sự cố; và thực hiện nghĩa
            vụ pháp lý áp dụng. Chúng tôi không bán dữ liệu cá nhân hoặc dữ liệu sổ bán hàng của bạn.
          </p>
        </Item>

        <Item title="11. Nhà cung cấp dịch vụ">
          <p>Tuỳ tính năng, dữ liệu có thể được xử lý bởi:</p>
          <ul>
            <li>Google Firebase: xác thực tài khoản.</li>
            <li>Google và Zalo: đăng nhập khi bạn chọn phương thức tương ứng.</li>
            <li>Supabase (PostgreSQL): cơ sở dữ liệu ứng dụng và lịch sử AI.</li>
            <li>
              Máy chủ chạy dịch vụ nghiệp vụ và AI: <Pending>nhà cung cấp VPS</Pending>.
            </li>
            <li>Cloudinary: lưu trữ và phân phối hình ảnh.</li>
            <li>Vercel: phân phối website và giao diện web.</li>
            <li>
              Nhà cung cấp AI: <Pending>nhà cung cấp AI trên production</Pending>.
            </li>
            <li>Google Play: phân phối ứng dụng và xử lý thanh toán subscription nếu được triển khai.</li>
          </ul>
        </Item>

        <Item title="12. Chuyển dữ liệu ra ngoài Việt Nam">
          <p>
            Một số nhà cung cấp hạ tầng, xác thực, AI hoặc lưu trữ có thể xử lý dữ liệu trên máy chủ ngoài Việt Nam. Khi có hoạt động xử lý xuyên biên
            giới, chúng tôi thực hiện các nghĩa vụ áp dụng theo pháp luật Việt Nam về bảo vệ dữ liệu cá nhân.
          </p>
        </Item>

        <Item title="13. Thời gian lưu dữ liệu">
          <p>
            Dữ liệu tài khoản và nghiệp vụ được lưu trong thời gian cần thiết để cung cấp dịch vụ hoặc cho đến khi bạn yêu cầu xoá, trừ trường hợp cần tiếp
            tục lưu để đáp ứng nghĩa vụ pháp lý, bảo mật, chống gian lận hoặc giải quyết tranh chấp.
          </p>
          <ul>
            <li>
              Xoá khỏi dữ liệu hoạt động chính: trong vòng {DELETION_DAYS} ngày kể từ khi xác minh được yêu cầu.
            </li>
            <li>
              Dữ liệu còn trong bản sao lưu: <Pending>thời gian tồn tại sau yêu cầu xoá</Pending>.
            </li>
            <li>
              Log kỹ thuật và nhật ký kiểm toán: <Pending>thời gian lưu</Pending>.
            </li>
            <li>
              Lịch sử hội thoại AI: <Pending>thời gian lưu</Pending>.
            </li>
          </ul>
        </Item>

        <Item title="14. Xoá tài khoản và dữ liệu">
          <p>
            Bạn có thể yêu cầu xoá tài khoản và dữ liệu liên quan trong ứng dụng hoặc tại trang công khai <Link to="/delete-account">Xoá tài khoản</Link>,
            không cần cài ứng dụng. Sau khi xác minh yêu cầu hợp lệ, chúng tôi xoá hoặc ẩn danh dữ liệu không còn cần thiết. Một số dữ liệu có thể được giữ
            lại trong thời gian giới hạn khi pháp luật hoặc yêu cầu bảo mật bắt buộc.
          </p>
        </Item>

        <Item title="15. Quyền của người dùng">
          <p>
            Tuỳ quy định pháp luật áp dụng, bạn có thể yêu cầu truy cập, chỉnh sửa, xoá hoặc hạn chế xử lý dữ liệu; rút lại sự đồng ý đối với hoạt động dựa
            trên sự đồng ý; và thực hiện các quyền khác theo pháp luật. Gửi yêu cầu tới <ContactEmail />.
          </p>
        </Item>

        <Item title="16. Bảo mật">
          <p>
            Chúng tôi áp dụng các biện pháp kỹ thuật và tổ chức hợp lý như xác thực tài khoản, kiểm soát quyền truy cập, kết nối bảo mật, phân tách dịch vụ
            và ghi nhật ký hoạt động quan trọng. Không có hệ thống trực tuyến nào bảo đảm an toàn tuyệt đối.
          </p>
        </Item>

        <Item title="17. AI và độ chính xác">
          <p>
            Nhận dạng giọng nói và AI có thể hiểu sai tên sản phẩm, số lượng, giá, khách hàng hoặc yêu cầu. Bạn phải kiểm tra dữ liệu trước khi xác nhận giao
            dịch. Nội dung AI không phải tư vấn pháp lý, thuế, kế toán hoặc tài chính.
          </p>
        </Item>

        <Item title="18. Trẻ em">
          <p>Sổ Nghe Lời được thiết kế cho chủ cửa hàng và người phục vụ hoạt động kinh doanh, không hướng tới trẻ em.</p>
        </Item>

        <Item title="19. Thay đổi chính sách">
          <p>Chúng tôi có thể cập nhật chính sách này khi sản phẩm, nhà cung cấp hoặc pháp luật thay đổi. Ngày cập nhật gần nhất hiện ở đầu trang.</p>
        </Item>
      </section>

      <section className="lp-legal-sec" id="dieu-khoan">
        <h2>II. Điều khoản sử dụng</h2>

        <Item title="1. Phạm vi">
          <p>
            Điều khoản này áp dụng cho ứng dụng Android Sổ Nghe Lời, website và các dịch vụ liên quan. Khi đăng ký hoặc tiếp tục sử dụng, bạn xác nhận đã đọc
            và đồng ý với Điều khoản và Chính sách quyền riêng tư.
          </p>
        </Item>
        <Item title="2. Dịch vụ">
          <p>
            Sổ Nghe Lời cung cấp công cụ quản lý sản phẩm, barcode, khách hàng, đơn hàng, giao dịch, công nợ, chi phí, báo cáo và chức năng hỗ trợ bằng giọng
            nói và AI. Tính năng có thể khác nhau theo phiên bản và gói dịch vụ.
          </p>
        </Item>
        <Item title="3. Trách nhiệm tài khoản">
          <p>Bạn phải cung cấp thông tin chính xác, bảo vệ tài khoản và thiết bị, và thông báo khi nghi ngờ có truy cập trái phép.</p>
        </Item>
        <Item title="4. Quyền đối với dữ liệu">
          <p>Bạn giữ quyền đối với dữ liệu hợp pháp của mình. Việc dùng Sổ Nghe Lời chỉ cho chúng tôi quyền xử lý dữ liệu trong phạm vi cần thiết để cung cấp dịch vụ.</p>
        </Item>
        <Item title="5. Dữ liệu của khách hàng">
          <p>Bạn chịu trách nhiệm về căn cứ hợp pháp khi nhập dữ liệu của khách hàng, nhân viên hoặc người khác vào ứng dụng.</p>
        </Item>
        <Item title="6. Giọng nói và AI">
          <p>
            Nhận dạng giọng nói và AI không bảo đảm chính xác tuyệt đối. Bạn phải kiểm tra tên sản phẩm, số lượng, giá, công nợ, doanh thu, tồn kho và các
            thông tin quan trọng trước khi xác nhận. AI không thay thế kế toán viên, luật sư, chuyên gia thuế hoặc cố vấn tài chính.
          </p>
        </Item>
        <Item title="7. Hành vi bị cấm">
          <p>
            Bạn không được dùng dịch vụ để vi phạm pháp luật; xâm phạm quyền của người khác; phát tán mã độc; truy cập trái phép; khai thác lỗ hổng khi chưa
            được phép; né quota hoặc giới hạn gói; gây quá tải; gian lận thanh toán; hoặc dùng AI để hỗ trợ hành vi bất hợp pháp.
          </p>
        </Item>
        <Item title="8. Dịch vụ bên thứ ba">
          <p>Một số chức năng phụ thuộc vào các nhà cung cấp nêu ở mục I.11. Sự cố của bên thứ ba có thể ảnh hưởng tạm thời tới dịch vụ.</p>
        </Item>
        <Item title="9. Tính khả dụng">
          <p>
            Chúng tôi cố gắng duy trì dịch vụ ổn định nhưng không cam kết hoạt động 100% liên tục. Dịch vụ có thể gián đoạn do bảo trì, cập nhật, sự cố mạng,
            cloud hoặc sự kiện ngoài khả năng kiểm soát hợp lý.
          </p>
        </Item>
        <Item title="10. Gói trả phí">
          <p>
            Một số chức năng có thể yêu cầu subscription. Giá, quota, thời hạn và quyền lợi được hiển thị trước khi bạn mua. Trên bản Android phân phối qua
            Google Play, subscription mở khoá tính năng số trong ứng dụng sẽ được triển khai qua Google Play Billing khi bắt đầu thu phí, trừ trường hợp thuộc
            ngoại lệ được Google Play cho phép.
          </p>
        </Item>
        <Item title="11. Giới hạn AI">
          <p>Gói dịch vụ có thể giới hạn theo phút voice, số yêu cầu AI hoặc tài nguyên khác. Khi đạt quota, tính năng liên quan có thể tạm dừng đến kỳ tiếp theo hoặc yêu cầu nâng cấp.</p>
        </Item>
        <Item title="12. Khoá hoặc đình chỉ tài khoản">
          <p>Chúng tôi có thể tạm giới hạn tài khoản khi có nguy cơ bảo mật, gian lận, lạm dụng hoặc vi phạm Điều khoản. Vi phạm nghiêm trọng hoặc lặp lại có thể dẫn đến chấm dứt tài khoản.</p>
        </Item>
        <Item title="13. Xoá tài khoản">
          <p>
            Bạn có thể yêu cầu xoá tài khoản trong ứng dụng hoặc qua trang <Link to="/delete-account">Xoá tài khoản</Link>. Xoá ứng dụng khỏi điện thoại không
            đồng nghĩa với xoá tài khoản và cũng không tự động huỷ subscription Google Play.
          </p>
        </Item>
        <Item title="14. Giới hạn trách nhiệm">
          <p>
            Sổ Nghe Lời là công cụ hỗ trợ vận hành. Trong phạm vi pháp luật cho phép, chúng tôi không chịu trách nhiệm đối với thiệt hại phát sinh do bạn không
            kiểm tra dữ liệu hoặc dùng AI như tư vấn chuyên môn. Điều này không loại trừ các quyền bắt buộc của người tiêu dùng theo pháp luật.
          </p>
        </Item>
        <Item title="15. Luật áp dụng">
          <p>Điều khoản được điều chỉnh bởi pháp luật Việt Nam. Các bên ưu tiên thương lượng trước khi yêu cầu cơ quan có thẩm quyền giải quyết.</p>
        </Item>
      </section>

      <section className="lp-legal-sec" id="thanh-toan">
        <h2>III. Thanh toán, gia hạn, huỷ và hoàn tiền</h2>

        <Item title="1. Trạng thái hiện tại">
          <p>Sổ Nghe Lời hiện chưa thu phí trong ứng dụng. Các gói dưới đây là phương án dự kiến, chưa mua được cho tới khi Google Play Billing được tích hợp và kiểm thử.</p>
        </Item>
        <Item title="2. Các gói dự kiến">
          <table className="lp-legal-table">
            <thead>
              <tr>
                <th scope="col">Quyền lợi</th>
                <th scope="col">Gọn</th>
                <th scope="col">Thông minh</th>
                <th scope="col">Chuyên nghiệp</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Giá tháng</th>
                <td>59.000đ</td>
                <td>109.000đ</td>
                <td>199.000đ</td>
              </tr>
              <tr>
                <th scope="row">Giá năm</th>
                <td>590.000đ</td>
                <td>1.090.000đ</td>
                <td>1.990.000đ</td>
              </tr>
              <tr>
                <th scope="row">Cửa hàng</th>
                <td>1</td>
                <td>1</td>
                <td>Tối đa 3</td>
              </tr>
              <tr>
                <th scope="row">Tài khoản sử dụng</th>
                <td>1</td>
                <td>Tối đa 3</td>
                <td>Tối đa 10</td>
              </tr>
              <tr>
                <th scope="row">Sản phẩm</th>
                <td>Tối đa 2.000</td>
                <td>Tối đa 10.000</td>
                <td>Tối đa 50.000</td>
              </tr>
              <tr>
                <th scope="row">Khách hàng</th>
                <td>Tối đa 1.000</td>
                <td>Tối đa 5.000</td>
                <td>Tối đa 20.000</td>
              </tr>
              <tr>
                <th scope="row">Voice AI mỗi tháng</th>
                <td>120 phút</td>
                <td>350 phút</td>
                <td>800 phút</td>
              </tr>
              <tr>
                <th scope="row">Yêu cầu AI mỗi tháng</th>
                <td>100</td>
                <td>500</td>
                <td>1.500</td>
              </tr>
              <tr>
                <th scope="row">Báo cáo</th>
                <td>Cơ bản</td>
                <td>Nâng cao</td>
                <td>Nâng cao, hỗ trợ ưu tiên</td>
              </tr>
            </tbody>
          </table>
          <p>Giá chính thức là giá hiển thị trên Google Play tại thời điểm mua.</p>
        </Item>
        <Item title="3. Google Play Billing">
          <p>
            Khi subscription được triển khai trên Android, giao dịch mua quyền truy cập tính năng số trong ứng dụng được xử lý qua Google Play Billing. Google xử
            lý phương thức thanh toán; chúng tôi không lưu đầy đủ số thẻ, mã CVV hoặc mật khẩu thanh toán, và có thể lưu mã giao dịch, product ID, trạng thái
            subscription, kỳ thanh toán và ngày hết hạn để xác định quyền truy cập.
          </p>
        </Item>
        <Item title="4. Dùng thử">
          <p>Nếu có chương trình dùng thử, thời lượng, giá sau dùng thử và ngày bắt đầu thu tiền được hiển thị trước khi bạn xác nhận.</p>
        </Item>
        <Item title="5. Tự động gia hạn">
          <p>Subscription tự động gia hạn theo chu kỳ cho đến khi bạn huỷ trong Google Play. Bạn được xem giá và chu kỳ thanh toán trước khi mua.</p>
        </Item>
        <Item title="6. Huỷ subscription">
          <p>
            Bạn có thể huỷ subscription trong Google Play. Gỡ cài đặt ứng dụng không tự động huỷ subscription. Sau khi huỷ, bạn thường vẫn dùng được quyền lợi đã
            thanh toán tới hết kỳ hiện tại, tuỳ điều kiện hiển thị tại thời điểm mua.
          </p>
        </Item>
        <Item title="7. Nâng hoặc hạ gói">
          <p>
            Việc nâng, hạ gói, phần phí chênh lệch và thời điểm hiệu lực theo cấu hình subscription trên Google Play và được hiển thị trước khi xác nhận. Nếu hạ gói
            khiến dữ liệu vượt quota mới, chúng tôi không tự ý xoá dữ liệu chỉ vì việc hạ gói; ứng dụng có thể giới hạn thao tác tạo mới cho tới khi bạn giảm dữ
            liệu hoặc nâng cấp lại.
          </p>
        </Item>
        <Item title="8. Quota AI">
          <p>Quota Voice AI và AI Chat được tính theo kỳ. Hạn mức không dùng hết không chuyển sang kỳ sau, trừ khi màn hình mua ghi rõ khác.</p>
        </Item>
        <Item title="9. Hoàn tiền">
          <p>
            Với giao dịch do Google Play lập hoá đơn, bạn gửi yêu cầu hoàn tiền theo cơ chế của Google Play. Khả năng đủ điều kiện phụ thuộc vào thời điểm yêu cầu,
            loại giao dịch, tình trạng sử dụng và chính sách hiện hành của Google. Chúng tôi có thể hỗ trợ xác định giao dịch và xử lý trường hợp Google chuyển yêu
            cầu về nhà phát triển, nhưng không cam kết mọi yêu cầu đều được hoàn tiền.
          </p>
        </Item>
        <Item title="10. Giao dịch trái phép hoặc tính phí nhầm">
          <p>
            Nếu thấy giao dịch lạ, tính phí lặp hoặc sai gói, hãy liên hệ Google Play và chúng tôi sớm nhất có thể. Chúng tôi có thể yêu cầu mã giao dịch nhưng
            không yêu cầu mật khẩu Google, mật khẩu ngân hàng hoặc CVV.
          </p>
        </Item>
        <Item title="11. Hết hạn gói">
          <p>Khi subscription hết hạn, tính năng trả phí có thể bị khoá hoặc giảm hạn mức. Dữ liệu cửa hàng không bị xoá ngay chỉ vì subscription hết hạn và vẫn theo Chính sách quyền riêng tư.</p>
        </Item>
        <Item title="12. Thay đổi giá">
          <p>Giá có thể thay đổi trong tương lai. Giá mới không áp dụng hồi tố cho kỳ đã thanh toán, và việc thay đổi tuân theo cơ chế thông báo và xác nhận của Google Play.</p>
        </Item>
        <Item title="13. Quyền người tiêu dùng">
          <p>Không nội dung nào trong chính sách này nhằm loại trừ quyền bắt buộc của người tiêu dùng theo pháp luật Việt Nam hoặc quy định bắt buộc của Google Play.</p>
        </Item>
      </section>

      <section className="lp-legal-sec" id="lien-he">
        <h2>Liên hệ</h2>
        <p>
          Sổ Nghe Lời, {CONTROLLER}. Email: <ContactEmail />. Website: <Website />. Địa chỉ: <Pending>địa chỉ công khai</Pending>.
        </p>
      </section>
    </LegalLayout>
  )
}
