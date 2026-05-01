package com.proctoring.dto.media;

import java.time.Instant;
import java.util.UUID;

public record ProctoringSnapshotResponse(
        UUID id,
        UUID sessionId,
        String contentType,
        long sizeBytes,
        String sha256,
        Instant capturedAt
) {
}
