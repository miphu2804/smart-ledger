package com.smartledger.core.zalo;

import com.smartledger.core.config.ZaloNativeProperties;
import com.smartledger.core.config.ZaloProperties;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.util.HtmlUtils;

/** No provider code, token, profile or client verifier is rendered or forwarded. */
@Component
public class ZaloNativePage {
    private final ZaloNativeProperties properties;
    private final ZaloProperties zalo;

    public ZaloNativePage(ZaloNativeProperties properties, ZaloProperties zalo) { this.properties = properties; this.zalo = zalo; }

    public ResponseEntity<String> callback(ZaloNativeCallbackResult result, String clearCookie) {
        // All values originate from validated/persisted server context, never callback returnUrl parameters.
        String target = result.returnUrl() + "#nativeClientId=" + result.nativeClientId() + "&requestId=" + result.requestId()
                + "&purpose=" + result.purpose().name()
                + (result.handoffReference() == null ? "&error=" + result.errorCode() : "&handoffReference=" + result.handoffReference());
        return headers(302, "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
                .header(HttpHeaders.LOCATION, target).header(HttpHeaders.SET_COOKIE, clearCookie)
                .body("<!doctype html><html lang=\"vi\"><meta charset=\"utf-8\"><title>Zalo</title><a href=\""
                        + HtmlUtils.htmlEscape(target) + "\">Quay lại ứng dụng</a></html>");
    }

    public ResponseEntity<String> landing() {
        properties.requireAssociation(zalo.getCallbackUrl());
        String nonce = ZaloCrypto.randomToken();
        // Target has a validated fixed path without quotes, query, fragment or user info.
        String target = properties.getReturnUrl();
        String html = """
                <!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
                <title>Quay lại Sổ Nghe Lời</title></head><body>
                <p>Nếu ứng dụng chưa mở, bấm nút dưới đây. Nếu đã hết hạn, hãy bắt đầu lại trong ứng dụng.</p>
                <a id="return" hidden>Quay lại ứng dụng</a>
                <script nonce="%s">
                (() => {
                  const fragment = window.location.hash;
                  history.replaceState(null, '', window.location.pathname);
                  const params = new URLSearchParams(fragment.slice(1));
                  const allowed = ['nativeClientId', 'requestId', 'purpose', 'handoffReference', 'error'];
                  if ([...params.keys()].some(k => !allowed.includes(k) || params.getAll(k).length !== 1)) return;
                  if (params.get('nativeClientId') !== '%s' || !/^[A-Za-z0-9_-]{16,100}$/.test(params.get('requestId') || '')
                    || !['LOGIN', 'LINK'].includes(params.get('purpose'))) return;
                  const reference = params.get('handoffReference');
                  const error = params.get('error');
                  if (reference !== null ? (!/^[A-Za-z0-9_-]{43}$/.test(reference) || error !== null)
                    : !['zalo_consent_denied','zalo_session_invalid','zalo_session_expired','zalo_provider_unavailable',
                        'zalo_unavailable'].includes(error)) return;
                  const link = document.getElementById('return');
                  link.href = '%s' + fragment;
                  link.hidden = false;
                })();
                </script></body></html>
                """.formatted(nonce, properties.getClientId(), target);
        return headers(200, "default-src 'none'; script-src 'nonce-" + nonce
                + "'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'").body(html);
    }

    public List<Map<String, Object>> assetLinks() {
        properties.requireAssociation(zalo.getCallbackUrl());
        return List.of(Map.of("relation", List.of("delegate_permission/common.handle_all_urls"), "target", Map.of(
                "namespace", "android_app", "package_name", properties.getPackageName(),
                "sha256_cert_fingerprints", properties.getCertificateSha256())));
    }

    private static ResponseEntity.BodyBuilder headers(int status, String policy) {
        return ResponseEntity.status(status).contentType(MediaType.TEXT_HTML)
                .header(HttpHeaders.CACHE_CONTROL, "no-store").header("Referrer-Policy", "no-referrer")
                .header("X-Content-Type-Options", "nosniff").header("X-Frame-Options", "DENY")
                .header("Content-Security-Policy", policy);
    }
}
