package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.smartledger.core.dto.request.SaleDraftItemRequest;
import com.smartledger.core.dto.request.SaleDraftWriteRequest;
import com.smartledger.core.dto.response.SaleDraftResponse;
import com.smartledger.core.entity.Payment;
import com.smartledger.core.entity.Customer;
import com.smartledger.core.entity.Debt;
import com.smartledger.core.entity.Product;
import com.smartledger.core.entity.Sale;
import com.smartledger.core.entity.SaleDraft;
import com.smartledger.core.entity.SaleDraftItem;
import com.smartledger.core.entity.SaleItem;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.CatalogStatus;
import com.smartledger.core.enums.DraftStatus;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.enums.PaymentMethod;
import com.smartledger.core.enums.PaymentStatus;
import com.smartledger.core.enums.PaymentType;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.PaymentRepository;
import com.smartledger.core.repository.CustomerRepository;
import com.smartledger.core.repository.DebtRepository;
import com.smartledger.core.repository.ProductRepository;
import com.smartledger.core.repository.SaleDraftItemRepository;
import com.smartledger.core.repository.SaleDraftRepository;
import com.smartledger.core.repository.SaleItemRepository;
import com.smartledger.core.repository.SaleRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.impl.SaleDraftServiceImpl;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.IntStream;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.test.util.ReflectionTestUtils;

class SaleDraftServiceTest {
    private final ShopService shopService = Mockito.mock(ShopService.class);
    private final SaleDraftRepository draftRepository = Mockito.mock(SaleDraftRepository.class);
    private final SaleDraftItemRepository draftItemRepository = Mockito.mock(SaleDraftItemRepository.class);
    private final ProductRepository productRepository = Mockito.mock(ProductRepository.class);
    private final SaleRepository saleRepository = Mockito.mock(SaleRepository.class);
    private final SaleItemRepository saleItemRepository = Mockito.mock(SaleItemRepository.class);
    private final PaymentRepository paymentRepository = Mockito.mock(PaymentRepository.class);
    private final CustomerRepository customerRepository = Mockito.mock(CustomerRepository.class);
    private final DebtRepository debtRepository = Mockito.mock(DebtRepository.class);
    private final AuditLogService auditLogService = Mockito.mock(AuditLogService.class);
    private final NotificationEventService notifications = Mockito.mock(NotificationEventService.class);
    private final SaleDraftService service = new SaleDraftServiceImpl(shopService, draftRepository,
            draftItemRepository, productRepository, saleRepository, saleItemRepository,
            paymentRepository, customerRepository, debtRepository, auditLogService,
            notifications);
    private final VerifiedFirebaseToken token = new VerifiedFirebaseToken("uid", null, false, null, null, null);

    @BeforeEach
    void setupShop() {
        Shop shop = Shop.create(42L, "Tiệm Thảo", "Grocery", null, null);
        ReflectionTestUtils.setField(shop, "id", 7L);
        when(shopService.requireOwnedActiveShop(any(), eq("7"))).thenReturn(shop);
    }

    @ParameterizedTest
    @ValueSource(ints = {1, 20, 100, 10000})
    void loadsDraftItemsOnceRegardlessOfDraftCount(int count) {
        var drafts = IntStream.rangeClosed(1, count).mapToObj(index -> {
            SaleDraft draft = draft(25000L, PaymentMethod.CASH);
            ReflectionTestUtils.setField(draft, "id", (long) count - index + 1);
            return draft;
        }).toList();
        var items = IntStream.rangeClosed(1, count).boxed().flatMap(index ->
                IntStream.rangeClosed(1, 2).mapToObj(line -> {
                    var item = SaleDraftItem.createCustom((long) index, "Item " + line, "piece",
                            BigDecimal.ONE, 12500L, 12500L);
                    ReflectionTestUtils.setField(item, "id", index * 2L + line);
                    return item;
                })).toList();
        when(draftRepository.findAllByShopIdOrderByIdDesc(7L)).thenReturn(drafts);
        when(draftItemRepository.findAllByShopId(7L)).thenReturn(items);

        var responses = service.list(token, "7");

        assertThat(responses).hasSize(count);
        assertThat(responses).extracting(response -> response.id())
                .containsExactlyElementsOf(drafts.stream().map(SaleDraft::getId).toList());
        for (var response : responses) {
            assertThat(response.items()).extracting(item -> item.id())
                    .containsExactly(response.id() * 2 + 1, response.id() * 2 + 2);
            assertThat(response.items()).extracting(item -> item.productName())
                    .containsExactly("Item 1", "Item 2");
        }
        verify(draftItemRepository).findAllByShopId(7L);
        verify(draftItemRepository, never()).findAllByDraftIdOrderByIdAsc(any());
    }

    @Test
    void emptyDraftListDoesNotReadItems() {
        when(draftRepository.findAllByShopIdOrderByIdDesc(7L)).thenReturn(List.of());

        assertThat(service.list(token, "7")).isEmpty();

        verifyNoInteractions(draftItemRepository);
    }

    @Test
    void draftListPreservesMissingItemsAndLifecycleStates() {
        var expired = draft(25000L, PaymentMethod.CASH);
        ReflectionTestUtils.setField(expired, "id", 14L);
        ReflectionTestUtils.setField(expired, "expiresAt", OffsetDateTime.now(ZoneOffset.UTC).minusDays(1));
        var confirmed = draft(25000L, PaymentMethod.CASH);
        ReflectionTestUtils.setField(confirmed, "id", 13L);
        confirmed.confirm(15L);
        var cancelled = draft(25000L, PaymentMethod.CASH);
        ReflectionTestUtils.setField(cancelled, "id", 12L);
        cancelled.cancel();
        when(draftRepository.findAllByShopIdOrderByIdDesc(7L))
                .thenReturn(List.of(expired, confirmed, cancelled, draft(25000L, PaymentMethod.CASH)));
        when(draftItemRepository.findAllByShopId(7L)).thenReturn(List.of());

        var responses = service.list(token, "7");

        assertThat(responses).extracting(response -> response.id()).containsExactly(14L, 13L, 12L, 11L);
        assertThat(responses).extracting(response -> response.status())
                .containsExactly(DraftStatus.EXPIRED, DraftStatus.CONFIRMED, DraftStatus.CANCELLED, DraftStatus.DRAFT);
        assertThat(responses).allSatisfy(response -> assertThat(response.items()).isEmpty());
        assertThat(expired.getStatus()).isEqualTo(DraftStatus.DRAFT);
        verify(draftItemRepository, never()).findAllByDraftIdOrderByIdAsc(any());
    }

    @Test
    void draftListChecksShopAccessBeforeReadingData() {
        when(shopService.requireOwnedActiveShop(token, "7"))
                .thenThrow(new BusinessException(ErrorCode.SHOP_ACCESS_DENIED));

        assertThatThrownBy(() -> service.list(token, "7"))
                .isInstanceOfSatisfying(BusinessException.class, error ->
                        assertThat(error.getErrorCode()).isEqualTo(ErrorCode.SHOP_ACCESS_DENIED));

        verifyNoInteractions(draftRepository, draftItemRepository);
    }

    @Test
    void creatingDraftDoesNotCreateSalePaymentOrChangeStock() {
        Product product = product(new BigDecimal("5.000"));
        when(productRepository.findAllByIdInAndShopIdAndStatus(Set.of(3L), 7L, CatalogStatus.ACTIVE))
                .thenReturn(List.of(product));
        when(draftRepository.save(any(SaleDraft.class))).thenAnswer(invocation -> {
            SaleDraft draft = invocation.getArgument(0);
            ReflectionTestUtils.setField(draft, "id", 11L);
            return draft;
        });
        when(draftItemRepository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));

        var response = service.create(token, "7", request(25000L, PaymentMethod.CASH));

        assertThat(response.id()).isEqualTo(11L);
        assertThat(response.estimatedTotalVnd()).isEqualTo(25000L);
        assertThat(response.status()).isEqualTo(DraftStatus.DRAFT);
        assertThat(response.items()).hasSize(1);
        assertThat(response.expiresAt()).isAfter(OffsetDateTime.now(ZoneOffset.UTC).plusDays(28));
        assertThat(product.getStockQuantity()).isEqualByComparingTo("5.000");
        verify(saleRepository, never()).saveAndFlush(any());
        verify(paymentRepository, never()).save(any());
    }

    @Test
    void createsCustomItemWithNameAndUnitSnapshotWithoutLookingUpAProduct() {
        when(draftRepository.save(any(SaleDraft.class))).thenAnswer(invocation -> {
            SaleDraft draft = invocation.getArgument(0);
            ReflectionTestUtils.setField(draft, "id", 11L);
            return draft;
        });
        when(draftItemRepository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));
        SaleDraftWriteRequest request = new SaleDraftWriteRequest(null, null, 0L, 20000L,
                PaymentMethod.CASH, List.of(new SaleDraftItemRequest(null, BigDecimal.ONE, 20000L,
                        "  Mon tu chon  ", "  phan  ")));

        var response = service.create(token, "7", request);

        assertThat(response.items()).hasSize(1);
        assertThat(response.items().getFirst().productId()).isNull();
        assertThat(response.items().getFirst().productName()).isEqualTo("Mon tu chon");
        assertThat(response.items().getFirst().unit()).isEqualTo("phan");
        verify(productRepository, never()).findByIdAndShopIdAndStatus(any(), any(), any());
    }

    @Test
    void rejectsCustomItemWithoutNameOrUnit() {
        for (SaleDraftItemRequest item : List.of(
                new SaleDraftItemRequest(null, BigDecimal.ONE, 20000L, " ", "phan"),
                new SaleDraftItemRequest(null, BigDecimal.ONE, 20000L, "Mon", " "))) {
            SaleDraftWriteRequest request = new SaleDraftWriteRequest(null, null, 0L, 20000L,
                    PaymentMethod.CASH, List.of(item));
            assertThatThrownBy(() -> service.create(token, "7", request))
                    .isInstanceOfSatisfying(BusinessException.class, exception ->
                            assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.DRAFT_ITEM_INVALID));
        }
        verify(draftRepository, never()).save(any());
    }

    @Test
    void rejectsCatalogItemThatAlsoSendsCustomNameOrUnit() {
        // The product exists and is ACTIVE, so only the mixed-item rule can reject these requests.
        when(productRepository.findAllByIdInAndShopIdAndStatus(Set.of(3L), 7L, CatalogStatus.ACTIVE))
                .thenReturn(List.of(product(new BigDecimal("5.000"))));
        for (SaleDraftItemRequest item : List.of(
                new SaleDraftItemRequest(3L, BigDecimal.ONE, 20000L, "Bia thung", null),
                new SaleDraftItemRequest(3L, BigDecimal.ONE, 20000L, null, "thung"))) {
            SaleDraftWriteRequest request = new SaleDraftWriteRequest(null, null, 0L, 20000L,
                    PaymentMethod.CASH, List.of(item));
            assertThatThrownBy(() -> service.create(token, "7", request))
                    .isInstanceOfSatisfying(BusinessException.class, exception ->
                            assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.DRAFT_ITEM_INVALID));
        }
        verify(productRepository, never()).findByIdAndShopIdAndStatus(any(), any(), any());
        verify(draftRepository, never()).save(any());
    }

    @Test
    void confirmingFullPaymentCreatesSaleItemsPaymentAndDeductsStock() {
        Product product = product(new BigDecimal("5.000"));
        SaleDraft draft = draft(25000L, PaymentMethod.CASH);
        SaleDraftItem item = SaleDraftItem.create(11L, product, BigDecimal.ONE, 25000L, 25000L);
        when(draftRepository.findLockedByIdAndShopId(11L, 7L)).thenReturn(Optional.of(draft));
        when(draftItemRepository.findAllByDraftIdOrderByIdAsc(11L)).thenReturn(List.of(item));
        when(productRepository.findAllLockedByIdInAndShopIdAndStatus(List.of(3L), 7L, CatalogStatus.ACTIVE))
                .thenReturn(List.of(product));
        when(saleRepository.saveAndFlush(any(Sale.class))).thenAnswer(invocation -> {
            Sale sale = invocation.getArgument(0);
            ReflectionTestUtils.setField(sale, "id", 15L);
            return sale;
        });
        when(saleItemRepository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));

        var response = service.confirm(token, "7", "11");

        assertThat(response.id()).isEqualTo(15L);
        assertThat(response.paymentStatus()).isEqualTo(PaymentStatus.PAID);
        assertThat(response.items()).hasSize(1);
        assertThat(product.getStockQuantity()).isEqualByComparingTo("4.000");
        assertThat(draft.getStatus()).isEqualTo(DraftStatus.CONFIRMED);
        assertThat(draft.getConfirmedSaleId()).isEqualTo(15L);
        ArgumentCaptor<Payment> payment = ArgumentCaptor.forClass(Payment.class);
        verify(paymentRepository).save(payment.capture());
        assertThat(payment.getValue().getSaleId()).isEqualTo(15L);
        assertThat(payment.getValue().getType()).isEqualTo(PaymentType.INITIAL);
        assertThat(payment.getValue().getAmountVnd()).isEqualTo(25000L);
        assertThat(payment.getValue().getReceivedByUserId()).isEqualTo(42L);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<SaleItem>> saleItems = ArgumentCaptor.forClass(List.class);
        verify(saleItemRepository).saveAll(saleItems.capture());
        assertThat(saleItems.getValue().getFirst().getEstimatedCostVnd()).isEqualTo(10_000L);
        verify(debtRepository, never()).save(any());
    }

    @ParameterizedTest
    @ValueSource(ints = {1, 20, 100})
    void confirmationLocksAllCatalogProductsOnce(int count) {
        var products = IntStream.rangeClosed(1, count).mapToObj(index -> {
            Product product = product(BigDecimal.TEN);
            ReflectionTestUtils.setField(product, "id", (long) index);
            return product;
        }).toList();
        var items = products.reversed().stream().map(product ->
                SaleDraftItem.create(11L, product, BigDecimal.ONE, 25000L, 25000L)).toList();
        var ids = products.stream().map(Product::getId).toList();
        SaleDraft draft = draft(count * 25000L, PaymentMethod.CASH);
        draft.replace(null, null, null, 0, count * 25000L, count * 25000L, PaymentMethod.CASH);
        when(draftRepository.findLockedByIdAndShopId(11L, 7L)).thenReturn(Optional.of(draft));
        when(draftItemRepository.findAllByDraftIdOrderByIdAsc(11L)).thenReturn(items);
        when(productRepository.findAllLockedByIdInAndShopIdAndStatus(ids, 7L, CatalogStatus.ACTIVE))
                .thenReturn(products);
        Mockito.doAnswer(call -> {
            assertThat(products).allSatisfy(product -> assertThat(product.getStockQuantity()).isEqualByComparingTo("9"));
            return null;
        }).when(notifications).reconcileStock(any(Shop.class), eq(products));
        when(saleRepository.saveAndFlush(any(Sale.class))).thenAnswer(invocation -> {
            Sale sale = invocation.getArgument(0);
            ReflectionTestUtils.setField(sale, "id", 15L);
            return sale;
        });
        when(saleItemRepository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));

        var response = service.confirm(token, "7", "11");

        assertThat(response.items()).hasSize(count);
        assertThat(response.items()).extracting(item -> item.productId()).containsExactlyElementsOf(ids.reversed());
        assertThat(products).allSatisfy(product -> assertThat(product.getStockQuantity()).isEqualByComparingTo("9"));
        verify(productRepository).findAllLockedByIdInAndShopIdAndStatus(ids, 7L, CatalogStatus.ACTIVE);
        verify(productRepository, never()).findLockedByIdAndShopIdAndStatus(any(), any(), any());
        verify(notifications).reconcileStock(any(Shop.class), eq(products));
        verify(notifications, never()).reconcileStock(any(Shop.class), any(Product.class));
    }

    @Test
    void confirmationRejectsIncompleteBatchBeforeChangingAnyStock() {
        Product product = product(BigDecimal.TEN);
        Product missing = product(BigDecimal.TEN);
        ReflectionTestUtils.setField(missing, "id", 5L);
        SaleDraft draft = draft(50000L, PaymentMethod.CASH);
        draft.replace(null, null, null, 0, 50000L, 50000L, PaymentMethod.CASH);
        when(draftRepository.findLockedByIdAndShopId(11L, 7L)).thenReturn(Optional.of(draft));
        when(draftItemRepository.findAllByDraftIdOrderByIdAsc(11L)).thenReturn(List.of(
                SaleDraftItem.create(11L, product, BigDecimal.ONE, 25000L, 25000L),
                SaleDraftItem.create(11L, missing, BigDecimal.ONE, 25000L, 25000L)));
        when(productRepository.findAllLockedByIdInAndShopIdAndStatus(List.of(3L, 5L), 7L, CatalogStatus.ACTIVE))
                .thenReturn(List.of(product));

        assertThatThrownBy(() -> service.confirm(token, "7", "11"))
                .isInstanceOfSatisfying(BusinessException.class, error ->
                        assertThat(error.getErrorCode()).isEqualTo(ErrorCode.DRAFT_ITEM_INVALID));
        assertThat(product.getStockQuantity()).isEqualByComparingTo("10");
        verifyNoInteractions(saleRepository, saleItemRepository, paymentRepository, debtRepository);
    }

    @Test
    void confirmingMixedDraftSavesCustomSaleItemWithoutDeductingCustomStock() {
        Product product = product(new BigDecimal("5.000"));
        SaleDraft draft = SaleDraft.create(7L, 42L);
        ReflectionTestUtils.setField(draft, "id", 11L);
        draft.replace(null, null, null, 0L, 45000L, 45000L, PaymentMethod.CASH);
        SaleDraftItem catalogItem = SaleDraftItem.create(11L, product, BigDecimal.ONE, 25000L, 25000L);
        SaleDraftItem customItem = SaleDraftItem.createCustom(11L, "Mon tu chon", "phan",
                BigDecimal.ONE, 20000L, 20000L);
        when(draftRepository.findLockedByIdAndShopId(11L, 7L)).thenReturn(Optional.of(draft));
        when(draftItemRepository.findAllByDraftIdOrderByIdAsc(11L))
                .thenReturn(List.of(catalogItem, customItem));
        when(productRepository.findAllLockedByIdInAndShopIdAndStatus(List.of(3L), 7L, CatalogStatus.ACTIVE))
                .thenReturn(List.of(product));
        when(saleRepository.saveAndFlush(any(Sale.class))).thenAnswer(invocation -> {
            Sale sale = invocation.getArgument(0);
            ReflectionTestUtils.setField(sale, "id", 15L);
            return sale;
        });
        when(saleItemRepository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));

        var response = service.confirm(token, "7", "11");

        assertThat(response.items()).hasSize(2);
        assertThat(response.items().get(1).productId()).isNull();
        assertThat(response.items().get(1).productName()).isEqualTo("Mon tu chon");
        assertThat(response.items().get(1).unit()).isEqualTo("phan");
        assertThat(response.totalVnd()).isEqualTo(45000L);
        assertThat(product.getStockQuantity()).isEqualByComparingTo("4.000");
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<SaleItem>> saleItems = ArgumentCaptor.forClass(List.class);
        verify(saleItemRepository).saveAll(saleItems.capture());
        assertThat(saleItems.getValue()).extracting(SaleItem::getEstimatedCostVnd)
                .containsExactly(10_000L, null);
        verify(productRepository).findAllLockedByIdInAndShopIdAndStatus(List.of(3L), 7L, CatalogStatus.ACTIVE);
        verify(paymentRepository).save(any(Payment.class));
    }

    @Test
    void confirmingCustomOnlyDraftDoesNotLockAnyProduct() {
        SaleDraft draft = draft(25000L, PaymentMethod.CASH);
        SaleDraftItem item = SaleDraftItem.createCustom(11L, "Mon tu chon", "phan",
                BigDecimal.ONE, 25000L, 25000L);
        when(draftRepository.findLockedByIdAndShopId(11L, 7L)).thenReturn(Optional.of(draft));
        when(draftItemRepository.findAllByDraftIdOrderByIdAsc(11L)).thenReturn(List.of(item));
        when(saleRepository.saveAndFlush(any(Sale.class))).thenAnswer(invocation -> {
            Sale sale = invocation.getArgument(0);
            ReflectionTestUtils.setField(sale, "id", 15L);
            return sale;
        });
        when(saleItemRepository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));

        var response = service.confirm(token, "7", "11");

        assertThat(response.items()).hasSize(1);
        assertThat(response.items().getFirst().productId()).isNull();
        assertThat(response.items().getFirst().productName()).isEqualTo("Mon tu chon");
        verifyNoInteractions(productRepository);
        verify(paymentRepository).save(any(Payment.class));
    }

    @Test
    void confirmingAlreadyConfirmedDraftReturnsExistingSaleWithoutChargingAgain() {
        SaleDraft draft = draft(25000L, PaymentMethod.CASH);
        draft.confirm(15L);
        Sale sale = Sale.fromPaidDraft(draft, 25000L);
        ReflectionTestUtils.setField(sale, "id", 15L);
        when(draftRepository.findLockedByIdAndShopId(11L, 7L)).thenReturn(Optional.of(draft));
        when(saleRepository.findByIdAndShopId(15L, 7L)).thenReturn(Optional.of(sale));
        when(saleItemRepository.findAllBySaleIdOrderByIdAsc(15L)).thenReturn(List.of());

        assertThat(service.confirm(token, "7", "11").id()).isEqualTo(15L);
        verify(paymentRepository, never()).save(any());
        verifyNoInteractions(productRepository);
    }

    @Test
    void partialPaymentDraftCreatesCustomerSaleInitialPaymentAndDebtOnConfirm() {
        Product product = product(new BigDecimal("5.000"));
        when(productRepository.findAllByIdInAndShopIdAndStatus(Set.of(3L), 7L, CatalogStatus.ACTIVE))
                .thenReturn(List.of(product));
        when(draftRepository.save(any(SaleDraft.class))).thenAnswer(invocation -> {
            SaleDraft saved = invocation.getArgument(0);
            ReflectionTestUtils.setField(saved, "id", 11L);
            return saved;
        });
        when(draftItemRepository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));
        Customer customer = Customer.create(7L, "Khách An", null);
        ReflectionTestUtils.setField(customer, "id", 22L);
        when(customerRepository.save(any(Customer.class))).thenReturn(customer);

        SaleDraftWriteRequest request = new SaleDraftWriteRequest("Khách An", null, 0L, 10000L,
                PaymentMethod.CASH, List.of(new SaleDraftItemRequest(3L, BigDecimal.ONE, 25000L)));
        var created = service.create(token, "7", request);

        assertThat(created.initialPaidVnd()).isEqualTo(10000L);
        assertThat(created.estimatedTotalVnd()).isEqualTo(25000L);
        ArgumentCaptor<SaleDraft> draftCaptor = ArgumentCaptor.forClass(SaleDraft.class);
        verify(draftRepository).save(draftCaptor.capture());
        SaleDraft draft = draftCaptor.getValue();
        when(draftRepository.findLockedByIdAndShopId(11L, 7L)).thenReturn(Optional.of(draft));
        when(draftItemRepository.findAllByDraftIdOrderByIdAsc(11L)).thenReturn(List.of(
                SaleDraftItem.create(11L, product, BigDecimal.ONE, 25000L, 25000L)));
        when(productRepository.findAllLockedByIdInAndShopIdAndStatus(List.of(3L), 7L, CatalogStatus.ACTIVE))
                .thenReturn(List.of(product));
        when(saleRepository.saveAndFlush(any(Sale.class))).thenAnswer(invocation -> {
            Sale sale = invocation.getArgument(0);
            ReflectionTestUtils.setField(sale, "id", 15L);
            return sale;
        });
        when(saleItemRepository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));

        var confirmed = service.confirm(token, "7", "11");

        assertThat(confirmed.paymentStatus()).isEqualTo(PaymentStatus.PARTIAL);
        assertThat(confirmed.customerId()).isEqualTo(22L);
        assertThat(confirmed.outstandingVnd()).isEqualTo(15000L);
        assertThat(product.getStockQuantity()).isEqualByComparingTo("4.000");
        assertThat(draft.getStatus()).isEqualTo(DraftStatus.CONFIRMED);
        ArgumentCaptor<Payment> payment = ArgumentCaptor.forClass(Payment.class);
        verify(paymentRepository).save(payment.capture());
        assertThat(payment.getValue().getAmountVnd()).isEqualTo(10000L);
        ArgumentCaptor<Debt> debt = ArgumentCaptor.forClass(Debt.class);
        verify(debtRepository).save(debt.capture());
        assertThat(debt.getValue().getSaleId()).isEqualTo(15L);
        assertThat(debt.getValue().getCustomerId()).isEqualTo(22L);
        assertThat(debt.getValue().getOutstandingVnd()).isEqualTo(15000L);
    }

    @Test
    void selectedExistingCustomerIsReusedForUnpaidSaleWithoutCreatingAnotherCustomer() {
        Product product = product(new BigDecimal("5.000"));
        Customer customer = Customer.create(7L, "Khách An", "0901234567");
        ReflectionTestUtils.setField(customer, "id", 22L);
        when(customerRepository.findByIdAndShopIdAndStatus(22L, 7L, CatalogStatus.ACTIVE))
                .thenReturn(Optional.of(customer));
        when(productRepository.findAllByIdInAndShopIdAndStatus(Set.of(3L), 7L, CatalogStatus.ACTIVE))
                .thenReturn(List.of(product));
        when(draftRepository.save(any(SaleDraft.class))).thenAnswer(invocation -> {
            SaleDraft saved = invocation.getArgument(0);
            ReflectionTestUtils.setField(saved, "id", 11L);
            return saved;
        });
        when(draftItemRepository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));
        SaleDraftWriteRequest request = new SaleDraftWriteRequest(null, null, 0L, 0L, null,
                List.of(new SaleDraftItemRequest(3L, BigDecimal.ONE, 25000L)), 22L);

        var created = service.create(token, "7", request);
        assertThat(created.customerId()).isEqualTo(22L);
        assertThat(created.customerName()).isEqualTo("Khách An");
        ArgumentCaptor<SaleDraft> draftCaptor = ArgumentCaptor.forClass(SaleDraft.class);
        verify(draftRepository).save(draftCaptor.capture());
        when(draftRepository.findLockedByIdAndShopId(11L, 7L))
                .thenReturn(Optional.of(draftCaptor.getValue()));
        when(draftItemRepository.findAllByDraftIdOrderByIdAsc(11L)).thenReturn(List.of(
                SaleDraftItem.create(11L, product, BigDecimal.ONE, 25000L, 25000L)));
        when(productRepository.findAllLockedByIdInAndShopIdAndStatus(List.of(3L), 7L, CatalogStatus.ACTIVE))
                .thenReturn(List.of(product));
        when(saleRepository.saveAndFlush(any(Sale.class))).thenAnswer(invocation -> {
            Sale sale = invocation.getArgument(0);
            ReflectionTestUtils.setField(sale, "id", 15L);
            return sale;
        });
        when(saleItemRepository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));

        var confirmed = service.confirm(token, "7", "11");

        assertThat(confirmed.customerId()).isEqualTo(22L);
        assertThat(confirmed.paymentStatus()).isEqualTo(PaymentStatus.DEBT);
        assertThat(confirmed.outstandingVnd()).isEqualTo(25000L);
        ArgumentCaptor<Debt> debtCaptor = ArgumentCaptor.forClass(Debt.class);
        verify(debtRepository).save(debtCaptor.capture());
        assertThat(debtCaptor.getValue().getCustomerId()).isEqualTo(22L);
        verify(customerRepository, never()).save(any());
        verify(paymentRepository, never()).save(any());
    }

    @Test
    void customersWithSameNameRemainSeparatedBySelectedId() {
        Product product = product(new BigDecimal("5.000"));
        Customer first = Customer.create(7L, "Khách An", null);
        Customer second = Customer.create(7L, "Khách An", null);
        ReflectionTestUtils.setField(first, "id", 22L);
        ReflectionTestUtils.setField(second, "id", 23L);
        when(customerRepository.findByIdAndShopIdAndStatus(22L, 7L, CatalogStatus.ACTIVE))
                .thenReturn(Optional.of(first));
        when(customerRepository.findByIdAndShopIdAndStatus(23L, 7L, CatalogStatus.ACTIVE))
                .thenReturn(Optional.of(second));
        when(productRepository.findAllByIdInAndShopIdAndStatus(Set.of(3L), 7L, CatalogStatus.ACTIVE))
                .thenReturn(List.of(product));
        when(draftRepository.save(any(SaleDraft.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(draftItemRepository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));

        var firstDraft = service.create(token, "7", new SaleDraftWriteRequest(null, null, 0L, 0L, null,
                List.of(new SaleDraftItemRequest(3L, BigDecimal.ONE, 25000L)), 22L));
        var secondDraft = service.create(token, "7", new SaleDraftWriteRequest(null, null, 0L, 0L, null,
                List.of(new SaleDraftItemRequest(3L, BigDecimal.ONE, 25000L)), 23L));

        assertThat(firstDraft.customerName()).isEqualTo(secondDraft.customerName());
        assertThat(firstDraft.customerId()).isEqualTo(22L);
        assertThat(secondDraft.customerId()).isEqualTo(23L);
        verify(customerRepository, never()).save(any());
    }

    @Test
    void unpaidDraftRequiresANameOrAnExistingCustomerBeforeConfirmation() {
        SaleDraft draft = draft(0, null);
        when(draftRepository.findLockedByIdAndShopId(11L, 7L)).thenReturn(Optional.of(draft));

        assertThatThrownBy(() -> service.confirm(token, "7", "11"))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.CUSTOMER_REQUIRED_FOR_DEBT));
        verify(saleRepository, never()).saveAndFlush(any());
        verify(paymentRepository, never()).save(any());
        verify(debtRepository, never()).save(any());
    }

    @Test
    void paidAmountWithoutPaymentMethodIsRejectedBeforeCreatingDraft() {
        Product product = product(new BigDecimal("5.000"));
        when(productRepository.findAllByIdInAndShopIdAndStatus(Set.of(3L), 7L, CatalogStatus.ACTIVE))
                .thenReturn(List.of(product));

        assertThatThrownBy(() -> service.create(token, "7", request(10000L, null)))
                .isInstanceOfSatisfying(BusinessException.class, exception -> {
                    assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.DRAFT_PAYMENT_INVALID);
                    assertThat(exception.getMessage()).contains("payment method");
                });
        verify(draftRepository, never()).save(any());
        verify(saleRepository, never()).saveAndFlush(any());
        verify(paymentRepository, never()).save(any());
        assertThat(product.getStockQuantity()).isEqualByComparingTo("5.000");
    }

    @Test
    void insufficientStockPreventsSaleAndPayment() {
        Product product = product(BigDecimal.ZERO);
        SaleDraft draft = draft(25000L, PaymentMethod.CASH);
        SaleDraftItem item = SaleDraftItem.create(11L, product, BigDecimal.ONE, 25000L, 25000L);
        when(draftRepository.findLockedByIdAndShopId(11L, 7L)).thenReturn(Optional.of(draft));
        when(draftItemRepository.findAllByDraftIdOrderByIdAsc(11L)).thenReturn(List.of(item));
        when(productRepository.findAllLockedByIdInAndShopIdAndStatus(List.of(3L), 7L, CatalogStatus.ACTIVE))
                .thenReturn(List.of(product));

        assertThatThrownBy(() -> service.confirm(token, "7", "11"))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.PRODUCT_STOCK_INSUFFICIENT));
        verify(saleRepository, never()).saveAndFlush(any());
        verify(paymentRepository, never()).save(any());
    }

    @Test
    void rejectsProductFromAnotherShopAndDuplicateProductInDraft() {
        assertThatThrownBy(() -> service.create(token, "7", request(25000L, PaymentMethod.CASH)))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.DRAFT_ITEM_INVALID));
        verify(draftRepository, never()).save(any());

        Product product = product(new BigDecimal("5.000"));
        when(productRepository.findAllByIdInAndShopIdAndStatus(Set.of(3L), 7L, CatalogStatus.ACTIVE))
                .thenReturn(List.of(product));
        SaleDraftItemRequest line = new SaleDraftItemRequest(3L, BigDecimal.ONE, 25000L);
        SaleDraftWriteRequest duplicates = new SaleDraftWriteRequest(null, null, 0L, 50000L,
                PaymentMethod.CASH, List.of(line, line));
        assertThatThrownBy(() -> service.create(token, "7", duplicates))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.DRAFT_ITEM_DUPLICATE));
    }

    @Test
    void cancelledDraftCannotBeConfirmed() {
        SaleDraft draft = draft(25000L, PaymentMethod.CASH);
        draft.cancel();
        when(draftRepository.findLockedByIdAndShopId(11L, 7L)).thenReturn(Optional.of(draft));

        assertThatThrownBy(() -> service.confirm(token, "7", "11"))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.DRAFT_NOT_EDITABLE));
    }

    @Test
    void expiredDraftCannotBeConfirmed() {
        SaleDraft draft = draft(25000L, PaymentMethod.CASH);
        ReflectionTestUtils.setField(draft, "expiresAt", OffsetDateTime.now(ZoneOffset.UTC).minusSeconds(1));
        when(draftRepository.findByIdAndShopId(11L, 7L)).thenReturn(Optional.of(draft));
        when(draftRepository.findLockedByIdAndShopId(11L, 7L)).thenReturn(Optional.of(draft));

        assertThat(service.getById(token, "7", "11").status()).isEqualTo(DraftStatus.EXPIRED);
        assertThatThrownBy(() -> service.confirm(token, "7", "11"))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.DRAFT_NOT_EDITABLE));
    }

    @Test
    void cancelKeepsDraftHistoryWithoutDeletingRows() {
        SaleDraft draft = draft(25000L, PaymentMethod.CASH);
        when(draftRepository.findLockedByIdAndShopId(11L, 7L)).thenReturn(Optional.of(draft));

        service.cancel(token, "7", "11");

        assertThat(draft.getStatus()).isEqualTo(DraftStatus.CANCELLED);
        assertThat(draft.getCancelledAt()).isNotNull();
        verify(draftRepository, never()).delete(any());
        verify(draftItemRepository, never()).deleteAllByDraftId(any());
    }

    @Test
    void replaceDraftReplacesItemsButDoesNotCreateSale() {
        SaleDraft draft = draft(25000L, PaymentMethod.CASH);
        Product product = product(new BigDecimal("5.000"));
        when(draftRepository.findLockedByIdAndShopId(11L, 7L)).thenReturn(Optional.of(draft));
        when(productRepository.findAllByIdInAndShopIdAndStatus(Set.of(3L), 7L, CatalogStatus.ACTIVE))
                .thenReturn(List.of(product));
        when(draftItemRepository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));

        var response = service.replace(token, "7", "11", request(25000L, PaymentMethod.CASH));

        assertThat(response.items()).hasSize(1);
        verify(draftItemRepository).deleteAllByDraftId(11L);
        verify(saleRepository, never()).saveAndFlush(any());
    }

    @Test
    void replacesCatalogItemWithCustomItemWithoutLookingUpAProduct() {
        SaleDraft draft = draft(25000L, PaymentMethod.CASH);
        when(draftRepository.findLockedByIdAndShopId(11L, 7L)).thenReturn(Optional.of(draft));
        when(draftItemRepository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));
        SaleDraftWriteRequest request = new SaleDraftWriteRequest(null, null, 0L, 25000L,
                PaymentMethod.CASH, List.of(new SaleDraftItemRequest(null, BigDecimal.ONE, 25000L,
                        "Mon moi", "phan")));

        var response = service.replace(token, "7", "11", request);

        assertThat(response.items()).hasSize(1);
        assertThat(response.items().getFirst().productId()).isNull();
        assertThat(response.items().getFirst().productName()).isEqualTo("Mon moi");
        verify(draftItemRepository).deleteAllByDraftId(11L);
        verify(productRepository, never()).findByIdAndShopIdAndStatus(any(), any(), any());
    }

    @Test
    void paidDraftCanConfirmWithArchivedCustomerUsingItsExistingSnapshot() {
        SaleDraft draft = draft(25000L, PaymentMethod.CASH);
        draft.replace(22L, "Snapshot customer", "0901234567", 0, 25000, 25000, PaymentMethod.CASH);
        when(draftRepository.findLockedByIdAndShopId(11L, 7L)).thenReturn(Optional.of(draft));
        when(draftItemRepository.findAllByDraftIdOrderByIdAsc(11L)).thenReturn(List.of(
                SaleDraftItem.createCustom(11L, "Custom", "piece", BigDecimal.ONE, 25000L, 25000L)));
        when(saleRepository.saveAndFlush(any(Sale.class))).thenAnswer(invocation -> {
            Sale sale = invocation.getArgument(0);
            ReflectionTestUtils.setField(sale, "id", 15L);
            return sale;
        });
        when(saleItemRepository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));

        var result = service.confirm(token, "7", "11");

        assertThat(result.customerId()).isNull();
        assertThat(result.customerName()).isEqualTo("Snapshot customer");
        assertThat(result.customerPhone()).isEqualTo("0901234567");
        assertThat(result.paymentStatus()).isEqualTo(PaymentStatus.PAID);
        verify(customerRepository).findByIdAndShopIdAndStatus(22L, 7L, CatalogStatus.ACTIVE);
        verify(customerRepository, never()).save(any());
        verify(debtRepository, never()).save(any());
    }

    @ParameterizedTest
    @ValueSource(longs = {0, 10000})
    void unpaidOrPartialDraftCannotConfirmWithArchivedSelectedCustomer(long paid) {
        SaleDraft draft = draft(paid, paid == 0 ? null : PaymentMethod.CASH);
        draft.replace(22L, "Snapshot customer", "0901234567", 0, 25000, paid,
                paid == 0 ? null : PaymentMethod.CASH);
        when(draftRepository.findLockedByIdAndShopId(11L, 7L)).thenReturn(Optional.of(draft));

        assertThatThrownBy(() -> service.confirm(token, "7", "11"))
                .isInstanceOfSatisfying(BusinessException.class, error ->
                        assertThat(error.getErrorCode()).isEqualTo(ErrorCode.CUSTOMER_NOT_FOUND));
        verify(saleRepository, never()).saveAndFlush(any());
        verify(customerRepository, never()).save(any());
        verify(debtRepository, never()).save(any());
        verify(paymentRepository, never()).save(any());
        verify(auditLogService, never()).recordOwner(any(), any(), any(), any(), any(), any());
    }

    @ParameterizedTest
    @MethodSource("draftWriteSizes")
    void draftWritesReadCatalogOnceAndKeepRequestOrder(boolean replace, int count) {
        stubDraftWrite();
        var catalog = IntStream.rangeClosed(1, count).mapToObj(index -> {
            Product product = product(BigDecimal.TEN);
            ReflectionTestUtils.setField(product, "id", (long) index);
            product.replace(null, "Product " + index, null, null, "unit " + index,
                    25000L, 10000L, true, BigDecimal.TEN);
            return product;
        }).toList();
        var ids = catalog.stream().map(Product::getId).collect(java.util.stream.Collectors.toSet());
        when(productRepository.findAllByIdInAndShopIdAndStatus(ids, 7L, CatalogStatus.ACTIVE))
                .thenReturn(catalog.reversed());
        var lines = catalog.stream().map(product -> new SaleDraftItemRequest(product.getId(), BigDecimal.ONE, 100L)).toList();

        var response = writeDraft(replace, new SaleDraftWriteRequest(null, null, 0L, 0L, null, lines));

        assertThat(response.items()).extracting(item -> item.productId())
                .containsExactlyElementsOf(catalog.stream().map(Product::getId).toList());
        assertThat(response.items()).extracting(item -> item.productName())
                .containsExactlyElementsOf(catalog.stream().map(Product::getName).toList());
        assertThat(response.items()).extracting(item -> item.unit())
                .containsExactlyElementsOf(catalog.stream().map(Product::getUnit).toList());
        assertThat(response.estimatedTotalVnd()).isEqualTo(count * 100L);
        verify(productRepository).findAllByIdInAndShopIdAndStatus(ids, 7L, CatalogStatus.ACTIVE);
        verify(productRepository, never()).findByIdAndShopIdAndStatus(any(), any(), any());
        verifyNoInteractions(saleRepository, saleItemRepository, paymentRepository, debtRepository, auditLogService, notifications);
    }

    static Stream<Arguments> draftWriteSizes() {
        return Stream.of(false, true).flatMap(replace -> IntStream.of(1, 20, 100)
                .mapToObj(count -> Arguments.of(replace, count)));
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void draftWritesPreserveMixedSnapshotsRoundingDiscountAndInitialPayment(boolean replace) {
        stubDraftWrite();
        when(productRepository.findAllByIdInAndShopIdAndStatus(Set.of(3L), 7L, CatalogStatus.ACTIVE))
                .thenReturn(List.of(product(BigDecimal.TEN)));
        var request = new SaleDraftWriteRequest("  Buyer  ", " 0901234567 ", 3L, 100L, PaymentMethod.CASH,
                List.of(new SaleDraftItemRequest(null, new BigDecimal("1.500"), 101L, "  Custom  ", " piece "),
                        new SaleDraftItemRequest(3L, new BigDecimal("1.005"), 100L)));

        var response = writeDraft(replace, request);

        assertThat(response.items()).extracting(item -> item.productId()).containsExactly(null, 3L);
        assertThat(response.items()).extracting(item -> item.productName()).containsExactly("Custom", "Cà phê");
        assertThat(response.items()).extracting(item -> item.unit()).containsExactly("piece", "ly");
        assertThat(response.items()).extracting(item -> item.lineTotalVnd()).containsExactly(152L, 101L);
        assertThat(response.items()).extracting(item -> item.unitPriceVnd()).containsExactly(101L, 100L);
        assertThat(response.discountVnd()).isEqualTo(3);
        assertThat(response.estimatedTotalVnd()).isEqualTo(250);
        assertThat(response.initialPaidVnd()).isEqualTo(100);
        assertThat(response.initialPaymentMethod()).isEqualTo(PaymentMethod.CASH);
        assertThat(response.customerName()).isEqualTo("Buyer");
        assertThat(response.customerPhone()).isEqualTo("0901234567");
        verify(productRepository).findAllByIdInAndShopIdAndStatus(Set.of(3L), 7L, CatalogStatus.ACTIVE);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void allCustomDraftWritesNeverReadProducts(boolean replace) {
        stubDraftWrite();
        var lines = IntStream.range(0, 100).mapToObj(index ->
                new SaleDraftItemRequest(null, BigDecimal.ONE, 100L, "Custom " + index, "piece")).toList();

        assertThat(writeDraft(replace, new SaleDraftWriteRequest(null, null, 0L, 0L, null, lines)).items()).hasSize(100);

        verifyNoInteractions(productRepository);
    }

    @ParameterizedTest(name = "replace={0}, {1}")
    @MethodSource("draftWriteErrors")
    void draftWritesKeepOriginalErrorPrecedence(boolean replace, String scenario,
            List<SaleDraftItemRequest> lines, ErrorCode expected) {
        stubDraftWrite();
        when(productRepository.findAllByIdInAndShopIdAndStatus(any(), eq(7L), eq(CatalogStatus.ACTIVE)))
                .thenReturn(List.of(product(BigDecimal.TEN)));

        assertThatThrownBy(() -> writeDraft(replace, new SaleDraftWriteRequest(null, null, 0L, 0L, null, lines)))
                .isInstanceOfSatisfying(BusinessException.class, error -> assertThat(error.getErrorCode()).isEqualTo(expected));

        verify(draftRepository, never()).save(any());
        verify(draftItemRepository, never()).deleteAllByDraftId(any());
        verify(draftItemRepository, never()).saveAll(any());
    }

    static Stream<Arguments> draftWriteErrors() {
        var valid = new SaleDraftItemRequest(3L, BigDecimal.ONE, 100L);
        var missing = new SaleDraftItemRequest(99L, BigDecimal.ONE, 100L);
        var custom = new SaleDraftItemRequest(null, BigDecimal.ONE, 100L, " ", "piece");
        var text = new SaleDraftItemRequest(3L, BigDecimal.ONE, 100L, "Client text", null);
        var overflow = new SaleDraftItemRequest(3L, new BigDecimal("999999999999.999"), Long.MAX_VALUE);
        var max = new SaleDraftItemRequest(null, BigDecimal.ONE, Long.MAX_VALUE, "Custom", "piece");
        return Stream.of(false, true).flatMap(replace -> Stream.of(
                Arguments.of(replace, "missing before duplicate", List.of(missing, valid, valid), ErrorCode.DRAFT_ITEM_INVALID),
                Arguments.of(replace, "missing duplicate is still invalid", List.of(missing, missing), ErrorCode.DRAFT_ITEM_INVALID),
                Arguments.of(replace, "custom before duplicate", List.of(custom, valid, valid), ErrorCode.DRAFT_ITEM_INVALID),
                Arguments.of(replace, "catalog text before duplicate", List.of(valid, text), ErrorCode.DRAFT_ITEM_INVALID),
                Arguments.of(replace, "duplicate before missing", List.of(valid, valid, missing), ErrorCode.DRAFT_ITEM_DUPLICATE),
                Arguments.of(replace, "duplicate before custom", List.of(valid, valid, custom), ErrorCode.DRAFT_ITEM_DUPLICATE),
                Arguments.of(replace, "duplicate before overflow", List.of(valid, overflow), ErrorCode.DRAFT_ITEM_DUPLICATE),
                Arguments.of(replace, "line overflow before duplicate", List.of(overflow, valid), ErrorCode.DRAFT_TOTAL_INVALID),
                Arguments.of(replace, "subtotal overflow before missing", List.of(max, valid, missing), ErrorCode.DRAFT_TOTAL_INVALID)));
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void invalidCustomerWinsBeforeItemValidationOrProductRead(boolean replace) {
        stubDraftWrite();
        var request = new SaleDraftWriteRequest(null, null, 0L, 0L, null,
                List.of(new SaleDraftItemRequest(null, BigDecimal.ONE, 100L)), 22L);

        assertThatThrownBy(() -> writeDraft(replace, request))
                .isInstanceOfSatisfying(BusinessException.class,
                        error -> assertThat(error.getErrorCode()).isEqualTo(ErrorCode.CUSTOMER_NOT_FOUND));

        verifyNoInteractions(productRepository, draftItemRepository);
        verify(draftRepository, never()).save(any());
    }

    private void stubDraftWrite() {
        when(draftRepository.findLockedByIdAndShopId(11L, 7L)).thenReturn(Optional.of(draft(0, null)));
        when(draftRepository.save(any(SaleDraft.class))).thenAnswer(invocation -> {
            SaleDraft saved = invocation.getArgument(0);
            ReflectionTestUtils.setField(saved, "id", 11L);
            return saved;
        });
        when(draftItemRepository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));
    }

    private SaleDraftResponse writeDraft(boolean replace, SaleDraftWriteRequest request) {
        return replace ? service.replace(token, "7", "11", request) : service.create(token, "7", request);
    }

    private Product product(BigDecimal stock) {
        Product product = Product.create(7L);
        ReflectionTestUtils.setField(product, "id", 3L);
        product.replace(null, "Cà phê", null, null, "ly", 25000L, 10000L, true, stock);
        return product;
    }

    private SaleDraft draft(long paid, PaymentMethod method) {
        SaleDraft draft = SaleDraft.create(7L, 42L);
        ReflectionTestUtils.setField(draft, "id", 11L);
        draft.replace(null, null, null, 0, 25000, paid, method);
        return draft;
    }

    private SaleDraftWriteRequest request(long paid, PaymentMethod method) {
        return new SaleDraftWriteRequest(null, null, 0L, paid, method,
                List.of(new SaleDraftItemRequest(3L, BigDecimal.ONE, 25000L)));
    }
}
