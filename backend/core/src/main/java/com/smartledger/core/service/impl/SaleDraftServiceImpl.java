package com.smartledger.core.service.impl;

import com.smartledger.core.dto.request.SaleDraftItemRequest;
import com.smartledger.core.dto.request.SaleDraftWriteRequest;
import com.smartledger.core.dto.response.SaleDraftItemResponse;
import com.smartledger.core.dto.response.SaleDraftResponse;
import com.smartledger.core.dto.response.SaleResponse;
import com.smartledger.core.entity.Product;
import com.smartledger.core.entity.Sale;
import com.smartledger.core.entity.SaleDraft;
import com.smartledger.core.entity.SaleDraftItem;
import com.smartledger.core.entity.SaleItem;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.entity.Payment;
import com.smartledger.core.enums.CatalogStatus;
import com.smartledger.core.enums.DraftStatus;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.PaymentRepository;
import com.smartledger.core.repository.ProductRepository;
import com.smartledger.core.repository.SaleDraftItemRepository;
import com.smartledger.core.repository.SaleDraftRepository;
import com.smartledger.core.repository.SaleItemRepository;
import com.smartledger.core.repository.SaleRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.SaleDraftService;
import com.smartledger.core.service.ShopService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class SaleDraftServiceImpl implements SaleDraftService {
    private final ShopService shopService;
    private final SaleDraftRepository draftRepository;
    private final SaleDraftItemRepository draftItemRepository;
    private final ProductRepository productRepository;
    private final SaleRepository saleRepository;
    private final SaleItemRepository saleItemRepository;
    private final PaymentRepository paymentRepository;

    public SaleDraftServiceImpl(ShopService shopService, SaleDraftRepository draftRepository,
            SaleDraftItemRepository draftItemRepository, ProductRepository productRepository,
            SaleRepository saleRepository, SaleItemRepository saleItemRepository,
            PaymentRepository paymentRepository) {
        this.shopService = shopService;
        this.draftRepository = draftRepository;
        this.draftItemRepository = draftItemRepository;
        this.productRepository = productRepository;
        this.saleRepository = saleRepository;
        this.saleItemRepository = saleItemRepository;
        this.paymentRepository = paymentRepository;
    }

    @Override
    @Transactional
    public SaleDraftResponse create(VerifiedFirebaseToken token, String shopId, SaleDraftWriteRequest request) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        PreparedDraft prepared = prepare(shop.getId(), request);
        SaleDraft draft = SaleDraft.create(shop.getId(), shop.getOwnerId());
        apply(draft, request, prepared);
        draft = draftRepository.save(draft);
        List<SaleDraftItem> items = draftItemRepository.saveAll(toItems(draft.getId(), prepared.items()));
        return toResponse(draft, items);
    }

    @Override
    @Transactional(readOnly = true)
    public List<SaleDraftResponse> list(VerifiedFirebaseToken token, String shopId) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        return draftRepository.findAllByShopIdOrderByIdDesc(shop.getId()).stream()
                .map(draft -> toResponse(draft, draftItemRepository.findAllByDraftIdOrderByIdAsc(draft.getId())))
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public SaleDraftResponse getById(VerifiedFirebaseToken token, String shopId, String draftId) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        SaleDraft draft = requireDraft(shop.getId(), draftId, false);
        return toResponse(draft, draftItemRepository.findAllByDraftIdOrderByIdAsc(draft.getId()));
    }

    @Override
    @Transactional
    public SaleDraftResponse replace(VerifiedFirebaseToken token, String shopId, String draftId,
            SaleDraftWriteRequest request) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        SaleDraft draft = requireDraft(shop.getId(), draftId, true);
        requireEditable(draft);
        PreparedDraft prepared = prepare(shop.getId(), request);
        apply(draft, request, prepared);
        draftItemRepository.deleteAllByDraftId(draft.getId());
        List<SaleDraftItem> items = draftItemRepository.saveAll(toItems(draft.getId(), prepared.items()));
        return toResponse(draft, items);
    }

    @Override
    @Transactional
    public void cancel(VerifiedFirebaseToken token, String shopId, String draftId) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        SaleDraft draft = requireDraft(shop.getId(), draftId, true);
        requireEditable(draft);
        draft.cancel();
    }

    @Override
    @Transactional
    public SaleResponse confirm(VerifiedFirebaseToken token, String shopId, String draftId) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        SaleDraft draft = requireDraft(shop.getId(), draftId, true);
        if (draft.getStatus() == DraftStatus.CONFIRMED && draft.getConfirmedSaleId() != null) {
            Sale existing = saleRepository.findByIdAndShopId(draft.getConfirmedSaleId(), shop.getId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.SALE_NOT_FOUND));
            return SaleServiceImpl.toResponse(existing,
                    saleItemRepository.findAllBySaleIdOrderByIdAsc(existing.getId()));
        }
        requireEditable(draft);
        if (!draft.getInitialPaidVnd().equals(draft.getEstimatedTotalVnd())
                || draft.getInitialPaymentMethod() == null) {
            throw new BusinessException(ErrorCode.FULL_PAYMENT_REQUIRED);
        }

        List<SaleDraftItem> draftItems = draftItemRepository.findAllByDraftIdOrderByIdAsc(draft.getId());
        if (draftItems.isEmpty()) {
            throw new BusinessException(ErrorCode.DRAFT_ITEM_INVALID);
        }
        long subtotal = 0;
        try {
            for (SaleDraftItem item : draftItems) {
                subtotal = Math.addExact(subtotal, item.getLineTotalVnd());
            }
            if (Math.subtractExact(subtotal, draft.getDiscountVnd()) != draft.getEstimatedTotalVnd()) {
                throw new BusinessException(ErrorCode.DRAFT_TOTAL_INVALID);
            }
        } catch (ArithmeticException exception) {
            throw new BusinessException(ErrorCode.DRAFT_TOTAL_INVALID);
        }

        // Lock products in a stable order so concurrent checkouts cannot oversell or deadlock.
        for (SaleDraftItem item : draftItems.stream()
                .sorted(java.util.Comparator.comparing(SaleDraftItem::getProductId)).toList()) {
            Product product = productRepository.findLockedByIdAndShopIdAndStatus(
                            item.getProductId(), shop.getId(), CatalogStatus.ACTIVE)
                    .orElseThrow(() -> new BusinessException(ErrorCode.DRAFT_ITEM_INVALID));
            product.deductStock(item.getQuantity());
        }

        Sale sale = saleRepository.saveAndFlush(Sale.fromPaidDraft(draft, subtotal));
        List<SaleItem> saleItems = saleItemRepository.saveAll(draftItems.stream()
                .map(item -> SaleItem.fromDraftItem(sale.getId(), item)).toList());
        paymentRepository.save(Payment.initial(sale.getId(), sale.getTotalVnd(),
                draft.getInitialPaymentMethod(), shop.getOwnerId()));
        draft.confirm(sale.getId());
        return SaleServiceImpl.toResponse(sale, saleItems);
    }

    private SaleDraft requireDraft(Long shopId, String draftId, boolean lock) {
        Long id = BusinessIdParser.parse(draftId, "draftId", ErrorCode.INVALID_DRAFT_ID);
        return (lock ? draftRepository.findLockedByIdAndShopId(id, shopId)
                : draftRepository.findByIdAndShopId(id, shopId))
                .orElseThrow(() -> new BusinessException(ErrorCode.DRAFT_NOT_FOUND));
    }

    private void requireEditable(SaleDraft draft) {
        if (draft.getStatus() != DraftStatus.DRAFT || draft.isExpired()) {
            throw new BusinessException(ErrorCode.DRAFT_NOT_EDITABLE);
        }
    }

    private PreparedDraft prepare(Long shopId, SaleDraftWriteRequest request) {
        List<PreparedItem> items = new ArrayList<>();
        Set<Long> productIds = new HashSet<>();
        long subtotal = 0;
        try {
            for (SaleDraftItemRequest item : request.items()) {
                if (!productIds.add(item.productId())) {
                    throw new BusinessException(ErrorCode.DRAFT_ITEM_DUPLICATE);
                }
                Product product = productRepository.findByIdAndShopIdAndStatus(
                                item.productId(), shopId, CatalogStatus.ACTIVE)
                        .orElseThrow(() -> new BusinessException(ErrorCode.DRAFT_ITEM_INVALID));
                long lineTotal = BigDecimal.valueOf(item.unitPriceVnd()).multiply(item.quantity())
                        .setScale(0, RoundingMode.HALF_UP).longValueExact();
                subtotal = Math.addExact(subtotal, lineTotal);
                items.add(new PreparedItem(product, item.quantity(), item.unitPriceVnd(), lineTotal));
            }
            long discount = request.discountVnd() == null ? 0 : request.discountVnd();
            long total = Math.subtractExact(subtotal, discount);
            if (total <= 0) {
                throw new BusinessException(ErrorCode.DRAFT_TOTAL_INVALID);
            }
            long paid = request.initialPaidVnd() == null ? 0 : request.initialPaidVnd();
            if (paid > total || (paid > 0 && request.initialPaymentMethod() == null)
                    || (paid == 0 && request.initialPaymentMethod() != null)) {
                throw new BusinessException(ErrorCode.DRAFT_PAYMENT_INVALID);
            }
            return new PreparedDraft(items, discount, total, paid);
        } catch (ArithmeticException exception) {
            throw new BusinessException(ErrorCode.DRAFT_TOTAL_INVALID);
        }
    }

    private void apply(SaleDraft draft, SaleDraftWriteRequest request, PreparedDraft prepared) {
        draft.replace(normalize(request.customerName()), normalize(request.customerPhone()),
                prepared.discountVnd(), prepared.totalVnd(), prepared.paidVnd(), request.initialPaymentMethod());
    }

    private List<SaleDraftItem> toItems(Long draftId, List<PreparedItem> prepared) {
        return prepared.stream().map(item -> SaleDraftItem.create(draftId, item.product(), item.quantity(),
                item.unitPriceVnd(), item.lineTotalVnd())).toList();
    }

    private SaleDraftResponse toResponse(SaleDraft draft, List<SaleDraftItem> items) {
        return new SaleDraftResponse(draft.getId(), draft.getShopId(), draft.getCustomerName(),
                draft.getCustomerPhone(), draft.getDiscountVnd(), draft.getEstimatedTotalVnd(),
                draft.getInitialPaidVnd(), draft.getInitialPaymentMethod(),
                draft.isExpired() ? DraftStatus.EXPIRED : draft.getStatus(), draft.getExpiresAt(),
                draft.getConfirmedSaleId(), items.stream().map(this::toItemResponse).toList());
    }

    private SaleDraftItemResponse toItemResponse(SaleDraftItem item) {
        return new SaleDraftItemResponse(item.getId(), item.getProductId(), item.getProductNameSnapshot(),
                item.getUnitSnapshot(), item.getQuantity(), item.getUnitPriceVnd(), item.getLineTotalVnd());
    }

    private String normalize(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private record PreparedItem(Product product, BigDecimal quantity, long unitPriceVnd, long lineTotalVnd) {
    }

    private record PreparedDraft(List<PreparedItem> items, long discountVnd, long totalVnd, long paidVnd) {
    }
}
