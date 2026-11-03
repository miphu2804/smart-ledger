/**
 * Email người dùng gõ ở màn đăng nhập, chuyển sang màn mật khẩu trong bộ nhớ thay vì tham số route: trên web tham số route
 * nằm trên URL, lọt vào lịch sử trình duyệt và log máy chủ. Lấy ra một lần rồi xoá.
 */
let draft = '';

export function setEmailDraft(email: string) {
  draft = email;
}

export function takeEmailDraft(): string {
  const email = draft;
  draft = '';
  return email;
}
