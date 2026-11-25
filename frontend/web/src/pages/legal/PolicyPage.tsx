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
          </ul>
        </Item>

        <Item title="2. Dữ liệu tài khoản">
          <p>
            Khi bạn tạo hoặc đăng nhập tài khoản, chúng tôi có thể xử lý tên hiển thị, email, ảnh đại diện, mã định danh tài khoản, thông tin cửa hàng và
            dữ liệu liên quan đến phương thức đăng nhập.
          </p>
          <p>
            Sổ Nghe Lời dùng Firebase Authentication để xác thực. Bạn đăng nhập bằng email và mật khẩu, Google hoặc Zalo; đăng nhập Facebook đang tạm
            khoá. Khi dùng tài khoản bên ngoài, chúng tôi chỉ nhận thông tin mà bạn hoặc nhà cung cấp đó cho phép chia sẻ. Mật khẩu email do Firebase quản
            lý; máy chủ của chúng tôi không lưu mật khẩu, kể cả mật khẩu Google hay Zalo.
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
            Bạn có thể nhập tên, số điện thoại, lịch sử mua hàng và công nợ của khách hàng. Chủ cửa hàng chịu trách nhiệm bảo đảm có
            căn cứ hợp pháp để thu thập, sử dụng và nhập các dữ liệu này. Chúng tôi xử lý dữ liệu đó để cung cấp chức năng quản lý khách hàng, bán hàng
            và công nợ cho chính bạn, và không bán danh sách khách hàng cho bên thứ ba.
          </p>
        </Item>

        <Item title="5. Barcode, camera và hình ảnh">
          <p>
            Ứng dụng xin quyền camera khi bạn chủ động quét barcode hoặc chụp ảnh sản phẩm. Lúc quét, hình ảnh từ camera không được lưu và không được gửi
            đi; mã barcode dùng để nhận diện hoặc tra cứu sản phẩm. Ảnh sản phẩm bạn chụp được tải lên và lưu qua Cloudinary để hiện trong danh mục hàng của
            cửa hàng bạn.
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
            Khi bạn dùng trợ lý AI, hệ thống xử lý câu hỏi, transcript, prompt, phản hồi AI và phần dữ liệu nghiệp vụ cần thiết để trả lời. Nội dung này được
            gửi tới nhà cung cấp mô hình OpenAI và Inception qua cổng Bifrost do chúng tôi tự vận hành để tạo câu trả lời. Bifrost không ghi nội dung tin
            nhắn vào log. Lịch sử hội thoại được lưu trong PostgreSQL trên Supabase.
          </p>
          <p>
            Để tìm lỗi và cải thiện chất lượng trợ lý, câu hỏi (đã che email, số thẻ và khoá truy cập), dữ liệu cửa hàng trợ lý đã đọc và câu trả lời được
            ghi lại trên HoneyHive. Bản ghi có thể chứa tên và số điện thoại khách mà bạn nhập; không gồm ảnh hay âm thanh.
          </p>
          <p>Bạn không nên nhập mật khẩu, khoá API, thông tin thẻ thanh toán hoặc dữ liệu nhạy cảm không cần thiết vào hội thoại AI.</p>
        </Item>

        <Item title="9. Dữ liệu kỹ thuật, bảo mật và nhật ký">
          <p>
            Chúng tôi có thể xử lý địa chỉ IP, thời gian truy cập, phiên bản ứng dụng, loại thiết bị, hệ điều hành, nhật ký API, mã lỗi, dữ liệu chẩn đoán
            và nhật ký kiểm toán để bảo vệ tài khoản, chống lạm dụng, xử lý lỗi và duy trì hệ thống. Chúng tôi cũng có thể ghi ngày bạn có hoạt động để thống
            kê số người dùng. Nhân sự hỗ trợ của nhóm chỉ xem hồ sơ và cửa hàng ở mức cần để giúp bạn, không sửa được sổ bán hàng của bạn.
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
            <li>
              Meta: đăng nhập Facebook đang tạm khoá. Bộ công cụ Facebook trong ứng dụng đã tắt tự ghi sự kiện và thu thập mã quảng cáo; khi mở lại, ứng dụng chỉ
              xin quyền hồ sơ công khai.
            </li>
            <li>Supabase (PostgreSQL): cơ sở dữ liệu ứng dụng và lịch sử AI.</li>
            <li>Máy chủ riêng ảo (VPS) do nhóm thuê: chạy dịch vụ nghiệp vụ, AI và hệ thống giám sát.</li>
            <li>Cloudinary: lưu trữ và phân phối ảnh sản phẩm.</li>
            <li>Vercel và Cloudflare R2: phân phối website và file cài đặt Android.</li>
            <li>OpenAI và Inception: tạo câu trả lời của trợ lý AI.</li>
            <li>HoneyHive: ghi lại hội thoại với trợ lý AI để tìm lỗi và cải thiện chất lượng.</li>
            <li>SePay: báo cho chúng tôi các khoản chuyển khoản vào tài khoản nhận tiền để xác nhận thanh toán gói.</li>
            <li>Google Play: phân phối ứng dụng.</li>
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
            <li>Bản sao lưu của nhà cung cấp hạ tầng: tự hết hạn theo chu kỳ của nhà cung cấp.</li>
            <li>Log kỹ thuật: 14 ngày. Chỉ số giám sát hệ thống: 30 ngày.</li>
            <li>
              Nhật ký kiểm toán: chỉ thêm, không sửa hay xoá được qua ứng dụng. Khi xử lý yêu cầu xoá, chúng tôi xoá tên và thông tin liên hệ khỏi hồ sơ mà nhật ký
              tham chiếu tới; dòng nhật ký không còn nhận ra bạn có thể được giữ lại.
            </li>
            <li>Lịch sử hội thoại AI: tới khi bạn xoá cuộc trò chuyện hoặc yêu cầu xoá tài khoản.</li>
          </ul>
        </Item>

        <Item title="14. Xoá tài khoản và dữ liệu">
          <p>
            Bạn có thể yêu cầu xoá tài khoản và dữ liệu liên quan trong ứng dụng (Quản lý → Xoá tài khoản) hoặc tại trang công khai{' '}
            <Link to="/delete-account">Xoá tài khoản</Link>, không cần cài ứng dụng. Sau khi xác minh yêu cầu hợp lệ, chúng tôi xoá hoặc ẩn danh dữ liệu không còn cần thiết. Một số dữ liệu có thể được giữ
            lại trong thời gian giới hạn khi pháp luật hoặc yêu cầu bảo mật bắt buộc.
          </p>
        </Item>

        <Item title="15. Quyền của người dùng">
          <p>
            Theo Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 và quy định pháp luật áp dụng, bạn có thể yêu cầu truy cập, chỉnh sửa, xoá hoặc hạn chế xử lý dữ liệu; rút lại sự đồng ý đối với hoạt động dựa
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
            nói và AI. Tính năng có thể khác nhau theo phiên bản.
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
            được phép; né giới hạn sử dụng; gây quá tải; gian lận thanh toán; hoặc dùng AI để hỗ trợ hành vi bất hợp pháp.
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
            Sổ Nghe Lời có gói Miễn phí và các gói trả phí theo thời hạn. Giá, thời hạn và quyền lợi của từng gói được hiển thị trong ứng dụng trước khi bạn
            thanh toán. Mục <a href="#thanh-toan">Thanh toán, gia hạn, huỷ và hoàn tiền</a> mô tả cách mua và dùng gói.
          </p>
        </Item>
        <Item title="11. Giới hạn sử dụng">
          <p>Để chống lạm dụng, hệ thống giới hạn tần suất một số thao tác như tạo cửa hàng và tải ảnh. Mỗi gói giới hạn số câu hỏi trợ lý AI theo kỳ; khi hết lượt, chỉ việc hỏi trợ lý AI tạm dừng đến kỳ tiếp theo hoặc khi bạn nâng cấp, các chức năng khác vẫn dùng bình thường.</p>
        </Item>
        <Item title="12. Khoá hoặc đình chỉ tài khoản">
          <p>Chúng tôi có thể tạm giới hạn tài khoản khi có nguy cơ bảo mật, gian lận, lạm dụng hoặc vi phạm Điều khoản. Vi phạm nghiêm trọng hoặc lặp lại có thể dẫn đến chấm dứt tài khoản.</p>
        </Item>
        <Item title="13. Xoá tài khoản">
          <p>
            Bạn có thể yêu cầu xoá tài khoản trong ứng dụng (Quản lý → Xoá tài khoản) hoặc qua trang <Link to="/delete-account">Xoá tài khoản</Link>. Xoá ứng dụng khỏi điện thoại không
            đồng nghĩa với xoá tài khoản.
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

        <Item title="1. Các gói">
          <table className="lp-legal-table">
            <thead>
              <tr>
                <th scope="col">Quyền lợi</th>
                <th scope="col">Miễn phí</th>
                <th scope="col">1 tháng</th>
                <th scope="col">3 tháng</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Giá</th>
                <td>0đ</td>
                <td>99.000đ</td>
                <td>297.000đ</td>
              </tr>
              <tr>
                <th scope="row">Thời hạn</th>
                <td>Không thời hạn</td>
                <td>1 tháng lịch</td>
                <td>3 tháng lịch</td>
              </tr>
              <tr>
                <th scope="row">Bán hàng, sổ sách, báo cáo</th>
                <td>Đầy đủ</td>
                <td>Đầy đủ</td>
                <td>Đầy đủ</td>
              </tr>
              <tr>
                <th scope="row">Lượt hỏi Trợ lý Bobi</th>
                <td>2 lượt/ngày</td>
                <td>300 lượt/tuần</td>
                <td>300 lượt/tuần</td>
              </tr>
            </tbody>
          </table>
          <p>
            Gói áp dụng cho tài khoản chủ tiệm và dùng chung cho mọi cửa hàng, mọi thiết bị của tài khoản đó. Hai gói trả phí có cùng quyền lợi, chỉ khác thời
            hạn. Giá chính thức là giá hiển thị trong màn mua gói tại thời điểm bạn tạo yêu cầu thanh toán.
          </p>
        </Item>
        <Item title="2. Cách mua">
          <p>
            Bạn mua gói trong ứng dụng tại Quản lý → Mua gói. Ứng dụng tạo một yêu cầu thanh toán gồm mã QR, số tiền, tài khoản nhận và nội dung chuyển khoản
            bắt đầu bằng <b>SLP</b>. Bạn chuyển khoản bằng ứng dụng ngân hàng, giữ nguyên số tiền và nội dung, trong vòng 30 phút.
          </p>
          <p>
            Gói chỉ được kích hoạt khi hệ thống nhận được khoản chuyển khớp yêu cầu qua SePay; quét QR hoặc chờ hết giờ không có nghĩa là đã thanh toán. Ứng
            dụng hiển thị trạng thái Chờ thanh toán, Đã nhận thanh toán — đang kích hoạt gói, và Gói đã được kích hoạt.
          </p>
          <p>
            Bản cài đặt từ Google Play không có lối mua gói. Gói đã mua từ bản khác vẫn áp dụng trên mọi thiết bị của tài khoản. Chúng tôi không lưu số thẻ, mật
            khẩu ngân hàng hoặc mã OTP; hệ thống chỉ lưu số tiền, thời gian, ngân hàng nhận và mã nội dung của khoản chuyển.
          </p>
        </Item>
        <Item title="3. Gia hạn">
          <p>
            Gói không tự gia hạn và không tự trừ tiền. Khi gói còn hạn, mua thêm sẽ cộng nối tiếp thời hạn; lượt hỏi trong tuần hiện tại không bị đặt lại.
          </p>
        </Item>
        <Item title="4. Lượt hỏi Trợ lý Bobi">
          <p>
            Lượt của gói Miễn phí đặt lại lúc 0 giờ theo giờ Việt Nam. Lượt của gói trả phí tính theo từng 7 ngày kể từ lúc kích hoạt gói. Mỗi câu hỏi được
            trả lời xong tính một lượt, kể cả khi trợ lý hỏi lại để làm rõ; câu hỏi lỗi kỹ thuật không trừ lượt. Lượt không dùng hết không chuyển sang kỳ sau.
          </p>
        </Item>
        <Item title="5. Hết hạn và huỷ">
          <p>
            Khi gói trả phí hết hạn, tài khoản trở về gói Miễn phí. Dữ liệu bán hàng giữ nguyên và vẫn theo Chính sách quyền riêng tư. Vì gói không tự gia hạn,
            bạn không cần huỷ; nếu không mua thêm, gói kết thúc khi hết thời hạn.
          </p>
        </Item>
        <Item title="6. Chuyển khoản sai, thừa hoặc trễ">
          <p>
            Khoản chuyển sai số tiền, sai nội dung hoặc đến sau khi yêu cầu hết hạn không tự kích hoạt gói; ứng dụng báo có khoản chuyển cần đối soát. Hãy liên
            hệ chúng tôi kèm nội dung <b>SLP…</b>, thời gian và số tiền đã chuyển. Chúng tôi đối soát và hỗ trợ kích hoạt gói hoặc xử lý khoản tiền
            đó.
          </p>
        </Item>
        <Item title="7. Hoàn tiền">
          <p>
            Bạn gửi yêu cầu hoàn tiền qua email liên hệ, kèm nội dung chuyển khoản. Chúng tôi xem xét từng trường hợp theo thời điểm yêu cầu và tình trạng sử
            dụng gói, nhưng không cam kết mọi yêu cầu đều được hoàn tiền.
          </p>
        </Item>
        <Item title="8. Giao dịch lạ">
          <p>Nếu thấy giao dịch lạ hoặc bị trừ tiền nhầm, hãy liên hệ ngân hàng của bạn và chúng tôi sớm nhất có thể. Chúng tôi không bao giờ hỏi mật khẩu ngân hàng hoặc mã OTP.</p>
        </Item>
        <Item title="9. Thay đổi giá">
          <p>Giá có thể thay đổi trong tương lai. Giá mới chỉ áp dụng cho yêu cầu thanh toán tạo sau khi thay đổi; gói đã thanh toán giữ nguyên thời hạn và quyền lợi.</p>
        </Item>
        <Item title="10. Quyền người tiêu dùng">
          <p>Không nội dung nào trong chính sách này nhằm loại trừ quyền bắt buộc của người tiêu dùng theo pháp luật Việt Nam.</p>
        </Item>
      </section>

      <section className="lp-legal-sec" id="lien-he">
        <h2>Liên hệ</h2>
        <p>
          Sổ Nghe Lời, {CONTROLLER}. Email: <ContactEmail />. Website: <Website />.
        </p>
      </section>
    </LegalLayout>
  )
}
