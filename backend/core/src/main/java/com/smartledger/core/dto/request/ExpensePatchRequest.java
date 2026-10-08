package com.smartledger.core.dto.request;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonSetter;
import com.fasterxml.jackson.annotation.Nulls;
import com.smartledger.core.enums.PaymentMethod;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.Set;
import lombok.Getter;

@Getter
public class ExpensePatchRequest {
    @JsonIgnore
    private final Set<String> providedFields = new HashSet<>();

    @Size(max = 150)
    private String category;

    @Pattern(regexp = "(?s).*\\S.*", message = "must not be blank")
    @Size(max = 500)
    private String description;

    @Positive
    private Long amountVnd;

    private PaymentMethod paymentMethod;

    private OffsetDateTime expenseAt;

    public boolean hasField(String field) {
        return providedFields.contains(field);
    }

    @JsonSetter("category")
    public void setCategory(String value) {
        providedFields.add("category");
        category = value;
    }

    @JsonSetter(value = "description", nulls = Nulls.FAIL)
    public void setDescription(String value) {
        providedFields.add("description");
        description = value;
    }

    @JsonSetter(value = "amountVnd", nulls = Nulls.FAIL)
    public void setAmountVnd(Long value) {
        providedFields.add("amountVnd");
        amountVnd = value;
    }

    @JsonSetter("paymentMethod")
    public void setPaymentMethod(PaymentMethod value) {
        providedFields.add("paymentMethod");
        paymentMethod = value;
    }

    @JsonSetter(value = "expenseAt", nulls = Nulls.FAIL)
    public void setExpenseAt(OffsetDateTime value) {
        providedFields.add("expenseAt");
        expenseAt = value;
    }
}
