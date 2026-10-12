package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import com.smartledger.core.dto.request.ProductPatchRequest;
import com.smartledger.core.dto.request.ProductWriteRequest;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.enums.CatalogStatus;
import com.smartledger.core.exception.ApiErrorDetail;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.ProductRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.SalesListQueryPostgresTest.SqlCounter;
import com.smartledger.core.service.impl.ProductServiceImpl;
import com.smartledger.core.service.impl.ShopServiceImpl;
import jakarta.persistence.EntityManager;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.List;
import java.util.Properties;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.orm.jpa.HibernatePropertiesCustomizer;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/** Uses existing migrations in a disposable schema; verifies exact lookup, permissions and SQL/index usage. */
@DataJpaTest(showSql = false, properties = {"spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate"})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({ProductServiceImpl.class, ShopServiceImpl.class, ProductBarcodePostgresTest.Config.class})
@EnabledIfEnvironmentVariable(named = "CORE_TEST_POSTGRES_URL", matches = "jdbc:postgresql:.+")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class ProductBarcodePostgresTest {
    private static final String SCHEMA = "core_barcode_test_" + UUID.randomUUID().toString().replace("-", "");
    private static boolean schemaCreated;
    @Autowired ProductService products;
    @Autowired ProductRepository repository;
    @Autowired JdbcTemplate jdbc;
    @Autowired EntityManager entityManager;
    @Autowired SqlCounter sql;
    private VerifiedFirebaseToken owner;
    private long userId;
    private long shopId;
    private long foreignShopId;

    @DynamicPropertySource
    static void schema(DynamicPropertyRegistry properties) {
        properties.add("spring.jpa.properties.hibernate.default_schema", () -> SCHEMA);
        properties.add("spring.flyway.default-schema", () -> SCHEMA);
        properties.add("spring.flyway.schemas", () -> SCHEMA);
    }

    @BeforeEach
    void seed() {
        owner = new VerifiedFirebaseToken("barcode-" + UUID.randomUUID(), null, false, null, null, null);
        userId = jdbc.queryForObject("insert into users(display_name) values ('Owner') returning id", Long.class);
        jdbc.update("insert into auth_identities(user_id,provider,provider_subject) values (?,'FIREBASE',?)", userId, owner.uid());
        shopId = jdbc.queryForObject("insert into shops(owner_id,name,industry) values (?,'Selected','Retail') returning id", Long.class, userId);
        long foreignUser = jdbc.queryForObject("insert into users(display_name) values ('Foreign') returning id", Long.class);
        foreignShopId = jdbc.queryForObject("insert into shops(owner_id,name,industry) values (?,'Foreign','Retail') returning id", Long.class, foreignUser);
    }

    @Test
    void exactLookupDistinguishesCaseLettersPunctuationAndLiteralWildcards() {
        for (String code : List.of("ABC-123", "abc-123", "123", "ABC%_!", "ABC-other")) {
            long id = product(shopId, code);
            clear();
            assertThat(products.lookup(owner, shop(), " " + code + "\r\n").id()).isEqualTo(id);
            assertOneExactRead();
        }
        clear();
        assertError(() -> products.lookup(owner, shop(), "ABC"), ErrorCode.PRODUCT_NOT_FOUND);
        assertOneExactRead();
    }

    @Test
    void archivedForeignAndMissingCodesAreNotVisibleInAnOwnedActiveShop() {
        long archived = product(shopId, "ARCHIVED");
        jdbc.update("update products set status='ARCHIVED',archived_at=current_timestamp,archived_by_user_id=? where id=?", userId, archived);
        product(foreignShopId, "FOREIGN");
        for (String code : List.of("ARCHIVED", "FOREIGN", "MISSING")) {
            clear();
            assertError(() -> products.lookup(owner, shop(), code), ErrorCode.PRODUCT_NOT_FOUND);
            assertOneExactRead();
        }
        clear();
        assertError(() -> products.lookup(owner, Long.toString(foreignShopId), "FOREIGN"), ErrorCode.SHOP_ACCESS_DENIED);
        assertThat(sql.readsOf("products")).isEmpty();
    }

    @Test
    void inactiveAndArchivedShopsAreRejectedBeforeProductLookup() {
        product(shopId, "CODE");
        jdbc.update("update shops set status='INACTIVE',inactive_reason='Test' where id=?", shopId);
        clear();
        assertError(() -> products.lookup(owner, shop(), "CODE"), ErrorCode.SHOP_INACTIVE);
        assertThat(sql.readsOf("products")).isEmpty();
        jdbc.update("update shops set status='ARCHIVED',inactive_reason=null,archived_at=current_timestamp,archived_reason='Test' where id=?", shopId);
        clear();
        assertError(() -> products.lookup(owner, shop(), "CODE"), ErrorCode.SHOP_NOT_FOUND);
        assertThat(sql.readsOf("products")).isEmpty();
    }

    @Test
    void adminAndDisabledAccountsCannotReadOwnerProducts() {
        product(shopId, "CODE");
        jdbc.update("update users set system_role='ADMIN' where id=?", userId);
        clear();
        assertError(() -> products.lookup(owner, shop(), "CODE"), ErrorCode.SHOP_ACCESS_DENIED);
        assertThat(sql.readsOf("products")).isEmpty();
        jdbc.update("update users set system_role='OWNER',status='DISABLED' where id=?", userId);
        clear();
        assertError(() -> products.lookup(owner, shop(), "CODE"), ErrorCode.ACCOUNT_DISABLED);
        assertThat(sql.readsOf("products")).isEmpty();
    }

    @Test
    void normalizedCreateAndPatchPersistAndUseExactUniquenessInTheExistingSchema() {
        long id = products.create(owner, shop(), request(" ABC-123\n")).id();
        products.create(owner, shop(), request("123"));
        products.create(owner, shop(), request("abc-123"));
        clear();
        assertThat(products.lookup(owner, shop(), "ABC-123").id()).isEqualTo(id);

        ProductPatchRequest patch = new ProductPatchRequest();
        patch.setBarcode(" ABC-123\t");
        assertThat(products.patch(owner, shop(), Long.toString(id), patch).barcode()).isEqualTo("ABC-123");
        entityManager.flush();
        assertThat(jdbc.queryForObject("select barcode from products where id=?", String.class, id)).isEqualTo("ABC-123");
        patch.setBarcode("");
        products.patch(owner, shop(), Long.toString(id), patch);
        clear();
        assertThat(jdbc.queryForObject("select barcode from products where id=?", String.class, id)).isNull();
        assertError(() -> products.lookup(owner, shop(), "ABC-123"), ErrorCode.PRODUCT_NOT_FOUND);
    }

    @ParameterizedTest
    @ValueSource(ints = {0x1F600, 0x20000})
    void supplementaryUnicodeLengthMatchesPostgresOnCreatePatchAndLookup(int codePoint) {
        String character = new String(Character.toChars(codePoint));
        String barcode = character.repeat(100);
        assertThat(barcode.length()).isEqualTo(200);
        long id = products.create(owner, shop(), request(" " + barcode + "\n")).id();
        clear();
        assertThat(jdbc.queryForObject("select char_length(barcode) from products where id=?", Integer.class, id))
                .isEqualTo(100);
        assertThat(products.lookup(owner, shop(), barcode).id()).isEqualTo(id);

        String updated = "A" + character.repeat(99);
        ProductPatchRequest patch = new ProductPatchRequest();
        patch.setBarcode("\t" + updated + " ");
        assertThat(products.patch(owner, shop(), Long.toString(id), patch).barcode()).isEqualTo(updated);
        clear();
        assertThat(products.lookup(owner, shop(), updated).id()).isEqualTo(id);
        assertThat(jdbc.queryForObject("select char_length(barcode) from products where id=?", Integer.class, id))
                .isEqualTo(100);

        String invalid = character.repeat(101);
        assertError(() -> products.create(owner, shop(), request(invalid)), ErrorCode.INVALID_PRODUCT_BARCODE);
        patch.setBarcode(invalid);
        assertError(() -> products.patch(owner, shop(), Long.toString(id), patch), ErrorCode.INVALID_PRODUCT_BARCODE);
        assertError(() -> products.lookup(owner, shop(), invalid), ErrorCode.INVALID_PRODUCT_BARCODE);
        clear();
        assertThat(jdbc.queryForObject("select barcode from products where id=?", String.class, id)).isEqualTo(updated);
        assertThat(jdbc.queryForObject("select count(*) from products where shop_id=?", Long.class, shopId)).isEqualTo(1L);
    }

    @ParameterizedTest
    @ValueSource(ints = {0x000B, 0x000C, 0x001C, 0x001D, 0x001E, 0x001F})
    void nonScannerControlsCannotCreateMatchOrClearAnExistingBarcode(int codePoint) {
        long original = product(shopId, "ABC");
        clear();
        String control = Character.toString(codePoint);
        ProductPatchRequest patch = new ProductPatchRequest();
        patch.setName("Must not change");

        for (String invalid : List.of(control + "ABC", "ABC" + control, control,
                "\t " + control + "ABC\r\n")) {
            assertError(() -> products.create(owner, shop(), request(invalid)), ErrorCode.INVALID_PRODUCT_BARCODE);
            patch.setBarcode(invalid);
            assertError(() -> products.patch(owner, shop(), Long.toString(original), patch), ErrorCode.INVALID_PRODUCT_BARCODE);
            assertError(() -> products.lookup(owner, shop(), invalid), ErrorCode.INVALID_PRODUCT_BARCODE);
        }
        clear();
        assertThat(jdbc.queryForObject("select barcode from products where id=?", String.class, original)).isEqualTo("ABC");
        assertThat(jdbc.queryForObject("select name from products where id=?", String.class, original)).isEqualTo("Coffee");
        assertThat(jdbc.queryForObject("select count(*) from products where shop_id=?", Long.class, shopId)).isEqualTo(1L);
    }

    @Test
    void activeConflictReturnsSameShopDetailsWithOneProductReadAndNoWrite() {
        long existing = product(shopId, "TAKEN");
        clear();
        assertThatThrownBy(() -> products.create(owner, shop(), request(" TAKEN\n")))
                .isInstanceOfSatisfying(BusinessException.class, error -> {
                    assertThat(error.getErrorCode()).isEqualTo(ErrorCode.PRODUCT_BARCODE_CONFLICT);
                    assertThat(error.getDetails()).containsExactly(
                            new ApiErrorDetail("barcode", "already_in_use", existing, CatalogStatus.ACTIVE));
                });
        assertOneExactRead();
        assertThat(jdbc.queryForObject("select count(*) from products where shop_id=?", Long.class, shopId)).isEqualTo(1L);
    }

    @Test
    void patchConflictExcludesItselfAndLeavesAllOriginalFieldsUnchanged() {
        long original = product(shopId, "ORIGINAL");
        long competing = product(shopId, "TAKEN");
        clear();
        ProductPatchRequest patch = new ProductPatchRequest();
        patch.setBarcode(" TAKEN\t");
        patch.setName("Must not change");
        assertThatThrownBy(() -> products.patch(owner, shop(), Long.toString(original), patch))
                .isInstanceOfSatisfying(BusinessException.class, error -> {
                    assertThat(error.getErrorCode()).isEqualTo(ErrorCode.PRODUCT_BARCODE_CONFLICT);
                    assertThat(error.getDetails()).containsExactly(
                            new ApiErrorDetail("barcode", "already_in_use", competing, CatalogStatus.ACTIVE));
                });
        assertThat(sql.readsOf("products")).hasSize(2); // One row lock, one competing-code read.
        assertThat(sql.readsOf("products").getLast()).contains(".shop_id=?", ".barcode=?", ".status=?", ".id<>?");
        entityManager.flush();
        assertThat(jdbc.queryForObject("select barcode from products where id=?", String.class, original)).isEqualTo("ORIGINAL");
        assertThat(jdbc.queryForObject("select name from products where id=?", String.class, original)).isEqualTo("Coffee");
    }

    @Test
    void competingCodeQueryIgnoresArchivedForeignAndSelfRows() {
        long archived = product(shopId, "ARCHIVED");
        jdbc.update("update products set status='ARCHIVED',archived_at=current_timestamp,archived_by_user_id=? where id=?", userId, archived);
        product(foreignShopId, "FOREIGN");
        long self = product(shopId, "SELF");
        for (String code : List.of("ARCHIVED", "FOREIGN", "SELF")) {
            clear();
            assertThat(repository.findFirstByShopIdAndBarcodeAndStatusAndIdNotOrderByIdDesc(
                    shopId, code, CatalogStatus.ACTIVE, self)).isEmpty();
            assertOneExactRead();
            assertThat(sql.readsOf("products").getFirst()).contains(".id<>?");
        }
    }

    @Test
    void archiveReleasesCodeAndLookupSelectsTheNewActiveProductWithoutRewritingHistory() {
        long archived = product(shopId, "REUSABLE");
        products.archive(owner, shop(), Long.toString(archived));
        clear();
        long replacement = products.create(owner, shop(), request("REUSABLE")).id();
        assertThat(replacement).isNotEqualTo(archived);
        clear();
        assertThat(products.lookup(owner, shop(), "REUSABLE").id()).isEqualTo(replacement);
        assertOneExactRead();
        assertThat(jdbc.queryForObject("select status || ':' || barcode from products where id=?",
                String.class, archived)).isEqualTo("ARCHIVED:REUSABLE");
    }

    @Test
    void patchCanReuseAnArchivedCodeAndThenKeepItsOwnCode() {
        long archived = product(shopId, "REUSABLE");
        products.archive(owner, shop(), Long.toString(archived));
        long current = product(shopId, "ORIGINAL");
        clear();
        ProductPatchRequest patch = new ProductPatchRequest();
        patch.setBarcode(" REUSABLE\n");
        assertThat(products.patch(owner, shop(), Long.toString(current), patch).barcode()).isEqualTo("REUSABLE");
        clear();
        assertThat(products.patch(owner, shop(), Long.toString(current), patch).id()).isEqualTo(current);
        clear();
        assertThat(products.lookup(owner, shop(), "REUSABLE").id()).isEqualTo(current);
    }

    @Test
    void lookupUsesOneIndexedQueryWithTwentyThousandProducts() {
        jdbc.update("""
                insert into products(shop_id,name,barcode,unit,selling_price_vnd,tracked)
                select ?,'Item '||n,'LOAD-'||n,'piece',1000,false from generate_series(1,20000) n
                """, shopId);
        jdbc.execute("analyze products");
        clear();
        assertThat(products.lookup(owner, shop(), "LOAD-19999").barcode()).isEqualTo("LOAD-19999");
        assertOneExactRead();
        String statement = sql.readsOf("products").getFirst();
        // Explain Hibernate's actual SQL with the same bindings, not a hand-written equivalent query.
        long parameters = statement.chars().filter(character -> character == '?').count();
        assertThat(parameters).isIn(3L, 4L);
        Object[] bindings = parameters == 4 ? new Object[] {shopId, "LOAD-19999", "ACTIVE", 1}
                : new Object[] {shopId, "LOAD-19999", "ACTIVE"};
        String plan = String.join("\n", jdbc.queryForList("explain (analyze, buffers) " + statement, String.class, bindings));
        assertThat(plan).contains("uq_products_shop_barcode_active", "Index Cond:");

        // Record local diagnostics, not a production latency promise; clear caches between calls.
        var timings = new java.util.ArrayList<Double>();
        for (int attempt = 0; attempt < 20; attempt++) {
            clear();
            long started = System.nanoTime();
            assertThat(products.lookup(owner, shop(), "LOAD-19999").barcode()).isEqualTo("LOAD-19999");
            timings.add((System.nanoTime() - started) / 1_000_000.0);
            assertOneExactRead();
        }
        timings.sort(Double::compareTo);
        System.out.printf("BARCODE LOOKUP: products=20000, dataQueries=1, localMedianMs=%.2f%n%s%n", timings.get(10), plan);
    }

    private void assertOneExactRead() {
        assertThat(sql.businessReads()).hasSize(1);
        String query = sql.readsOf("products").getFirst();
        assertThat(query).contains(".shop_id=?", ".barcode=?", ".status=?", "order by", ".id desc", "fetch first");
        assertThat(query).doesNotContain(" like ", "lower(", "count(");
    }

    private void assertError(org.assertj.core.api.ThrowableAssert.ThrowingCallable action, ErrorCode expected) {
        assertThatThrownBy(action).isInstanceOfSatisfying(BusinessException.class,
                error -> assertThat(error.getErrorCode()).isEqualTo(expected));
    }

    private long product(long shop, String barcode) {
        return jdbc.queryForObject("insert into products(shop_id,name,barcode,unit,selling_price_vnd,tracked) "
                + "values (?,'Coffee',?,'piece',1000,false) returning id", Long.class, shop, barcode);
    }

    private ProductWriteRequest request(String barcode) {
        return new ProductWriteRequest(null, "Coffee", barcode, null, "cup", 1000L, null, false, null);
    }

    private String shop() { return Long.toString(shopId); }

    private void clear() { entityManager.flush(); entityManager.clear(); sql.clear(); }

    @AfterAll
    static void cleanupSchema() throws SQLException {
        if (schemaCreated && SCHEMA.matches("core_barcode_test_[a-f0-9]{32}")) {
            try (var connection = connection(); var statement = connection.createStatement()) {
                statement.execute("drop schema \"" + SCHEMA + "\" cascade");
            }
        }
    }

    private static Connection connection() throws SQLException {
        return DriverManager.getConnection(System.getenv("CORE_TEST_POSTGRES_URL"),
                System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class Config {
        @Bean
        DataSource dataSource() throws SQLException {
            try (var connection = connection(); var statement = connection.createStatement()) {
                statement.execute("create schema \"" + SCHEMA + "\"");
                schemaCreated = true;
            }
            var source = new DriverManagerDataSource(System.getenv("CORE_TEST_POSTGRES_URL"),
                    System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
            var properties = new Properties();
            properties.setProperty("currentSchema", SCHEMA);
            source.setConnectionProperties(properties);
            return source;
        }

        @Bean SqlCounter sqlCounter() { return new SqlCounter(); }
        @Bean HibernatePropertiesCustomizer inspectSql(SqlCounter counter) {
            return properties -> properties.put("hibernate.session_factory.statement_inspector", counter);
        }
        @Bean IdempotencyService idempotencyService() { return mock(IdempotencyService.class); }
        @Bean AuditLogService auditLogService() { return mock(AuditLogService.class); }
        @Bean AdminAccessAuditService adminAccessAuditService() { return mock(AdminAccessAuditService.class); }
        @Bean NotificationEventService notificationEventService() { return mock(NotificationEventService.class); }
    }
}
