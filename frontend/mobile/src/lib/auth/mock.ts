import { AuthClient, AuthError } from './types';

/** Bản giả lập (USE_MOCK=true): trạng thái đăng nhập chỉ nằm trong bộ nhớ — không cần Firebase. */
let signedIn = false;
let phone = '';
let email = '';
/** true khi tài khoản email vừa đăng ký chưa bấm xác minh; bản mock coi việc "Tôi đã xác minh" là đủ. */
let unverified = false;
const emailAccounts = new Map<string, string>(); // email -> mật khẩu
const listeners = new Set<(signedIn: boolean) => void>();
const notify = () => listeners.forEach((cb) => cb(signedIn));
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const normalize = (e: string) => e.trim().toLowerCase();

function loginAs(kind: { email: string }, needsVerification = false) {
  phone = '';
  email = kind.email;
  unverified = needsVerification;
  signedIn = true;
  notify();
}

/** Tài khoản Facebook giả lập: bản mock không có Facebook thật, nên luôn đăng nhập vào cùng một người dùng mẫu. */
const MOCK_FACEBOOK_EMAIL = 'facebook.demo@example.com';

export const mockAuth: AuthClient = {
  async signInWithFacebook() {
    await sleep(500);
    loginAs({ email: MOCK_FACEBOOK_EMAIL });
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
    loginAs({ email: e }, true);
  },
  async sendPasswordReset(rawEmail) {
    await sleep(400);
    if (!/^\S+@\S+\.\S+$/.test(normalize(rawEmail))) throw new AuthError('invalid-email');
  },
  async sendEmailVerification() {
    await sleep(300);
  },
  needsEmailVerification: () => signedIn && unverified,
  async refreshEmailVerified() {
    await sleep(500);
    unverified = false;
    return true;
  },
  async getIdToken() {
    return signedIn ? 'mock-id-token' : null;
  },
  async signOut() {
    signedIn = false;
    unverified = false;
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
