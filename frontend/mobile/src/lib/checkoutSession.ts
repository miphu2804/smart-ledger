import type { SaleDraftView, SaleView } from '../data/types';
import { ApiError } from './apiError';
import { canonicalJson } from './idempotency';
import type { SaleDraftWriteRequest } from './salesApi';

/**
 * Chốt một đơn bán qua đơn nháp: tạo nháp rồi `confirm`. Core chống trùng ở bước confirm theo `draftId` (không dùng
 * `Idempotency-Key`), còn tạo nháp thì không được bảo vệ — nên phải nhớ `draftId` giữa các lần bấm.
 *
 * Lỗi cần tránh: `confirm` bị timeout SAU khi Core đã chốt đơn (mất mạng đúng lúc trả lời). Nếu bấm lại mà tạo nháp mới
 * thì Core chốt thêm một đơn nữa cho cùng giỏ hàng: trùng doanh thu, trừ kho hai lần, có thể ghi nợ hai lần.
 *
 * Mỗi màn thanh toán dùng một phiên (`createCheckoutSession`); mỗi lần `submit`:
 * - chưa có nháp đang chờ → tạo nháp, rồi confirm;
 * - có nháp đang chờ (lần trước chưa biết kết quả hoặc bị Core từ chối) → hỏi lại Core về nháp đó trước:
 *   đã CONFIRMED → trả lại đơn đã ghi, KHÔNG tạo thêm; còn DRAFT và giỏ hàng không đổi → confirm lại chính nháp đó;
 *   giỏ hàng đã đổi → huỷ nháp cũ rồi tạo nháp mới; nháp đã mất/hết hạn → tạo mới.
 * - hai lần bấm gần như cùng lúc chỉ chạy một lần.
 */
export interface CheckoutDeps {
  createDraft(input: SaleDraftWriteRequest): Promise<SaleDraftView>;
  getDraft(id: number): Promise<SaleDraftView>;
  cancelDraft(id: number): Promise<void>;
  confirmDraft(id: number): Promise<SaleView>;
  getSale(id: number): Promise<SaleView>;
}

export interface CheckoutResult {
  sale: SaleView;
  /** true = đơn này đã được ghi từ một lần bấm trước, lần này không tạo thêm */
  recovered: boolean;
  /** Chỉ có nghĩa khi `recovered`: giỏ hàng hiện tại có đúng là giỏ hàng của đơn đã ghi không */
  sameCart: boolean;
}

export interface CheckoutSession {
  submit(input: SaleDraftWriteRequest): Promise<CheckoutResult>;
}

export function createCheckoutSession(deps: CheckoutDeps): CheckoutSession {
  let pending: { fingerprint: string; draftId: number } | null = null;
  let running: Promise<CheckoutResult> | null = null;

  async function run(input: SaleDraftWriteRequest): Promise<CheckoutResult> {
    const fingerprint = canonicalJson(input);

    if (pending) {
      const { draftId, fingerprint: pendingFingerprint } = pending;
      let draft: SaleDraftView | null = null;
      try {
        draft = await deps.getDraft(draftId);
      } catch (err) {
        // Lỗi mạng thì dừng và giữ nháp để thử lại; riêng 404 nghĩa là nháp không còn nên tạo mới.
        if (!(err instanceof ApiError && err.status === 404)) throw err;
        pending = null;
      }
      if (draft) {
        if (draft.status === 'CONFIRMED' && draft.confirmedSaleId != null) {
          const sale = await deps.getSale(draft.confirmedSaleId);
          pending = null;
          return { sale, recovered: true, sameCart: pendingFingerprint === fingerprint };
        }
        if (draft.status === 'DRAFT' && pendingFingerprint === fingerprint) {
          const sale = await deps.confirmDraft(draftId);
          pending = null;
          return { sale, recovered: false, sameCart: true };
        }
        if (draft.status === 'DRAFT') {
          try {
            await deps.cancelDraft(draftId);
          } catch {
            /* nháp mồ côi tự hết hạn; không để việc dọn dẹp chặn thanh toán */
          }
        }
        pending = null;
      }
    }

    const draft = await deps.createDraft(input);
    pending = { fingerprint, draftId: draft.id };
    const sale = await deps.confirmDraft(draft.id);
    pending = null;
    return { sale, recovered: false, sameCart: true };
  }

  return {
    submit(input) {
      if (running) return running;
      const current = run(input);
      running = current;
      const clear = () => {
        if (running === current) running = null;
      };
      current.then(clear, clear);
      return current;
    },
  };
}
