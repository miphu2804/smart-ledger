import { router } from 'expo-router';
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { USE_MOCK } from '../config';
import { generateExpenses, generateInvoices, mockDebts, mockProducts, mockStaff, mockStore, mockUser } from '../data/mock';
import type {
  Debt,
  Expense,
  Invoice,
  InvoiceEffects,
  InvoiceSource,
  LineItem,
  PayMethod,
  Product,
  SessionView,
  Staff,
} from '../data/types';
import { ApiError, setActiveShop, setUnauthorizedHandler } from '../lib/api';
import { DEFAULT_APP_SETTINGS, type AppSettings } from '../lib/appSettings';
import { loadAppSettings, saveAppSettings } from '../lib/appSettingsStorage';
import { authClient, AuthError } from '../lib/auth';
import { fromE164VN } from '../lib/auth/phone';
import { debugLog } from '../lib/debug';
import { describeError, isDisplayNameRequired } from '../lib/errors';
import { setFeedbackEnabled } from '../lib/feedback';
import { sessionApi } from '../lib/sessionApi';
import { loadLocalProfile, saveLocalProfile } from '../lib/localProfile';
import type { LocalProfile } from '../lib/localProfile.types';
import { industriesFromCore } from '../lib/shopProfile';

/**
 * Hồ sơ trên máy được đọc rồi ghi lại cả khối, nên hai lần cập nhật chạy chồng nhau (sửa hồ sơ, xem xong hướng dẫn, đã đọc
 * thông báo) có thể làm mất thay đổi của nhau. Mỗi tài khoản xếp hàng các lần cập nhật: lần sau đọc hồ sơ sau khi lần trước ghi xong.
 */
const localProfileWrites = new Map<string, Promise<void>>();

function updateLocalProfile(userId: string, changed: Partial<LocalProfile>): Promise<void> {
  const previous = localProfileWrites.get(userId) ?? Promise.resolve();
  const current = previous
    .catch(() => undefined)
    .then(async () => {
      const prev = await loadLocalProfile(userId);
      await saveLocalProfile(userId, { ...prev, ...changed });
    });
  localProfileWrites.set(userId, current);
  const clear = () => {
    if (localProfileWrites.get(userId) === current) localProfileWrites.delete(userId);
  };
  current.then(clear, clear);
  return current;
}

/** Đơn nháp đang chờ thanh toán (từ màn Giọng nói / POS / Nhập tay). */
export interface Draft {
  items: LineItem[];
  source: InvoiceSource;
  transcript?: string;
}

interface State {
  /** false cho tới khi SDK Firebase khôi phục xong phiên đã lưu — màn splash chờ cờ này */
  authReady: boolean;
  /** Firebase còn đăng nhập nhưng Core chưa có tài khoản (thoát app giữa chừng ở bước nhập tên) */
  needsProfile: boolean;
  /** Firebase còn đăng nhập bằng email + mật khẩu nhưng email chưa xác minh (thoát app giữa chừng ở bước xác minh) */
  needsEmailVerification: boolean;
  loggedIn: boolean;
  onboarded: boolean;
  /** id tiệm đang dùng (gửi qua header X-Shop-Id); null khi chưa có / đang mock */
  shopId: string | null;
  /** id tài khoản Core, dùng làm khoá hồ sơ lưu trên máy (`localProfile`); null khi chưa đăng nhập */
  userId: string | null;
  user: typeof mockUser;
  store: typeof mockStore;
  products: Product[];
  invoices: Invoice[];
  expenses: Expense[];
  debts: Debt[];
  staff: Staff[];
  cart: Record<string, number>;
  draft: Draft | null;
  guideDismissed: boolean;
  /** id các thông báo tính trên máy đã đọc (lưu theo tài khoản ở hồ sơ trên máy) */
  readNotifs: string[];
  /** Lần "Xoá toàn bộ thông báo" gần nhất (ISO), null là chưa xoá; lưu theo tài khoản ở hồ sơ trên máy */
  notifClearedAt: string | null;
}

function initialState(): State {
  return {
    authReady: false,
    needsProfile: false,
    needsEmailVerification: false,
    loggedIn: false,
    onboarded: true,
    shopId: null,
    userId: null,
    user: { ...mockUser },
    store: { ...mockStore },
    products: mockProducts.map((p) => ({ ...p })),
    invoices: generateInvoices(),
    expenses: generateExpenses(),
    debts: mockDebts.map((d) => ({ ...d, history: [...d.history] })),
    staff: mockStaff.map((s) => ({ ...s })),
    cart: {},
    draft: null,
    guideDismissed: true,
    readNotifs: [],
    notifClearedAt: null,
  };
}

/** Đổ SessionView (từ Core hoặc mock) vào state. Ở chế độ thật, không để dữ liệu mẫu (email, Facebook, địa chỉ…) lẫn vào tài khoản. */
function sessionPatch(st: State, s: SessionView): Partial<State> {
  const shop = s.shops[0];
  // Core lưu các ngành đã chọn thành MỘT chuỗi "food, drink"; tách lại, nếu không màn hồ sơ không nhận ra ngành nào.
  const fromCore = industriesFromCore(shop?.industry);
  const industries = shop?.industries ?? (fromCore.length ? fromCore : null);
  return {
    loggedIn: true,
    needsProfile: false,
    needsEmailVerification: false,
    onboarded: !s.needsOnboarding,
    shopId: shop ? String(shop.id) : null,
    userId: String(s.user.id),
    user: {
      ...st.user,
      name: s.user.displayName || (USE_MOCK ? st.user.name : 'Bạn'),
      phone: s.user.phone ? fromE164VN(s.user.phone) : USE_MOCK ? st.user.phone : '',
      email: USE_MOCK ? st.user.email : (s.user.email ?? ''),
      facebook: USE_MOCK ? st.user.facebook : '',
    },
    store: shop
      ? {
          ...st.store,
          name: shop.name,
          address: shop.address ?? (USE_MOCK ? st.store.address : ''),
          phone: shop.phone ?? (USE_MOCK ? st.store.phone : ''),
          industries: industries ?? st.store.industries,
          bankName: USE_MOCK ? st.store.bankName : '',
          bankAccount: USE_MOCK ? st.store.bankAccount : '',
        }
      : st.store,
  };
}

/** Bỏ các trường `undefined` (chuỗi rỗng giữ lại: người dùng xoá trắng một ô cũng phải được lưu). */
function definedOnly<T extends Record<string, string | undefined>>(o: T): Partial<Record<keyof T, string>> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<Record<keyof T, string>>;
}

let seq = 5000;
/** Số id thông báo đã đọc giữ lại trong hồ sơ trên máy */
const READ_NOTIFS_KEPT = 300;
const uid = (p: string) => `${p}${++seq}`;

function useStoreValue() {
  const [s, setS] = useState<State>(initialState);
  const patch = useCallback((fn: (s: State) => Partial<State>) => setS((prev) => ({ ...prev, ...fn(prev) })), []);
  // Bản đồng bộ của s.loggedIn để các callback bất đồng bộ (Firebase, 401) đọc được giá trị mới nhất
  const loggedInRef = useRef(false);
  // id tài khoản hiện tại cho các action (đọc/ghi hồ sơ trên máy)
  const userIdRef = useRef<string | null>(null);

  // Tuỳ chọn ở Cài đặt (rung, cảnh báo hàng): theo máy chứ không theo tài khoản, nên để ngoài `s` (đăng xuất không đặt lại).
  // Chỉ ghi xuống máy sau khi đã đọc xong bản đã lưu, để giá trị mặc định lúc mở app không đè lên lựa chọn cũ.
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const settingsLoaded = useRef(false);
  useEffect(() => {
    let alive = true;
    void loadAppSettings().then((saved) => {
      if (!alive) return;
      settingsLoaded.current = true;
      setSettings(saved);
    });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    setFeedbackEnabled(settings.haptics);
    if (settingsLoaded.current) void saveAppSettings(settings);
  }, [settings]);
  const setSetting = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => setSettings((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const actions = useMemo(
    () => ({
      // --- auth / hồ sơ ---
      /**
       * Gọi SAU khi Firebase đã xác thực xong (màn OTP): đổi ID token lấy phiên ở Core (POST /auth/session),
       * rồi vào app. Trả SessionView để màn hình biết đi tiếp: needsOnboarding → tạo tiệm, ngược lại → Trang chủ.
       */
      signIn: async (displayName?: string): Promise<SessionView> => {
        try {
          const session = await sessionApi.create(displayName);
          if (session.role !== 'OWNER') throw new AuthError('not-owner');
          loggedInRef.current = true;
          patch((st) => sessionPatch(st, session));
          debugLog('session', 'signIn ✓', `role=${session.role}`, `needsOnboarding=${session.needsOnboarding}`);
          return session;
        } catch (e) {
          debugLog('session', 'signIn ✗', describeError(e));
          // Tài khoản mới chưa gửi tên: giữ phiên Firebase để màn "Bạn tên gì?" gửi lại kèm displayName.
          // Lỗi khác: không để Firebase đã đăng nhập mà app chưa có phiên → đăng xuất hẳn.
          if (!isDisplayNameRequired(e)) await authClient.signOut().catch(() => undefined);
          throw e;
        }
      },
      logout: async () => {
        loggedInRef.current = false;
        patch(() => ({ loggedIn: false, needsProfile: false, needsEmailVerification: false, shopId: null, userId: null }));
        await authClient.signOut().catch(() => undefined);
      },
      enterDevApp: () => {
        if (!__DEV__) return;
        loggedInRef.current = true;
        patch(() => ({ authReady: true, loggedIn: true, onboarded: true, needsProfile: false, needsEmailVerification: false, guideDismissed: true }));
      },
      /** 401 từ Core hoặc Firebase báo hết phiên: đăng xuất và đưa về màn đăng nhập (hợp đồng: 401 → đăng xuất). */
      forceSignOut: async () => {
        const wasLoggedIn = loggedInRef.current;
        debugLog('session', 'forceSignOut', wasLoggedIn ? '(đang đăng nhập → về màn đăng nhập)' : '(chưa đăng nhập)');
        loggedInRef.current = false;
        patch(() => ({ loggedIn: false, needsProfile: false, needsEmailVerification: false, shopId: null, userId: null }));
        await authClient.signOut().catch(() => undefined);
        if (wasLoggedIn) {
          try {
            router.replace('/(auth)/welcome');
          } catch {
            /* navigator chưa sẵn sàng */
          }
        }
      },
      /** Tạo tiệm lần đầu (POST /shops). Lỗi được ném ra để màn hình hiển thị. */
      finishOnboarding: async (storeName: string, industries: string[]) => {
        const shop = await sessionApi.createShop({ name: storeName.trim(), industries });
        patch((st) => ({
          onboarded: true,
          shopId: String(shop.id),
          store: { ...st.store, name: shop.name || st.store.name, industries },
        }));
      },
      /**
       * Sửa hồ sơ trên máy. Họ tên, email, Facebook và tài khoản nhận chuyển khoản Core chưa có chỗ lưu nên ghi thêm vào hồ sơ
       * trên máy của tài khoản này (`localProfile`), để đăng xuất rồi đăng nhập lại vẫn còn.
       */
      updateProfile: (user: Partial<State['user']>, store: Partial<State['store']>) => {
        patch((st) => ({ user: { ...st.user, ...user }, store: { ...st.store, ...store } }));
        const id = userIdRef.current;
        if (!id) return;
        const changed = definedOnly({
          name: user.name,
          email: user.email,
          facebook: user.facebook,
          bankName: store.bankName,
          bankAccount: store.bankAccount,
        });
        void updateLocalProfile(id, changed);
      },
      /** Đóng hướng dẫn (xong hoặc bỏ qua) và nhớ trên máy cho tài khoản này để lần sau không tự mở lại */
      dismissGuide: () => {
        patch(() => ({ guideDismissed: true }));
        const id = userIdRef.current;
        if (id) void updateLocalProfile(id, { guideSeen: true });
      },
      /** Mở lại phần giới thiệu ở Tổng quan (mục "Xem lại hướng dẫn" ở tab Quản lý) */
      showGuide: () => patch(() => ({ guideDismissed: false })),
      /** Ẩn mọi thông báo tới trước `at` (ISO) trên máy này: "Xoá toàn bộ thông báo" khi Core chưa có API xoá */
      clearNotifications: (at: string) => patch(() => ({ notifClearedAt: at })),
      markNotifsRead: (ids: string[]) =>
        patch((st) => ({ readNotifs: Array.from(new Set([...st.readNotifs, ...ids])) })),
      resetMock: () => setS((prev) => ({ ...initialState(), loggedIn: true, authReady: true, shopId: prev.shopId })),

      // --- giỏ hàng POS ---
      addToCart: (productId: string, delta = 1) =>
        patch((st) => {
          const q = Math.max(0, (st.cart[productId] ?? 0) + delta);
          const cart = { ...st.cart, [productId]: q };
          if (!q) delete cart[productId];
          return { cart };
        }),
      clearCart: () => patch(() => ({ cart: {} })),
      setDraft: (draft: Draft | null) => patch(() => ({ draft })),

      // --- hoá đơn ---
      createInvoice: (input: {
        items: LineItem[];
        customer?: string;
        phone?: string;
        method: PayMethod;
        source: InvoiceSource;
        transcript?: string;
      }) => {
        const id = uid('inv');
        patch((st) => {
          const code = `HD${1000 + st.invoices.length + 1}`;
          const inv: Invoice = {
            id,
            code,
            createdAt: new Date().toISOString(),
            items: input.items,
            customer: input.customer?.trim() || 'Khách lẻ',
            method: input.method,
            source: input.source,
            staffId: 's1',
            status: input.method === 'debt' ? 'debt' : 'paid',
            transcript: input.transcript,
          };
          const effects: InvoiceEffects = { stock: [] };
          const products = st.products.map((p) => {
            const li = input.items.find((i) => i.productId === p.id);
            if (!li || !p.tracked) return p;
            const qty = Math.min(p.stock, li.qty);
            if (qty > 0) effects.stock.push({ productId: p.id, qty });
            return { ...p, stock: p.stock - qty };
          });
          let debts = st.debts;
          if (input.method === 'debt') {
            const total = input.items.reduce((a, i) => a + i.price * i.qty, 0);
            const name = input.customer?.trim() || 'Khách lẻ';
            const note = `Mua ${input.items.map((i) => `${i.qty} ${i.name}`).join(', ')}`;
            const ex = st.debts.find((d) => d.name.toLowerCase() === name.toLowerCase());
            const entry = { at: inv.createdAt, amount: total, note };
            const debtId = ex ? ex.id : uid('d');
            effects.debt = { debtId, amount: total };
            debts = ex
              ? st.debts.map((d) =>
                  d === ex ? { ...d, total: d.total + total, lastDate: inv.createdAt, history: [entry, ...d.history] } : d,
                )
              : [
                  { id: debtId, name, phone: input.phone ?? '', total, paid: 0, lastDate: inv.createdAt, history: [entry] },
                  ...st.debts,
                ];
          }
          return { invoices: [{ ...inv, effects }, ...st.invoices], products, debts, cart: {}, draft: null };
        });
        return id;
      },
      updateInvoice: (id: string, items: LineItem[], customer?: string) =>
        patch((st) => ({
          invoices: st.invoices.map((i) => (i.id === id ? { ...i, items, customer: customer ?? i.customer } : i)),
        })),
      cancelInvoice: (id: string) =>
        patch((st) => {
          const inv = st.invoices.find((i) => i.id === id);
          // Đã huỷ rồi thì không hoàn tác kho / nợ lần nữa
          if (!inv || inv.status === 'cancelled') return {};
          const fx = inv.effects;
          const products = fx?.stock.length
            ? st.products.map((p) => {
                const s = fx.stock.find((x) => x.productId === p.id);
                return s ? { ...p, stock: p.stock + s.qty } : p;
              })
            : st.products;
          const debtFx = fx?.debt;
          const debts = debtFx
            ? st.debts.map((d) => {
                if (d.id !== debtFx.debtId) return d;
                const total = Math.max(0, d.total - debtFx.amount);
                const entry = { at: new Date().toISOString(), amount: -debtFx.amount, note: `Huỷ đơn ${inv.code}` };
                return { ...d, total, paid: Math.min(d.paid, total), history: [entry, ...d.history] };
              })
            : st.debts;
          return {
            invoices: st.invoices.map((i) => (i.id === id ? { ...i, status: 'cancelled' as const } : i)),
            products,
            debts,
          };
        }),

      // --- hàng hoá ---
      findProductByBarcode: (rawBarcode: string): Product | undefined => {
        const code = rawBarcode.trim();
        if (!code) return undefined;
        return s.products.find(
          (p) =>
            p.barcode === code ||
            p.id.toLowerCase() === code.toLowerCase() ||
            (p.barcode && p.barcode.replace(/\D/g, '') === code.replace(/\D/g, ''))
        );
      },
      addProduct: (p: Omit<Product, 'id'>) => {
        const id = uid('p');
        patch((st) => ({ products: [{ ...p, id }, ...st.products] }));
        return id;
      },
      updateProduct: (id: string, p: Partial<Product>) =>
        patch((st) => ({ products: st.products.map((x) => (x.id === id ? { ...x, ...p } : x)) })),
      deleteProduct: (id: string) => patch((st) => ({ products: st.products.filter((x) => x.id !== id) })),

      // --- chi phí ---
      addExpense: (e: Omit<Expense, 'id' | 'createdAt'>) =>
        patch((st) => ({ expenses: [{ ...e, id: uid('e'), createdAt: new Date().toISOString() }, ...st.expenses] })),
      deleteExpense: (id: string) => patch((st) => ({ expenses: st.expenses.filter((e) => e.id !== id) })),

      // --- công nợ ---
      payDebt: (id: string, amount: number) =>
        patch((st) => ({
          debts: st.debts.map((d) =>
            d.id === id
              ? {
                  ...d,
                  paid: Math.min(d.total, d.paid + amount),
                  lastDate: new Date().toISOString(),
                  history: [{ at: new Date().toISOString(), amount: -amount, note: 'Khách trả tiền' }, ...d.history],
                }
              : d,
          ),
        })),
      removeDebt: (id: string) => patch((st) => ({ debts: st.debts.filter((d) => d.id !== id) })),

      // --- nhân viên ---
      addStaff: (name: string, role: string, phone: string) =>
        patch((st) => ({ staff: [...st.staff, { id: uid('s'), name, role, phone, active: true }] })),
      toggleStaff: (id: string) =>
        patch((st) => ({ staff: st.staff.map((x) => (x.id === id ? { ...x, active: !x.active } : x)) })),
    }),
    [patch],
  );

  useEffect(() => {
    loggedInRef.current = s.loggedIn;
  }, [s.loggedIn]);
  useLayoutEffect(() => {
    setActiveShop(s.shopId);
  }, [s.shopId]);

  // Đã đọc / đã xoá thông báo: ghi xuống hồ sơ trên máy của tài khoản, chỉ sau khi đã đọc xong bản đã lưu (không đè bằng
  // danh sách rỗng lúc mới đăng nhập). Chỉ giữ các id gần nhất để file không phình mãi.
  const notifLoadedFor = useRef<string | null>(null);
  useEffect(() => {
    const id = s.userId;
    if (!id || notifLoadedFor.current !== id) return;
    const changed = { readNotifs: s.readNotifs.slice(-READ_NOTIFS_KEPT), ...definedOnly({ notifClearedAt: s.notifClearedAt ?? undefined }) };
    void updateLocalProfile(id, changed);
  }, [s.userId, s.readNotifs, s.notifClearedAt]);

  // Đăng nhập (hoặc khôi phục phiên) xong: phủ phần hồ sơ đã lưu trên máy của tài khoản này lên dữ liệu từ Core
  useEffect(() => {
    userIdRef.current = s.userId;
    if (!s.userId) return;
    let alive = true;
    const userId = s.userId;
    void loadLocalProfile(userId).then((saved) => {
      if (!alive) return;
      if (saved) {
        const { name, email, facebook, bankName, bankAccount } = saved;
        patch((st) => ({
          user: { ...st.user, ...definedOnly({ name, email, facebook }) },
          store: { ...st.store, ...definedOnly({ bankName, bankAccount }) },
          readNotifs: Array.from(new Set([...(saved.readNotifs ?? []), ...st.readNotifs])),
          notifClearedAt: saved.notifClearedAt ?? st.notifClearedAt,
        }));
      }
      // Tài khoản chưa xem hướng dẫn trên máy này (mới đăng ký, lần đầu đăng nhập ở máy này) thì mở hướng dẫn ở Tổng quan; đã
      // xem thì đóng, kể cả khi tài khoản trước trên máy còn để hướng dẫn mở
      patch(() => ({ guideDismissed: Boolean(saved?.guideSeen) }));
      notifLoadedFor.current = userId;
    });
    return () => {
      alive = false;
    };
  }, [s.userId, patch]);

  // Khởi động: chờ SDK khôi phục phiên Firebase đã lưu; còn đăng nhập thì lấy lại phiên ở Core (GET /me).
  useEffect(() => {
    setUnauthorizedHandler(() => void actions.forceSignOut());
    const ready = () => patch(() => ({ authReady: true }));
    const fallback = setTimeout(ready, 8000); // SDK không phản hồi thì vẫn cho vào màn đăng nhập
    let first = true;
    const unsubscribe = authClient.onAuthStateChanged(async (signedIn) => {
      if (first) {
        first = false;
        clearTimeout(fallback);
        debugLog('session', 'khởi động: Firebase', signedIn ? 'còn đăng nhập → gọi /me' : 'chưa đăng nhập');
        if (signedIn && authClient.needsEmailVerification()) {
          // Chưa xác minh email thì chưa lấy phiên ở Core; splash đưa về màn xác minh
          patch(() => ({ needsEmailVerification: true }));
        } else if (signedIn) {
          try {
            const session = await sessionApi.me();
            if (session.role !== 'OWNER') throw new AuthError('not-owner');
            loggedInRef.current = true;
            patch((st) => sessionPatch(st, session));
            debugLog('session', '/me ✓', `role=${session.role}`, `needsOnboarding=${session.needsOnboarding}`);
          } catch (e) {
            debugLog('session', '/me ✗', describeError(e));
            if (e instanceof ApiError && e.status === 404 && e.code === 'auth_profile_not_found') {
              // Firebase còn đăng nhập nhưng Core chưa có tài khoản → vào lại bước nhập tên
              patch(() => ({ needsProfile: true }));
            } else if (e instanceof AuthError || (e instanceof ApiError && e.status === 403)) {
              // Sai vai trò hoặc tài khoản bị khoá → đăng xuất hẳn
              await authClient.signOut().catch(() => undefined);
            }
            // 401 đã được handler xử lý; lỗi mạng thì giữ phiên Firebase, lần mở sau thử lại
          }
        }
        ready();
      } else if (!signedIn && loggedInRef.current) {
        void actions.forceSignOut(); // phiên bị thu hồi / hết hiệu lực ở phía Firebase
      }
    });
    return () => {
      clearTimeout(fallback);
      unsubscribe();
      setUnauthorizedHandler(null);
    };
  }, [actions, patch]);

  return { ...s, ...actions, settings, setSetting };
}

type Store = ReturnType<typeof useStoreValue>;
const Ctx = createContext<Store | null>(null);

export function AppStoreProvider({ children }: { children: React.ReactNode }) {
  const value = useStoreValue();
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppStoreProvider');
  return v;
}
