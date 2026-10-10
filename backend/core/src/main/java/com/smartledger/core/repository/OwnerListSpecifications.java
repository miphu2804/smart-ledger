package com.smartledger.core.repository;

import com.smartledger.core.dto.request.OwnerListQuery.*;
import com.smartledger.core.entity.*;
import com.smartledger.core.enums.*;
import jakarta.persistence.criteria.*;
import java.math.BigDecimal;
import java.text.Normalizer;
import java.time.*;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.springframework.data.jpa.domain.Specification;

/** Tenant-scoped predicates reused verbatim by the bounded content and count queries. */
public final class OwnerListSpecifications {
    // PostgreSQL built-in translate, not an unaccent extension or a database-side function.
    private static final String ACCENTED = "àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ\u0300\u0301\u0303\u0309\u0323\u0302\u0306\u031b";
    private static final String ASCII = "aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd";

    private OwnerListSpecifications() {}

    public static Specification<Product> products(long shopId, Products filter) {
        return (root, query, cb) -> {
            if (filter.sort() == ProductSort.STOCK_DESC && query.getResultType() != Long.class) {
                query.orderBy(cb.desc(cb.coalesce(root.<BigDecimal>get("stockQuantity"), BigDecimal.ONE.negate())),
                        cb.asc(root.get("id")));
            }
            List<Predicate> p = activeShop(root, cb, shopId, CatalogStatus.ACTIVE);
            if (filter.categoryId() != null) p.add(cb.equal(root.get("categoryId"), filter.categoryId()));
            if (filter.q() != null) p.add(cb.or(contains(cb, root.get("name"), filter.q()),
                    contains(cb, root.get("barcode"), filter.q())));
            if (filter.stockStatus() != null) {
                Predicate out = cb.equal(root.get("stockQuantity"), BigDecimal.ZERO);
                Predicate low = cb.and(cb.greaterThan(root.get("stockQuantity"), BigDecimal.ZERO),
                        cb.isNotNull(root.get("lowStockThreshold")),
                        cb.lessThanOrEqualTo(root.get("stockQuantity"), root.get("lowStockThreshold")));
                p.add(cb.isTrue(root.get("tracked")));
                p.add(switch (filter.stockStatus()) {
                    case LOW -> low;
                    case OUT -> out;
                    case NEEDS_RESTOCK -> cb.or(low, out);
                });
            }
            return cb.and(p.toArray(Predicate[]::new));
        };
    }

    public static Specification<Customer> customers(long shopId, Customers filter) {
        return (root, query, cb) -> {
            List<Predicate> p = activeShop(root, cb, shopId, CatalogStatus.ACTIVE);
            if (filter.q() != null) p.add(cb.or(contains(cb, root.get("name"), filter.q()),
                    contains(cb, root.get("normalizedPhone"), filter.q())));
            return cb.and(p.toArray(Predicate[]::new));
        };
    }

    public static Specification<Sale> sales(long shopId, Sales filter) {
        return (root, query, cb) -> {
            List<Predicate> p = new ArrayList<>();
            p.add(cb.equal(root.get("shopId"), shopId));
            if (filter.saleStatus() != null) p.add(cb.equal(root.get("saleStatus"), filter.saleStatus()));
            timestamps(p, root.get("soldAt"), cb, filter.from(), filter.to());
            if (filter.q() != null) {
                Subquery<Long> items = query.subquery(Long.class);
                Root<SaleItem> item = items.from(SaleItem.class);
                items.select(item.get("id")).where(cb.equal(item.get("saleId"), root.get("id")),
                        contains(cb, item.get("productNameSnapshot"), filter.q()));
                // ID search is exact, not a cast of every row to text.
                Predicate id = cb.disjunction();
                try { id = cb.equal(root.get("id"), Long.parseLong(filter.q())); }
                catch (NumberFormatException ignored) { /* A nonnumeric search still matches names. */ }
                p.add(cb.or(id, contains(cb, root.get("customerNameSnapshot"), filter.q()), cb.exists(items)));
            }
            return cb.and(p.toArray(Predicate[]::new));
        };
    }

    public static Specification<SaleDraft> drafts(long shopId, Drafts filter, OffsetDateTime now) {
        return (root, query, cb) -> {
            Predicate shop = cb.equal(root.get("shopId"), shopId);
            if (filter.status() == null) return shop;
            Predicate status = switch (filter.status()) {
                case EXPIRED -> cb.or(cb.equal(root.get("status"), DraftStatus.EXPIRED),
                        cb.and(cb.equal(root.get("status"), DraftStatus.DRAFT),
                                cb.lessThanOrEqualTo(root.get("expiresAt"), now)));
                case DRAFT -> cb.and(cb.equal(root.get("status"), DraftStatus.DRAFT),
                        cb.greaterThan(root.get("expiresAt"), now));
                default -> cb.equal(root.get("status"), filter.status());
            };
            return cb.and(shop, status);
        };
    }

    public static Specification<Debt> debts(long shopId, Debts filter) {
        return (root, query, cb) -> {
            Subquery<Long> sales = query.subquery(Long.class);
            Root<Sale> sale = sales.from(Sale.class);
            sales.select(sale.get("id")).where(cb.equal(sale.get("id"), root.get("saleId")),
                    cb.equal(sale.get("shopId"), shopId));
            List<Predicate> p = new ArrayList<>();
            p.add(cb.exists(sales));
            if (filter.status() != null) p.add(cb.equal(root.get("status"), filter.status()));
            if (filter.customerId() != null) p.add(cb.equal(root.get("customerId"), filter.customerId()));
            return cb.and(p.toArray(Predicate[]::new));
        };
    }

    public static Specification<Expense> expenses(long shopId, Expenses filter,
            OffsetDateTime periodFrom, OffsetDateTime periodTo) {
        return (root, query, cb) -> {
            List<Predicate> p = activeShop(root, cb, shopId, ExpenseStatus.ACTIVE);
            if (filter.category() != null) p.add(cb.equal(root.get("category"), filter.category()));
            timestamps(p, root.get("expenseAt"), cb, filter.from(), filter.to());
            if (periodFrom != null) p.add(cb.greaterThanOrEqualTo(root.get("expenseAt"), periodFrom));
            if (periodTo != null) p.add(cb.lessThan(root.get("expenseAt"), periodTo));
            return cb.and(p.toArray(Predicate[]::new));
        };
    }

    private static List<Predicate> activeShop(Root<?> root, CriteriaBuilder cb, long shopId, Enum<?> status) {
        List<Predicate> p = new ArrayList<>();
        p.add(cb.equal(root.get("shopId"), shopId));
        p.add(cb.equal(root.get("status"), status));
        return p;
    }

    private static void timestamps(List<Predicate> p, Path<OffsetDateTime> field, CriteriaBuilder cb,
            OffsetDateTime from, OffsetDateTime to) {
        if (from != null) p.add(cb.greaterThanOrEqualTo(field, from));
        if (to != null) p.add(cb.lessThan(field, to));
    }

    private static Predicate contains(CriteriaBuilder cb, Expression<String> field, String term) {
        String folded = Normalizer.normalize(term.toLowerCase(Locale.ROOT), Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "").replace('đ', 'd');
        String literal = folded.replace("!", "!!").replace("%", "!%").replace("_", "!_");
        Expression<String> normalized = cb.function("translate", String.class, cb.lower(field),
                cb.literal(ACCENTED), cb.literal(ASCII));
        return cb.like(normalized, "%" + literal + "%", '!');
    }
}
