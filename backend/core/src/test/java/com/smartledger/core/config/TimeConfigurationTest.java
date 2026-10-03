package com.smartledger.core.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.smartledger.core.dto.request.ExpenseWriteRequest;
import com.smartledger.core.enums.PaymentMethod;
import com.smartledger.core.repository.IdempotencyKeyRepository;
import com.smartledger.core.repository.IdempotencyKeyRepository.StoredResult;
import com.smartledger.core.service.impl.IdempotencyServiceImpl;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.json.JsonTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;

@JsonTest
@Import(TimeConfiguration.class)
class TimeConfigurationTest {
    @Autowired
    private ObjectMapper mapper;

    @Test
    void displaysVietnamTimeForBothUtcAndOtherOffsetsWithoutChangingTheInstant() throws Exception {
        for (String input : List.of("2026-10-01T14:30:00Z", "2026-10-01T07:30:00-07:00",
                "2026-10-01T21:30:00+07:00")) {
            var value = new TemporalResponse(1L, OffsetDateTime.parse(input));
            String json = mapper.writeValueAsString(value);
            assertThat(mapper.readTree(json).get("at").asText()).isEqualTo("2026-10-01T21:30:00+07:00");
            assertThat(mapper.readValue(json, TemporalResponse.class).at().toInstant())
                    .isEqualTo(value.at().toInstant());
        }
    }

    @Test
    void readsOldUtcResponsesAndOffsetInputsAsTheSameInstant() throws Exception {
        for (String input : List.of("2026-10-01T14:30:00Z", "2026-10-01T21:30:00+07:00",
                "2026-10-01T07:30:00-07:00")) {
            var value = mapper.readValue("{\"id\":1,\"at\":\"" + input + "\"}", TemporalResponse.class);
            assertThat(value.at().toInstant()).isEqualTo(OffsetDateTime.parse("2026-10-01T14:30:00Z").toInstant());
        }
    }

    @Test
    void rejectsDateTimeInputsWithoutAnOffset() {
        assertThatThrownBy(() -> mapper.readValue(
                "{\"id\":1,\"at\":\"2026-10-01T21:30:00\"}", TemporalResponse.class))
                .isInstanceOf(com.fasterxml.jackson.core.JsonProcessingException.class);
    }

    @Test
    void handlesNestedTimestampsNullsAndCalendarDates() throws Exception {
        var utc = OffsetDateTime.parse("2026-12-31T17:00:00Z");
        var value = new NestedResponse(List.of(new TemporalResponse(1L, utc)), null, LocalDate.of(2026, 12, 31));
        var json = mapper.readTree(mapper.writeValueAsString(value));
        assertThat(json.at("/items/0/at").asText()).isEqualTo("2027-01-01T00:00:00+07:00");
        assertThat(json.get("optional").isNull()).isTrue();
        assertThat(json.get("date").asText()).isEqualTo("2026-12-31");
    }

    @Test
    void keepsExistingExpenseRequestHashesWhileResponsesUseVietnamTime() throws Exception {
        ObjectMapper legacyMapper = Jackson2ObjectMapperBuilder.json()
                .featuresToDisable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS).build();
        var at = OffsetDateTime.parse("2026-10-01T14:30:00Z");
        var request = new ExpenseWriteRequest("Rent", "Rent", 100L, PaymentMethod.CASH, at);
        String oldHash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(legacyMapper.writeValueAsBytes(request)));
        var repository = mock(IdempotencyKeyRepository.class);
        when(repository.reserve(eq(7L), eq(42L), eq("EXPENSE_CREATE"), eq("old-key"), any(), any()))
                .thenReturn(false);
        when(repository.find(7L, "EXPENSE_CREATE", "old-key"))
                .thenReturn(new StoredResult(42L, oldHash, "{\"id\":1,\"at\":\"2026-10-01T14:30:00Z\"}",
                        OffsetDateTime.now().plusDays(1)));
        var service = new IdempotencyServiceImpl(repository, mapper, 30);

        var replay = service.execute(7L, 42L, "EXPENSE_CREATE", "old-key", request,
                "EXPENSE", TemporalResponse::id, TemporalResponse.class,
                () -> { throw new AssertionError("An existing retry must not create another expense"); });

        var hash = ArgumentCaptor.forClass(String.class);
        verify(repository).reserve(eq(7L), eq(42L), eq("EXPENSE_CREATE"), eq("old-key"), hash.capture(), any());
        assertThat(hash.getValue()).isEqualTo(oldHash);
        assertThat(mapper.readTree(mapper.writeValueAsString(replay)).get("at").asText())
                .isEqualTo("2026-10-01T21:30:00+07:00");
    }

    public record TemporalResponse(Long id, OffsetDateTime at) {}
    public record NestedResponse(List<TemporalResponse> items, OffsetDateTime optional, LocalDate date) {}
}
