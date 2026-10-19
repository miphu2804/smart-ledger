package com.smartledger.core.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartledger.core.config.ZaloNativeProperties;
import com.smartledger.core.config.ZaloProperties;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.service.ZaloAuthService;
import com.smartledger.core.service.ZaloNativeAuthService;
import com.smartledger.core.service.impl.ZaloAuthServiceImpl;
import com.smartledger.core.zalo.*;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.slf4j.LoggerFactory;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;

/** Synthetic callback data only; capture formatted output, arguments and throwable metadata. */
class ZaloCallbackDiagnosticsTest {
    private static final String PRIVATE = "callback-private-marker";
    private static final String STATE = "s".repeat(43);
    private static final String BINDING = "b".repeat(43);
    private static final String CREDENTIAL = "p".repeat(43);
    private final ZaloAuthService service = mock(ZaloAuthService.class);
    private final ZaloNativeAuthService nativeService = mock(ZaloNativeAuthService.class);
    private final Logger logger = (Logger) LoggerFactory.getLogger(ZaloAuthController.class);
    private final ListAppender<ILoggingEvent> events = new ListAppender<>();
    private Level previousLevel;
    private boolean previousAdditive;
    private ZaloAuthController controller;

    @BeforeEach
    void capture() {
        previousLevel = logger.getLevel();
        previousAdditive = logger.isAdditive();
        logger.setLevel(Level.INFO);
        logger.setAdditive(false);
        events.start();
        logger.addAppender(events);
        controller = controller(new ZaloCallbackPage(new ObjectMapper()));
    }

    @AfterEach
    void restore() {
        logger.detachAppender(events);
        logger.setLevel(previousLevel);
        logger.setAdditive(previousAdditive);
        events.stop();
    }

    @Test
    void identifiesInstrumentationAtConstructionWithoutClaimingProviderReadiness() {
        assertThat(events.list).hasSize(1);
        assertThat(events.list.getFirst().getLevel()).isEqualTo(Level.INFO);
        assertThat(events.list.getFirst().getFormattedMessage()).isEqualTo("zalo_callback_diagnostics_ready version=1");
        verifyNoInteractions(service, nativeService);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void reportsPreparedHandoffWithoutLoggingCredentialOrChangingResponse(boolean android) {
        stubResult(android, CREDENTIAL, null);
        events.list.clear();
        var response = controller.callback(params(), request());
        assertThat(response.getStatusCode().value()).isEqualTo(android ? 302 : 200);
        assertThat(response.getHeaders().getFirst("Cache-Control")).isEqualTo("no-store");
        assertThat(response.getHeaders().getFirst("Set-Cookie"))
                .contains("Max-Age=0", "Secure", "HttpOnly", "SameSite=Lax");
        if (android) {
            assertThat(response.getHeaders().getFirst("Location")).contains("#nativeClientId=", "handoffReference=" + CREDENTIAL);
            verifyNoInteractions(service);
            verify(nativeService).callback(STATE, PRIVATE, null, null, BINDING);
        } else {
            assertThat(response.getBody()).contains("window.opener.postMessage", "\"proof\":\"" + CREDENTIAL + "\"");
            assertThat(response.getHeaders().getFirst("Content-Security-Policy")).contains("script-src 'nonce-");
            verify(service).callback(STATE, PRIVATE, null, null, BINDING);
        }
        diagnostic(android ? "android" : "web", "handoff_ready", android ? 302 : 200, "none", true, Level.INFO);
    }

    @ParameterizedTest
    @CsvSource({
        "false,zalo_provider_unavailable", "true,zalo_provider_unavailable",
        "false,zalo_consent_denied", "true,zalo_consent_denied",
        "false,zalo_session_invalid", "true,zalo_session_expired",
        "false,zalo_unavailable", "true,invalid_zalo_request"
    })
    void errorHandoffIsWarnEvenWhenHttpResponseIs200Or302(boolean android, String code) {
        stubResult(android, null, code);
        events.list.clear();
        var response = controller.callback(params(), request());
        assertThat(response.getStatusCode().value()).isEqualTo(android ? 302 : 200);
        assertThat(response.getBody()).contains(code);
        diagnostic(android ? "android" : "web", "error_returned", android ? 302 : 200, code, false, Level.WARN);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void unknownErrorsCannotInjectLogData(boolean android) {
        stubResult(android, null, PRIVATE + "\r\nforged-log-entry");
        events.list.clear();
        controller.callback(params(), request());
        diagnostic(android ? "android" : "web", "error_returned", android ? 302 : 200, "other_error", false, Level.WARN);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void missingCredentialIsNotReportedAsSuccessfulHandoff(boolean android) {
        stubResult(android, null, null);
        events.list.clear();
        controller.callback(params(), request());
        diagnostic(android ? "android" : "web", "error_returned", android ? 302 : 200, "other_error", false, Level.WARN);
    }

    @ParameterizedTest
    @ValueSource(strings = {"missing-state", "invalid-state", "duplicate-state", "unknown-field", "missing-cookie", "duplicate-cookie"})
    void logsEarlyRejectionWithoutGuessingChannelOrCallingServices(String variant) {
        var params = params();
        var request = request();
        switch (variant) {
            case "missing-state" -> params.remove("state");
            case "invalid-state" -> params.set("state", PRIVATE);
            case "duplicate-state" -> params.add("state", PRIVATE);
            case "unknown-field" -> params.add(PRIVATE, PRIVATE);
            case "missing-cookie" -> request.setCookies();
            case "duplicate-cookie" -> request.setCookies(bindingCookie(), bindingCookie());
            default -> throw new AssertionError(variant);
        }
        ErrorCode code = variant.endsWith("cookie") ? ErrorCode.ZALO_SESSION_INVALID : ErrorCode.INVALID_ZALO_REQUEST;
        events.list.clear();
        assertThatThrownBy(() -> controller.callback(params, request)).isInstanceOfSatisfying(BusinessException.class,
                failure -> assertThat(failure.getErrorCode()).isEqualTo(code));
        diagnostic("unknown", "rejected", 400, code.getCode(), false, Level.WARN);
        verifyNoInteractions(service, nativeService);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void rethrowsServiceBusinessFailureUnchanged(boolean android) {
        when(nativeService.isNativeCallback(STATE)).thenReturn(android);
        var failure = new BusinessException(ErrorCode.ZALO_UNAVAILABLE);
        if (android) when(nativeService.callback(any(), any(), any(), any(), any())).thenThrow(failure);
        else when(service.callback(any(), any(), any(), any(), any())).thenThrow(failure);
        events.list.clear();
        assertThatThrownBy(() -> controller.callback(params(), request())).isSameAs(failure);
        diagnostic(android ? "android" : "web", "rejected", 503, "zalo_unavailable", false, Level.WARN);
    }

    @Test
    void dispatchFailureHasUnknownChannelAndNoExceptionDetails() {
        var failure = new IllegalStateException(PRIVATE, new IllegalArgumentException(PRIVATE));
        when(nativeService.isNativeCallback(STATE)).thenThrow(failure);
        events.list.clear();
        assertThatThrownBy(() -> controller.callback(params(), request())).isSameAs(failure);
        diagnostic("unknown", "exception", 0, "other_error", false, Level.WARN);
        verifyNoInteractions(service);
    }

    @Test
    void dispatchBusinessFailureUsesOnlyAnAllowlistedErrorAndPreservesHttpMapping() {
        var failure = new BusinessException(ErrorCode.ZALO_ACCOUNT_NOT_ALLOWED);
        when(nativeService.isNativeCallback(STATE)).thenThrow(failure);
        events.list.clear();
        assertThatThrownBy(() -> controller.callback(params(), request())).isSameAs(failure);
        diagnostic("unknown", "rejected", 403, "other_error", false, Level.WARN);
        verifyNoInteractions(service);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void serviceRuntimeFailureIsRethrownWithoutItsMessageOrCause(boolean android) {
        when(nativeService.isNativeCallback(STATE)).thenReturn(android);
        var failure = new IllegalStateException(PRIVATE, new IllegalArgumentException(PRIVATE));
        if (android) when(nativeService.callback(any(), any(), any(), any(), any())).thenThrow(failure);
        else when(service.callback(any(), any(), any(), any(), any())).thenThrow(failure);
        events.list.clear();
        assertThatThrownBy(() -> controller.callback(params(), request())).isSameAs(failure);
        diagnostic(android ? "android" : "web", "exception", 0, "other_error", false, Level.WARN);
    }

    @Test
    void renderFailureIsNotMisreportedAsReadyAndPreservesException() {
        var page = mock(ZaloCallbackPage.class);
        controller = controller(page);
        stubResult(false, CREDENTIAL, null);
        var failure = new IllegalStateException(PRIVATE);
        when(page.render(any(), any())).thenThrow(failure);
        events.list.clear();
        assertThatThrownBy(() -> controller.callback(params(), request())).isSameAs(failure);
        diagnostic("web", "exception", 0, "other_error", false, Level.WARN);
    }

    private ZaloAuthController controller(ZaloCallbackPage page) {
        return new ZaloAuthController(service, page, nativeService,
                new ZaloNativePage(new ZaloNativeProperties(), new ZaloProperties()));
    }

    private void stubResult(boolean android, String credential, String code) {
        when(nativeService.isNativeCallback(STATE)).thenReturn(android);
        if (android) when(nativeService.callback(any(), any(), any(), any(), any())).thenReturn(
                new ZaloNativeCallbackResult("https://" + PRIVATE + ".example.test/mobile/auth/zalo/complete",
                        PRIVATE, PRIVATE, ZaloPurpose.LOGIN, credential, code));
        else when(service.callback(any(), any(), any(), any(), any())).thenReturn(
                new ZaloCallbackResult("https://" + PRIVATE + ".example.test", PRIVATE,
                        ZaloPurpose.LOGIN, credential, code, ZaloAuthServiceImpl.cookieName(STATE)));
    }

    private MultiValueMap<String, String> params() {
        var params = new LinkedMultiValueMap<String, String>();
        params.add("state", STATE);
        params.add("code", PRIVATE);
        return params;
    }

    private MockHttpServletRequest request() {
        var request = new MockHttpServletRequest();
        request.setCookies(bindingCookie());
        request.addHeader("Authorization", "Bearer " + PRIVATE);
        request.setQueryString(PRIVATE);
        return request;
    }

    private Cookie bindingCookie() { return new Cookie(ZaloAuthServiceImpl.cookieName(STATE), BINDING); }

    private void diagnostic(String channel, String outcome, int status, String code, boolean credential, Level level) {
        assertThat(events.list).hasSize(1);
        var event = events.list.getFirst();
        assertThat(event.getLevel()).isEqualTo(level);
        assertThat(event.getFormattedMessage()).matches("zalo_callback_result channel=" + channel + " outcome=" + outcome
                + " http_status=" + status + " error_code=" + code + " credential_present=" + credential + " elapsed_ms=[0-9]+");
        assertThat(event.getThrowableProxy()).isNull();
        assertThat(event.getFormattedMessage()).doesNotContain(PRIVATE, STATE, BINDING, CREDENTIAL,
                ZaloAuthServiceImpl.cookieName(STATE), "forged-log-entry", "\r", "\n");
        assertThat(event.getArgumentArray()).allSatisfy(argument -> assertThat(String.valueOf(argument))
                .doesNotContain(PRIVATE, STATE, BINDING, CREDENTIAL, "forged-log-entry"));
    }
}
