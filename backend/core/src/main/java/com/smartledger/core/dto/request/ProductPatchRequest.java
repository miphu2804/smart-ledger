package com.smartledger.core.dto.request;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonSetter;
import com.fasterxml.jackson.annotation.Nulls;
import com.fasterxml.jackson.core.JsonLocation;
import com.fasterxml.jackson.databind.exc.UnrecognizedPropertyException;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.util.HashSet;
import java.util.Set;
import lombok.Getter;

/** Distinguishes an omitted field from an explicit null in a partial update. */
@Getter
public class ProductPatchRequest {

    @JsonIgnore
    private final Set<String> providedFields = new HashSet<>();

    @Positive
    private Long categoryId;

    @Pattern(regexp = "(?s).*\\S.*", message = "must not be blank")
    @Size(max = 255)
    private String name;

    @Size(max = 100)
    private String barcode;

    @Size(max = 1000)
    private String imageUrl;

    @Pattern(regexp = "(?s).*\\S.*", message = "must not be blank")
    @Size(max = 50)
    private String unit;

    @PositiveOrZero
    private Long sellingPriceVnd;

    @PositiveOrZero
    private Long costPriceVnd;

    private Boolean tracked;

    public boolean hasField(String field) {
        return providedFields.contains(field);
    }

    @JsonSetter("categoryId")
    public void setCategoryId(Long value) {
        providedFields.add("categoryId");
        categoryId = value;
    }

    @JsonSetter(value = "name", nulls = Nulls.FAIL)
    public void setName(String value) {
        providedFields.add("name");
        name = value;
    }

    @JsonSetter("barcode")
    public void setBarcode(String value) {
        providedFields.add("barcode");
        barcode = value;
    }

    @JsonSetter("imageUrl")
    public void setImageUrl(String value) {
        providedFields.add("imageUrl");
        imageUrl = value;
    }

    @JsonSetter(value = "unit", nulls = Nulls.FAIL)
    public void setUnit(String value) {
        providedFields.add("unit");
        unit = value;
    }

    @JsonSetter(value = "sellingPriceVnd", nulls = Nulls.FAIL)
    public void setSellingPriceVnd(Long value) {
        providedFields.add("sellingPriceVnd");
        sellingPriceVnd = value;
    }

    @JsonSetter("costPriceVnd")
    public void setCostPriceVnd(Long value) {
        providedFields.add("costPriceVnd");
        costPriceVnd = value;
    }

    @JsonSetter(value = "tracked", nulls = Nulls.FAIL)
    public void setTracked(Boolean value) {
        providedFields.add("tracked");
        tracked = value;
    }

    @JsonAnySetter
    public void rejectRemovedStockField(String field, Object value) throws UnrecognizedPropertyException {
        // Preserve existing handling of other unknown fields, but never silently accept an old stock write.
        if ("stockQuantity".equals(field)) {
            throw new UnrecognizedPropertyException(null, "stockQuantity cannot be patched", JsonLocation.NA,
                    ProductPatchRequest.class, field, null);
        }
    }
}
