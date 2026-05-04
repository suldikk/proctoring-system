package com.proctoring.controller;

import com.proctoring.domain.SessionStatus;
import com.proctoring.dto.session.CreateExamSessionRequest;
import com.proctoring.dto.session.ExamSessionResponse;
import com.proctoring.service.ExamSessionService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/sessions")
public class ExamSessionController {

    private final ExamSessionService examSessionService;

    public ExamSessionController(ExamSessionService examSessionService) {
        this.examSessionService = examSessionService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('ADMIN', 'PROCTOR')")
    public ExamSessionResponse create(@Valid @RequestBody CreateExamSessionRequest request, Authentication authentication) {
        return examSessionService.create(request, authentication);
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'PROCTOR', 'STUDENT')")
    public List<ExamSessionResponse> findVisible(Authentication authentication) {
        return examSessionService.findVisible(authentication);
    }

    @PatchMapping("/{id}/status/{status}")
    @PreAuthorize("hasAnyRole('ADMIN', 'PROCTOR')")
    public ExamSessionResponse updateStatus(
            @PathVariable UUID id,
            @PathVariable SessionStatus status,
            Authentication authentication
    ) {
        return examSessionService.updateStatus(id, status, authentication);
    }
}
