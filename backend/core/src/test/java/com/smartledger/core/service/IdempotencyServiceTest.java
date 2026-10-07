package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.IdempotencyKeyRepository;
import com.smartledger.core.repository.IdempotencyKeyRepository.StoredResult;
import com.smartledger.core.service.impl.IdempotencyServiceImpl;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;

class IdempotencyServiceTest {
    private final IdempotencyKeyRepository repository = Mockito.mock(IdempotencyKeyRepository.class);
    private final IdempotencyService service = new IdempotencyServiceImpl(repository, new ObjectMapper(), 30);

    @Test
    void retriesTheSameRequestWithoutRunningTheActionAgain() {
        when(repository.reserve(eq(7L), eq(42L), eq("DEBT_REPAYMENT"), eq("retry-key"),
                any(), any())).thenReturn(true, false);
        AtomicInteger calls = new AtomicInteger();
        TestResponse first = service.execute(7L, 42L, "DEBT_REPAYMENT", "retry-key",
                new Object[] { 11L, 5_000L }, "PAYMENT", TestResponse::id, TestResponse.class,
                () -> new TestResponse(21L, calls.incrementAndGet()));

        ArgumentCaptor<String> hash = ArgumentCaptor.forClass(String.class);
        verify(repository).reserve(eq(7L), eq(42L), eq("DEBT_REPAYMENT"), eq("retry-key"),
                hash.capture(), any());
        when(repository.find(7L, "DEBT_REPAYMENT", "retry-key"))
                .thenReturn(new StoredResult(42L, hash.getValue(), "{\"id\":21,\"count\":1}",
                        OffsetDateTime.now(ZoneOffset.UTC).plusDays(1)));

        TestResponse retry = service.execute(7L, 42L, "DEBT_REPAYMENT", "retry-key",
                new Object[] { 11L, 5_000L }, "PAYMENT", TestResponse::id, TestResponse.class,
                () -> new TestResponse(22L, calls.incrementAndGet()));

        assertThat(retry).isEqualTo(first);
        assertThat(calls).hasValue(1);
        verify(repository).complete(7L, "DEBT_REPAYMENT", "retry-key", "PAYMENT", 21L, 201,
                "{\"id\":21,\"count\":1}");
    }

    @Test
    void rejectsReusingAKeyForAnotherRequest() {
        when(repository.reserve(eq(7L), eq(42L), eq("EXPENSE_CREATE"), eq("key"),
                any(), any())).thenReturn(false);
        when(repository.find(7L, "EXPENSE_CREATE", "key"))
                .thenReturn(new StoredResult(42L, "different-hash", "{}",
                        OffsetDateTime.now(ZoneOffset.UTC).plusDays(1)));

        assertThatThrownBy(() -> service.execute(7L, 42L, "EXPENSE_CREATE", "key",
                new Object[] { "Rent", 100L }, "EXPENSE", TestResponse::id, TestResponse.class,
                () -> new TestResponse(1L, 1)))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.IDEMPOTENCY_KEY_CONFLICT));
        verify(repository, never()).complete(any(), any(), any(), any(), any(), anyInt(), any());
    }

    @Test
    void stockInStoresTheActualHttpStatusInsteadOfTheLegacyCreatedStatus() {
        when(repository.reserve(eq(7L), eq(42L), eq("PRODUCT_STOCK_IN"), eq("stock-key"), any(), any()))
                .thenReturn(true);
        service.execute(7L, 42L, "PRODUCT_STOCK_IN", "stock-key", new Object[] {3L, 10},
                "PRODUCT", TestResponse::id, TestResponse.class, 200, () -> new TestResponse(3L, 1));
        verify(repository).complete(7L, "PRODUCT_STOCK_IN", "stock-key", "PRODUCT", 3L, 200,
                "{\"id\":3,\"count\":1}");
    }

    @Test
    void rejectsMissingOrOversizedKeysBeforeAccessingTheRepository() {
        for (String key : new String[] { " ", "x".repeat(256) }) {
            assertThatThrownBy(() -> service.execute(7L, 42L, "EXPENSE_CREATE", key,
                    new Object[] { "Rent", 100L }, "EXPENSE", TestResponse::id, TestResponse.class,
                    () -> new TestResponse(1L, 1)))
                    .isInstanceOfSatisfying(BusinessException.class, exception ->
                            assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.INVALID_IDEMPOTENCY_KEY));
        }
        Mockito.verifyNoInteractions(repository);
    }

    @Test
    void rejectsAnExpiredKeyInsteadOfExecutingThePaymentAgain() {
        ArgumentCaptor<String> hash = ArgumentCaptor.forClass(String.class);
        when(repository.reserve(eq(7L), eq(42L), eq("DEBT_REPAYMENT"), eq("old-key"),
                hash.capture(), any())).thenReturn(false);
        // Obtain the hash for the exact retry body without creating a business record.
        when(repository.find(7L, "DEBT_REPAYMENT", "old-key")).thenAnswer(invocation ->
                new StoredResult(42L, hash.getValue(), "{\"id\":21,\"count\":1}",
                        OffsetDateTime.now(ZoneOffset.UTC).minusDays(1)));

        assertThatThrownBy(() -> service.execute(7L, 42L, "DEBT_REPAYMENT", "old-key",
                new Object[] { 11L, 5_000L }, "PAYMENT", TestResponse::id, TestResponse.class,
                () -> { throw new AssertionError("Expired retry must not run the payment"); }))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.IDEMPOTENCY_KEY_EXPIRED));
    }

    private record TestResponse(Long id, int count) {
    }
}
