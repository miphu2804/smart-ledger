package com.smartledger.core.ratelimit;

import static org.assertj.core.api.Assertions.*;

import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.UserRateLimitRepository;
import java.sql.DriverManager;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

/** Real commits, restart, independent instances and concurrent admission on disposable schemas only. */
@EnabledIfEnvironmentVariable(named="CORE_TEST_POSTGRES_URL", matches="jdbc:postgresql:.+")
class UserRateLimitPostgresTest {
    String schema;
    DriverManagerDataSource source;
    JdbcTemplate jdbc;
    TransactionTemplate tx;
    UserRateLimitService quota;
    long user;

    @BeforeEach void setup() throws Exception {
        schema="core_quota_test_"+UUID.randomUUID().toString().replace("-", "");
        try(var c=connection(); var s=c.createStatement()) { s.execute("CREATE SCHEMA "+schema); }
        source=new DriverManagerDataSource(System.getenv("CORE_TEST_POSTGRES_URL"),
                System.getenv("CORE_TEST_POSTGRES_USERNAME"),System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
        var properties=new Properties(); properties.setProperty("currentSchema",schema); source.setConnectionProperties(properties);
        jdbc=new JdbcTemplate(source); tx=new TransactionTemplate(new DataSourceTransactionManager(source));
        flyway("19").migrate();
        user=jdbc.queryForObject("INSERT INTO users(display_name) VALUES ('Quota tester') RETURNING id",Long.class);
        var before=jdbc.queryForMap("SELECT * FROM users WHERE id=?",user);
        flyway(null).migrate();
        assertThat(jdbc.queryForMap("SELECT * FROM users WHERE id=?",user)).isEqualTo(before);
        quota=new UserRateLimitService(new UserRateLimitRepository(jdbc),true,300);
    }

    @AfterEach void cleanup() throws Exception {
        if(schema!=null && schema.matches("core_quota_test_[a-f0-9]{32}")) {
            try(var c=connection();var s=c.createStatement()) { s.execute("DROP SCHEMA "+schema+" CASCADE"); }
        }
    }

    @Test void migrationPreservesV19AndAddsPrivateConstrainedTables() {
        assertThat(flyway(null).migrate().migrationsExecuted).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM user_rate_limit_windows",Integer.class)).isZero();
        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname=? AND c.relname IN ('user_rate_limit_windows','user_rate_limit_reservations')
                    AND c.relrowsecurity
                """,Integer.class,schema)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM pg_policies WHERE schemaname=? AND tablename LIKE 'user_rate_limit_%'",
                Integer.class,schema)).isZero();
        var token=reserve(RateLimitPolicy.SHOP_CREATE);
        assertThatThrownBy(()->jdbc.update("UPDATE user_rate_limit_windows SET successful_count=6"))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThatThrownBy(()->jdbc.update("UPDATE user_rate_limit_reservations SET status='COMMITTED'"))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        release(token,RateLimitPolicy.SHOP_CREATE);
    }

    @Test void independentInstancesAndRestartShareExactlyTenSuccessfulSlots() throws Exception {
        var other=new UserRateLimitService(new UserRateLimitRepository(new JdbcTemplate(source)),true,300);
        var accepted=new AtomicInteger(); var rejected=new AtomicInteger();
        try(var executor=Executors.newFixedThreadPool(12)) {
            var tasks=java.util.stream.IntStream.range(0,30).mapToObj(n->executor.submit(()->{
                try {
                    UUID token=UUID.randomUUID();
                    tx.executeWithoutResult(s->{
                        var instance=n%2==0?quota:other;
                        instance.reserve(user,RateLimitPolicy.MEDIA_UPLOAD,token);
                        instance.complete(user,RateLimitPolicy.MEDIA_UPLOAD,token);
                    }); accepted.incrementAndGet();
                } catch(RateLimitExceededException expected) { rejected.incrementAndGet(); }
            })).toList();
            for(var task:tasks) task.get(20,java.util.concurrent.TimeUnit.SECONDS);
        }
        assertThat(accepted.get()).isEqualTo(10); assertThat(rejected.get()).isEqualTo(20);
        var restarted=new UserRateLimitService(new UserRateLimitRepository(new JdbcTemplate(source)),true,300);
        assertThatThrownBy(()->tx.executeWithoutResult(s->restarted.reserve(user,RateLimitPolicy.MEDIA_UPLOAD,UUID.randomUUID())))
                .isInstanceOf(RateLimitExceededException.class);
        assertThat(success()).isEqualTo(10);
    }

    @Test void failureAndRollbackDoNotConsumeSuccessOrMoveWindowAnchor() {
        UUID token=reserve(RateLimitPolicy.MEDIA_UPLOAD);
        var before=jdbc.queryForObject("SELECT started_at FROM user_rate_limit_windows",java.time.OffsetDateTime.class);
        assertThatThrownBy(()->tx.executeWithoutResult(s->{
            quota.complete(user,RateLimitPolicy.MEDIA_UPLOAD,token);
            jdbc.update("INSERT INTO shops(owner_id,name,industry) VALUES (?,'Rolled back','IT')",user);
            throw new IllegalStateException("late audit failure");
        })).isInstanceOf(IllegalStateException.class);
        assertThat(success()).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM shops",Integer.class)).isZero();
        release(token,RateLimitPolicy.MEDIA_UPLOAD);
        var retry=reserve(RateLimitPolicy.MEDIA_UPLOAD);
        tx.executeWithoutResult(s->quota.complete(user,RateLimitPolicy.MEDIA_UPLOAD,retry));
        assertThat(success()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT started_at FROM user_rate_limit_windows",java.time.OffsetDateTime.class)).isEqualTo(before);
    }

    @Test void shopWindowIsTwentyFourHoursAndUsersAndGroupsAreIndependent() {
        for(int n=0;n<5;n++) { var token=reserve(RateLimitPolicy.SHOP_CREATE); tx.executeWithoutResult(s->quota.complete(user,RateLimitPolicy.SHOP_CREATE,token)); }
        assertThatThrownBy(()->reserve(RateLimitPolicy.SHOP_CREATE)).isInstanceOfSatisfying(RateLimitExceededException.class,
                e->assertThat(e.retryAfter()).isBetween(86300L,86400L));
        assertThat(jdbc.queryForObject("SELECT extract(epoch FROM ends_at-started_at) FROM user_rate_limit_windows",Long.class)).isEqualTo(86400);
        reserve(RateLimitPolicy.MEDIA_UPLOAD);
        long other=jdbc.queryForObject("INSERT INTO users(display_name) VALUES ('Other') RETURNING id",Long.class);
        tx.executeWithoutResult(s->quota.reserve(other,RateLimitPolicy.SHOP_CREATE,UUID.randomUUID()));
    }

    @Test void pendingSlotsBlockOverbookingAndExpiredLeaseCannotCommit() {
        UUID first=reserve(RateLimitPolicy.MEDIA_UPLOAD);
        for(int n=1;n<10;n++) reserve(RateLimitPolicy.MEDIA_UPLOAD);
        assertThat(success()).isZero();
        assertThatThrownBy(()->reserve(RateLimitPolicy.MEDIA_UPLOAD)).isInstanceOfSatisfying(RateLimitExceededException.class,
                e->assertThat(e.retryAfter()).isBetween(1L,60L));
        jdbc.update("""
                UPDATE user_rate_limit_reservations SET created_at=clock_timestamp()-interval '10 seconds',
                    lease_expires_at=clock_timestamp()-interval '1 second' WHERE lease_token=?
                """,first);
        UUID replacement=reserve(RateLimitPolicy.MEDIA_UPLOAD);
        assertThatThrownBy(()->tx.executeWithoutResult(s->quota.complete(user,RateLimitPolicy.MEDIA_UPLOAD,first)))
                .isInstanceOfSatisfying(BusinessException.class,e->assertThat(e.getErrorCode()).isEqualTo(ErrorCode.RATE_LIMIT_RESERVATION_EXPIRED));
        release(first,RateLimitPolicy.MEDIA_UPLOAD);
        tx.executeWithoutResult(s->quota.complete(user,RateLimitPolicy.MEDIA_UPLOAD,replacement));
        assertThat(success()).isEqualTo(1);
    }

    @Test void lateCompletionStaysInItsOriginalWindow() {
        UUID old=reserve(RateLimitPolicy.MEDIA_UPLOAD);
        UUID oldWindow=jdbc.queryForObject("SELECT id FROM user_rate_limit_windows",UUID.class);
        jdbc.update("UPDATE user_rate_limit_windows SET started_at=clock_timestamp()-interval '61 seconds',ends_at=clock_timestamp()-interval '1 second'");
        UUID current=reserve(RateLimitPolicy.MEDIA_UPLOAD);
        tx.executeWithoutResult(s->quota.complete(user,RateLimitPolicy.MEDIA_UPLOAD,old));
        assertThat(jdbc.queryForObject("SELECT successful_count FROM user_rate_limit_windows WHERE id=?",Integer.class,oldWindow)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT successful_count FROM user_rate_limit_windows WHERE id<>?",Integer.class,oldWindow)).isZero();
        tx.executeWithoutResult(s->quota.complete(user,RateLimitPolicy.MEDIA_UPLOAD,current));
        assertThat(success()).isEqualTo(2);
    }

    @Test void missingStoreFailsClosedAndDisabledFeatureDoesNotQueryIt() {
        jdbc.execute("ALTER TABLE user_rate_limit_windows RENAME TO missing_quota_windows");
        assertThatThrownBy(()->reserve(RateLimitPolicy.SHOP_CREATE)).isInstanceOfSatisfying(BusinessException.class,
                e->assertThat(e.getErrorCode()).isEqualTo(ErrorCode.RATE_LIMIT_UNAVAILABLE));
        var disabled=new UserRateLimitService(new UserRateLimitRepository(jdbc),false,300);
        tx.executeWithoutResult(s->disabled.reserve(user,RateLimitPolicy.SHOP_CREATE,UUID.randomUUID()));
    }

    @Test void cleanupRetainsLiveLeasesAndOnlyDeletesExpiredWindows() {
        UUID token=reserve(RateLimitPolicy.MEDIA_UPLOAD);
        jdbc.update("UPDATE user_rate_limit_windows SET started_at=clock_timestamp()-interval '3 days',ends_at=clock_timestamp()-interval '2 days'");
        tx.executeWithoutResult(s->quota.cleanup());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM user_rate_limit_windows",Integer.class)).isEqualTo(1);
        release(token,RateLimitPolicy.MEDIA_UPLOAD); tx.executeWithoutResult(s->quota.cleanup());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM user_rate_limit_windows",Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM user_rate_limit_reservations",Integer.class)).isZero();
    }

    @Test void migrationCollisionRollsBackBothTablesAndPreservesV19() throws Exception {
        String conflicting="core_quota_collision_"+UUID.randomUUID().toString().replace("-", "");
        try(var c=connection();var s=c.createStatement()) { s.execute("CREATE SCHEMA "+conflicting); }
        try {
            var isolated=new DriverManagerDataSource(System.getenv("CORE_TEST_POSTGRES_URL"),
                    System.getenv("CORE_TEST_POSTGRES_USERNAME"),System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
            var properties=new Properties();properties.setProperty("currentSchema",conflicting);isolated.setConnectionProperties(properties);
            var sql=new JdbcTemplate(isolated);
            Flyway.configure().dataSource(isolated).schemas(conflicting).defaultSchema(conflicting).target("19").load().migrate();
            sql.execute("CREATE TABLE user_rate_limit_reservations(marker TEXT)");
            sql.update("INSERT INTO user_rate_limit_reservations VALUES ('unrelated')");
            assertThatThrownBy(()->Flyway.configure().dataSource(isolated).schemas(conflicting).defaultSchema(conflicting).load().migrate())
                    .isInstanceOf(org.flywaydb.core.api.FlywayException.class);
            assertThat(sql.queryForObject("SELECT marker FROM user_rate_limit_reservations",String.class)).isEqualTo("unrelated");
            assertThat(sql.queryForObject("SELECT to_regclass('user_rate_limit_windows')",String.class)).isNull();
            assertThat(sql.queryForObject("SELECT max(version::int) FROM flyway_schema_history WHERE success",Integer.class)).isEqualTo(19);
        } finally {
            if(conflicting.matches("core_quota_collision_[a-f0-9]{32}")) {
                try(var c=connection();var s=c.createStatement()) { s.execute("DROP SCHEMA "+conflicting+" CASCADE"); }
            }
        }
    }

    UUID reserve(RateLimitPolicy policy) {
        UUID token=UUID.randomUUID(); tx.executeWithoutResult(s->quota.reserve(user,policy,token)); return token;
    }
    void release(UUID token,RateLimitPolicy policy) { tx.executeWithoutResult(s->quota.release(user,policy,token)); }
    int success() { return jdbc.queryForObject("SELECT coalesce(sum(successful_count),0) FROM user_rate_limit_windows",Integer.class); }
    Flyway flyway(String target) {
        var config=Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema);
        if(target!=null) config.target(target); return config.load();
    }
    java.sql.Connection connection() throws Exception {
        return DriverManager.getConnection(System.getenv("CORE_TEST_POSTGRES_URL"),System.getenv("CORE_TEST_POSTGRES_USERNAME"),System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
    }
}
