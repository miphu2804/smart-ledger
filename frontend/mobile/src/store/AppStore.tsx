import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { generateExpenses, generateInvoices, mockDebts, mockProducts, mockStaff, mockStore, mockUser } from '../data/mock';
import type { Debt, Expense, Invoice, InvoiceSource, LineItem, PayMethod, Product, Staff } from '../data/types';

/** Đơn nháp đang chờ thanh toán (từ màn Giọng nói / POS / Nhập tay). */
export interface Draft {
  items: LineItem[];
  source: InvoiceSource;
  transcript?: string;
}

interface State {
  loggedIn: boolean;
  onboarded: boolean;
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
}

function initialState(): State {
  return {
    loggedIn: false,
    onboarded: true,
    user: { ...mockUser },
    store: { ...mockStore },
    products: mockProducts.map((p) => ({ ...p })),
    invoices: generateInvoices(),
    expenses: generateExpenses(),
    debts: mockDebts.map((d) => ({ ...d, history: [...d.history] })),
    staff: mockStaff.map((s) => ({ ...s })),
    cart: {},
    draft: null,
    guideDismissed: false,
  };
}

let seq = 5000;
const uid = (p: string) => `${p}${++seq}`;

function useStoreValue() {
  const [s, setS] = useState<State>(initialState);
  const patch = useCallback((fn: (s: State) => Partial<State>) => setS((prev) => ({ ...prev, ...fn(prev) })), []);

  const actions = useMemo(
    () => ({
      // --- auth / hồ sơ ---
      login: (phone: string, isNew: boolean) =>
        patch((st) => ({ loggedIn: true, onboarded: !isNew, user: { ...st.user, phone: phone || st.user.phone } })),
      logout: () => patch(() => ({ loggedIn: false })),
      finishOnboarding: (storeName: string, industries: string[]) =>
        patch((st) => ({ onboarded: true, store: { ...st.store, name: storeName || st.store.name, industries } })),
      updateProfile: (user: Partial<State['user']>, store: Partial<State['store']>) =>
        patch((st) => ({ user: { ...st.user, ...user }, store: { ...st.store, ...store } })),
      dismissGuide: () => patch(() => ({ guideDismissed: true })),
      resetMock: () => setS({ ...initialState(), loggedIn: true }),

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
          const products = st.products.map((p) => {
            const li = input.items.find((i) => i.productId === p.id);
            return li && p.tracked ? { ...p, stock: Math.max(0, p.stock - li.qty) } : p;
          });
          let debts = st.debts;
          if (input.method === 'debt') {
            const total = input.items.reduce((a, i) => a + i.price * i.qty, 0);
            const name = input.customer?.trim() || 'Khách lẻ';
            const note = `Mua ${input.items.map((i) => `${i.qty} ${i.name}`).join(', ')}`;
            const ex = st.debts.find((d) => d.name.toLowerCase() === name.toLowerCase());
            const entry = { at: inv.createdAt, amount: total, note };
            debts = ex
              ? st.debts.map((d) =>
                  d === ex ? { ...d, total: d.total + total, lastDate: inv.createdAt, history: [entry, ...d.history] } : d,
                )
              : [
                  { id: uid('d'), name, phone: input.phone ?? '', total, paid: 0, lastDate: inv.createdAt, history: [entry] },
                  ...st.debts,
                ];
          }
          return { invoices: [inv, ...st.invoices], products, debts, cart: {}, draft: null };
        });
        return id;
      },
      updateInvoice: (id: string, items: LineItem[], customer?: string) =>
        patch((st) => ({
          invoices: st.invoices.map((i) => (i.id === id ? { ...i, items, customer: customer ?? i.customer } : i)),
        })),
      cancelInvoice: (id: string) =>
        patch((st) => ({ invoices: st.invoices.map((i) => (i.id === id ? { ...i, status: 'cancelled' } : i)) })),

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
