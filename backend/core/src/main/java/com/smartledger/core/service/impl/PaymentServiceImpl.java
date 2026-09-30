package com.smartledger.core.service.impl;

import com.smartledger.core.dto.response.PaymentResponse;
import com.smartledger.core.entity.Payment;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.PaymentRepository;
import com.smartledger.core.repository.SaleRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.PaymentService;
import com.smartledger.core.service.ShopService;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PaymentServiceImpl implements PaymentService {
    private final ShopService shopService;
    private final SaleRepository saleRepository;
    private final PaymentRepository paymentRepository;

    public PaymentServiceImpl(ShopService shopService, SaleRepository saleRepository,
            PaymentRepository paymentRepository) {
        this.shopService = shopService;
        this.saleRepository = saleRepository;
        this.paymentRepository = paymentRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public List<PaymentResponse> listForSale(VerifiedFirebaseToken token, String shopId, String saleId) {
        Long id = requireSaleId(token, shopId, saleId);
        return paymentRepository.findAllBySaleIdOrderByIdAsc(id).stream().map(this::toResponse).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public PaymentResponse getById(VerifiedFirebaseToken token, String shopId, String saleId, String paymentId) {
        Long id = requireSaleId(token, shopId, saleId);
        Long payment = BusinessIdParser.parse(paymentId, "paymentId", ErrorCode.INVALID_PAYMENT_ID);
        return paymentRepository.findByIdAndSaleId(payment, id).map(this::toResponse)
                .orElseThrow(() -> new BusinessException(ErrorCode.PAYMENT_NOT_FOUND));
    }

    private Long requireSaleId(VerifiedFirebaseToken token, String shopId, String saleId) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        Long id = BusinessIdParser.parse(saleId, "saleId", ErrorCode.INVALID_SALE_ID);
        if (saleRepository.findByIdAndShopId(id, shop.getId()).isEmpty()) {
            throw new BusinessException(ErrorCode.SALE_NOT_FOUND);
        }
        return id;
    }

    private PaymentResponse toResponse(Payment payment) {
        return new PaymentResponse(payment.getId(), payment.getSaleId(), payment.getAmountVnd(),
                payment.getPaymentMethod(), payment.getType(), payment.getReceivedAt());
    }
}
