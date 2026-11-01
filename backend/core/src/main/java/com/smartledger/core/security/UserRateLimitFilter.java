package com.smartledger.core.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartledger.core.enums.UserStatus;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.ApiErrorResponse;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.ratelimit.RateLimitPolicy;
import com.smartledger.core.ratelimit.UserRateLimitService;
import com.smartledger.core.repository.AuthIdentityRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/** Anchors a durable request window without consuming quota or blocking authenticated media replays. */
public class UserRateLimitFilter extends OncePerRequestFilter {
    private final UserRateLimitService quota;
    private final AuthIdentityRepository identities;
    private final ObjectMapper mapper;
    public UserRateLimitFilter(UserRateLimitService quota, AuthIdentityRepository identities, ObjectMapper mapper) {
        this.quota = quota; this.identities = identities; this.mapper = mapper;
    }
    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !quota.enabled() || policy(request) == null;
    }
    private RateLimitPolicy policy(HttpServletRequest request) {
        String path = request.getServletPath().isEmpty()
                ? request.getRequestURI().substring(request.getContextPath().length()) : request.getServletPath();
        return RateLimitPolicy.match(request.getMethod(), path);
    }
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication instanceof FirebaseAuthenticationToken token && token.isAuthenticated()) {
            try {
                var user = identities.findWithUserByProviderSubject(token.getPrincipal().uid()).map(i -> i.getUser());
                // Existing services keep ownership/role and disabled/missing-profile error semantics.
                if (user.isPresent() && user.get().getStatus() != UserStatus.DISABLED) {
                    quota.touch(user.get().getId(), policy(request));
                }
            } catch (BusinessException error) {
                error(response, error.getErrorCode()); return;
            } catch (org.springframework.dao.DataAccessException | org.springframework.transaction.TransactionException error) {
                error(response, ErrorCode.RATE_LIMIT_UNAVAILABLE); return;
            }
        }
        chain.doFilter(request, response);
    }
    private void error(HttpServletResponse response, ErrorCode code) throws IOException {
        response.setStatus(code.getHttpStatus().value());
        response.setContentType("application/json");
        response.setHeader("Cache-Control", "no-store");
        mapper.writeValue(response.getOutputStream(), new ApiErrorResponse(
                code.getCode(), code.getMessage(), List.of(), UUID.randomUUID().toString()));
    }
}
