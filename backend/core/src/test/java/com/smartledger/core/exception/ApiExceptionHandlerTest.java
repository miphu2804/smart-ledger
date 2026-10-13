package com.smartledger.core.exception;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.SQLException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

class ApiExceptionHandlerTest {
    private final ApiExceptionHandler handler = new ApiExceptionHandler();

    @ParameterizedTest
    @ValueSource(strings = {"uq_products_shop_barcode", "uq_products_shop_barcode_active"})
    void mapsAConcurrentBarcodeUniqueViolationToTheCatalogError(String constraint) {
        SQLException sqlCause = new SQLException(
                "duplicate key value violates unique constraint \"" + constraint + "\"", "23505");
        var response = handler.handleDataIntegrity(new DataIntegrityViolationException("write failed", sqlCause),
                new MockHttpServletRequest());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody().code()).isEqualTo("product_barcode_conflict");
        assertThat(response.getBody().details()).isEmpty();
    }

    @Test
    void doesNotMislabelAnUnrelatedDatabaseFailureAsABarcodeConflict() {
        var response = handler.handleDataIntegrity(new DataIntegrityViolationException("other failure"),
                new MockHttpServletRequest());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(response.getBody().code()).isEqualTo("internal_error");
    }

    @Test
    void mapsAConcurrentFirstSessionToARetryableAuthConflict() {
        SQLException sqlCause = new SQLException(
                "duplicate key value violates unique constraint \"uq_auth_identities_provider_subject\"", "23505");
        var response = handler.handleDataIntegrity(new DataIntegrityViolationException("write failed", sqlCause),
                new MockHttpServletRequest());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody().code()).isEqualTo("auth_session_conflict");
    }

    @ParameterizedTest
    @ValueSource(strings = {"UQ_PRODUCTS_SHOP_BARCODE", "UQ_PRODUCTS_SHOP_BARCODE_ACTIVE"})
    void mapsAHibernateConstraintNameWithoutRelyingOnTheMessage(String constraint) {
        var violation = new org.hibernate.exception.ConstraintViolationException(
                "insert failed", new SQLException("duplicate", "23505"), constraint);
        var response = handler.handleDataIntegrity(new DataIntegrityViolationException("write failed", violation),
                new MockHttpServletRequest());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody().code()).isEqualTo("product_barcode_conflict");
        assertThat(response.getBody().details()).isEmpty();
    }

    @Test
    void doesNotTreatAnotherUniqueConstraintAsABusinessConflict() {
        SQLException sqlCause = new SQLException(
                "duplicate key value violates unique constraint \"uq_sale_refunds_sale_id\"", "23505");
        var response = handler.handleDataIntegrity(new DataIntegrityViolationException("write failed", sqlCause),
                new MockHttpServletRequest());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
    }

    @Test
    void mapsMultipartLimitsToThePublicImageTooLargeError() {
        var response = handler.handleMaxUploadSizeExceeded(
                new MaxUploadSizeExceededException(5L * 1024 * 1024), new MockHttpServletRequest());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE);
        assertThat(response.getBody().code()).isEqualTo("image_too_large");
    }
}
