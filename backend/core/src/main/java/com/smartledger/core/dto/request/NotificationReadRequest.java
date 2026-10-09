package com.smartledger.core.dto.request;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.util.List;

/** Explicit IDs avoid marking newly arriving notifications as read by accident. */
public record NotificationReadRequest(@NotEmpty @Size(max = 100) List<@NotNull @Positive Long> ids) { }
