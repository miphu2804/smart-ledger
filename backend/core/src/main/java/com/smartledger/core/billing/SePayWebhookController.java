package com.smartledger.core.billing;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.parameters.RequestBody;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.Collections;
import java.util.Map;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

/** HMAC-only provider ingress; a successful ACK follows durable commit, not merely valid JSON. */
@RestController
@SecurityRequirements
public class SePayWebhookController {
    private static final Logger LOG = LoggerFactory.getLogger(SePayWebhookController.class);
    private final SePayWebhookService service;
    public SePayWebhookController(SePayWebhookService service) { this.service = service; }

    @PostMapping("/api/v1/webhooks/sepay/{integrationKey}")
    @Operation(summary = "Receive a SePay HMAC-SHA256 bank event",
            description = "Requires X-SePay-Signature and X-SePay-Timestamp over exact raw JSON bytes. No Firebase authentication.",
            parameters = {@Parameter(name = "X-SePay-Signature", in = ParameterIn.HEADER, required = true),
                    @Parameter(name = "X-SePay-Timestamp", in = ParameterIn.HEADER, required = true)},
            requestBody = @RequestBody(required = true, content = @Content(mediaType = "application/json", schema = @Schema(type = "object"))),
            responses = @ApiResponse(responseCode = "201", description = "Receipt durably committed; not subscription activation"))
    public ResponseEntity<Map<String, Object>> receive(@PathVariable String integrationKey, HttpServletRequest request) {
        try {
            if (!BillingController.jsonContent(request)) throw new SePayFailure(400);
            byte[] body = request.getInputStream().readNBytes(65537);
            if (body.length > 65536) throw new SePayFailure(400);
            String timestamp = oneHeader(request, "X-SePay-Timestamp");
            String signature = oneHeader(request, "X-SePay-Signature");
            service.accept(integrationKey, timestamp, signature, body);
            return ResponseEntity.status(201).cacheControl(CacheControl.noStore()).body(Map.of("success", true));
        } catch (SePayFailure exception) { return failure(exception.status()); }
        catch (IOException exception) { return failure(400); }
        catch (RuntimeException exception) {
            LOG.warn("SePay receipt transaction failed; delivery not acknowledged.");
            return failure(503);
        }
    }

    private static String oneHeader(HttpServletRequest request, String name) {
        var values = Collections.list(request.getHeaders(name));
        if (values.size() != 1) throw new SePayFailure(401);
        return values.getFirst();
    }
    private static ResponseEntity<Map<String, Object>> failure(int status) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore())
                .body(Map.of("success", false, "code", "sepay_delivery_rejected"));
    }
}
