package com.proctoring.controller;

import com.proctoring.dto.event.CreateProctoringEventRequest;
import com.proctoring.dto.event.ProctoringEventResponse;
import com.proctoring.service.ProctoringEventService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/sessions/{sessionId}/events")
public class ProctoringEventController {

    private final ProctoringEventService eventService;

    public ProctoringEventController(ProctoringEventService eventService) {
        this.eventService = eventService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('ADMIN', 'PROCTOR', 'STUDENT')")
    public ProctoringEventResponse create(
            @PathVariable UUID sessionId,
            @Valid @RequestBody CreateProctoringEventRequest request,
            Authentication authentication
    ) {
        return eventService.create(sessionId, request, authentication);
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'PROCTOR', 'STUDENT')")
    public List<ProctoringEventResponse> findBySession(@PathVariable UUID sessionId, Authentication authentication) {
        return eventService.findBySession(sessionId, authentication);
    }
}
