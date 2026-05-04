package com.proctoring.service;

import org.springframework.core.io.Resource;

public record ProctoringFileContent(
        Resource resource,
        String contentType
) {
}
