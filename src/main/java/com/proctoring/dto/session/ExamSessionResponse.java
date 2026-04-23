package com.proctoring.dto.session;

import com.proctoring.domain.SessionStatus;
import java.time.Instant;
import java.util.UUID;

public record ExamSessionResponse(
        UUID id,
        String examTitle,
        UUID studentId,
        UUID proctorId,
        SessionStatus status,
        Instant startsAt,
        Instant endsAt
) {
}
