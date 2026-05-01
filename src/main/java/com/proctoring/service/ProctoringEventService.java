package com.proctoring.service;

import com.proctoring.dto.event.CreateProctoringEventRequest;
import com.proctoring.dto.event.ProctoringEventResponse;
import com.proctoring.mapper.ProctoringEventMapper;
import com.proctoring.repository.ExamSessionRepository;
import com.proctoring.repository.ProctoringEventRepository;
import com.proctoring.repository.entity.ExamSessionEntity;
import com.proctoring.repository.entity.ProctoringEventEntity;
import java.util.List;
import java.util.UUID;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ProctoringEventService {

    private final ProctoringEventRepository eventRepository;
    private final ExamSessionRepository sessionRepository;
    private final ProctoringEventMapper eventMapper;
    private final AuditService auditService;

    public ProctoringEventService(
            ProctoringEventRepository eventRepository,
            ExamSessionRepository sessionRepository,
            ProctoringEventMapper eventMapper,
            AuditService auditService
    ) {
        this.eventRepository = eventRepository;
        this.sessionRepository = sessionRepository;
        this.eventMapper = eventMapper;
        this.auditService = auditService;
    }

    @Transactional
    public ProctoringEventResponse create(UUID sessionId, CreateProctoringEventRequest request, Authentication authentication) {
        ExamSessionEntity session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("Session not found"));
        ensureSessionVisible(session, authentication);

        ProctoringEventEntity event = new ProctoringEventEntity();
        event.setSession(session);
        event.setType(request.type());
        event.setSeverity(request.severity());
        event.setDetails(request.details());

        ProctoringEventEntity saved = eventRepository.save(event);
        auditService.record(authentication.getName(), "PROCTORING_EVENT_CREATED", "PROCTORING_EVENT", saved.getId().toString());
        return eventMapper.toResponse(saved);
    }

    @Transactional(readOnly = true)
    public List<ProctoringEventResponse> findBySession(UUID sessionId, Authentication authentication) {
        ExamSessionEntity session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("Session not found"));
        ensureSessionVisible(session, authentication);

        return eventRepository.findBySessionIdOrderByOccurredAtDesc(sessionId).stream()
                .map(eventMapper::toResponse)
                .toList();
    }

    private void ensureSessionVisible(ExamSessionEntity session, Authentication authentication) {
        if (hasRole(authentication, "ROLE_ADMIN")) {
            return;
        }
        if (hasRole(authentication, "ROLE_STUDENT")
                && authentication.getName().equalsIgnoreCase(session.getStudent().getEmail())) {
            return;
        }
        if (hasRole(authentication, "ROLE_PROCTOR")
                && session.getProctor() != null
                && authentication.getName().equalsIgnoreCase(session.getProctor().getEmail())) {
            return;
        }
        throw new AccessDeniedException("Session is not visible to the current user");
    }

    private boolean hasRole(Authentication authentication, String role) {
        return authentication.getAuthorities().stream()
                .anyMatch(authority -> role.equals(authority.getAuthority()));
    }
}
