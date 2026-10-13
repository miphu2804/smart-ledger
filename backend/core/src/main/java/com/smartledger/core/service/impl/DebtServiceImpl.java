package com.smartledger.core.service.impl;

import com.smartledger.core.dto.request.DebtRepaymentRequest;
import com.smartledger.core.dto.request.OwnerListQuery.Debts;
import com.smartledger.core.dto.response.DebtRepaymentResponse;
import com.smartledger.core.dto.response.DebtResponse;
import com.smartledger.core.dto.response.PageResponse;
import com.smartledger.core.dto.response.PaymentResponse;
import com.smartledger.core.entity.Debt;
import com.smartledger.core.entity.Payment;
import com.smartledger.core.entity.Sale;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.AuditAction;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.enums.SaleStatus;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.DebtRepository;
import com.smartledger.core.repository.OwnerListSpecifications;
import com.smartledger.core.repository.PaymentRepository;
import com.smartledger.core.repository.SaleRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.AuditLogService;
import com.smartledger.core.service.DebtService;
import com.smartledger.core.service.IdempotencyService;
import com.smartledger.core.service.ShopService;
import java.util.Map;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class DebtServiceImpl implements DebtService {
    private final AuditLogService auditLogService;
    private final ShopService shopService;
    private final DebtRepository debtRepository;
    private final SaleRepository saleRepository;
    private final PaymentRepository paymentRepository;
    private final IdempotencyService idempotencyService;

    public DebtServiceImpl(ShopService shopService, DebtRepository debtRepository,
            SaleRepository saleRepository, PaymentRepository paymentRepository,
            IdempotencyService idempotencyService, AuditLogService auditLogService) {
        this.auditLogService = auditLogService;
        this.shopService = shopService;
        this.debtRepository = debtRepository;
        this.saleRepository = saleRepository;
        this.paymentRepository = paymentRepository;
        this.idempotencyService = idempotencyService;
    }

    @Override
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public PageResponse<DebtResponse> list(VerifiedFirebaseToken token, String shopId, Debts query) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        var page = debtRepository.findAll(OwnerListSpecifications.debts(shop.getId(), query),
                query.pageable(Sort.by(Sort.Direction.DESC, "id")));
        return PageResponse.from(page, this::toResponse);
    }

    @Override
    @Transactional(readOnly = true)
    public DebtResponse getById(VerifiedFirebaseToken token, String shopId, String debtId) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        Long id = BusinessIdParser.parse(debtId, "debtId", ErrorCode.INVALID_DEBT_ID);
        return toResponse(debtRepository.findByIdAndShopId(id, shop.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.DEBT_NOT_FOUND)));
    }

    @Override
    @Transactional
    public DebtRepaymentResponse repay(VerifiedFirebaseToken token, String shopId, String debtId,
            String idempotencyKey,
            DebtRepaymentRequest request) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        Long id = BusinessIdParser.parse(debtId, "debtId", ErrorCode.INVALID_DEBT_ID);
        return idempotencyService.execute(shop.getId(), shop.getOwnerId(), "DEBT_REPAYMENT",
                idempotencyKey, new Object[] { id, request }, "PAYMENT",
                response -> response.payment().id(), DebtRepaymentResponse.class,
                () -> repayOnce(shop, id, idempotencyKey, request));
    }

    private DebtRepaymentResponse repayOnce(Shop shop, Long id, String idempotencyKey, DebtRepaymentRequest request) {
        Long saleId = debtRepository.findSaleIdByIdAndShopId(id, shop.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.DEBT_NOT_FOUND));
        // Read only the ID before waiting, so no stale Debt enters the persistence context.
        // Lock sale before debt, matching the void flow to avoid lock inversion.
        Sale sale = saleRepository.findLockedByIdAndShopId(saleId, shop.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.SALE_NOT_FOUND));
        if (sale.getSaleStatus() != SaleStatus.CONFIRMED) {
            throw new BusinessException(ErrorCode.SALE_ALREADY_VOIDED);
        }
        Debt debt = debtRepository.findLockedByIdAndShopId(id, shop.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.DEBT_NOT_FOUND));
        Long beforeBalance = debt.getOutstandingVnd();
        debt.repay(request.amountVnd());
        sale.recordRepayment(request.amountVnd());
        Payment payment = paymentRepository.save(Payment.debtRepayment(sale.getId(), debt.getId(),
                request.amountVnd(), request.paymentMethod(),
                StringUtils.hasText(request.transferReference()) ? request.transferReference().trim() : null,
                shop.getOwnerId()));
        auditLogService.recordOwner(shop, AuditAction.DEBT_REPAYMENT_RECORDED, debt.getId(), null, idempotencyKey,
                Map.of("saleId", sale.getId(), "paymentId", payment.getId(), "amountVnd", request.amountVnd(),
                        "beforeBalanceVnd", beforeBalance, "afterBalanceVnd", debt.getOutstandingVnd()));
        return new DebtRepaymentResponse(toResponse(debt), new PaymentResponse(payment.getId(),
                payment.getSaleId(), payment.getAmountVnd(), payment.getPaymentMethod(),
                payment.getType(), payment.getReceivedAt()));
    }

    private DebtResponse toResponse(Debt debt) {
        return new DebtResponse(debt.getId(), debt.getSaleId(), debt.getCustomerId(),
                debt.getOriginalVnd(), debt.getOutstandingVnd(), debt.getStatus(),
                debt.getCreatedAt(), debt.getSettledAt(), debt.getVoidedAt(), debt.getCancelledVnd());
    }
}
