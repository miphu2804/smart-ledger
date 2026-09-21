import { MOCK_OTP } from '../../data/mock';
import { AuthClient, AuthError } from './types';

/** Bản giả lập (USE_MOCK=true): mã OTP luôn là MOCK_OTP, trạng thái đăng nhập chỉ nằm trong bộ nhớ — không cần Firebase. */
let signedIn = false;
let phone = '';
let email = '';
const emailAccounts = new Map<string, string>(); // email -> mật khẩu
const listeners = new Set<(signedIn: boolean) => void>();
const notify = () => listeners.forEach((cb) => cb(signedIn));
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const normalize = (e: string) => e.trim().toLowerCase();

function loginAs(kind: { phone: string } | { email: string }) {
  phone = 'phone' in kind ? kind.phone : '';
  email = 'email' in kind ? kind.email : '';
  signedIn = true;
  notify();
}

export const mockAuth: AuthClient = {
  async sendOtp(phoneE164) {
    await sleep(300);
    return {
      async confirm(code) {
        await sleep(600);
        if (code !== MOCK_OTP) throw new AuthError('invalid-code', `Mã OTP không đúng. Thử lại với ${MOCK_OTP}`);
        loginAs({ phone: phoneE164 });
      },
    };
  },
  async signInWithEmail(rawEmail, password) {
    await sleep(400);
    const e = normalize(rawEmail);
    if (emailAccounts.get(e) !== password) throw new AuthError('invalid-credentials');
    loginAs({ email: e });
  },
  async signUpWithEmail(rawEmail, password) {
    await sleep(400);
    const e = normalize(rawEmail);
    if (!/^\S+@\S+\.\S+$/.test(e)) throw new AuthError('invalid-email');
    if (password.length < 6) throw new AuthError('weak-password');
    if (emailAccounts.has(e)) throw new AuthError('email-in-use');
    emailAccounts.set(e, password);
    loginAs({ email: e });
  },
  async getIdToken() {
    return signedIn ? 'mock-id-token' : null;
  },
  async signOut() {
    signedIn = false;
    email = '';
    notify();
  },
  onAuthStateChanged(cb) {
    listeners.add(cb);
    // Giống SDK thật: báo trạng thái ban đầu bất đồng bộ
    void Promise.resolve().then(() => listeners.has(cb) && cb(signedIn));
    return () => {
      listeners.delete(cb);
    };
  },
  currentPhone: () => phone || null,
  currentEmail: () => email || null,
};
