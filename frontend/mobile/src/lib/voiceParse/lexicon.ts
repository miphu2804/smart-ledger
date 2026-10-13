/** Từ vựng dùng chung cho tagger luật và đặc trưng CRF (đều ở dạng bỏ dấu, trừ khi ghi rõ). */
import { fold, UNITS } from '../parseOrder';

/** Đơn vị/loại từ đứng sau số lượng ("hai BAO gạo") hoặc thay số lượng 1 ("lấy CHAI nước mắm"). */
export const UNIT_WORDS = new Set([
  ...UNITS,
  'bao', 'vi', 'hu', 'cay', 'tuyp', 'tup', 'tui', 'can', 'lit', 'loc', 'xien', 'cuon', 'cap', 'khay', 'thanh', 'vien',
  'chiec', 'doi', 'suat', 'binh', 'chen', 'bat', 'lang', 'xap', 'mieng', 'cu', 'trai', 'con',
]);
/** Cách viết có dấu của đơn vị: "ờ"/"ở" không phải "ổ", "bò" không phải "bó", "tố" không phải "tô". */
export const UNIT_RAW = new Set([
  'ly', 'ổ', 'chai', 'lon', 'gói', 'bịch', 'ký', 'kí', 'kg', 'ki', 'hộp', 'cái', 'phần', 'tô', 'dĩa', 'đĩa', 'bó', 'cốc',
  'trái', 'quả', 'thùng', 'bao', 'vỉ', 'hũ', 'cây', 'tuýp', 'túp', 'túi', 'can', 'lít', 'lốc', 'xiên', 'cuộn', 'cặp',
  'khay', 'thanh', 'viên', 'chiếc', 'đôi', 'suất', 'bình', 'chén', 'bát', 'lạng', 'xấp', 'miếng', 'củ', 'con',
]);

/**
 * Từ đệm, xưng hô, từ cảm thán (viết có dấu): không thuộc tên món mới; món trong danh mục có chữ trùng thì gazetteer
 * quyết. Viết có dấu để "ô" (trà ô long) không lẫn với "ờ", "đá" không lẫn với "dạ".
 */
export const FILLER_RAW = new Set([
  'cho', 'cô', 'có', 'chú', 'anh', 'chị', 'em', 'bán', 'bạn', 'lấy', 'mua', 'nha', 'nhé', 'nhe', 'nhen', 'đi', 'dì',
  'thêm', 'khách', 'mình', 'tôi', 'tui', 'con', 'à', 'ạ', 'á', 'a', 'ả', 'ah', 'ak', 'hả', 'há', 'ha', 'ờ', 'ơ', 'ở',
  'o', 'ừ', 'ừm', 'ư', 'u', 'um', 'uh', 'mmm', 'hmm', 'dạ', 'ơi', 'thôi', 'luôn', 'nữa', 'xong', 'rồi', 'vậy', 'thế',
  'thì', 'là', 'nè', 'nghe', 'đây', 'đấy', 'này', 'kia', 'cái', 'gì', 'hộ', 'cháu', 'bác', 'cậu', 'ông', 'bà', 'ghi',
  'tính', 'giúp', 'với', 'và', 'cũng', 'cùng', 'không', 'được', 'nhiều', 'ít', 'lại', 'để', 'xem', 'cần', 'đang',
  'của', 'quán', 'chừng', 'tiền', 'hàng', 'ấy', 'ui', 'mà', 'như', 'vợ', 'chồng', 'oke', 'ok', 'uk', 'vâng',
]);
/** Dạng bỏ dấu của từ đệm, chỉ dùng khi câu gõ không dấu. */
export const FILLER_WORDS = new Set([...FILLER_RAW].map(fold));

/** Động từ bán/gọi món: cụm tên đứng sau chúng là món (kể cả món chưa có trong danh mục). */
export const SALE_VERBS = new Set(['ban', 'lay', 'cho', 'ghi', 'them', 'goi', 'order', 'mua', 'xin']);
/** Cách viết có dấu của động từ bán: "mưa" không phải "mua", "gỏi" không phải "gọi", "bạn" không phải "bán". */
export const SALE_VERBS_RAW = new Set(['bán', 'lấy', 'cho', 'ghi', 'thêm', 'gọi', 'order', 'mua', 'xin']);

/**
 * Từ hay gặp khi nói chuyện chứ không phải tên món (động từ, tính từ, thời gian), viết có dấu để không lẫn với chữ
 * trùng khi bỏ dấu ("mưa"/"mua", "đắt"/"đất"). Món trong danh mục có chữ trùng thì gazetteer vẫn giữ.
 */
export const CHAT_RAW = new Set([
  'hôm', 'nay', 'qua', 'mai', 'giờ', 'lát', 'sáng', 'trưa', 'chiều', 'tối', 'đêm', 'tuần', 'tháng',
  'trời', 'mưa', 'nắng', 'lạnh', 'nóng', 'vắng', 'đông', 'đắt', 'rẻ', 'mắc', 'chậm', 'nhanh', 'quá', 'lắm', 'hơi',
  'rất', 'nên', 'vì', 'nhưng', 'mà', 'thì', 'là', 'nếu', 'khi', 'đã', 'đang', 'sẽ', 'chưa', 'hết', 'còn', 'vẫn',
  'cũng', 'lại', 'tiếp', 'nữa', 'xong', 'rồi', 'đâu', 'sao', 'gì', 'nào', 'ai', 'nhiêu', 'mấy', 'tính',
  'xem', 'đọc', 'nghe', 'nói', 'hỏi', 'gọi', 'đóng', 'mở', 'tắt', 'bật', 'đổi', 'đợi', 'chờ', 'đi', 'về', 'đến',
  'tới', 'làm', 'biết', 'nhớ', 'quên', 'cần', 'muốn', 'thích', 'được', 'bị', 'có', 'không', 'sổ', 'tổng', 'giá',
  'cửa', 'máy', 'ca', 'điện', 'thoại', 'khách', 'chồng', 'vợ', 'con', 'nhà', 'tiệm', 'quán', 'chợ', 'bận',
  'mệt', 'vui', 'buồn', 'ổn', 'tốt', 'xấu', 'giúp', 'dùm', 'giùm', 'coi', 'kiểm', 'lượng',
]);

/** Từ nối giữa hai món khi nói liền ("hai cà phê VÀ một bánh mì"), như `DELIMITER_WORDS` của parseOrder. */
export const DELIMITERS = new Set(['voi', 'them', 'va', 'kem', 'cung', 'nha', 'nhe', 'roi', 'xong']);

/** Sau "trà" là các từ này thì là món trà chứ không phải "trả" tiền (như parseOrder). */
export { TEA_WORDS } from '../parseOrder';
