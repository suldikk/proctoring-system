package com.proctoring.dto.event;

import com.proctoring.domain.EventType;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateProctoringEventRequest(
        @NotNull EventType type,
        @Min(1) @Max(5) int severity,
        @NotBlank @Size(max = 1000) String details
) {
}
