package com.proctoring.dto.media;

import java.time.Instant;
import java.util.UUID;

public record ProctoringRecordingChunkResponse(
        UUID id,
        UUID sessionId,
        int chunkIndex,
        String contentType,
        long sizeBytes,
        String sha256,
        Instant uploadedAt
) {
}
