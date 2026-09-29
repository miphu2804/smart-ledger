package com.smartledger.core.service.impl;

import com.smartledger.core.dto.request.DebtRepaymentRequest;
import com.smartledger.core.dto.response.DebtRepaymentResponse;
import com.smartledger.core.dto.response.DebtResponse;
import com.smartledger.core.dto.response.PaymentResponse;
import com.smartledger.core.entity.Debt;
import com.smartledger.core.entity.Payment;
import com.smartledger.core.entity.Sale;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.DebtRepository;
import com.smartledger.core.repository.PaymentRepository;
import com.smartledger.core.repository.SaleRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.DebtService;
import com.smartledger.core.service.IdempotencyService;
import com.smartledger.core.service.ShopService;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class DebtServiceImpl implements DebtService {
    private final ShopService shopService;
    private final DebtRepository debtRepository;
    private final SaleRepository saleRepository;
    private final PaymentRepository paymentRepository;
    private final IdempotencyService idempotencyService;

    public DebtServiceImpl(ShopService shopService, DebtRepository debtRepository,
            SaleRepository saleRepository, PaymentRepository paymentRepository,
            IdempotencyService idempotencyService) {
        this.shopService = shopService;
        this.debtRepository = debtRepository;
        this.saleRepository = saleRepository;
        this.paymentRepository = paymentRepository;
        this.idempotencyService = idempotencyService;
    }

    @Override
    @Transactional(readOnly = true)
    public List<DebtResponse> list(VerifiedFirebaseToken token, String shopId) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        return debtRepository.findAllByShopIdOrderByIdDesc(shop.getId()).stream().map(this::toResponse).toList();
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
                () -> repayOnce(shop, id, request));
    }

    private DebtRepaymentResponse repayOnce(Shop shop, Long id, DebtRepaymentRequest request) {
        Debt debt = debtRepository.findLockedByIdAndShopId(id, shop.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.DEBT_NOT_FOUND));
        Sale sale = saleRepository.findByIdAndShopId(debt.getSaleId(), shop.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.SALE_NOT_FOUND));
        debt.repay(request.amountVnd());
        sale.recordRepayment(request.amountVnd());
        Payment payment = paymentRepository.save(Payment.debtRepayment(sale.getId(), debt.getId(),
                request.amountVnd(), request.paymentMethod(),
                StringUtils.hasText(request.transferReference()) ? request.transferReference().trim() : null,
                shop.getOwnerId()));
        return new DebtRepaymentResponse(toResponse(debt), new PaymentResponse(payment.getId(),
                payment.getSaleId(), payment.getAmountVnd(), payment.getPaymentMethod(),
                payment.getType(), payment.getReceivedAt()));
    }

    private DebtResponse toResponse(Debt debt) {
        return new DebtResponse(debt.getId(), debt.getSaleId(), debt.getCustomerId(),
                debt.getOriginalVnd(), debt.getOutstandingVnd(), debt.getStatus(),
                debt.getCreatedAt(), debt.getSettledAt());
    }
}
