package com.smartledger.core.zalo;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;

/** No remote resources, form submission or URL credential fallback. */
@Component
public class ZaloCallbackPage {
    private final ObjectMapper mapper;
    public ZaloCallbackPage(ObjectMapper mapper) { this.mapper = mapper; }

    public ResponseEntity<String> render(ZaloCallbackResult result, String clearCookie) {
        String nonce = ZaloCrypto.randomToken();
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("type", "smartledger:zalo");
        payload.put("requestId", result.requestId());
        payload.put("purpose", result.purpose().name());
        payload.put("proof", result.proof());
        payload.put("error", result.errorCode());
        String html = """
                <!doctype html><html lang="vi"><head><meta charset="utf-8">
                <meta name="viewport" content="width=device-width"><title>Đăng nhập Zalo</title></head>
                <body><p id="result">Đã xử lý yêu cầu Zalo. Quay lại ứng dụng để hoàn tất.</p>
                <script nonce="%s">
                (() => {
                  const message = %s;
                  const targetOrigin = %s;
                  if (window.opener && !window.opener.closed) {
                    window.opener.postMessage(message, targetOrigin);
                    window.close();
                  } else {
                    document.getElementById('result').textContent =
                      'Không tìm thấy cửa sổ ứng dụng. Hãy đóng trang và bắt đầu lại từ ứng dụng.';
                  }
                })();
                </script></body></html>
                """.formatted(nonce, json(payload), json(result.clientOrigin()));
        return ResponseEntity.ok().contentType(MediaType.TEXT_HTML)
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .header("Referrer-Policy", "no-referrer")
                .header("X-Frame-Options", "DENY")
                .header("X-Content-Type-Options", "nosniff")
                .header("Content-Security-Policy", "default-src 'none'; script-src 'nonce-" + nonce
                        + "'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
                .header(HttpHeaders.SET_COOKIE, clearCookie).body(html);
    }

    private String json(Object value) {
        try {
            // JSON is embedded in a script element; JSON string escaping alone does not escape </script>.
            return mapper.writeValueAsString(value).replace("<", "\\u003c").replace(">", "\\u003e")
                    .replace("&", "\\u0026").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029");
        } catch (JsonProcessingException failure) {
            throw new IllegalStateException("Cannot serialize Zalo popup message.");
        }
    }
}
