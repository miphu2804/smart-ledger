package com.smartledger.core.repository;

import com.smartledger.core.dto.response.SaleSummaryResponse;
import com.smartledger.core.entity.Sale;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.enums.SaleStatus;
import com.smartledger.core.exception.BusinessException;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Tuple;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Root;
import java.math.BigDecimal;
import java.math.BigInteger;
import org.springframework.data.jpa.domain.Specification;

/** One aggregate SELECT; EXISTS item search cannot multiply sale rows. No entity/item hydration. */
public class SaleSummaryRepositoryImpl implements SaleSummaryRepository {
    private final EntityManager entityManager;

    public SaleSummaryRepositoryImpl(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    @Override
    public SaleSummaryResponse aggregateSummary(Specification<Sale> specification) {
        var cb = entityManager.getCriteriaBuilder();
        var query = cb.createTupleQuery();
        var sale = query.from(Sale.class);
        var confirmed = cb.equal(sale.get("saleStatus"), SaleStatus.CONFIRMED);
        var voided = cb.equal(sale.get("saleStatus"), SaleStatus.VOIDED);
        query.multiselect(cb.count(sale),
                cb.count(cb.<Long>selectCase().when(confirmed, 1L).otherwise(cb.nullLiteral(Long.class))),
                cb.count(cb.<Long>selectCase().when(voided, 1L).otherwise(cb.nullLiteral(Long.class))),
                sumValue(cb, sale, SaleStatus.CONFIRMED), sumValue(cb, sale, SaleStatus.VOIDED));
        query.where(specification.toPredicate(sale, query, cb));
        Tuple totals = entityManager.createQuery(query).getSingleResult();
        try {
            return new SaleSummaryResponse(totals.get(0, Long.class), totals.get(1, Long.class),
                    totals.get(2, Long.class), exactLong(totals.get(3)), exactLong(totals.get(4)));
        } catch (ArithmeticException overflow) {
            throw new BusinessException(ErrorCode.SALE_SUMMARY_OVERFLOW);
        }
    }

    private long exactLong(Object total) {
        if (total instanceof BigInteger value) return value.longValueExact();
        if (total instanceof BigDecimal value) return value.longValueExact();
        if (total instanceof Long value) return value;
        throw new IllegalStateException("Unexpected aggregate result type: " + total.getClass());
    }

    private Expression<BigInteger> sumValue(CriteriaBuilder cb, Root<Sale> sale, SaleStatus status) {
        // PostgreSQL SUM(bigint) is wider than bigint; keep that precision until checked conversion.
        var amount = cb.<BigInteger>selectCase()
                .when(cb.equal(sale.get("saleStatus"), status), sale.<Long>get("totalVnd").as(BigInteger.class))
                .otherwise(BigInteger.ZERO);
        return cb.coalesce(cb.sum(amount), BigInteger.ZERO);
    }
}
