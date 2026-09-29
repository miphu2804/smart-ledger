/** "0901 234 567" -> "+84901234567" (E.164, định dạng Firebase yêu cầu) */
export function toE164VN(input: string): string {
  const d = input.replace(/\D/g, '');
  if (d.startsWith('84') && d.length >= 11) return `+${d}`;
  return `+84${d.replace(/^0/, '')}`;
}

/** "+84901234567" -> "0901234567" (dạng hiển thị trong app); số nước ngoài giữ nguyên */
export function fromE164VN(phone: string): string {
  return phone.startsWith('+84') ? `0${phone.slice(3)}` : phone;
}
