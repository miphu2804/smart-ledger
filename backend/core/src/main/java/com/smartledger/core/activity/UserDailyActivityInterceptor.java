package com.smartledger.core.activity;

import com.smartledger.core.security.FirebaseAuthenticationToken;
import jakarta.servlet.DispatcherType;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.LocalDate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

/** Captures only server-verified identity; records after the final successful MVC dispatch, including async. */
public class UserDailyActivityInterceptor implements HandlerInterceptor {
    private static final String ATTEMPT = UserDailyActivityInterceptor.class.getName() + ".attempt";
    private final UserDailyActivityService service;

    public UserDailyActivityInterceptor(UserDailyActivityService service) { this.service = service; }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (request.getDispatcherType() == DispatcherType.REQUEST && handler instanceof HandlerMethod
                && !"OPTIONS".equals(request.getMethod())) {
            var authentication = SecurityContextHolder.getContext().getAuthentication();
            if (authentication instanceof FirebaseAuthenticationToken token && token.isAuthenticated()) {
                request.setAttribute(ATTEMPT, new Attempt(token.getPrincipal().uid(), service.today()));
            }
        }
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        Object captured = request.getAttribute(ATTEMPT);
        request.removeAttribute(ATTEMPT);
        if (captured instanceof Attempt attempt && ex == null && response.getStatus() >= 200
                && response.getStatus() < 400 && request.getDispatcherType() != DispatcherType.ERROR) {
            service.record(attempt.uid(), attempt.date());
        }
    }

    private record Attempt(String uid, LocalDate date) { }
}
