package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartledger.core.dto.request.*;
import com.smartledger.core.entity.*;
import com.smartledger.core.enums.*;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.*;
import com.smartledger.core.security.*;
import com.smartledger.core.service.impl.*;
import java.sql.*;
import java.time.*;
import java.util.*;
import javax.sql.DataSource;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/** Real Flyway V1-V13 in a UUID-named temporary schema; no manual schema fixture. */
@DataJpaTest(showSql = false, properties = {"spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate"})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({AdminDashboardServiceImpl.class, AdminAccessGuard.class, AdminDashboardRepository.class,
        AdminAccessAuditService.class, ShopServiceImpl.class, NotificationEventServiceImpl.class,
        AuditLogServiceImpl.class, AuditLogQueryServiceImpl.class, ProductServiceImpl.class,
        ExpenseServiceImpl.class, DebtServiceImpl.class, SaleVoidServiceImpl.class,
        AdminDashboardPostgresTest.PostgresConfig.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@EnabledIfEnvironmentVariable(named = "CORE_TEST_POSTGRES_URL", matches = "jdbc:postgresql:.+")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class AdminDashboardPostgresTest {
    private static final String SCHEMA = "core_admin_test_" + UUID.randomUUID().toString().replace("-", "");
    private static boolean schemaCreated;
    @Autowired AdminDashboardService dashboard;
    @Autowired AdminAccessAuditService adminAudit;
    @Autowired AuditLogService businessAudit;
    @Autowired AuditLogQueryService ownerAudit;
    @Autowired ShopService shops;
    @Autowired ProductService products;
    @Autowired ExpenseService expenses;
    @Autowired DebtService debts;
    @Autowired SaleVoidService voids;
    @Autowired UserAccountRepository users;
    @Autowired AuthIdentityRepository identities;
    @Autowired PlatformTransactionManager transactions;
    @Autowired JdbcTemplate jdbc;
    @MockitoBean IdempotencyService idempotency;
    private VerifiedFirebaseToken admin;
    private VerifiedFirebaseToken secondAdmin;
    private VerifiedFirebaseToken owner;
    private VerifiedFirebaseToken disabledAdmin;
    private long adminId;
    private long secondAdminId;
    private long ownerId;
    private long disabledAdminId;
    private long shopId;

    @DynamicPropertySource
    static void schema(DynamicPropertyRegistry properties) {
        properties.add("spring.jpa.properties.hibernate.default_schema", () -> SCHEMA);
        properties.add("spring.flyway.default-schema", () -> SCHEMA);
        properties.add("spring.flyway.schemas", () -> SCHEMA);
    }

    @BeforeEach
    void seed() {
        admin = token("admin"); secondAdmin = token("admin2"); owner = token("owner"); disabledAdmin = token("disabled");
        adminId = user(admin, SystemRole.ADMIN, UserStatus.ACTIVE);
        secondAdminId = user(secondAdmin, SystemRole.ADMIN, UserStatus.ACTIVE);
        ownerId = user(owner, SystemRole.OWNER, UserStatus.ACTIVE);
        disabledAdminId = user(disabledAdmin, SystemRole.ADMIN, UserStatus.DISABLED);
        shopId = shops.create(owner, new ShopCreateRequest("Shop-" + UUID.randomUUID(), "Retail", "0901234567", "Private address")).id();
    }

    @Test
    void literalSearchMasksContactsFiltersStatusAndUsesStablePagination() {
        String name = "Literal%_!" + UUID.randomUUID();
        jdbc.update("update users set display_name=?,email=?,phone=? where id=?", name, "private@example.test", "0901234567", ownerId);
        var result = dashboard.owners(admin, name.toUpperCase(Locale.ROOT), UserStatus.ACTIVE, 0, 20);
        assertThat(result.totalElements()).isEqualTo(1);
        assertThat(result.items().getFirst().id()).isEqualTo(ownerId);
        assertThat(result.items().getFirst().maskedEmail()).isEqualTo("***@***");
        assertThat(result.items().getFirst().maskedPhone()).isEqualTo("***567");
        assertThat(result.items().getFirst().shopCount()).isEqualTo(1);
        assertThat(dashboard.owners(admin, "private@example.test", UserStatus.DISABLED, 0, 20).items()).isEmpty();
        String otherName = "LiteralXYZ" + name.substring(10);
        jdbc.update("update users set display_name=? where id=?", otherName, secondAdminId);
        assertThat(dashboard.owners(admin, "' OR 1=1 --", null, 0, 20).items()).isEmpty();
        shops.create(owner, new ShopCreateRequest("Shop 2", "Retail", null, null));
        shops.create(owner, new ShopCreateRequest("Shop 3", "Retail", null, null));
        jdbc.update("update shops set created_at='2026-01-01T00:00:00Z' where owner_id=?", ownerId);
        var first = dashboard.shops(admin, null, null, ownerId, 0, 2);
        var second = dashboard.shops(admin, null, null, ownerId, 1, 2);
        assertThat(first.totalElements()).isEqualTo(3); assertThat(first.totalPages()).isEqualTo(2);
        assertThat(first.items()).extracting(s -> s.id()).isSortedAccordingTo(Comparator.reverseOrder());
        assertThat(second.items()).hasSize(1);
        assertThat(first.items()).extracting(s -> s.id()).doesNotContain(second.items().getFirst().id());
        assertThat(dashboard.shops(admin, null, null, ownerId, 99, 20).items()).isEmpty();
        assertThat(ownCount(adminId)).isEqualTo(6);
    }

    @Test
    void overviewCountsOwnersOnlyAndHonorsVietnamDayBoundaries() {
        var owner2 = token("owner2"); var owner3 = token("owner3");
        long id2 = user(owner2, SystemRole.OWNER, UserStatus.ACTIVE);
        long id3 = user(owner3, SystemRole.OWNER, UserStatus.ACTIVE);
        var inactive = shops.create(owner2, new ShopCreateRequest("Inactive", "Retail", null, null)).id();
        var archived = shops.create(owner3, new ShopCreateRequest("Archived", "Retail", null, null)).id();
        jdbc.update("update users set status='DISABLED' where id=?", id2);
        jdbc.update("update users set created_at=?::timestamptz where id=?", "2026-01-01T17:00:00Z", ownerId);
        jdbc.update("update users set created_at=?::timestamptz where id=?", "2026-01-02T16:59:59Z", id2);
        jdbc.update("update users set created_at=?::timestamptz where id=?", "2026-01-02T17:00:00Z", id3);
        jdbc.update("update users set created_at=?::timestamptz where id=?", "2026-01-01T17:00:00Z", adminId);
        jdbc.update("update shops set created_at=?::timestamptz where id=?", "2026-01-01T17:00:00Z", shopId);
        jdbc.update("update shops set status='INACTIVE',inactive_reason='Paused',created_at=?::timestamptz where id=?", "2026-01-02T16:59:59Z", inactive);
        jdbc.update("update shops set status='ARCHIVED',archived_at=now(),archived_reason='Closed',created_at=?::timestamptz where id=?", "2026-01-02T17:00:00Z", archived);
        var result = dashboard.overview(admin, LocalDate.parse("2026-01-02"), LocalDate.parse("2026-01-02"));
        assertThat(result.owners().createdInPeriod()).isEqualTo(2);
        assertThat(result.shops().createdInPeriod()).isEqualTo(2);
        assertThat(result.owners().total()).isEqualTo(jdbc.queryForObject("select count(*) from users where system_role='OWNER'", Long.class));
        assertThat(result.shops().total()).isEqualTo(result.shops().active() + result.shops().inactive() + result.shops().archived());
        assertThat(result.owners().total()).isEqualTo(result.owners().active() + result.owners().disabled());
        assertThat(jdbc.queryForObject("select shop_id from audit_logs where actor_user_id=?", Long.class, adminId)).isNull();
    }

    @Test
    void adminReadsArchivedAndInactiveWithoutAllowingReactivationOfArchived() {
        shops.updateStatus(admin, Long.toString(shopId), new ShopStatusUpdateRequest(ShopStatus.INACTIVE, "Paused"));
        assertThat(dashboard.shop(admin, shopId).inactiveReason()).isEqualTo("Paused");
        assertThat(dashboard.shops(admin, null, ShopStatus.INACTIVE, ownerId, 0, 20).totalElements()).isEqualTo(1);
        shops.updateStatus(admin, Long.toString(shopId), new ShopStatusUpdateRequest(ShopStatus.ACTIVE, null));
        shops.archiveById(owner, Long.toString(shopId), new ArchiveShopRequest("Closed"));
        assertThat(dashboard.shop(admin, shopId).status()).isEqualTo(ShopStatus.ARCHIVED);
        assertThat(dashboard.owner(admin, ownerId).shopCount()).isEqualTo(1);
        expectCode(() -> shops.getById(owner, Long.toString(shopId)), ErrorCode.SHOP_NOT_FOUND);
        expectCode(() -> shops.updateStatus(admin, Long.toString(shopId), new ShopStatusUpdateRequest(ShopStatus.ACTIVE, null)), ErrorCode.SHOP_NOT_FOUND);
    }

    @Test
    void roleAndDisabledStatusAreReadFromDatabaseOnEveryCall() {
        expectCode(() -> dashboard.shop(owner, shopId), ErrorCode.ADMIN_ACCESS_REQUIRED);
        expectCode(() -> dashboard.shop(disabledAdmin, shopId), ErrorCode.ACCOUNT_DISABLED);
        jdbc.update("update users set status='DISABLED' where id=?", adminId);
        expectCode(() -> dashboard.shop(admin, shopId), ErrorCode.ACCOUNT_DISABLED);
        jdbc.update("update users set status='ACTIVE',system_role='OWNER' where id=?", adminId);
        expectCode(() -> dashboard.shop(admin, shopId), ErrorCode.ADMIN_ACCESS_REQUIRED);
        assertThat(ownCount(adminId)).isZero();
    }

    @Test
    void historyIsOwnActorOnlyAndAdminReadNeverChangesOwnerAudit() throws Exception {
        dashboard.shop(admin, shopId); dashboard.shop(secondAdmin, shopId);
        var history = dashboard.accessLogs(admin, null, null, null, null, 0, 20);
        assertThat(history.items()).hasSize(1).allSatisfy(event -> assertThat(event.actorUserId()).isEqualTo(adminId));
        assertThat(history.items()).extracting(event -> event.action()).containsOnly(AdminAccessAction.SHOP_VIEWED);
        var from = history.items().getFirst().occurredAt();
        assertThat(dashboard.accessLogs(admin, AdminAccessAction.SHOP_VIEWED, shopId, from, from.plusSeconds(1), 0, 20).items()).hasSize(1);
        assertThat(dashboard.accessLogs(admin, AdminAccessAction.SHOP_VIEWED, shopId, from.minusSeconds(1), from, 0, 20).items()).isEmpty();
        assertThat(ownCount(secondAdminId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where shop_id=? and actor_role='OWNER'", Long.class, shopId)).isEqualTo(1);
        var ownerHistory = ownerAudit.list(owner, Long.toString(shopId), null, null, null, null, 0, 20);
        assertThat(ownerHistory.content()).extracting(event -> event.action()).containsOnly(AuditAction.SHOP_CREATED);
        assertThat(new ObjectMapper().findAndRegisterModules().writeValueAsString(history))
                .doesNotContain("metadata", "private", "email", "phone", "payment", "refundedVnd");
        expectCode(() -> ownerAudit.list(admin, Long.toString(shopId), null, null, null, null, 0, 20), ErrorCode.SHOP_ACCESS_DENIED);
    }

    @Test
    void statusHistoryWhitelistsOnlyAdministrativeStatusChangesNotMoney() {
        new TransactionTemplate(transactions).executeWithoutResult(status -> businessAudit.record(
                shopId, ownerId, SystemRole.OWNER, AuditAction.SALE_VOIDED, 123L, "Private reason", null,
                Map.of("refundedVnd", 40_000L, "cancelledDebtVnd", 60_000L)));
        shops.updateStatus(admin, Long.toString(shopId), new ShopStatusUpdateRequest(ShopStatus.INACTIVE, "Paused"));
        shops.updateStatus(secondAdmin, Long.toString(shopId), new ShopStatusUpdateRequest(ShopStatus.ACTIVE, null));
        var history = dashboard.statusHistory(admin, shopId, 0, 20);
        assertThat(history.totalElements()).isEqualTo(2);
        assertThat(history.items()).extracting(event -> event.afterStatus()).containsExactly(ShopStatus.ACTIVE, ShopStatus.INACTIVE);
        assertThat(history.items()).extracting(event -> event.actorUserId()).containsExactly(secondAdminId, adminId);
        assertThat(ownerAudit.list(owner, Long.toString(shopId), AuditAction.SALE_VOIDED, null, null, null, 0, 20).content())
                .hasSize(1).allSatisfy(event -> assertThat(event.metadata()).containsKey("refundedVnd"));
    }

    @Test
    void sharedHistoryNeverExposesFinancialEventsEvenWithAnAdminActor() throws Exception {
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            businessAudit.record(shopId, ownerId, SystemRole.OWNER, AuditAction.SALE_VOIDED, 123L,
                    "Private refund reason", null, Map.of("refundedVnd", 40_000L));
            // Even a legacy financial row attributed to this ADMIN cannot enter the support projection.
            businessAudit.record(shopId, adminId, SystemRole.ADMIN, AuditAction.DEBT_VOIDED, 456L,
                    "Private debt reason", null, Map.of("cancelledDebtVnd", 60_000L));
        });
        dashboard.shop(admin, shopId);
        var result = dashboard.accessLogs(admin, null, shopId, null, null, 0, 20);
        assertThat(result.totalElements()).isEqualTo(1);
        assertThat(result.items()).extracting(event -> event.action()).containsOnly(AdminAccessAction.SHOP_VIEWED);
        assertThat(new ObjectMapper().findAndRegisterModules().writeValueAsString(result))
                .doesNotContain("refundedVnd", "cancelledDebtVnd", "Private refund", "Private debt", "metadata", "40000", "60000");
        var ownerResult = ownerAudit.list(owner, Long.toString(shopId), null, null, null, null, 0, 20);
        assertThat(ownerResult.content()).noneSatisfy(event -> assertThat(event.action().isAdminRead()).isTrue());
        expectCode(() -> ownerAudit.list(owner, Long.toString(shopId), AuditAction.ADMIN_SHOP_VIEWED,
                null, null, null, 0, 20), ErrorCode.INVALID_AUDIT_QUERY);
        assertThat(jdbc.queryForObject("select count(*) from information_schema.tables where table_schema=current_schema() and table_name='admin_access_logs'", Long.class)).isZero();
    }

    @Test
    void migratedConstraintsRejectUnscopedBusinessAndOwnerReadEvents() {
        String requestId = UUID.randomUUID().toString();
        assertThatThrownBy(() -> jdbc.update("""
                insert into audit_logs(actor_user_id,actor_role,shop_id,action,entity_type,entity_id,outcome,request_id)
                values (?,'OWNER',null,'SALE_VOIDED','SALE',123,'SUCCESS',?)
                """, ownerId, requestId)).isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("""
                insert into audit_logs(actor_user_id,actor_role,action,entity_type,outcome,request_id)
                values (?,'OWNER','ADMIN_OVERVIEW_VIEWED','SYSTEM','SUCCESS',?)
                """, ownerId, requestId)).isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("""
                insert into audit_logs(actor_user_id,actor_role,shop_id,action,entity_type,entity_id,outcome,request_id)
                values (?,'ADMIN',?,'ADMIN_SHOP_VIEWED','SHOP',?,'SUCCESS',?)
                """, adminId, shopId, shopId + 1, requestId)).isInstanceOf(DataAccessException.class);
    }

    @Test
    void auditFailureRollsBackAndMissingSchemaFailsClosed() {
        jdbc.execute("alter table audit_logs add constraint test_reject_actor check(actor_user_id<>" + adminId + ")");
        String name = jdbc.queryForObject("select name from shops where id=?", String.class, shopId);
        try {
            expectCode(() -> dashboard.shop(admin, shopId), ErrorCode.ADMIN_AUDIT_UNAVAILABLE);
            assertThatThrownBy(() -> new TransactionTemplate(transactions).executeWithoutResult(status -> {
                jdbc.update("update shops set name='SHOULD ROLLBACK' where id=?", shopId);
                dashboard.shop(admin, shopId);
            })).isInstanceOf(BusinessException.class);
            assertThat(jdbc.queryForObject("select name from shops where id=?", String.class, shopId)).isEqualTo(name);
            assertThat(ownCount(adminId)).isZero();
        } finally { jdbc.execute("alter table audit_logs drop constraint test_reject_actor"); }
        dashboard.shop(admin, shopId);
        assertThat(ownCount(adminId)).isEqualTo(1);
        jdbc.execute("alter table audit_logs rename to audit_logs_unavailable");
        try {
            expectCode(() -> dashboard.shop(admin, shopId), ErrorCode.ADMIN_AUDIT_UNAVAILABLE);
            expectCode(() -> dashboard.accessLogs(admin, null, null, null, null, 0, 20), ErrorCode.ADMIN_AUDIT_UNAVAILABLE);
        } finally { jdbc.execute("alter table audit_logs_unavailable rename to audit_logs"); }
    }

    @Test
    void appendOnlyAndMandatoryTransactionAreEnforced() {
        dashboard.shop(admin, shopId);
        long count = ownCount(adminId);
        for (String mutation : List.of("update audit_logs set outcome='FAILURE'", "delete from audit_logs", "truncate audit_logs")) {
            assertThatThrownBy(() -> jdbc.execute(mutation)).isInstanceOf(DataAccessException.class);
            assertThat(ownCount(adminId)).isEqualTo(count);
        }
        assertThatThrownBy(() -> adminAudit.record(adminId, AdminAccessAction.OVERVIEW_VIEWED, null, null, false, 1))
                .isInstanceOf(IllegalTransactionStateException.class);
        var readOnly = new TransactionTemplate(transactions); readOnly.setReadOnly(true);
        assertThatThrownBy(() -> readOnly.executeWithoutResult(status -> adminAudit.record(adminId,
                AdminAccessAction.OVERVIEW_VIEWED, null, null, false, 1))).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void adminCannotWriteOwnerLedgerEvenAfterViewingShop() {
        dashboard.shop(admin, shopId);
        String id = Long.toString(shopId);
        expectCode(() -> products.create(admin, id, new ProductWriteRequest(null, "Product", null, null,
                "piece", 10_000L, null, false, null)), ErrorCode.SHOP_ACCESS_DENIED);
        expectCode(() -> expenses.create(admin, id, "key", new ExpenseWriteRequest("Rent", null, 10_000L, PaymentMethod.CASH, null)), ErrorCode.SHOP_ACCESS_DENIED);
        expectCode(() -> debts.repay(admin, id, "1", "key", new DebtRepaymentRequest(10_000L, PaymentMethod.CASH, null)), ErrorCode.SHOP_ACCESS_DENIED);
        expectCode(() -> voids.voidSale(admin, id, "1", "key", new SaleVoidRequest("Void", false, PaymentMethod.CASH, null)), ErrorCode.SHOP_ACCESS_DENIED);
        expectCode(() -> shops.create(admin, new ShopCreateRequest("New shop", "Retail", null, null)), ErrorCode.SHOP_ACCESS_DENIED);
        assertThat(jdbc.queryForObject("select count(*) from products where shop_id=?", Long.class, shopId)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from expenses where shop_id=?", Long.class, shopId)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from api_idempotency_keys where shop_id=?", Long.class, shopId)).isZero();
    }

    @Test
    void unknownAndInvalidTargetsDoNotCreateSuccessEvents() {
        expectCode(() -> dashboard.owner(admin, secondAdminId), ErrorCode.ADMIN_OWNER_NOT_FOUND);
        expectCode(() -> dashboard.shop(admin, Long.MAX_VALUE), ErrorCode.SHOP_NOT_FOUND);
        expectCode(() -> dashboard.statusHistory(admin, Long.MAX_VALUE, 0, 20), ErrorCode.SHOP_NOT_FOUND);
        expectCode(() -> dashboard.owner(admin, 0), ErrorCode.INVALID_ADMIN_QUERY);
        expectCode(() -> dashboard.shops(admin, null, null, -1L, 0, 20), ErrorCode.INVALID_ADMIN_QUERY);
        assertThat(ownCount(adminId)).isZero();
    }

    @Test
    void adminStatusWritesPersistOnceAndBothViewsUseTheSameEvent() {
        shops.updateStatus(admin, Long.toString(shopId), new ShopStatusUpdateRequest(ShopStatus.INACTIVE, "Policy review"));
        shops.updateStatus(admin, Long.toString(shopId), new ShopStatusUpdateRequest(ShopStatus.ACTIVE, null));
        var result = dashboard.accessLogs(admin, AdminAccessAction.SHOP_STATUS_UPDATED, shopId, null, null, 0, 20);
        assertThat(result.items()).hasSize(2);
        var activated = result.items().getFirst(); var paused = result.items().getLast();
        assertThat(activated.beforeStatus()).isEqualTo(ShopStatus.INACTIVE);
        assertThat(activated.afterStatus()).isEqualTo(ShopStatus.ACTIVE);
        assertThat(activated.reason()).isNull();
        assertThat(paused.beforeStatus()).isEqualTo(ShopStatus.ACTIVE);
        assertThat(paused.afterStatus()).isEqualTo(ShopStatus.INACTIVE);
        assertThat(paused.reason()).isEqualTo("Policy review");
        assertThat(paused.actorUserId()).isEqualTo(adminId);
        String ownerRequest = jdbc.queryForObject("select request_id from audit_logs where shop_id=? and action='SHOP_INACTIVATED'", String.class, shopId);
        assertThat(paused.requestId()).isEqualTo(ownerRequest).isNotEqualTo(activated.requestId());
        assertThat(paused.id()).isEqualTo(jdbc.queryForObject("select id from audit_logs where shop_id=? and action='SHOP_INACTIVATED'", Long.class, shopId));
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where shop_id=? and action in ('SHOP_INACTIVATED','SHOP_REACTIVATED')", Long.class, shopId)).isEqualTo(2);
        assertThat(dashboard.accessLogs(secondAdmin, AdminAccessAction.SHOP_STATUS_UPDATED, shopId, null, null, 0, 20).items()).isEmpty();
        var ownerHistory = ownerAudit.list(owner, Long.toString(shopId), null, null, null, null, 0, 20);
        assertThat(ownerHistory.content()).hasSize(3);
        assertThat(ownerHistory.content()).extracting(event -> event.getClass().getSimpleName()).containsOnly("AuditLogResponse");
    }

    @Test
    void adminAuditFailureRollsBackShopAndOwnerBusinessAuditThenAllowsRetry() {
        long beforeOwnerAudit = jdbc.queryForObject("select count(*) from audit_logs where shop_id=?", Long.class, shopId);
        jdbc.execute("alter table audit_logs add constraint test_reject_status check(actor_user_id<>" + adminId + " or action<>'SHOP_INACTIVATED')");
        try {
            expectCode(() -> shops.updateStatus(admin, Long.toString(shopId), new ShopStatusUpdateRequest(ShopStatus.INACTIVE, "Paused")),
                    ErrorCode.ADMIN_AUDIT_UNAVAILABLE);
            assertThat(jdbc.queryForObject("select status from shops where id=?", String.class, shopId)).isEqualTo("ACTIVE");
            assertThat(jdbc.queryForObject("select inactive_reason from shops where id=?", String.class, shopId)).isNull();
            assertThat(jdbc.queryForObject("select count(*) from audit_logs where shop_id=?", Long.class, shopId)).isEqualTo(beforeOwnerAudit);
            assertThat(ownCount(adminId)).isZero();
        } finally { jdbc.execute("alter table audit_logs drop constraint test_reject_status"); }
        shops.updateStatus(admin, Long.toString(shopId), new ShopStatusUpdateRequest(ShopStatus.INACTIVE, "Paused"));
        assertThat(ownCount(adminId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where shop_id=?", Long.class, shopId)).isEqualTo(beforeOwnerAudit + 1);
    }

    @Test
    void ownerBusinessAuditFailureAlsoRollsBackAdministrativeStatusEvent() {
        shops.updateStatus(admin, Long.toString(shopId), new ShopStatusUpdateRequest(ShopStatus.INACTIVE, "Paused"));
        long count = ownCount(adminId);
        jdbc.execute("alter table audit_logs add constraint test_reject_activation check(shop_id<>" + shopId + " or action<>'SHOP_REACTIVATED')");
        try {
            expectCode(() -> shops.updateStatus(admin, Long.toString(shopId), new ShopStatusUpdateRequest(ShopStatus.ACTIVE, null)),
                    ErrorCode.ADMIN_AUDIT_UNAVAILABLE);
            assertThat(jdbc.queryForObject("select status from shops where id=?", String.class, shopId)).isEqualTo("INACTIVE");
            assertThat(ownCount(adminId)).isEqualTo(count);
        } finally { jdbc.execute("alter table audit_logs drop constraint test_reject_activation"); }
    }

    private long ownCount(long actor) { return jdbc.queryForObject("select count(*) from audit_logs where actor_user_id=? and actor_role='ADMIN'", Long.class, actor); }
    private void expectCode(Runnable action, ErrorCode code) {
        assertThatThrownBy(action::run).isInstanceOfSatisfying(BusinessException.class, ex -> assertThat(ex.getErrorCode()).isEqualTo(code));
    }
    private VerifiedFirebaseToken token(String prefix) {
        String uid = prefix + UUID.randomUUID(); return new VerifiedFirebaseToken(uid, uid + "@example.test", true, null, null, null);
    }
    private long user(VerifiedFirebaseToken token, SystemRole role, UserStatus status) {
        return new TransactionTemplate(transactions).execute(tx -> {
            var user = UserAccount.createOwner(token.uid(), token);
            ReflectionTestUtils.setField(user, "systemRole", role); ReflectionTestUtils.setField(user, "status", status);
            users.saveAndFlush(user); identities.saveAndFlush(AuthIdentity.forFirebase(user, token.uid())); return user.getId();
        });
    }

    @AfterAll static void cleanupSchema() throws SQLException {
        if (schemaCreated && SCHEMA.matches("core_admin_test_[a-f0-9]{32}")) {
            try (var connection = connection(); var sql = connection.createStatement()) { sql.execute("drop schema \"" + SCHEMA + "\" cascade"); }
        }
    }
    private static Connection connection() throws SQLException {
        return DriverManager.getConnection(System.getenv("CORE_TEST_POSTGRES_URL"), System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
    }
    @TestConfiguration(proxyBeanMethods = false)
    static class PostgresConfig {
        @Bean DataSource dataSource() throws SQLException {
            try (var connection = connection(); var sql = connection.createStatement()) {
                sql.execute("create schema \"" + SCHEMA + "\""); schemaCreated = true;
            }
            var source = new DriverManagerDataSource(System.getenv("CORE_TEST_POSTGRES_URL"), System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
            var properties = new Properties(); properties.setProperty("currentSchema", SCHEMA); source.setConnectionProperties(properties); return source;
        }
    }
}
