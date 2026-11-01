package com.smartledger.core.ratelimit;

import static org.assertj.core.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartledger.core.zalo.ZaloRequestLimiter;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration;
import org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration;
import org.springframework.boot.autoconfigure.security.servlet.SecurityAutoConfiguration;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;
import org.springframework.boot.web.servlet.context.ServletWebServerApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Real embedded Tomcat RemoteIpValve executes before the unchanged Zalo servlet filter. */
class ForwardedClientIpHttpTest {
    @Configuration(proxyBeanMethods=false)
    @EnableAutoConfiguration(exclude={DataSourceAutoConfiguration.class,HibernateJpaAutoConfiguration.class,
            FlywayAutoConfiguration.class,SecurityAutoConfiguration.class,UserDetailsServiceAutoConfiguration.class,
            org.springframework.boot.actuate.autoconfigure.security.servlet.ManagementWebSecurityAutoConfiguration.class})
    @Import(Probe.class)
    static class App {
        @Bean ZaloRequestLimiter limiter(ObjectMapper mapper) { return new ZaloRequestLimiter(mapper); }
    }
    @RestController static class Probe {
        @GetMapping("/api/v1/auth/zalo/authorize") String ip(HttpServletRequest request) { return request.getRemoteAddr(); }
    }
    @Test void trustedProxyProvidesRealClientIpAndSeparateZaloQuota() throws Exception {
        try(var context=start("127\\.0\\.0\\.1");var client=HttpClient.newHttpClient()) {
            int port=context.getWebServer().getPort();
            for(int n=0;n<30;n++) assertThat(get(client,port,"198.51.100.1").body()).isEqualTo("198.51.100.1");
            assertThat(get(client,port,"198.51.100.1").statusCode()).isEqualTo(429);
            // The existing salted fixed buckets permit collisions; do not create a probabilistically flaky test.
            boolean independent=false;
            for(int n=2;n<10;n++) {
                var response=get(client,port,"198.51.100."+n);
                if(response.statusCode()==200) { assertThat(response.body()).isEqualTo("198.51.100."+n); independent=true; break; }
            }
            assertThat(independent).isTrue();
        }
    }
    @Test void untrustedSocketPeerCannotChangeAddressBySpoofingForwardedHeader() throws Exception {
        try(var context=start("192\\.0\\.2\\.10");var client=HttpClient.newHttpClient()) {
            int port=context.getWebServer().getPort();
            for(int n=0;n<30;n++) assertThat(get(client,port,"198.51.100."+n).body()).isEqualTo("127.0.0.1");
            assertThat(get(client,port,"203.0.113.1").statusCode()).isEqualTo(429);
        }
    }
    ServletWebServerApplicationContext start(String proxy) {
        return (ServletWebServerApplicationContext)SpringApplication.run(App.class,
                "--server.port=0","--server.address=127.0.0.1","--server.forward-headers-strategy=native",
                "--server.tomcat.remoteip.internal-proxies="+proxy,"--springdoc.api-docs.enabled=false",
                "--springdoc.swagger-ui.enabled=false","--management.endpoint.health.group.readiness.include=readinessState");
    }
    HttpResponse<String> get(HttpClient client,int port,String forwarded) throws Exception {
        return client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/api/v1/auth/zalo/authorize"))
                .header("X-Forwarded-For",forwarded).GET().build(),HttpResponse.BodyHandlers.ofString());
    }
}
