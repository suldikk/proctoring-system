package com.proctoring.dto.event;

import com.proctoring.domain.EventType;
import java.time.Instant;
import java.util.UUID;

public record ProctoringEventResponse(
        UUID id,
        UUID sessionId,
        EventType type,
        int severity,
        String details,
        Instant occurredAt
) {
}
