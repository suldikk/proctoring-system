package com.proctoring.service;

public record StoredProctoringFile(
        String filePath,
        String contentType,
        long sizeBytes,
        String sha256
) {
}
