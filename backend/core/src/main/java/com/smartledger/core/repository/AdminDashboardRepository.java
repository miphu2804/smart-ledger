package com.smartledger.core.repository;

import com.smartledger.core.dto.response.AdminDashboardViews.*;
import com.smartledger.core.dto.response.AdminPageResponse;
import com.smartledger.core.enums.AdminAccessAction;
import com.smartledger.core.enums.AuditAction;
import com.smartledger.core.enums.ShopStatus;
import com.smartledger.core.enums.UserStatus;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.Optional;
import javax.sql.DataSource;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/** Read-only support SQL. No joins to sales, payments, debt, products or financial audit. */
@Repository
public class AdminDashboardRepository {
    private static final String OWNER_WHERE = """
            u.system_role='OWNER' and (:allStatuses or u.status=:status)
            and (lower(u.display_name) like :query escape '!'
                or lower(coalesce(u.email,'')) like :query escape '!'
                or lower(coalesce(u.phone,'')) like :query escape '!')
            """;
    private static final String SHOP_WHERE = """
            (:allStatuses or s.status=:status) and (:allOwners or s.owner_id=:ownerId)
            and (lower(s.name) like :query escape '!' or lower(coalesce(s.phone,'')) like :query escape '!'
                or lower(u.display_name) like :query escape '!'
                or lower(coalesce(u.email,'')) like :query escape '!'
                or lower(coalesce(u.phone,'')) like :query escape '!')
            """;
    private final NamedParameterJdbcTemplate jdbc;

    public AdminDashboardRepository(DataSource dataSource) { jdbc = new NamedParameterJdbcTemplate(dataSource); }

    public OwnerCounts ownerCounts(OffsetDateTime from, OffsetDateTime to) {
        return jdbc.queryForObject("""
                select count(*) as total, count(*) filter(where status='ACTIVE') as active,
                count(*) filter(where status='DISABLED') as disabled,
                count(*) filter(where created_at>=:from and created_at<:to) as created
                from users where system_role='OWNER'
                """, Map.of("from", from, "to", to), (rs, row) ->
                new OwnerCounts(rs.getLong("total"), rs.getLong("active"), rs.getLong("disabled"), rs.getLong("created")));
    }

    public ShopCounts shopCounts(OffsetDateTime from, OffsetDateTime to) {
        return jdbc.queryForObject("""
                select count(*) as total, count(*) filter(where status='ACTIVE') as active,
                count(*) filter(where status='INACTIVE') as inactive, count(*) filter(where status='ARCHIVED') as archived,
                count(*) filter(where created_at>=:from and created_at<:to) as created from shops
                """, Map.of("from", from, "to", to), (rs, row) -> new ShopCounts(rs.getLong("total"),
                rs.getLong("active"), rs.getLong("inactive"), rs.getLong("archived"), rs.getLong("created")));
    }

    public AdminPageResponse<OwnerSummary> owners(String query, UserStatus status, int page, int size) {
        var params = search(query, status == null ? null : status.name(), page, size);
        long total = jdbc.queryForObject("select count(*) from users u where " + OWNER_WHERE, params, Long.class);
        var items = jdbc.query("""
                select u.id, u.display_name, u.email, u.phone, u.status, u.created_at,
                    (select count(*) from shops s where s.owner_id=u.id) as shop_count
                from users u where
                """ + OWNER_WHERE + " order by u.created_at desc, u.id desc limit :limit offset :offset", params,
                (rs, row) -> new OwnerSummary(rs.getLong("id"), rs.getString("display_name"),
                        maskEmail(rs.getString("email")), maskPhone(rs.getString("phone")),
                        UserStatus.valueOf(rs.getString("status")), time(rs, "created_at"), rs.getLong("shop_count")));
        return AdminPageResponse.of(items, page, size, total);
    }

    public Optional<OwnerDetail> owner(long id) {
        return jdbc.query("""
                select u.id, u.display_name, u.email, u.phone, u.status, u.created_at, u.updated_at,
                    (select count(*) from shops s where s.owner_id=u.id) as shop_count
                from users u where u.id=:id and u.system_role='OWNER'
                """, Map.of("id", id), (rs, row) -> new OwnerDetail(rs.getLong("id"), rs.getString("display_name"),
                rs.getString("email"), rs.getString("phone"), UserStatus.valueOf(rs.getString("status")),
                time(rs, "created_at"), time(rs, "updated_at"), rs.getLong("shop_count"))).stream().findFirst();
    }

    public AdminPageResponse<ShopSummary> shops(String query, ShopStatus status, Long ownerId, int page, int size) {
        var params = search(query, status == null ? null : status.name(), page, size)
                .addValue("allOwners", ownerId == null).addValue("ownerId", ownerId == null ? 0L : ownerId);
        long total = jdbc.queryForObject("select count(*) from shops s join users u on u.id=s.owner_id where "
                + SHOP_WHERE, params, Long.class);
        var items = jdbc.query("""
                select s.id,s.owner_id,u.display_name as owner_name,s.name,s.industry,s.phone,s.status,s.created_at
                from shops s join users u on u.id=s.owner_id where
                """ + SHOP_WHERE + " order by s.created_at desc,s.id desc limit :limit offset :offset", params,
                (rs, row) -> new ShopSummary(rs.getLong("id"), rs.getLong("owner_id"), rs.getString("owner_name"),
                        rs.getString("name"), rs.getString("industry"), maskPhone(rs.getString("phone")),
                        ShopStatus.valueOf(rs.getString("status")), time(rs, "created_at")));
        return AdminPageResponse.of(items, page, size, total);
    }

    public Optional<ShopDetail> shop(long id) {
        return jdbc.query("""
                select s.*,u.display_name as owner_name,u.email as owner_email,u.phone as owner_phone,u.status as owner_status
                from shops s join users u on u.id=s.owner_id where s.id=:id
                """, Map.of("id", id), (rs, row) -> new ShopDetail(rs.getLong("id"), rs.getString("name"),
                rs.getString("industry"), rs.getString("phone"), rs.getString("address"),
                ShopStatus.valueOf(rs.getString("status")), rs.getString("inactive_reason"), rs.getString("archived_reason"),
                time(rs, "archived_at"), time(rs, "created_at"), time(rs, "updated_at"),
                new OwnerContact(rs.getLong("owner_id"), rs.getString("owner_name"), rs.getString("owner_email"),
                        rs.getString("owner_phone"), UserStatus.valueOf(rs.getString("owner_status"))))).stream().findFirst();
    }

    /** Explicit action whitelist, NOT a generic ADMIN read endpoint for OWNER audit_logs. */
    public AdminPageResponse<ShopStatusEvent> statusHistory(long shopId, int page, int size) {
        var params = new MapSqlParameterSource("id", shopId).addValue("limit", size).addValue("offset", (long) page * size);
        String where = "shop_id=:id and entity_type='SHOP' and entity_id=:id and actor_role='ADMIN' "
                + "and action in ('SHOP_INACTIVATED','SHOP_REACTIVATED')";
        long total = jdbc.queryForObject("select count(*) from audit_logs where " + where, params, Long.class);
        var items = jdbc.query("""
                select id,actor_user_id,metadata->>'beforeStatus' as before_status,metadata->>'afterStatus' as after_status,
                    reason,request_id,created_at from audit_logs where
                """ + where + " order by created_at desc,id desc limit :limit offset :offset", params,
                (rs, row) -> new ShopStatusEvent(rs.getLong("id"), rs.getLong("actor_user_id"),
                        ShopStatus.valueOf(rs.getString("before_status")), ShopStatus.valueOf(rs.getString("after_status")),
                        rs.getString("reason"), rs.getString("request_id"), time(rs, "created_at")));
        return AdminPageResponse.of(items, page, size, total);
    }

    /** Actor AND action/target whitelist; never select raw OWNER metadata or financial reasons. */
    public AdminPageResponse<AccessLog> ownAccessHistory(long actorId, AdminAccessAction action, Long shopId,
            OffsetDateTime from, OffsetDateTime to, int page, int size) {
        var actions = action == null ? java.util.Arrays.stream(AdminAccessAction.values())
                .flatMap(a -> a.auditActions().stream()).map(Enum::name).toList()
                : action.auditActions().stream().map(Enum::name).toList();
        var params = new MapSqlParameterSource("actor", actorId).addValue("actions", actions)
                .addValue("allShops", shopId == null).addValue("shop", shopId == null ? 0L : shopId)
                .addValue("from", from).addValue("to", to).addValue("limit", size).addValue("offset", (long) page * size);
        String where = """
                actor_user_id=:actor and actor_role='ADMIN' and outcome='SUCCESS' and action in (:actions)
                and (:allShops or shop_id=:shop) and created_at>=:from and created_at<:to
                and (
                    (action in ('ADMIN_SHOP_VIEWED','ADMIN_SHOP_STATUS_HISTORY_VIEWED','SHOP_INACTIVATED','SHOP_REACTIVATED')
                        and entity_type='SHOP' and entity_id=shop_id)
                    or (action='ADMIN_OWNER_VIEWED' and entity_type='OWNER' and shop_id is null and entity_id>0)
                    or (action='ADMIN_OVERVIEW_VIEWED' and entity_type='SYSTEM' and shop_id is null and entity_id is null)
                    or (action='ADMIN_OWNERS_SEARCHED' and entity_type='OWNER_LIST' and shop_id is null and entity_id is null)
                    or (action='ADMIN_SHOPS_SEARCHED' and entity_type='SHOP_LIST' and shop_id is null and entity_id is null)
                    or (action='ADMIN_ACCESS_LOGS_VIEWED' and entity_type='ADMIN_ACCESS_LOG_LIST' and shop_id is null and entity_id is null)
                )
                """;
        long total = jdbc.queryForObject("select count(*) from audit_logs where " + where, params, Long.class);
        var items = jdbc.query("""
                select id,actor_user_id,actor_role,action,entity_type,entity_id,shop_id,outcome,request_id,created_at,
                    case when action in ('SHOP_INACTIVATED','SHOP_REACTIVATED') then metadata->>'beforeStatus' end as before_status,
                    case when action in ('SHOP_INACTIVATED','SHOP_REACTIVATED') then metadata->>'afterStatus' end as after_status,
                    case when action in ('SHOP_INACTIVATED','SHOP_REACTIVATED') then reason end as status_reason
                from audit_logs where
                """ + where + " order by created_at desc,id desc limit :limit offset :offset", params,
                (rs, row) -> new AccessLog(rs.getLong("id"), rs.getLong("actor_user_id"), rs.getString("actor_role"),
                        AdminAccessAction.fromAuditAction(AuditAction.valueOf(rs.getString("action"))), rs.getString("entity_type"),
                        rs.getObject("entity_id", Long.class), rs.getObject("shop_id", Long.class), rs.getString("outcome"),
                        rs.getString("request_id"), time(rs, "created_at"),
                        rs.getString("before_status") == null ? null : ShopStatus.valueOf(rs.getString("before_status")),
                        rs.getString("after_status") == null ? null : ShopStatus.valueOf(rs.getString("after_status")),
                        rs.getString("status_reason")));
        return AdminPageResponse.of(items, page, size, total);
    }

    private MapSqlParameterSource search(String query, String status, int page, int size) {
        // User '%'/'_' are literal text, never wildcard operators. All values are bound, never interpolated.
        String pattern = "%" + query.toLowerCase(java.util.Locale.ROOT).replace("!", "!!").replace("%", "!%")
                .replace("_", "!_") + "%";
        return new MapSqlParameterSource("query", pattern).addValue("allStatuses", status == null)
                .addValue("status", status == null ? "" : status).addValue("limit", size).addValue("offset", (long) page * size);
    }

    public static String maskEmail(String value) {
        if (value == null || value.isBlank()) { return null; }
        // Never reveal a one-character local part or a complete identifying domain.
        return "***@***";
    }

    public static String maskPhone(String value) {
        if (value == null || value.isBlank()) { return null; }
        return value.length() <= 4 ? "***" : "***" + value.substring(value.length() - 3);
    }

    private static OffsetDateTime time(ResultSet rs, String column) throws SQLException {
        return rs.getObject(column, OffsetDateTime.class);
    }
}
