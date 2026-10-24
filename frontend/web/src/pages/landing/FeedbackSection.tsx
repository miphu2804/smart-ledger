import { useState, type FormEvent } from 'react'

export default function FeedbackSection() {
  const [previewed, setPreviewed] = useState(false)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPreviewed(true)
  }

  return (
    <section className="lp-section lp-feedback" id="gop-y" aria-labelledby="feedback-title">
      <div className="lp-container feedback-grid">
        <div className="lp-sec-head">
          <h2 className="lp-display" id="feedback-title">Sổ lắng nghe bạn.</h2>
          <p>Có điều gì chưa thuận tiện? Hay một tính năng bạn mong có? Hãy chia sẻ để nhóm hiểu bạn hơn.</p>
          <p className="feedback-preview">Bản xem trước giao diện. Thông tin bạn nhập chưa được gửi hoặc lưu lại.</p>
        </div>
        <form className="feedback-form" onSubmit={submit} onChange={() => setPreviewed(false)}>
          <div className="feedback-fields">
            <label htmlFor="feedback-name">Họ và tên
              <input id="feedback-name" name="name" autoComplete="name" placeholder="Tên của bạn" required maxLength={100} />
            </label>
            <label htmlFor="feedback-phone">Số điện thoại
              <input id="feedback-phone" name="phone" type="tel" autoComplete="tel" placeholder="Số điện thoại liên hệ" required maxLength={25} />
            </label>
          </div>
          <label htmlFor="feedback-kind">Bạn muốn chia sẻ về
            <select id="feedback-kind" name="kind" defaultValue="issue">
              <option value="issue">Phản ánh trải nghiệm</option>
              <option value="feature">Đề xuất tính năng</option>
              <option value="other">Góp ý khác</option>
            </select>
          </label>
          <label htmlFor="feedback-message">Nội dung góp ý
            <textarea id="feedback-message" name="message" rows={5} placeholder="Bạn gặp khó khăn ở đâu, hoặc muốn Sổ Nghe Lời làm thêm điều gì?" required maxLength={2000} />
          </label>
          <div className="feedback-submit">
            <button className="lp-pill" type="submit">Gửi góp ý</button>
          </div>
          <p role="status" className="feedback-status">{previewed ? 'Bạn vừa thử thao tác gửi. Đây là bản xem trước; góp ý chưa được gửi và thông tin vẫn được giữ trong các ô để bạn chỉnh sửa.' : ''}</p>
        </form>
      </div>
    </section>
  )
}
