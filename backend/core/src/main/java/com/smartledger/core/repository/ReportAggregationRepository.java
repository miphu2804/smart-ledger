package com.smartledger.core.repository;

import com.smartledger.core.enums.ReportItemSource;
import com.smartledger.core.enums.TopProductSort;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class ReportAggregationRepository {
    private static final String ALLOCATED_LINES = """
            with selected_sales as (
                select s.* from sales s
                where s.shop_id=:shopId and (
                    (s.sold_at>=:fromInclusive and s.sold_at<:toExclusive)
                    or (s.sale_status='VOIDED' and s.voided_at>=:fromInclusive and s.voided_at<:toExclusive)
                )
            ), line_bases as (
                select s.id as sale_id,s.total_vnd,s.subtotal_vnd,s.sold_at,s.voided_at,s.sale_status,
                    si.id as item_id,si.product_id,si.product_name_snapshot,si.unit_snapshot,
                    si.quantity,si.line_total_vnd,si.estimated_cost_vnd,
                    floor(s.total_vnd::numeric*si.line_total_vnd::numeric/s.subtotal_vnd)::bigint as base_revenue,
                    row_number() over(partition by s.id order by si.id) as line_number
                from selected_sales s join sale_items si on si.sale_id=s.id
            ), allocated_lines as (
                select b.*,
                    b.base_revenue + case when b.line_number=1 then
                        b.total_vnd-sum(b.base_revenue) over(partition by b.sale_id)
                        else 0 end as allocated_revenue
                from line_bases b
            )
            """;

    private final NamedParameterJdbcTemplate jdbc;

    public ReportAggregationRepository(DataSource dataSource) {
        jdbc = new NamedParameterJdbcTemplate(dataSource);
    }

    public List<TopProductRow> topProducts(long shopId, OffsetDateTime fromInclusive,
            OffsetDateTime toExclusive, TopProductSort sortBy, int limit) {
        String order = sortBy == TopProductSort.QUANTITY
                ? "net_quantity desc,item_key asc" : "net_revenue_vnd desc,item_key asc";
        String sql = ALLOCATED_LINES + """
                , events as (
                    select item_id,product_id,product_name_snapshot,unit_snapshot,sold_at as event_at,
                        quantity as gross_quantity,0::numeric as voided_quantity,
                        allocated_revenue as gross_revenue_vnd,0::bigint as voided_revenue_vnd
                    from allocated_lines where sold_at>=:fromInclusive and sold_at<:toExclusive
                    union all
                    select item_id,product_id,product_name_snapshot,unit_snapshot,voided_at as event_at,
                        0::numeric,quantity,0::bigint,allocated_revenue
                    from allocated_lines where sale_status='VOIDED'
                        and voided_at>=:fromInclusive and voided_at<:toExclusive
                ), grouped as (
                    select case when product_id is null
                            then 'CUSTOM:'||md5(jsonb_build_array(lower(btrim(product_name_snapshot)),
                                lower(btrim(unit_snapshot)))::text)
                            else 'PRODUCT:'||product_id::text end as item_key,
                        product_id,
                        (array_agg(product_name_snapshot order by event_at desc,item_id desc))[1] as product_name,
                        (array_agg(unit_snapshot order by event_at desc,item_id desc))[1] as unit,
                        case when product_id is null then 'CUSTOM' else 'CATALOG' end as source,
                        sum(gross_quantity) as gross_quantity,sum(voided_quantity) as voided_quantity,
                        sum(gross_quantity)-sum(voided_quantity) as net_quantity,
                        sum(gross_revenue_vnd)::bigint as gross_revenue_vnd,
                        sum(voided_revenue_vnd)::bigint as voided_revenue_vnd,
                        (sum(gross_revenue_vnd)-sum(voided_revenue_vnd))::bigint as net_revenue_vnd
                    from events group by item_key,product_id
                ) select * from grouped order by
                """ + order + " limit :limit";
        var parameters = parameters(shopId, fromInclusive, toExclusive).addValue("limit", limit);
        return jdbc.query(sql, parameters, (rs, row) -> new TopProductRow(rs.getString("item_key"),
                rs.getObject("product_id", Long.class), rs.getString("product_name"), rs.getString("unit"),
                ReportItemSource.valueOf(rs.getString("source")), rs.getBigDecimal("gross_quantity"),
                rs.getBigDecimal("voided_quantity"), rs.getBigDecimal("net_quantity"),
                rs.getLong("gross_revenue_vnd"), rs.getLong("voided_revenue_vnd"),
                rs.getLong("net_revenue_vnd")));
    }

    public List<SalesSeriesRow> salesSeries(long shopId, OffsetDateTime fromInclusive,
            OffsetDateTime toExclusive) {
        return jdbc.query("""
                with events as (
                    select (sold_at at time zone 'Asia/Ho_Chi_Minh')::date as business_date,
                        total_vnd as gross_revenue_vnd,0::bigint as voided_revenue_vnd,
                        1::bigint as order_count,0::bigint as voided_order_count
                    from sales where shop_id=:shopId and sold_at>=:fromInclusive and sold_at<:toExclusive
                    union all
                    select (voided_at at time zone 'Asia/Ho_Chi_Minh')::date,
                        0::bigint,total_vnd,0::bigint,1::bigint
                    from sales where shop_id=:shopId and sale_status='VOIDED'
                        and voided_at>=:fromInclusive and voided_at<:toExclusive
                ) select business_date,sum(gross_revenue_vnd)::bigint as gross_revenue_vnd,
                    sum(voided_revenue_vnd)::bigint as voided_revenue_vnd,
                    (sum(gross_revenue_vnd)-sum(voided_revenue_vnd))::bigint as net_revenue_vnd,
                    sum(order_count)::bigint as order_count,
                    sum(voided_order_count)::bigint as voided_order_count
                from events group by business_date order by business_date
                """, parameters(shopId, fromInclusive, toExclusive), (rs, row) ->
                new SalesSeriesRow(rs.getObject("business_date", LocalDate.class),
                        rs.getLong("gross_revenue_vnd"), rs.getLong("voided_revenue_vnd"),
                        rs.getLong("net_revenue_vnd"), rs.getLong("order_count"),
                        rs.getLong("voided_order_count")));
    }

    public ProfitEstimateRow profitEstimate(long shopId, OffsetDateTime fromInclusive,
            OffsetDateTime toExclusive) {
        return jdbc.queryForObject(ALLOCATED_LINES + """
                , item_events as (
                    select estimated_cost_vnd,allocated_revenue,false as is_void
                    from allocated_lines where sold_at>=:fromInclusive and sold_at<:toExclusive
                    union all
                    select estimated_cost_vnd,allocated_revenue,true
                    from allocated_lines where sale_status='VOIDED'
                        and voided_at>=:fromInclusive and voided_at<:toExclusive
                ) select
                    (select coalesce(sum(total_vnd),0)::bigint from selected_sales
                        where sold_at>=:fromInclusive and sold_at<:toExclusive) as gross_revenue_vnd,
                    (select coalesce(sum(total_vnd),0)::bigint from selected_sales
                        where sale_status='VOIDED' and voided_at>=:fromInclusive and voided_at<:toExclusive)
                        as voided_revenue_vnd,
                    coalesce(sum(estimated_cost_vnd) filter(where not is_void),0)::bigint as gross_cogs_vnd,
                    coalesce(sum(estimated_cost_vnd) filter(where is_void),0)::bigint as voided_cogs_vnd,
                    (select coalesce(sum(amount_vnd),0)::bigint from expenses
                        where shop_id=:shopId and status='ACTIVE'
                            and expense_at>=:fromInclusive and expense_at<:toExclusive) as expense_vnd,
                    count(*) filter(where estimated_cost_vnd is null)::bigint as unknown_item_count,
                    coalesce(sum(allocated_revenue) filter(where estimated_cost_vnd is null),0)::bigint
                        as unknown_revenue_vnd
                from item_events
                """, parameters(shopId, fromInclusive, toExclusive), (rs, row) -> new ProfitEstimateRow(
                rs.getLong("gross_revenue_vnd"), rs.getLong("voided_revenue_vnd"),
                rs.getLong("gross_cogs_vnd"), rs.getLong("voided_cogs_vnd"),
                rs.getLong("expense_vnd"), rs.getLong("unknown_item_count"),
                rs.getLong("unknown_revenue_vnd")));
    }

    private static MapSqlParameterSource parameters(long shopId, OffsetDateTime fromInclusive,
            OffsetDateTime toExclusive) {
        return new MapSqlParameterSource(Map.of("shopId", shopId, "fromInclusive", fromInclusive,
                "toExclusive", toExclusive));
    }

    public record TopProductRow(String itemKey, Long productId, String productName, String unit,
            ReportItemSource source, BigDecimal grossQuantity, BigDecimal voidedQuantity,
            BigDecimal netQuantity, long grossRevenueVnd, long voidedRevenueVnd,
            long netRevenueVnd) {
    }

    public record SalesSeriesRow(LocalDate date, long grossRevenueVnd, long voidedRevenueVnd,
            long netRevenueVnd, long orderCount, long voidedOrderCount) {
    }

    public record ProfitEstimateRow(long grossRevenueVnd, long voidedRevenueVnd,
            long grossEstimatedCogsVnd, long voidedEstimatedCogsVnd, long expenseVnd,
            long unknownCostItemCount, long unknownCostRevenueVnd) {
    }
}
