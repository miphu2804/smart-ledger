package com.smartledger.core.billing;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartledger.core.config.SecurityConfiguration;
import com.smartledger.core.controller.AgentController;
import com.smartledger.core.dto.request.AgentChatRequest;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.ApiExceptionHandler;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.exception.RestAuthenticationEntryPoint;
import com.smartledger.core.security.BearerTokenAuthenticationFilter;
import com.smartledger.core.security.FirebaseTokenVerifier;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.AgentService;
import com.smartledger.core.service.ShopService;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.servlet.context.ServletWebServerApplicationContext;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.web.client.RestClient;

/**
 * Explicit opt-in integration: real Core HTTP, Python AI HTTP and PostgreSQL on loopback.
 * The IT suffix excludes it from ordinary Surefire runs; explicit invocation fails if setup is absent.
 * Firebase verification/shop lookup are fixtures; the final OWNER/shop admission checks and all quota/AI persistence are real.
 */
class CoreAiQuotaIT {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final AgentChatRequest QUESTION = new AgentChatRequest(null, "Today's revenue?");
    private final HttpClient http = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).connectTimeout(Duration.ofSeconds(3)).build();
    private Path repository;
    private Path scratch;
    private String schema;
    private String database;
    private String username;
    private String password;
    private String internalToken;
    private Process python;
    private int aiPort;
    private int corePort;
    private long owner;
    private long shopId;
    private Shop shop;
    private ShopService shops;
    private DriverManagerDataSource source;
    private JdbcTemplate sql;
    private ChatQuotaStore store;
    private ChatQuotaLedger ledger;
    private ChatQuotaService service;
    private ChatQuotaAiClient transport;
    private AgentService legacy;
    private SubscriptionService subscription;
    private SePayPaymentsPostgresTest.MutableClock clock;
    private ServletWebServerApplicationContext core;

    @Configuration(proxyBeanMethods = false)
    @EnableAutoConfiguration(exclude = {DataSourceAutoConfiguration.class, HibernateJpaAutoConfiguration.class,
            FlywayAutoConfiguration.class, UserDetailsServiceAutoConfiguration.class})
    @Import({AgentController.class, SubscriptionController.class, SecurityConfiguration.class,
            BearerTokenAuthenticationFilter.class, RestAuthenticationEntryPoint.class, ApiExceptionHandler.class})
    static class TestApplication { }

    @BeforeEach void setup() throws Exception {
        repository = Path.of("").toAbsolutePath().getParent().getParent();
        assertThat(repository.resolve("backend/ai/src/main.py")).isRegularFile();
        database = required("CORE_TEST_POSTGRES_URL");
        username = required("CORE_TEST_POSTGRES_USERNAME"); password = required("CORE_TEST_POSTGRES_PASSWORD");
        URI destination = URI.create(database.replaceFirst("^jdbc:", ""));
        assertThat(destination.getHost()).as("Disposable DB must be loopback").isIn("localhost", "127.0.0.1");
        assertThat(destination.getPath()).as("Disposable DB name must contain test").contains("test");
        assertThat(destination.getQuery()).as("No caller-controlled search path").isNull();
        assertThat(Path.of(required("CORE_TEST_AI_PYTHON"))).isRegularFile();
        schema = "core_ai_it_" + UUID.randomUUID().toString().replace("-", "");
        scratch = Files.createDirectory(repository.resolve("backend/core/target/" + schema));
        try (var c = DriverManager.getConnection(database, username, password); var statement = c.createStatement()) {
            statement.execute("CREATE SCHEMA " + schema);
        }
        source = new DriverManagerDataSource(database, username, password);
        var options = new Properties(); options.setProperty("currentSchema", schema); source.setConnectionProperties(options);
        Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).load().migrate();
        sql = new JdbcTemplate(source);
        owner = sql.queryForObject("INSERT INTO users(display_name) VALUES ('Integration owner') RETURNING id", Long.class);
        sql.update("INSERT INTO auth_identities(user_id,provider_subject) VALUES (?,'it-owner')", owner);
        shopId = sql.queryForObject("INSERT INTO shops(owner_id,name,industry) VALUES (?,'Integration','Retail') RETURNING id", Long.class, owner);
        internalToken = UUID.randomUUID().toString();
        startAi();
        clock = new SePayPaymentsPostgresTest.MutableClock(Instant.parse("2027-01-31T03:04:05Z"));
        var billing = new BillingRepository(sql);
        var subscriptions = new SubscriptionRepository(sql);
        var manager = new DataSourceTransactionManager(source);
        store = new ChatQuotaStore(sql);
        ledger = new ChatQuotaLedger(store, billing, subscriptions, new ChatQuotaProperties(true, true), clock, manager);
        var client = client(internalToken);
        transport = new ChatQuotaAiClient(client, client);
        shop = mock(Shop.class); when(shop.getId()).thenReturn(shopId); when(shop.getOwnerId()).thenReturn(owner);
        shops = mock(ShopService.class);
        when(shops.requireOwnedActiveShop(any(), any())).thenAnswer(call -> {
            if (!Long.toString(shopId).equals(call.getArgument(1))) throw new BusinessException(ErrorCode.SHOP_ACCESS_DENIED);
            return shop;
        });
        service = new ChatQuotaService(shops, ledger, transport);
        subscription = new SubscriptionService(billing, subscriptions, new SubscriptionProperties(false), clock, manager,
                new ChatQuotaProperties(true, true));
        startCore();
    }

    private RestClient client(String token) {
        var factory = new SimpleClientHttpRequestFactory(); factory.setConnectTimeout(Duration.ofSeconds(3)); factory.setReadTimeout(Duration.ofSeconds(20));
        return RestClient.builder().baseUrl("http://127.0.0.1:" + aiPort).defaultHeader("X-Internal-Token", token).requestFactory(factory).build();
    }
    private void startCore() {
        legacy = mock(AgentService.class);
        var verifier = mock(FirebaseTokenVerifier.class);
        when(verifier.verify("fixture-owner")).thenReturn(token());
        core = (ServletWebServerApplicationContext) new SpringApplicationBuilder(TestApplication.class)
                .properties("server.address=127.0.0.1", "server.port=0", "spring.main.banner-mode=off", "spring.jmx.enabled=false",
                        "smartledger.ai-quota.enabled=true", "logging.level.root=WARN", "spring.main.lazy-initialization=false")
                .initializers(context -> {
                    var beans = context.getBeanFactory();
                    beans.registerSingleton("legacyAgent", legacy); beans.registerSingleton("quotaService", service);
                    beans.registerSingleton("subscription", subscription); beans.registerSingleton("verifier", verifier);
                    beans.registerSingleton("dbHealthIndicator", (HealthIndicator) () -> {
                        sql.queryForObject("SELECT 1", Integer.class); return Health.up().build();
                    });
                }).run("--server.address=127.0.0.1", "--server.port=0", "--smartledger.ai-quota.enabled=true");
        corePort = core.getWebServer().getPort();
    }
    private void startAi() throws Exception {
        Path ready = scratch.resolve("ready.json"); Files.deleteIfExists(ready);
        var builder = new ProcessBuilder(required("CORE_TEST_AI_PYTHON"), "-m", "tests.integration_tests.core_quota_fixture",
                "--schema", schema, "--ready-file", ready.toString()).directory(scratch.toFile());
        var inherited = new HashMap<>(builder.environment()); builder.environment().clear();
        for (String key : new String[]{"PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP"})
            if (inherited.containsKey(key)) builder.environment().put(key, inherited.get(key));
        URI destination = URI.create(database.replaceFirst("^jdbc:", ""));
        builder.environment().putAll(Map.of("PYTHONPATH", repository.resolve("backend/ai").toString(), "PYTHONUTF8", "1",
                "INTERNAL_API_TOKEN", internalToken, "LOG_LEVEL", "WARNING", "POSTGRES_TEST_URL",
                "postgresql://" + encode(username) + ":" + encode(password) + "@127.0.0.1:" + destination.getPort() + destination.getPath()));
        builder.redirectErrorStream(true).redirectOutput(ProcessBuilder.Redirect.appendTo(scratch.resolve("ai.log").toFile()));
        python = builder.start();
        await(() -> Files.isRegularFile(ready) || !python.isAlive());
        assertThat(python.isAlive()).as("AI fixture startup failed; inspect target/%s/ai.log locally", schema).isTrue();
        aiPort = JSON.readTree(Files.readString(ready)).path("port").asInt();
        await(() -> { try { return stats().path("calls").asInt() >= 0; } catch (Exception ignored) { return false; } });
    }

    @AfterEach void cleanup() throws Exception {
        if (core != null) core.close();
        if (python != null && python.isAlive()) {
            try { control("RELEASE"); } catch (Exception ignored) { }
            python.destroy(); if (!python.waitFor(5, TimeUnit.SECONDS)) python.destroyForcibly().waitFor(5, TimeUnit.SECONDS);
        }
        if (schema != null && schema.matches("core_ai_it_[a-f0-9]{32}")) {
            try (var c = DriverManager.getConnection(database, username, password); var statement = c.createStatement()) {
                statement.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
            }
        }
    }

    @Test void jsonAndRealSseReplayShareOneReceiptAndDebitBeforeDone() throws Exception {
        var first = chat("a", false); assertThat(first.statusCode()).isEqualTo(200);
        var replay = chat("a", true); assertThat(replay.statusCode()).isEqualTo(200);
        assertThat(replay.headers().firstValue("Content-Type").orElse("")).startsWith("text/event-stream");
        assertThat(replay.body()).contains("event: done", json(first).path("answer").asText()).doesNotContain("model", "request_id");
        String followup = JSON.writeValueAsString(Map.of("conversation_id", json(first).path("conversation_id").asLong(),
                "message", "Today's revenue?"));
        var streamed = http.send(chatRequest("b", followup, true), HttpResponse.BodyHandlers.ofInputStream());
        assertThat(streamed.statusCode()).isEqualTo(200);
        boolean done = false, delta = false;
        try (var reader = new BufferedReader(new InputStreamReader(streamed.body(), StandardCharsets.UTF_8))) {
            for (String line = reader.readLine(); line != null; line = reader.readLine()) {
                if (line.equals("event: delta")) delta = true;
                if (line.equals("event: done")) { counts(2, 0); done = true; }
            }
        }
        assertThat(done).isTrue(); assertThat(delta).isTrue();
        var repeated = chatBody("b", followup, false); assertThat(repeated.statusCode()).isEqualTo(200);
        assertThat(json(repeated).path("conversation_id")).isEqualTo(json(first).path("conversation_id"));
        counts(2, 0); assertThat(rows("chat_messages")).isEqualTo(4); assertThat(stats().path("calls").asInt()).isEqualTo(2);
        assertThat(chat("c", false).statusCode()).isEqualTo(429);
        assertThat(chatBody("a", "{\"message\":\"different\"}", false).statusCode()).isEqualTo(409);
        verifyNoInteractions(legacy);
    }

    @Test void pendingReplayAndConcurrentLastSlotDoNotGenerateTwice() throws Exception {
        assertThat(chat("used", false).statusCode()).isEqualTo(200); control("WAIT");
        try (var workers = Executors.newSingleThreadExecutor()) {
            var running = workers.submit(() -> chat("waiting", false));
            await(() -> { try { return stats().path("waiting").asInt() == 1; } catch (Exception e) { return false; } });
            var pending = chat("waiting", true);
            assertThat(pending.statusCode()).isEqualTo(202);
            assertThat(pending.headers().firstValue("Content-Type").orElse("")).startsWith("application/json");
            assertThat(pending.headers().firstValue("Retry-After")).contains("2");
            assertThat(json(pending).path("status").asText()).isEqualTo("PENDING");
            var rejected = chat("third", false); assertThat(rejected.statusCode()).isEqualTo(429);
            assertThat(json(rejected).path("code").asText()).isEqualTo("ai_quota_exhausted"); counts(1, 1);
            control("RELEASE"); assertThat(running.get(20, TimeUnit.SECONDS).statusCode()).isEqualTo(200);
        } finally { control("RELEASE"); }
        counts(2, 0); assertThat(stats().path("calls").asInt()).isEqualTo(2);
    }

    @Test void savedSuccessSurvivesCoreRollbackContextAndAiProcessRestarts() throws Exception {
        sql.execute("CREATE FUNCTION skip_usage() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$");
        sql.execute("CREATE TRIGGER skip_usage BEFORE UPDATE ON ai_turn_usages FOR EACH ROW EXECUTE FUNCTION skip_usage()");
        assertThat(chat("crash", false).statusCode()).isEqualTo(503); counts(0, 1);
        assertThat(rows("chat_messages")).isEqualTo(2);
        sql.execute("DROP TRIGGER skip_usage ON ai_turn_usages");
        core.close(); python.destroy(); assertThat(python.waitFor(5, TimeUnit.SECONDS)).isTrue(); startAi();
        var manager = new DataSourceTransactionManager(source);
        store = new ChatQuotaStore(sql);
        ledger = new ChatQuotaLedger(store, new BillingRepository(sql), new SubscriptionRepository(sql),
                new ChatQuotaProperties(true, true), clock, manager);
        var client = client(internalToken);
        transport = new ChatQuotaAiClient(client, client);
        service = new ChatQuotaService(shops, ledger, transport);
        startCore();
        sql.update("UPDATE users SET status='DISABLED' WHERE id=?", owner);
        clock.advance(91); new ChatQuotaRecovery(ledger, service).run(); counts(1, 0);
        sql.update("UPDATE users SET status='ACTIVE' WHERE id=?", owner);
        assertThat(chat("crash", true).body()).contains("event: done");
        assertThat(stats().path("calls").asInt()).isZero(); assertThat(rows("chat_messages")).isEqualTo(2);
    }

    @Test void recoveryTombstoneBeforeDelayedDispatchPreventsAnyGeneration() throws Exception {
        var row = ledger.admit(token(), shop, QUESTION, "delayed").usage();
        clock.advance(91); new ChatQuotaRecovery(ledger, service).run(); counts(0, 0);
        assertThat(transport.dispatch(row, QUESTION)).isEqualTo(409);
        assertThat(chat("delayed", false).statusCode()).isEqualTo(409);
        assertThat(rows("chat_messages")).isZero(); assertThat(stats().path("calls").asInt()).isZero();
    }

    @Test void cancellationFencesAStillRunningModelBeforeItsLateSave() throws Exception {
        control("WAIT");
        try (var workers = Executors.newSingleThreadExecutor()) {
            var running = workers.submit(() -> chat("cancel", false));
            await(() -> { try { return stats().path("waiting").asInt() == 1; } catch (Exception e) { return false; } });
            clock.advance(91); new ChatQuotaRecovery(ledger, service).run(); counts(0, 0);
            control("RELEASE"); assertThat(running.get(20, TimeUnit.SECONDS).statusCode()).isEqualTo(409);
        } finally { control("RELEASE"); }
        assertThat(chat("cancel", false).statusCode()).isEqualTo(409);
        assertThat(rows("chat_messages")).isZero(); assertThat(stats().path("calls").asInt()).isEqualTo(1);
    }

    @Test void definitiveFailureReleasesOnceWithoutLeakingProviderDiagnostics() throws Exception {
        control("FAIL"); var failed = chat("failure", false);
        assertThat(failed.statusCode()).isEqualTo(503); assertThat(failed.body()).doesNotContain("synthetic", "private", "RuntimeError");
        counts(0, 0); control("SUCCESS");
        assertThat(chat("failure", false).statusCode()).isEqualTo(503);
        assertThat(stats().path("calls").asInt()).isEqualTo(1);
        assertThat(chat("next", false).statusCode()).isEqualTo(200); counts(1, 0);
    }

    @Test void deletedSuccessRemainsChargedAndReturnsGoneWithoutRegeneration() throws Exception {
        var success = chat("deleted", false);
        long conversation = json(success).path("conversation_id").asLong();
        var deleted = ai("DELETE", "/internal/v1/agent/conversations/" + conversation + "?user_id=" + owner + "&shop_id=" + shopId, null, internalToken);
        assertThat(deleted.statusCode()).isEqualTo(204);
        var replay = chat("deleted", false); assertThat(replay.statusCode()).isEqualTo(410);
        assertThat(json(replay).path("code").asText()).isEqualTo("ai_turn_result_removed");
        counts(1, 0); assertThat(rows("chat_messages")).isZero(); assertThat(stats().path("calls").asInt()).isEqualTo(1);
    }

    @Test void unavailableProtocolRetainsReservationUntilAuthenticatedRecovery() throws Exception {
        assertThat(ai("GET", "/internal/v1/agent/turns/" + UUID.randomUUID() + "?user_id=" + owner + "&shop_id=" + shopId, null, null).statusCode()).isEqualTo(401);
        control("DISABLED"); var unavailable = chat("offline", false);
        assertThat(unavailable.statusCode()).isEqualTo(503); counts(0, 1);
        assertThat(stats().path("calls").asInt()).isZero();
        control("SUCCESS"); clock.advance(91); new ChatQuotaRecovery(ledger, service).run(); counts(0, 0);
        assertThat(chat("offline", false).statusCode()).isEqualTo(409);
    }

    @Test void paidAllowanceAndExactExpiryMatchThePublicQuotaProjection() throws Exception {
        assertThat(chat("free-a", false).statusCode()).isEqualTo(200);
        assertThat(chat("free-b", false).statusCode()).isEqualTo(200);
        assertThat(chat("free-full", false).statusCode()).isEqualTo(429);
        var anchor = SubscriptionPolicy.now(clock.instant());
        var expiry = SubscriptionPolicy.expiry(anchor, 1);
        sql.update("""
                INSERT INTO billing_subscription_periods(user_id,activated_at,purchased_months,quota_policy_version,expires_at,version)
                VALUES (?,?,1,1,?,1)
                """, owner, anchor, expiry);
        assertThat(chat("paid", true).body()).contains("event: done");
        var quota = quota();
        assertThat(quota.path("effectiveTier").asText()).isEqualTo("FULL");
        assertThat(quota.path("limit").asInt()).isEqualTo(300);
        assertThat(quota.path("committed").asInt()).isEqualTo(1);
        assertThat(quota.path("remaining").asInt()).isEqualTo(299);
        assertThat(quota.path("enforcementEnabled").asBoolean()).isTrue();
        clock.current.set(expiry.toInstant());
        assertThat(chat("expired-free", false).statusCode()).isEqualTo(200);
        assertThat(quota().path("effectiveTier").asText()).isEqualTo("FREE");
        assertThat(quota().path("remaining").asInt()).isEqualTo(1);
        counts(4, 0); assertThat(stats().path("calls").asInt()).isEqualTo(4);
    }

    private JsonNode quota() throws Exception {
        var response = http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + corePort + "/api/v1/agent/quota"))
                .timeout(Duration.ofSeconds(5)).header("Authorization", "Bearer fixture-owner").GET().build(), HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(200); return json(response);
    }

    private HttpResponse<String> chat(String key, boolean stream) throws Exception { return chatBody(key, "{\"message\":\"Today's revenue?\"}", stream); }
    private HttpResponse<String> chatBody(String key, String body, boolean stream) throws Exception {
        return http.send(chatRequest(key, body, stream), HttpResponse.BodyHandlers.ofString());
    }
    private HttpRequest chatRequest(String key, String body, boolean stream) {
        return HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + corePort + "/api/v1/agent/chat" + (stream ? "/stream" : "")))
                .timeout(Duration.ofSeconds(25)).header("Authorization", "Bearer fixture-owner").header("X-Shop-Id", Long.toString(shopId))
                .header("Content-Type", "application/json").header("Accept", stream ? "text/event-stream, application/json" : "application/json")
                .header("Idempotency-Key", key).POST(HttpRequest.BodyPublishers.ofString(body)).build();
    }
    private HttpResponse<String> ai(String method, String path, String body, String token) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + aiPort + path)).timeout(Duration.ofSeconds(5));
        if (token != null) request.header("X-Internal-Token", token);
        if (body != null) request.header("Content-Type", "application/json");
        return http.send(request.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
    }
    private void control(String mode) throws Exception { assertThat(ai("POST", "/__test__/control", "{\"mode\":\"" + mode + "\"}", internalToken).statusCode()).isEqualTo(200); }
    private JsonNode stats() throws Exception {
        var response = ai("GET", "/__test__/stats", null, internalToken); assertThat(response.statusCode()).isEqualTo(200); return json(response);
    }
    private static JsonNode json(HttpResponse<String> response) throws Exception { return JSON.readTree(response.body()); }
    private int rows(String table) { return sql.queryForObject("SELECT count(*) FROM " + table, Integer.class); }
    private void counts(int committed, int reserved) {
        assertThat(sql.queryForObject("SELECT coalesce(sum(committed_count),0) FROM ai_quota_windows", Integer.class)).isEqualTo(committed);
        assertThat(sql.queryForObject("SELECT coalesce(sum(reserved_count),0) FROM ai_quota_windows", Integer.class)).isEqualTo(reserved);
    }
    private static VerifiedFirebaseToken token() { return new VerifiedFirebaseToken("it-owner", null, false, null, null, null); }
    private static String required(String key) {
        String value = System.getenv(key); assertThat(value).as("Required local integration setting: %s", key).isNotBlank(); return value;
    }
    private static String encode(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20"); }
    private static void await(BooleanSupplier condition) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(45);
        while (!condition.getAsBoolean()) { assertThat(System.nanoTime()).as("Local integration wait deadline").isLessThan(deadline); Thread.sleep(50); }
    }
}
