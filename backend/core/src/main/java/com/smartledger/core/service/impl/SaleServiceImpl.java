package com.smartledger.core.service.impl;

import com.smartledger.core.dto.request.OwnerListQuery.Sales;
import com.smartledger.core.dto.response.PageResponse;
import com.smartledger.core.dto.response.SaleItemResponse;
import com.smartledger.core.dto.response.SaleResponse;
import com.smartledger.core.entity.Sale;
import com.smartledger.core.entity.SaleItem;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.enums.SaleStatus;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.OwnerListSpecifications;
import com.smartledger.core.repository.SaleItemRepository;
import com.smartledger.core.repository.SaleRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.SaleService;
import com.smartledger.core.service.ShopService;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
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

    /**
     * Reads one bounded page ordered by soldAt/id descending and its items ordered by ID.
     * Uses at most three data queries (content, count, items), excluding auth/shop checks.
     * An empty page skips the item query; content and count share a repeatable-read snapshot.
     */
    @Override
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public PageResponse<SaleResponse> list(VerifiedFirebaseToken token, String shopId, Sales query) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        var page = saleRepository.findAll(OwnerListSpecifications.sales(shop.getId(), query),
                query.pageable(Sort.by(Sort.Direction.DESC, "soldAt", "id")));
        if (page.isEmpty()) return PageResponse.from(page, parent -> toResponse(parent, List.of()));
        var ids = page.getContent().stream().map(Sale::getId).toList();
        Map<Long, List<SaleItem>> itemsByParent = saleItemRepository.findAllForPage(shop.getId(), ids).stream()
                .collect(Collectors.groupingBy(SaleItem::getSaleId));
        return PageResponse.from(page, parent -> toResponse(parent,
                itemsByParent.getOrDefault(parent.getId(), List.of())));
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
                sale.getSoldAt(), items.stream().map(SaleServiceImpl::toItemResponse).toList(),
                sale.getCustomerId(), sale.getSaleStatus() == SaleStatus.VOIDED
                        ? 0L : sale.getTotalVnd() - sale.getPaidVnd(),
                sale.getVoidedAt(), sale.getVoidedByUserId(), sale.getVoidReason());
    }

    private static SaleItemResponse toItemResponse(SaleItem item) {
        return new SaleItemResponse(item.getId(), item.getProductId(), item.getProductNameSnapshot(),
                item.getUnitSnapshot(), item.getQuantity(), item.getUnitPriceVnd(), item.getLineTotalVnd());
    }
}
