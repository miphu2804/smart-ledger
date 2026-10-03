package com.smartledger.core.entity;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.TimeZone;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.ResourceLock;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.test.util.ReflectionTestUtils;

@ResourceLock("java.util.TimeZone.default")
class EntityTimeTest {
    private TimeZone originalZone;

    @BeforeEach
    void useNonVietnamHostTimezone() {
        originalZone = TimeZone.getDefault();
        TimeZone.setDefault(TimeZone.getTimeZone("America/Los_Angeles"));
    }

    @AfterEach
    void restoreHostTimezone() {
        TimeZone.setDefault(originalZone);
    }

    static Stream<Object> entities() {
        return Stream.of(new AuthIdentity(), new UserAccount(), new Shop(), new Category(), new Product(),
                new Customer(), new Expense(), new SaleDraft(), new SaleDraftItem(), new Sale(),
                new SaleItem(), new Payment(), new Debt(), new SaleRefund());
    }

    static Stream<Object> updatableEntities() {
        return Stream.of(new AuthIdentity(), new UserAccount(), new Shop(), new Category(), new Product(),
                new Customer(), new Expense(), new SaleDraft(), new SaleDraftItem(), new Sale());
    }

    @ParameterizedTest
    @MethodSource("entities")
    void creationCallbacksGenerateUtcTimestampsRegardlessOfHostTimezone(Object entity) {
        Instant before = Instant.now();
        ReflectionTestUtils.invokeMethod(entity, "onCreate");
        String field = entity instanceof SaleRefund ? "refundedAt" : "createdAt";
        OffsetDateTime created = (OffsetDateTime) ReflectionTestUtils.getField(entity, field);
        assertThat(created.getOffset()).isEqualTo(ZoneOffset.UTC);
        assertThat(created.toInstant()).isBetween(before, Instant.now());
    }

    @ParameterizedTest
    @MethodSource("updatableEntities")
    void updateCallbacksUseUtcAndPreserveCreationTime(Object entity) {
        ReflectionTestUtils.invokeMethod(entity, "onCreate");
        Object created = ReflectionTestUtils.getField(entity, "createdAt");
        Instant before = Instant.now();
        ReflectionTestUtils.invokeMethod(entity, "onUpdate");
        OffsetDateTime updated = (OffsetDateTime) ReflectionTestUtils.getField(entity, "updatedAt");
        assertThat(updated.getOffset()).isEqualTo(ZoneOffset.UTC);
        assertThat(updated.toInstant()).isBetween(before, Instant.now());
        assertThat(ReflectionTestUtils.getField(entity, "createdAt")).isEqualTo(created);
    }

    @Test
    void confirmationAndArchiveEventsUseUtc() {
        var draft = SaleDraft.create(7L, 42L);
        draft.confirm(15L);
        assertThat(draft.getConfirmedAt().getOffset()).isEqualTo(ZoneOffset.UTC);
        var product = Product.create(7L);
        product.archive(42L);
        assertThat(product.getArchivedAt().getOffset()).isEqualTo(ZoneOffset.UTC);
        var category = Category.create(7L, "Category");
        category.archive(42L);
        assertThat(category.getArchivedAt().getOffset()).isEqualTo(ZoneOffset.UTC);
        var shop = Shop.create(42L, "Shop", "Retail", null, null);
        shop.archive("Closed");
        assertThat(shop.getArchivedAt().getOffset()).isEqualTo(ZoneOffset.UTC);
    }
}
