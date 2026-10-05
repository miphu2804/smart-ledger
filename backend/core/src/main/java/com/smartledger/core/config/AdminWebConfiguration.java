package com.smartledger.core.config;

import com.smartledger.core.security.AdminAccessGuard;
import com.smartledger.core.security.VerifiedFirebaseToken;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Bean;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration(proxyBeanMethods = false)
public class AdminWebConfiguration {
    @Bean
    WebMvcConfigurer adminAccessInterceptor(AdminAccessGuard guard) {
        return new WebMvcConfigurer() {
            @Override
            public void addInterceptors(InterceptorRegistry registry) {
                registry.addInterceptor(new HandlerInterceptor() {
                    @Override
                    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
                        var authentication = SecurityContextHolder.getContext().getAuthentication();
                        var principal = authentication == null ? null : authentication.getPrincipal();
                        guard.requireAdmin(principal instanceof VerifiedFirebaseToken token ? token : null);
                        response.setHeader("Cache-Control", "no-store");
                        return true;
                    }
                }).addPathPatterns("/api/v1/admin/**");
            }
        };
    }
}
