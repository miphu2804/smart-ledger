package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.smartledger.core.dto.request.OwnerListQuery.*;
import com.smartledger.core.dto.response.PageResponse;
import com.smartledger.core.exception.BusinessException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

class OwnerListQueryTest {
    interface Factory { Pagination create(int page, int size); }

    static Stream<Arguments> invalidPages() {
        List<Factory> factories = List.of(
                (p, s) -> new Products(p, s, null, null, null, null),
                (p, s) -> new Sales(p, s, null, null, null, null),
                (p, s) -> new Drafts(p, s, null),
                (p, s) -> new Customers(p, s, null),
                (p, s) -> new Debts(p, s, null, null),
                (p, s) -> new Expenses(p, s, null, null, null, null));
        return factories.stream().flatMap(f -> Stream.of(
                Arguments.of(f, -1, 20), Arguments.of(f, 0, 0), Arguments.of(f, 0, 101),
                Arguments.of(f, Integer.MAX_VALUE, 20), Arguments.of(f, 21474837, 100)));
    }

    @ParameterizedTest @MethodSource("invalidPages")
    void rejectsInvalidPaginationWithoutOverflow(Factory factory, int page, int size) {
        assertThatThrownBy(() -> factory.create(page, size)).isInstanceOf(BusinessException.class);
    }

    @Test
    void acceptsMaximumOffsetAndPageSizeBoundary() {
        assertThat(new Customers(Integer.MAX_VALUE, 1, null).pageable(org.springframework.data.domain.Sort.by("id"))
                .getOffset()).isEqualTo(Integer.MAX_VALUE);
        assertThat(new Products(21474836, 100, null, null, null, null).size()).isEqualTo(100);
    }

    @Test
    void validatesFiltersAndNormalizesBlankSearch() {
        assertThat(new Customers(0, 20, "   ").q()).isNull();
        assertThat(new Products(0, 20, "  Đường  ", null, null, null).q()).isEqualTo("Đường");
        assertThatThrownBy(() -> new Customers(0, 20, "x".repeat(201))).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> new Products(0, 20, null, 0L, null, null)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> new Debts(0, 20, null, -1L)).isInstanceOf(BusinessException.class);
        OffsetDateTime day = OffsetDateTime.parse("2026-10-10T00:00:00+07:00");
        assertThatThrownBy(() -> new Sales(0, 20, null, null, day, day.minusDays(1)))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> new Expenses(0, 20, "month", null, day, day))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> new Expenses(0, 20, null, null, null, OffsetDateTime.MAX))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void validatesTimestampOrderByInstantRatherThanLocalClockTime() {
        var from = OffsetDateTime.parse("2026-10-09T12:30:00+07:00");
        var later = OffsetDateTime.parse("2026-10-09T06:30:00Z");
        assertThat(new Sales(0, 20, null, null, from, later).from()).isEqualTo(from);
        assertThat(new Expenses(0, 20, null, null, from, later).to()).isEqualTo(later);
        var same = OffsetDateTime.parse("2026-10-09T05:30:00Z");
        assertThatThrownBy(() -> new Sales(0, 20, null, null, from, same))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> new Expenses(0, 20, null, null, from, same))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> new Sales(0, 20, null, null, from, same.minusSeconds(1)))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> new Expenses(0, 20, null, null, from, same.minusSeconds(1)))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void pageEnvelopeDefensivelyCopiesItems() {
        var items = new ArrayList<>(List.of("first"));
        var page = new PageResponse<>(items, 0, 20, 1, 1);
        items.clear();
        assertThat(page.items()).containsExactly("first");
        assertThatThrownBy(() -> page.items().clear()).isInstanceOf(UnsupportedOperationException.class);
    }
}
