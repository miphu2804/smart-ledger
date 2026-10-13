package com.smartledger.core.dto.request;

import com.smartledger.core.enums.*;
import com.smartledger.core.exception.BusinessException;
import java.time.OffsetDateTime;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;

/** Explicit allowlists; no client-supplied property name is used as a JPA sort expression. */
public final class OwnerListQuery {
    private OwnerListQuery() {}

    public enum StockStatus { LOW, OUT, NEEDS_RESTOCK }
    public enum ProductSort { ID_ASC, NAME_ASC, PRICE_ASC, STOCK_DESC }

    public interface Pagination {
        int page();
        int size();
        default PageRequest pageable(Sort sort) { return PageRequest.of(page(), size(), sort); }
    }

    public record Products(int page, int size, String q, Long categoryId,
            StockStatus stockStatus, ProductSort sort) implements Pagination {
        public Products {
            validatePage(page, size, ErrorCode.INVALID_PRODUCT_QUERY);
            q = search(q, ErrorCode.INVALID_PRODUCT_QUERY);
            positive(categoryId, ErrorCode.INVALID_PRODUCT_QUERY);
            sort = sort == null ? ProductSort.ID_ASC : sort;
        }
        public static Products defaults() { return new Products(0, 20, null, null, null, null); }
        public Sort ordering() {
            return switch (sort) {
                case ID_ASC -> Sort.by("id").ascending();
                case NAME_ASC -> Sort.by("name", "id").ascending();
                case PRICE_ASC -> Sort.by("sellingPriceVnd", "id").ascending();
                // The specification orders coalesce(stock,-1) so untracked/null stock comes last.
                case STOCK_DESC -> Sort.unsorted();
            };
        }
    }

    public record Sales(int page, int size, String q, SaleStatus saleStatus,
            OffsetDateTime from, OffsetDateTime to) implements Pagination {
        public Sales {
            validatePage(page, size, ErrorCode.INVALID_SALE_QUERY);
            q = search(q, ErrorCode.INVALID_SALE_QUERY);
            range(from, to, ErrorCode.INVALID_SALE_QUERY);
        }
        public static Sales defaults() { return new Sales(0, 20, null, null, null, null); }
    }

    public record Drafts(int page, int size, DraftStatus status) implements Pagination {
        public Drafts { validatePage(page, size, ErrorCode.INVALID_DRAFT_QUERY); }
        public static Drafts defaults() { return new Drafts(0, 20, null); }
    }

    public record Customers(int page, int size, String q) implements Pagination {
        public Customers {
            validatePage(page, size, ErrorCode.INVALID_CUSTOMER_QUERY);
            q = search(q, ErrorCode.INVALID_CUSTOMER_QUERY);
        }
        public static Customers defaults() { return new Customers(0, 20, null); }
    }

    public record Debts(int page, int size, DebtStatus status, Long customerId) implements Pagination {
        public Debts {
            validatePage(page, size, ErrorCode.INVALID_DEBT_QUERY);
            positive(customerId, ErrorCode.INVALID_DEBT_QUERY);
        }
        public static Debts defaults() { return new Debts(0, 20, null, null); }
    }

    public record Expenses(int page, int size, String period, String category,
            OffsetDateTime from, OffsetDateTime to) implements Pagination {
        public Expenses {
            validatePage(page, size, ErrorCode.INVALID_EXPENSE_QUERY);
            period = trim(period);
            category = trim(category);
            if (category != null && category.length() > 150) fail(ErrorCode.INVALID_EXPENSE_QUERY);
            range(from, to, ErrorCode.INVALID_EXPENSE_QUERY);
            if (period != null && (from != null || to != null)) fail(ErrorCode.INVALID_EXPENSE_QUERY);
        }
        public static Expenses defaults() { return new Expenses(0, 20, null, null, null, null); }
    }

    private static void validatePage(int page, int size, ErrorCode error) {
        if (page < 0 || size < 1 || size > 100 || (long) page * size > Integer.MAX_VALUE) fail(error);
    }

    private static void positive(Long value, ErrorCode error) {
        if (value != null && value <= 0) fail(error);
    }

    private static void range(OffsetDateTime from, OffsetDateTime to, ErrorCode error) {
        // Compare instants, not local clock times: offsets may differ between the bounds.
        if (from != null && (from.getYear() < 1 || from.getYear() > 9998)
                || to != null && (to.getYear() < 1 || to.getYear() > 9998)
                || from != null && to != null && !from.isBefore(to)) fail(error);
    }

    private static String search(String value, ErrorCode error) {
        value = trim(value);
        if (value != null && value.length() > 200) fail(error);
        return value;
    }

    private static String trim(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private static void fail(ErrorCode error) { throw new BusinessException(error); }
}
