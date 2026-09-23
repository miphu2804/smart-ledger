package com.smartledger.core.security;

import com.smartledger.core.exception.RestAuthenticationEntryPoint;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.http.HttpHeaders;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class BearerTokenAuthenticationFilter extends OncePerRequestFilter {

    private static final String BEARER_PREFIX = "Bearer ";

    private final FirebaseTokenVerifier tokenVerifier;
    private final RestAuthenticationEntryPoint authenticationEntryPoint;

    public BearerTokenAuthenticationFilter(
            FirebaseTokenVerifier tokenVerifier,
            RestAuthenticationEntryPoint authenticationEntryPoint) {
        this.tokenVerifier = tokenVerifier;
        this.authenticationEntryPoint = authenticationEntryPoint;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {
        String authorization = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (!StringUtils.hasText(authorization)) {
            filterChain.doFilter(request, response);
            return;
        }
        if (!authorization.regionMatches(true, 0, BEARER_PREFIX, 0, BEARER_PREFIX.length())) {
            authenticationEntryPoint.writeUnauthorized(request, response);
            return;
        }

        String idToken = authorization.substring(BEARER_PREFIX.length()).trim();
        if (!StringUtils.hasText(idToken)) {
            authenticationEntryPoint.writeUnauthorized(request, response);
            return;
        }

        try {
            VerifiedFirebaseToken verifiedToken = tokenVerifier.verify(idToken);
            SecurityContext context = SecurityContextHolder.createEmptyContext();
            context.setAuthentication(new FirebaseAuthenticationToken(verifiedToken));
            SecurityContextHolder.setContext(context);
            filterChain.doFilter(request, response);
        } catch (FirebaseTokenVerificationException exception) {
            authenticationEntryPoint.writeUnauthorized(request, response);
        } finally {
            SecurityContextHolder.clearContext();
        }
    }
}
