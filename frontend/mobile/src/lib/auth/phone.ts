/**
 * Đăng nhập bằng số điện thoại đã bỏ. Hàm này còn lại để hiển thị số của tài khoản cũ (Core vẫn lưu số E.164):
 * "+84901234567" -> "0901234567"; số nước ngoài giữ nguyên.
 */
export function fromE164VN(phone: string): string {
  return phone.startsWith('+84') ? `0${phone.slice(3)}` : phone;
}
