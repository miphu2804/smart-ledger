/** Cách đăng nhập thành công gần nhất trên máy này, để màn đăng nhập gắn nhãn "Lần trước dùng" (như Runpod). */
export type SignInMethod = 'email' | 'google' | 'zalo';

const METHODS: readonly SignInMethod[] = ['email', 'google', 'zalo'];

/** Giá trị đọc từ bộ nhớ máy → cách đăng nhập, hoặc null khi trống hay không nhận ra (bản cũ từng lưu "facebook"). */
export function parseSignInMethod(raw: unknown): SignInMethod | null {
  return typeof raw === 'string' && (METHODS as readonly string[]).includes(raw) ? (raw as SignInMethod) : null;
}
