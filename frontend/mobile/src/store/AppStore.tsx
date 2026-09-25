import { router } from 'expo-router';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
import { authClient, AuthError } from '../lib/auth';
import { fromE164VN } from '../lib/auth/phone';
import { debugLog } from '../lib/debug';
import { describeError, isDisplayNameRequired } from '../lib/errors';
import { sessionApi } from '../lib/sessionApi';

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
  loggedIn: boolean;
  onboarded: boolean;
  /** id tiệm đang dùng (gửi qua header X-Shop-Id); null khi chưa có / đang mock */
  shopId: string | null;
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
  /** id các thông báo đã đọc */
  readNotifs: string[];
}

function initialState(): State {
  return {
    authReady: false,
    needsProfile: false,
    loggedIn: false,
    onboarded: true,
    shopId: null,
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
  };
}

/** Đổ SessionView (từ Core hoặc mock) vào state. Ở chế độ thật, không để dữ liệu mẫu (email, Facebook, địa chỉ…) lẫn vào tài khoản. */
function sessionPatch(st: State, s: SessionView): Partial<State> {
  const shop = s.shops[0];
  const industries = shop?.industries ?? (shop?.industry ? [shop.industry] : null);
  return {
    loggedIn: true,
    needsProfile: false,
    onboarded: !s.needsOnboarding,
    shopId: shop ? String(shop.id) : null,
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
          industries: industries ?? st.store.industries,
          bankName: USE_MOCK ? st.store.bankName : '',
          bankAccount: USE_MOCK ? st.store.bankAccount : '',
        }
      : st.store,
  };
}

let seq = 5000;
const uid = (p: string) => `${p}${++seq}`;

function useStoreValue() {
  const [s, setS] = useState<State>(initialState);
  const patch = useCallback((fn: (s: State) => Partial<State>) => setS((prev) => ({ ...prev, ...fn(prev) })), []);
  // Bản đồng bộ của s.loggedIn để các callback bất đồng bộ (Firebase, 401) đọc được giá trị mới nhất
  const loggedInRef = useRef(false);

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
          patch((st) => ({ ...sessionPatch(st, session), guideDismissed: false }));
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
        patch(() => ({ loggedIn: false, needsProfile: false, shopId: null }));
        await authClient.signOut().catch(() => undefined);
      },
      /** 401 từ Core hoặc Firebase báo hết phiên: đăng xuất và đưa về màn đăng nhập (hợp đồng: 401 → đăng xuất). */
      forceSignOut: async () => {
        const wasLoggedIn = loggedInRef.current;
        debugLog('session', 'forceSignOut', wasLoggedIn ? '(đang đăng nhập → về màn đăng nhập)' : '(chưa đăng nhập)');
        loggedInRef.current = false;
        patch(() => ({ loggedIn: false, needsProfile: false, shopId: null }));
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
      updateProfile: (user: Partial<State['user']>, store: Partial<State['store']>) =>
        patch((st) => ({ user: { ...st.user, ...user }, store: { ...st.store, ...store } })),
      dismissGuide: () => patch(() => ({ guideDismissed: true })),
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
  useEffect(() => {
    setActiveShop(s.shopId);
  }, [s.shopId]);

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
        if (signedIn) {
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

  return { ...s, ...actions };
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
