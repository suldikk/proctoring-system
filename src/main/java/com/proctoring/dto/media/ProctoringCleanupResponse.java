package com.proctoring.dto.media;

import java.util.UUID;

public record ProctoringCleanupResponse(
        UUID sessionId,
        long deletedEvents,
        long deletedSnapshots,
        long deletedRecordingChunks
) {
}
