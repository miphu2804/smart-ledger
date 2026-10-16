package com.smartledger.core.manual;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartledger.core.SmartLedgerCoreApplication;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import org.flywaydb.core.Flyway;
import org.springframework.boot.SpringApplication;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** Explicit manual test entry point. Test classpath only; never packaged into the Core JAR. */
public final class ZaloManualServer {
    static final String JDBC_URL = "jdbc:postgresql://127.0.0.1:55449/zalo_manual?currentSchema=core_zalo_manual";
    private static final String DATABASE_USER = "zalo_manual";
    private static final String DATABASE_PASSWORD = "zalo_manual_disposable_only";
    private static final String SCHEMA = "core_zalo_manual";

    private ZaloManualServer() { }

    public static void main(String[] args) {
        try {
            if (args.length == 1 && "--check-db".equals(args[0])) {
                prepareDatabase();
                System.out.println("Disposable Zalo database ready; existing mappings preserved. No Firebase calls.");
                return;
            }
            if (args.length != 0 || System.getenv("FIREBASE_AUTH_EMULATOR_HOST") != null) {
                throw new IllegalArgumentException("Use the documented manual launcher without emulator overrides.");
            }
            String credentialFile = System.getenv("ZALO_MANUAL_FIREBASE_CREDENTIALS");
            if (credentialFile == null || !Path.of(credentialFile).isAbsolute()) {
                throw new IllegalArgumentException("An absolute dev/staging credential file is required.");
            }
            Path credential = Path.of(credentialFile);
            if (Files.size(credential) > 65536) throw new IllegalArgumentException("Invalid credential file.");
            String json = Files.readString(credential);
            validateCredential(json);
            var environment = new StandardEnvironment();
            // Do not inherit a shared database/profile/config import from the user's normal Core shell.
            environment.getPropertySources().remove(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME);
            environment.getPropertySources().remove(StandardEnvironment.SYSTEM_PROPERTIES_PROPERTY_SOURCE_NAME);
            var pinned = settings(System.getenv(), json);
            environment.getPropertySources().addFirst(new MapPropertySource("isolated-zalo-manual",
                    new HashMap<>(pinned)));
            prepareDatabase();
            var application = new SpringApplication(SmartLedgerCoreApplication.class);
            application.setEnvironment(environment);
            // Reassert highest priority after Boot converts the environment for a servlet application.
            application.addInitializers(context -> context.getEnvironment().getPropertySources()
                    .addFirst(new MapPropertySource("isolated-zalo-manual", new HashMap<>(pinned))));
            application.setAdditionalProfiles("zalo-manual");
            application.run();
        } catch (Exception ignored) {
            // Do not echo environment, credential JSON, provider response or raw exception text.
            System.err.println("Manual startup failed. Check Docker, ports, HTTPS origin and dev/staging credentials. See docs/zalo-manual-login.md.");
            System.exit(1);
        }
    }

    static void validateCredential(String json) {
        try {
            var document = new ObjectMapper().readTree(json);
            if (!"service_account".equals(document.path("type").asText())
                    || !"smart-ledger-c2892".equals(document.path("project_id").asText())) {
                throw new IllegalArgumentException();
            }
        } catch (Exception ignored) {
            throw new IllegalArgumentException("Only a dev/staging service-account file is allowed.");
        }
    }

    static Map<String, String> settings(Map<String, String> config, String credentialJson) {
        if (!"true".equals(config.get("ZALO_MANUAL_CONFIRM_FIREBASE_STAGING"))) {
            throw new IllegalArgumentException("Explicit consent for real dev/staging Firebase is required.");
        }
        String origin = config.get("ZALO_MANUAL_ORIGIN");
        try {
            URI uri = URI.create(origin);
            if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null
                    || uri.getPort() > 65535 || origin.contains("*")
                    || !origin.equals("https://" + uri.getRawAuthority())) throw new IllegalArgumentException();
        } catch (Exception ignored) {
            throw new IllegalArgumentException("Use an exact HTTPS test origin without path or trailing slash.");
        }
        String appId = config.get("ZALO_APP_ID");
        String secret = config.get("ZALO_APP_SECRET");
        if (appId == null || !appId.matches("[0-9]{1,30}") || secret == null || secret.isBlank()) {
            throw new IllegalArgumentException("Zalo credentials are required.");
        }
        byte[] key = new byte[32];
        new SecureRandom().nextBytes(key);
        var settings = new HashMap<String, String>();
        settings.put("server.address", "127.0.0.1");
        settings.put("server.port", "18081");
        settings.put("server.forward-headers-strategy", "none");
        settings.put("server.tomcat.accesslog.enabled", "false");
        settings.put("spring.datasource.url", JDBC_URL);
        settings.put("spring.datasource.username", DATABASE_USER);
        settings.put("spring.datasource.password", DATABASE_PASSWORD);
        settings.put("spring.jpa.properties.hibernate.default_schema", SCHEMA);
        settings.put("spring.jpa.hibernate.ddl-auto", "validate");
        settings.put("spring.jpa.show-sql", "false");
        settings.put("spring.flyway.enabled", "false");
        settings.put("firebase.project-id", "smart-ledger-c2892");
        settings.put("firebase.service-account-json", credentialJson);
        settings.put("cloudinary.enabled", "false");
        settings.put("ai.internal-token", "");
        settings.put("ai.base-url", "http://127.0.0.1:1");
        settings.put("springdoc.api-docs.enabled", "false");
        settings.put("springdoc.swagger-ui.enabled", "false");
        settings.put("smartledger.cors.allowed-origins", origin);
        settings.put("zalo.enabled", "true");
        settings.put("zalo.app-id", appId);
        settings.put("zalo.app-secret", secret);
        settings.put("zalo.callback-url", origin + "/api/v1/auth/zalo/callback");
        settings.put("zalo.client-origins", origin);
        settings.put("zalo.session-encryption-key", Base64.getEncoder().encodeToString(key));
        settings.put("zalo.session-ttl-seconds", "300");
        settings.put("zalo.proof-ttl-seconds", "90");
        settings.put("zalo.http-timeout-seconds", "10");
        settings.put("logging.level.root", "WARN");
        settings.put("logging.level.com.smartledger", "INFO");
        settings.put("logging.level.org.springframework.web", "OFF");
        settings.put("logging.level.org.springframework.jdbc", "OFF");
        settings.put("logging.level.org.hibernate", "OFF");
        settings.put("logging.level.com.zaxxer.hikari", "OFF");
        return Map.copyOf(settings);
    }

    private static void prepareDatabase() throws Exception {
        var source = new DriverManagerDataSource(JDBC_URL, DATABASE_USER, DATABASE_PASSWORD);
        var jdbc = new JdbcTemplate(source);
        if (!"zalo_manual".equals(jdbc.queryForObject("select current_database()", String.class))
                || !DATABASE_USER.equals(jdbc.queryForObject("select current_user", String.class))) {
            throw new IllegalArgumentException("Dedicated manual database required.");
        }
        boolean sessions = Boolean.TRUE.equals(jdbc.queryForObject(
                "select to_regclass('oauth_login_sessions') is not null", Boolean.class));
        boolean identities = Boolean.TRUE.equals(jdbc.queryForObject(
                "select to_regclass('external_auth_identities') is not null", Boolean.class));
        boolean history = Boolean.TRUE.equals(jdbc.queryForObject(
                "select to_regclass('flyway_schema_history') is not null", Boolean.class));
        boolean migrated = history && jdbc.queryForObject(
                "select count(*) from flyway_schema_history where version='17' and success", Integer.class) == 1;
        if ((sessions || identities) && !migrated) {
            System.err.println("Legacy manual fixture detected. No adoption/reset performed. See the V17 note in docs/zalo-manual-login.md before choosing to discard temporary DB data.");
            throw new IllegalStateException("Unversioned manual stores.");
        }
        Flyway.configure().dataSource(source).locations("classpath:db/migration")
                .schemas(SCHEMA).defaultSchema(SCHEMA).cleanDisabled(true).load().migrate();
    }
}
