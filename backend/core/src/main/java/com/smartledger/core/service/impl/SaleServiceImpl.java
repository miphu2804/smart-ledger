package com.smartledger.core.service.impl;

import com.smartledger.core.dto.response.SaleItemResponse;
import com.smartledger.core.dto.response.SaleResponse;
import com.smartledger.core.entity.Sale;
import com.smartledger.core.entity.SaleItem;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.SaleItemRepository;
import com.smartledger.core.repository.SaleRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.SaleService;
import com.smartledger.core.service.ShopService;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SaleServiceImpl implements SaleService {
    private final ShopService shopService;
    private final SaleRepository saleRepository;
    private final SaleItemRepository saleItemRepository;

    public SaleServiceImpl(ShopService shopService, SaleRepository saleRepository,
            SaleItemRepository saleItemRepository) {
        this.shopService = shopService;
        this.saleRepository = saleRepository;
        this.saleItemRepository = saleItemRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public List<SaleResponse> list(VerifiedFirebaseToken token, String shopId) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        return saleRepository.findAllByShopIdOrderByIdDesc(shop.getId()).stream()
                .map(sale -> toResponse(sale, saleItemRepository.findAllBySaleIdOrderByIdAsc(sale.getId())))
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public SaleResponse getById(VerifiedFirebaseToken token, String shopId, String saleId) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        Long id = BusinessIdParser.parse(saleId, "saleId", ErrorCode.INVALID_SALE_ID);
        Sale sale = saleRepository.findByIdAndShopId(id, shop.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.SALE_NOT_FOUND));
        return toResponse(sale, saleItemRepository.findAllBySaleIdOrderByIdAsc(id));
    }

    static SaleResponse toResponse(Sale sale, List<SaleItem> items) {
        return new SaleResponse(sale.getId(), sale.getShopId(), sale.getCustomerNameSnapshot(),
                sale.getCustomerPhoneSnapshot(), sale.getSubtotalVnd(), sale.getDiscountVnd(),
                sale.getTotalVnd(), sale.getPaidVnd(), sale.getSaleStatus(), sale.getPaymentStatus(),
                sale.getSoldAt(), items.stream().map(SaleServiceImpl::toItemResponse).toList());
    }

    private static SaleItemResponse toItemResponse(SaleItem item) {
        return new SaleItemResponse(item.getId(), item.getProductId(), item.getProductNameSnapshot(),
                item.getUnitSnapshot(), item.getQuantity(), item.getUnitPriceVnd(), item.getLineTotalVnd());
    }
}
