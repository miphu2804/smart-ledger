package com.smartledger.core.repository;

import com.smartledger.core.dto.response.SaleSummaryResponse;
import com.smartledger.core.entity.Sale;
import org.springframework.data.jpa.domain.Specification;

/** Read-only aggregate fragment; the caller supplies the same tenant-scoped predicate as the list. */
public interface SaleSummaryRepository {
    SaleSummaryResponse aggregateSummary(Specification<Sale> specification);
}
