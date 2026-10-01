package com.smartledger.core.service.impl;

import com.smartledger.core.dto.request.SaleVoidRequest;
import com.smartledger.core.dto.response.SaleRefundResponse;
import com.smartledger.core.dto.response.SaleVoidResponse;
import com.smartledger.core.entity.Debt;
import com.smartledger.core.entity.Payment;
import com.smartledger.core.entity.Product;
import com.smartledger.core.entity.Sale;
import com.smartledger.core.entity.SaleItem;
import com.smartledger.core.entity.SaleRefund;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.enums.SaleStatus;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.DebtRepository;
import com.smartledger.core.repository.PaymentRepository;
import com.smartledger.core.repository.ProductRepository;
import com.smartledger.core.repository.SaleItemRepository;
import com.smartledger.core.repository.SaleRefundRepository;
import com.smartledger.core.repository.SaleRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.IdempotencyService;
import com.smartledger.core.service.SaleVoidService;
import com.smartledger.core.service.ShopService;
import java.util.Comparator;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class SaleVoidServiceImpl implements SaleVoidService {
    private final ShopService shopService;
    private final SaleRepository saleRepository;
    private final SaleItemRepository saleItemRepository;
    private final DebtRepository debtRepository;
    private final PaymentRepository paymentRepository;
    private final ProductRepository productRepository;
    private final SaleRefundRepository refundRepository;
    private final IdempotencyService idempotencyService;

    public SaleVoidServiceImpl(ShopService shopService, SaleRepository saleRepository,
            SaleItemRepository saleItemRepository, DebtRepository debtRepository,
            PaymentRepository paymentRepository, ProductRepository productRepository,
            SaleRefundRepository refundRepository, IdempotencyService idempotencyService) {
        this.shopService = shopService;
        this.saleRepository = saleRepository;
        this.saleItemRepository = saleItemRepository;
        this.debtRepository = debtRepository;
        this.paymentRepository = paymentRepository;
        this.productRepository = productRepository;
        this.refundRepository = refundRepository;
        this.idempotencyService = idempotencyService;
    }

    @Override
    @Transactional
    public SaleVoidResponse voidSale(VerifiedFirebaseToken token, String shopId, String saleId,
            String idempotencyKey, SaleVoidRequest request) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        Long id = BusinessIdParser.parse(saleId, "saleId", ErrorCode.INVALID_SALE_ID);
        return idempotencyService.execute(shop.getId(), shop.getOwnerId(), "SALE_VOID",
                idempotencyKey, new Object[] { id, request }, "SALE", response -> response.sale().id(),
                SaleVoidResponse.class, () -> voidOnce(shop, id, request));
    }

    private SaleVoidResponse voidOnce(Shop shop, Long id, SaleVoidRequest request) {
        Sale sale = saleRepository.findLockedByIdAndShopId(id, shop.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.SALE_NOT_FOUND));
        if (sale.getSaleStatus() != SaleStatus.CONFIRMED) {
            throw new BusinessException(ErrorCode.SALE_ALREADY_VOIDED);
        }
        List<Payment> payments = paymentRepository.findAllBySaleIdOrderByIdAsc(id);
        long received;
        try {
            received = payments.stream().mapToLong(Payment::getAmountVnd).reduce(0, Math::addExact);
        } catch (ArithmeticException exception) {
            throw new BusinessException(ErrorCode.SALE_PAYMENT_MISMATCH);
        }
        if (received != sale.getPaidVnd()) {
            throw new BusinessException(ErrorCode.SALE_PAYMENT_MISMATCH);
        }
        if (received > 0 && request.refundMethod() == null) {
            throw new BusinessException(ErrorCode.SALE_REFUND_METHOD_REQUIRED);
        }
        if (received == 0 && request.refundMethod() != null) {
            throw new BusinessException(ErrorCode.SALE_REFUND_METHOD_INVALID);
        }

        // All money-changing flows lock sale -> debt -> products (ascending product ID).
        Debt debt = debtRepository.findLockedBySaleIdAndShopId(id, shop.getId()).orElse(null);
        long cancelledDebt = debt == null ? 0 : debt.getOutstandingVnd();
        List<SaleItem> items = saleItemRepository.findAllBySaleIdOrderByIdAsc(id);
        boolean stockRestocked = false;
        if (Boolean.TRUE.equals(request.restockItems())) {
            // Product locks follow the same stable ID order as checkout confirmation.
            for (SaleItem item : items.stream().sorted(Comparator.comparing(
                    SaleItem::getProductId, Comparator.nullsLast(Long::compareTo))).toList()) {
                if (item.getStockDeducted() == null) {
                    throw new BusinessException(ErrorCode.SALE_RESTOCK_UNAVAILABLE);
                }
                if (Boolean.TRUE.equals(item.getStockDeducted())) {
                    Product product = productRepository.findLockedByIdAndShopId(item.getProductId(), shop.getId())
                            .orElseThrow(() -> new BusinessException(ErrorCode.SALE_RESTOCK_UNAVAILABLE));
                    product.restoreStock(item.getQuantity());
                    stockRestocked = true;
                }
            }
        }

        if (debt != null) {
            debt.voidRemaining();
        }
        SaleRefund refund = received == 0 ? null : refundRepository.save(SaleRefund.record(id, received,
                request.refundMethod(), StringUtils.hasText(request.transferReference())
                        ? request.transferReference().trim() : null, shop.getOwnerId()));
        sale.voidSale(shop.getOwnerId(), request.reason().trim());
        return new SaleVoidResponse(SaleServiceImpl.toResponse(sale, items),
                refund == null ? null : toResponse(refund), cancelledDebt, stockRestocked);
    }

    @Override
    @Transactional(readOnly = true)
    public SaleRefundResponse getRefund(VerifiedFirebaseToken token, String shopId, String saleId) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        Long id = BusinessIdParser.parse(saleId, "saleId", ErrorCode.INVALID_SALE_ID);
        saleRepository.findByIdAndShopId(id, shop.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.SALE_NOT_FOUND));
        return refundRepository.findBySaleId(id).map(this::toResponse)
                .orElseThrow(() -> new BusinessException(ErrorCode.SALE_REFUND_NOT_FOUND));
    }

    private SaleRefundResponse toResponse(SaleRefund refund) {
        return new SaleRefundResponse(refund.getId(), refund.getSaleId(), refund.getAmountVnd(),
                refund.getRefundMethod(), refund.getTransferReference(),
                refund.getRefundedByUserId(), refund.getRefundedAt());
    }
}
