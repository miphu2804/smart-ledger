package com.smartledger.core.service;

import com.smartledger.core.dto.response.PaymentResponse;
import com.smartledger.core.security.VerifiedFirebaseToken;
import java.util.List;

public interface PaymentService {
    List<PaymentResponse> listForSale(VerifiedFirebaseToken token, String shopId, String saleId);

    PaymentResponse getById(VerifiedFirebaseToken token, String shopId, String saleId, String paymentId);
}
