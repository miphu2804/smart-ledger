import type { SaleView, SaleVoidView } from '../data/types';
import { vnd } from './format';

/**
 * Huỷ cả đơn đã chốt: `POST /api/v1/sales/{saleId}/void` (docs/contracts/api-contracts.md, "Hủy toàn bộ và hoàn tiền").
 * Core hoàn TOÀN BỘ tiền đã thu của đơn (kể cả tiền khách trả nợ sau đó), huỷ phần nợ còn dư và tuỳ chọn hoàn hàng về kho.
 * Không có hoàn một phần. Hoàn tiền chỉ là ghi nhận: Core không tự chuyển tiền qua ngân hàng.
 */

export const VOID_REASON_MAX = 500;
export const TRANSFER_REFERENCE_MAX = 255;

export type RefundMethod = 'CASH' | 'TRANSFER';

export const refundMethodLabel: Record<RefundMethod, string> = { CASH: 'Tiền mặt', TRANSFER: 'Chuyển khoản' };

/** Nội dung gửi cho Core. `refundMethod`/`transferReference` bị bỏ hẳn khi không dùng, vì Core từ chối `refundMethod` ở đơn chưa thu tiền. */
export interface SaleVoidRequest {
  reason: string;
  restockItems: boolean;
  refundMethod?: RefundMethod;
  transferReference?: string;
}

export interface SaleVoidForm {
  reason: string;
  restockItems: boolean;
  refundMethod: RefundMethod | null;
  transferReference: string;
}

/**
 * Dựng nội dung gửi từ form theo đúng luật của Core, để báo lỗi ngay trên màn hình thay vì chờ Core trả 400:
 * - lý do bắt buộc, tối đa 500 ký tự;
 * - đơn đã thu tiền (`paidVnd` > 0) phải chọn hình thức hoàn; đơn chưa thu đồng nào thì KHÔNG được gửi hình thức hoàn;
 * - mã giao dịch chỉ gửi kèm khi hoàn chuyển khoản và có nhập, tối đa 255 ký tự.
 */
export function buildVoidRequest(
  sale: Pick<SaleView, 'paidVnd'>,
  form: SaleVoidForm,
): { body: SaleVoidRequest } | { error: string } {
  const reason = form.reason.trim();
  if (!reason) return { error: 'Nhập lý do huỷ đơn' };
  if (reason.length > VOID_REASON_MAX) return { error: `Lý do tối đa ${VOID_REASON_MAX} ký tự` };

  const body: SaleVoidRequest = { reason, restockItems: form.restockItems };
  if (sale.paidVnd > 0) {
    if (!form.refundMethod) return { error: 'Chọn hình thức hoàn tiền cho khách' };
    body.refundMethod = form.refundMethod;
    const reference = form.transferReference.trim();
    if (form.refundMethod === 'TRANSFER' && reference) {
      if (reference.length > TRANSFER_REFERENCE_MAX) return { error: `Mã giao dịch tối đa ${TRANSFER_REFERENCE_MAX} ký tự` };
      body.transferReference = reference;
    }
  }
  return { body };
}

/** Câu tóm tắt sau khi huỷ, ví dụ "Đã huỷ đơn #7. Hoàn 40.000đ (tiền mặt). Huỷ nợ 60.000đ. Đã hoàn hàng về kho." */
export function voidSummary(result: SaleVoidView): string {
  const parts = [`Đã huỷ đơn #${result.sale.id}.`];
  if (result.refund) {
    parts.push(`Hoàn ${vnd(result.refund.amountVnd)} (${refundMethodLabel[result.refund.refundMethod].toLowerCase()}).`);
  }
  if (result.cancelledDebtVnd > 0) parts.push(`Huỷ nợ ${vnd(result.cancelledDebtVnd)}.`);
  if (result.stockRestocked) parts.push('Đã hoàn hàng về kho.');
  return parts.join(' ');
}
