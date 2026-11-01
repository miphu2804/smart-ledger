/**
 * Kiểm tra định dạng các ô ở màn Chỉnh sửa thông tin và màn tạo tiệm.
 *
 * Mỗi hàm trả câu báo lỗi, hoặc '' khi hợp lệ hay ô tuỳ chọn để trống. Giới hạn độ dài theo Core (ShopUpdateRequest: tên tiệm
 * 200, số điện thoại 30, địa chỉ 500) và theo phiên đăng nhập (họ tên 150); các ô chỉ lưu trên máy (email, Facebook, ngân hàng)
 * giới hạn theo độ dài hợp lý của dữ liệu thật.
 */
export const PROFILE_MAX = {
  name: 150,
  email: 254,
  facebook: 200,
  shopName: 200,
  shopPhone: 30,
  address: 500,
  bankName: 100,
  bankAccount: 23,
} as const;

/**
 * Dữ liệu đã lưu từ trước có thể không đúng quy tắc mới (VD Core đang giữ "0901234567 / 0912345678"). Ô chưa sửa thì không báo
 * lỗi, để một giá trị cũ không khoá nút Lưu của cả màn. Ô để trống vẫn theo kết quả kiểm tra.
 */
export function unlessUnchanged(value: string, saved: string, error: string): string {
  const v = value.trim();
  return v && v === saved.trim() ? '' : error;
}

const HAS_LETTER = /\p{L}/u;
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

export function nameError(value: string): string {
  const v = value.trim();
  if (!v) return 'Nhập họ và tên';
  return HAS_LETTER.test(v) ? '' : 'Họ tên cần có chữ cái';
}

// Phần trước @ theo các ký tự email thường dùng, dấu chấm chỉ nằm giữa các chữ; tên miền có ít nhất một dấu chấm và đuôi từ 2 chữ cái
const EMAIL = /^[A-Za-z0-9_%+-]+(\.[A-Za-z0-9_%+-]+)*@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

export function emailError(value: string): string {
  const v = value.trim();
  if (!v) return '';
  if (v.length > PROFILE_MAX.email || !EMAIL.test(v)) return 'Email chưa đúng định dạng, VD: ten@gmail.com';
  return '';
}

// Có hoặc không có https://, tên miền Facebook, rồi đường dẫn tới trang cá nhân hay trang của tiệm (không có khoảng trắng)
const FACEBOOK = /^(https?:\/\/)?((www|m|web|mobile)\.)?(facebook\.com|fb\.com|fb\.me)\/[A-Za-z0-9._\-/?=&%#+]+$/i;

export function facebookError(value: string): string {
  const v = value.trim();
  if (!v) return '';
  return FACEBOOK.test(v) ? '' : 'Link Facebook chưa đúng, VD: facebook.com/tenban';
}

export function shopNameError(value: string): string {
  const v = value.trim();
  if (!v) return 'Nhập tên tiệm';
  return HAS_LETTER_OR_DIGIT.test(v) ? '' : 'Tên tiệm cần có chữ hoặc số';
}

/**
 * Số điện thoại Việt Nam: 10–11 chữ số bắt đầu bằng 0, +84 rồi 9–10 chữ số, hoặc hotline 1800/1900 có 8 hay 10 chữ số. Cho phép
 * khoảng trắng, dấu chấm, gạch và ngoặc để dễ đọc (VD "0901 234 567", "(028) 3822 1234", "1900 6522").
 */
export function shopPhoneError(value: string): string {
  const v = value.trim();
  if (!v) return '';
  const digits = v.replace(/[\s.()-]/g, '');
  if (!/^[0-9+\s.()-]+$/.test(v) || !/^((\+84|0)\d{9,10}|(1800|1900)(\d{4}|\d{6}))$/.test(digits)) return 'Số điện thoại chưa đúng, VD: 0901 234 567';
  return '';
}

export function addressError(value: string): string {
  const v = value.trim();
  if (!v) return '';
  return HAS_LETTER_OR_DIGIT.test(v) ? '' : 'Địa chỉ cần có chữ hoặc số';
}

/** Tên ngân hàng: chữ, số, khoảng trắng và vài dấu có trong tên đầy đủ hay tên chi nhánh (VD "BIDV", "VP Bank, CN Hà Nội"). */
export function bankNameError(value: string, account: string): string {
  const v = value.trim();
  if (!v) return account.trim() ? 'Nhập tên ngân hàng của số tài khoản này' : '';
  if (!/^[\p{L}\p{M}\p{N} .,&()/'-]+$/u.test(v) || !HAS_LETTER.test(v)) return "Tên ngân hàng cần có chữ, chỉ dùng thêm số và các dấu . , & ( ) / ' -";
  if (v.length < 2) return 'Tên ngân hàng quá ngắn';
  return '';
}

/** Bỏ khoảng trắng người dùng gõ để chia nhóm số (VD "0123 456 789"). */
export function normalizeBankAccount(value: string): string {
  return value.replace(/\s/g, '');
}

/** Số tài khoản ngân hàng ở Việt Nam chỉ có chữ số; độ dài thường từ 6 đến 19 số. */
export function bankAccountError(value: string, bankName: string): string {
  const v = normalizeBankAccount(value);
  if (!v) return bankName.trim() ? 'Nhập số tài khoản' : '';
  if (!/^\d+$/.test(v)) return 'Số tài khoản chỉ gồm chữ số';
  if (v.length < 6 || v.length > 19) return 'Số tài khoản cần từ 6 đến 19 chữ số';
  return '';
}
