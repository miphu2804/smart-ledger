package com.smartledger.core.service.impl;

import com.smartledger.core.dto.request.OwnerListQuery.Drafts;
import com.smartledger.core.dto.request.SaleDraftItemRequest;
import com.smartledger.core.dto.request.SaleDraftWriteRequest;
import com.smartledger.core.dto.response.PageResponse;
import com.smartledger.core.dto.response.SaleDraftItemResponse;
import com.smartledger.core.dto.response.SaleDraftResponse;
import com.smartledger.core.dto.response.SaleResponse;
import com.smartledger.core.entity.Customer;
import com.smartledger.core.entity.Debt;
import com.smartledger.core.entity.Payment;
import com.smartledger.core.entity.Product;
import com.smartledger.core.entity.Sale;
import com.smartledger.core.entity.SaleDraft;
import com.smartledger.core.entity.SaleDraftItem;
import com.smartledger.core.entity.SaleItem;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.AuditAction;
import com.smartledger.core.enums.CatalogStatus;
import com.smartledger.core.enums.DraftStatus;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.CustomerRepository;
import com.smartledger.core.repository.DebtRepository;
import com.smartledger.core.repository.OwnerListSpecifications;
import com.smartledger.core.repository.PaymentRepository;
import com.smartledger.core.repository.ProductRepository;
import com.smartledger.core.repository.SaleDraftItemRepository;
import com.smartledger.core.repository.SaleDraftRepository;
import com.smartledger.core.repository.SaleItemRepository;
import com.smartledger.core.repository.SaleRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.AuditLogService;
import com.smartledger.core.service.NotificationEventService;
import com.smartledger.core.service.SaleDraftService;
import com.smartledger.core.service.ShopService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class SaleDraftServiceImpl implements SaleDraftService {
    private final AuditLogService auditLogService;
    private final NotificationEventService notifications;
    private final ShopService shopService;
    private final SaleDraftRepository draftRepository;
    private final SaleDraftItemRepository draftItemRepository;
    private final ProductRepository productRepository;
    private final SaleRepository saleRepository;
    private final SaleItemRepository saleItemRepository;
    private final PaymentRepository paymentRepository;
    private final CustomerRepository customerRepository;
    private final DebtRepository debtRepository;

    public SaleDraftServiceImpl(ShopService shopService, SaleDraftRepository draftRepository,
            SaleDraftItemRepository draftItemRepository, ProductRepository productRepository,
            SaleRepository saleRepository, SaleItemRepository saleItemRepository,
            PaymentRepository paymentRepository, CustomerRepository customerRepository,
            DebtRepository debtRepository, AuditLogService auditLogService, NotificationEventService notifications) {
        this.notifications = notifications;
        this.auditLogService = auditLogService;
        this.shopService = shopService;
        this.draftRepository = draftRepository;
        this.draftItemRepository = draftItemRepository;
        this.productRepository = productRepository;
        this.saleRepository = saleRepository;
        this.saleItemRepository = saleItemRepository;
        this.paymentRepository = paymentRepository;
        this.customerRepository = customerRepository;
        this.debtRepository = debtRepository;
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

    /** Bounded parent/count reads and one tenant-scoped item read for nonempty pages. */
    @Override
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public PageResponse<SaleDraftResponse> list(VerifiedFirebaseToken token, String shopId, Drafts query) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        var page = draftRepository.findAll(OwnerListSpecifications.drafts(shop.getId(), query, now),
                query.pageable(Sort.by(Sort.Direction.DESC, "id")));
        if (page.isEmpty()) return PageResponse.from(page, parent -> toResponse(parent, List.of(), now));
        var ids = page.getContent().stream().map(SaleDraft::getId).toList();
        Map<Long, List<SaleDraftItem>> itemsByParent = draftItemRepository.findAllForPage(shop.getId(), ids).stream()
                .collect(Collectors.groupingBy(SaleDraftItem::getDraftId));
        return PageResponse.from(page, parent -> toResponse(parent,
                itemsByParent.getOrDefault(parent.getId(), List.of()), now));
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

    /**
     * Confirms under the draft row lock, replaying its sale if confirmation already succeeded.
     * Locks non-null catalog IDs once in ascending order, then validates each item in that order:
     * a missing later Product must not mask an earlier cost overflow or stock shortage.
     * Custom items do not lock or change Product stock. Cost snapshots, stock changes, sale/payment/debt,
     * grouped stock alerts and audit writes share this transaction and roll back together on failure.
     */
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
        Customer customer = customerForConfirmation(draft, shop.getId());

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

        for (SaleDraftItem item : draftItems) {
            if (item.getProductId() == null && (!StringUtils.hasText(item.getProductNameSnapshot())
                    || !StringUtils.hasText(item.getUnitSnapshot()))) {
                throw new BusinessException(ErrorCode.DRAFT_ITEM_INVALID);
            }
        }
        Map<Long, Boolean> stockDeducted = new HashMap<>();
        Map<Long, Long> estimatedCosts = new HashMap<>();
        Map<Long, BigDecimal> beforeStocks = new HashMap<>();
        Map<Long, BigDecimal> afterStocks = new HashMap<>();
        List<Long> productIds = draftItems.stream().map(SaleDraftItem::getProductId)
                .filter(java.util.Objects::nonNull).distinct().sorted().toList();
        List<Product> lockedProducts = productIds.isEmpty() ? List.of()
                : productRepository.findAllLockedByIdInAndShopIdAndStatus(productIds, shop.getId(), CatalogStatus.ACTIVE);
        Map<Long, Product> productsById = lockedProducts.stream()
                .collect(Collectors.toMap(Product::getId, product -> product));
        // Lock in one query, but preserve validation precedence by processing each item in ID order.
        for (SaleDraftItem item : draftItems.stream()
                .filter(item -> item.getProductId() != null)
                .sorted(java.util.Comparator.comparing(SaleDraftItem::getProductId)).toList()) {
            Product product = productsById.get(item.getProductId());
            if (product == null) {
                throw new BusinessException(ErrorCode.DRAFT_ITEM_INVALID);
            }
            stockDeducted.put(item.getProductId(), product.isTracked());
            estimatedCosts.put(item.getProductId(), estimateCost(product, item.getQuantity()));
            if (product.isTracked()) { beforeStocks.put(product.getId(), product.getStockQuantity()); }
            product.deductStock(item.getQuantity());
            if (product.isTracked()) { afterStocks.put(product.getId(), product.getStockQuantity()); }
        }
        notifications.reconcileStock(shop, lockedProducts);

        Sale sale = saleRepository.saveAndFlush(Sale.fromDraft(draft, subtotal, customer));
        List<SaleItem> saleItems = saleItemRepository.saveAll(draftItems.stream()
                .map(item -> SaleItem.fromDraftItem(sale.getId(), item,
                        Boolean.TRUE.equals(stockDeducted.get(item.getProductId())),
                        estimatedCosts.get(item.getProductId()))).toList());
        if (draft.getInitialPaidVnd() > 0) {
            paymentRepository.save(Payment.initial(sale.getId(), draft.getInitialPaidVnd(),
                    draft.getInitialPaymentMethod(), shop.getOwnerId()));
        }
        if (draft.getInitialPaidVnd() < draft.getEstimatedTotalVnd()) {
            debtRepository.save(Debt.open(sale.getId(), customer.getId(),
                    draft.getEstimatedTotalVnd() - draft.getInitialPaidVnd()));
        }
        draft.confirm(sale.getId());
        auditLogService.recordOwner(shop, AuditAction.SALE_CONFIRMED, sale.getId(), null, null,
                Map.of("draftId", draft.getId(), "totalVnd", sale.getTotalVnd(), "paidVnd", sale.getPaidVnd(),
                        "outstandingVnd", sale.getTotalVnd() - sale.getPaidVnd(), "itemCount", saleItems.size()));
        for (SaleDraftItem item : draftItems) {
            if (Boolean.TRUE.equals(stockDeducted.get(item.getProductId()))) {
                auditLogService.recordOwner(shop, AuditAction.STOCK_ADJUSTED, item.getProductId(), null, null,
                        Map.of("source", "SALE_CONFIRM", "saleId", sale.getId(), "quantity", item.getQuantity(),
                                "beforeStock", beforeStocks.get(item.getProductId()), "afterStock", afterStocks.get(item.getProductId())));
            }
        }
        return SaleServiceImpl.toResponse(sale, saleItems);
    }

    private Long estimateCost(Product product, BigDecimal quantity) {
        if (product.getCostPriceVnd() == null) {
            return null;
        }
        try {
            return BigDecimal.valueOf(product.getCostPriceVnd()).multiply(quantity)
                    .setScale(0, RoundingMode.HALF_UP).longValueExact();
        } catch (ArithmeticException exception) {
            throw new BusinessException(ErrorCode.DRAFT_TOTAL_INVALID);
        }
    }

    private Customer customerForConfirmation(SaleDraft draft, Long shopId) {
        boolean customerRequired = draft.getInitialPaidVnd() < draft.getEstimatedTotalVnd();
        if (draft.getCustomerId() != null) {
            // Fully paid sales keep the draft's customer snapshot even if that customer was archived.
            // A new debt must still link to an active customer in this shop.
            return customerRepository.findByIdAndShopIdAndStatus(draft.getCustomerId(), shopId, CatalogStatus.ACTIVE)
                    .orElseGet(() -> {
                        if (customerRequired) {
                            throw new BusinessException(ErrorCode.CUSTOMER_NOT_FOUND);
                        }
                        return null;
                    });
        }
        if (customerRequired) {
            if (!StringUtils.hasText(draft.getCustomerName())) {
                throw new BusinessException(ErrorCode.CUSTOMER_REQUIRED_FOR_DEBT);
            }
            return customerRepository.save(Customer.create(shopId, draft.getCustomerName(),
                    Customer.normalizePhone(draft.getCustomerPhone())));
        }
        return null;
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

    /**
     * Validates the customer first, batch-reads ACTIVE catalog Products, then checks items in request order.
     * Collecting IDs must not reject duplicates or missing Products early and change error precedence.
     * Custom-only requests skip the Product read; line totals use HALF_UP and exact arithmetic so overflow
     * becomes DRAFT_TOTAL_INVALID. Preparation does not lock or deduct stock; confirm checks it again.
     */
    private PreparedDraft prepare(Long shopId, SaleDraftWriteRequest request) {
        List<PreparedItem> items = new ArrayList<>();
        Set<Long> productIds = new HashSet<>();
        long subtotal = 0;
        Customer customer = request.customerId() == null ? null
                : customerRepository.findByIdAndShopIdAndStatus(request.customerId(), shopId, CatalogStatus.ACTIVE)
                        .orElseThrow(() -> new BusinessException(ErrorCode.CUSTOMER_NOT_FOUND));
        // Collect only: item validation and duplicate detection below must keep request-order precedence.
        Set<Long> catalogIds = new HashSet<>();
        for (SaleDraftItemRequest item : request.items()) {
            if (item.productId() != null) {
                catalogIds.add(item.productId());
            }
        }
        Map<Long, Product> products = catalogIds.isEmpty() ? Map.of()
                : productRepository.findAllByIdInAndShopIdAndStatus(catalogIds, shopId, CatalogStatus.ACTIVE)
                        .stream().collect(Collectors.toMap(Product::getId, product -> product));
        try {
            for (SaleDraftItemRequest item : request.items()) {
                Product product = null;
                String customName = null;
                String customUnit = null;
                if (item.productId() == null) {
                    customName = normalize(item.productName());
                    customUnit = normalize(item.unit());
                    if (customName == null || customUnit == null) {
                        throw new BusinessException(ErrorCode.DRAFT_ITEM_INVALID);
                    }
                } else {
                    // A catalog item takes its name/unit snapshot from the product; never drop client text silently.
                    if (StringUtils.hasText(item.productName()) || StringUtils.hasText(item.unit())) {
                        throw new BusinessException(ErrorCode.DRAFT_ITEM_INVALID);
                    }
                    if (!productIds.add(item.productId())) {
                        throw new BusinessException(ErrorCode.DRAFT_ITEM_DUPLICATE);
                    }
                    product = products.get(item.productId());
                    if (product == null) {
                        throw new BusinessException(ErrorCode.DRAFT_ITEM_INVALID);
                    }
                }
                long lineTotal = BigDecimal.valueOf(item.unitPriceVnd()).multiply(item.quantity())
                        .setScale(0, RoundingMode.HALF_UP).longValueExact();
                subtotal = Math.addExact(subtotal, lineTotal);
                items.add(new PreparedItem(product, customName, customUnit, item.quantity(),
                        item.unitPriceVnd(), lineTotal));
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
            return new PreparedDraft(items, discount, total, paid, customer);
        } catch (ArithmeticException exception) {
            throw new BusinessException(ErrorCode.DRAFT_TOTAL_INVALID);
        }
    }

    private void apply(SaleDraft draft, SaleDraftWriteRequest request, PreparedDraft prepared) {
        Customer customer = prepared.customer();
        draft.replace(customer == null ? null : customer.getId(),
                customer == null ? normalize(request.customerName()) : customer.getName(),
                customer == null ? normalize(request.customerPhone()) : customer.getNormalizedPhone(),
                prepared.discountVnd(), prepared.totalVnd(), prepared.paidVnd(), request.initialPaymentMethod());
    }

    private List<SaleDraftItem> toItems(Long draftId, List<PreparedItem> prepared) {
        return prepared.stream().map(item -> item.product() == null
                ? SaleDraftItem.createCustom(draftId, item.customName(), item.customUnit(), item.quantity(),
                        item.unitPriceVnd(), item.lineTotalVnd())
                : SaleDraftItem.create(draftId, item.product(), item.quantity(), item.unitPriceVnd(),
                        item.lineTotalVnd())).toList();
    }

    private SaleDraftResponse toResponse(SaleDraft draft, List<SaleDraftItem> items) {
        return toResponse(draft, items, OffsetDateTime.now(ZoneOffset.UTC));
    }

    private SaleDraftResponse toResponse(SaleDraft draft, List<SaleDraftItem> items, OffsetDateTime now) {
        return new SaleDraftResponse(draft.getId(), draft.getShopId(), draft.getCustomerName(),
                draft.getCustomerPhone(), draft.getDiscountVnd(), draft.getEstimatedTotalVnd(),
                draft.getInitialPaidVnd(), draft.getInitialPaymentMethod(),
                (draft.getStatus() == DraftStatus.EXPIRED || draft.getStatus() == DraftStatus.DRAFT
                        && !now.isBefore(draft.getExpiresAt())) ? DraftStatus.EXPIRED : draft.getStatus(), draft.getExpiresAt(),
                draft.getConfirmedSaleId(), items.stream().map(this::toItemResponse).toList(),
                draft.getCustomerId());
    }

    private SaleDraftItemResponse toItemResponse(SaleDraftItem item) {
        return new SaleDraftItemResponse(item.getId(), item.getProductId(), item.getProductNameSnapshot(),
                item.getUnitSnapshot(), item.getQuantity(), item.getUnitPriceVnd(), item.getLineTotalVnd());
    }

    private String normalize(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private record PreparedItem(Product product, String customName, String customUnit,
            BigDecimal quantity, long unitPriceVnd, long lineTotalVnd) {
    }

    private record PreparedDraft(List<PreparedItem> items, long discountVnd, long totalVnd, long paidVnd,
            Customer customer) {
    }
}
