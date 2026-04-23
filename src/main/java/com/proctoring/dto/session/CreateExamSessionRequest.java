package com.proctoring.dto.session;

import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;

public record CreateExamSessionRequest(
        @NotBlank @Size(max = 160) String examTitle,
        @NotNull UUID studentId,
        UUID proctorId,
        @Future @NotNull Instant startsAt,
        @Future @NotNull Instant endsAt
) {
}
