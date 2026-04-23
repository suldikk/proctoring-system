package com.proctoring.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import com.proctoring.domain.EventType;
import com.proctoring.dto.event.CreateProctoringEventRequest;
import com.proctoring.mapper.ProctoringEventMapper;
import com.proctoring.repository.ExamSessionRepository;
import com.proctoring.repository.ProctoringEventRepository;
import com.proctoring.repository.entity.ExamSessionEntity;
import com.proctoring.repository.entity.UserEntity;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

@ExtendWith(MockitoExtension.class)
class ProctoringEventServiceTest {

    @Mock
    private ProctoringEventRepository eventRepository;

    @Mock
    private ExamSessionRepository sessionRepository;

    @Mock
    private AuditService auditService;

    @Test
    void studentCannotCreateEventForAnotherStudentSession() {
        ProctoringEventService proctoringEventService = new ProctoringEventService(
                eventRepository,
                sessionRepository,
                new ProctoringEventMapper(),
                auditService
        );
        UUID sessionId = UUID.randomUUID();
        UserEntity sessionOwner = new UserEntity();
        sessionOwner.setEmail("owner@example.com");
        ExamSessionEntity session = new ExamSessionEntity();
        session.setStudent(sessionOwner);
        CreateProctoringEventRequest request = new CreateProctoringEventRequest(
                EventType.TAB_SWITCH,
                3,
                "Switched tab"
        );

        when(sessionRepository.findById(sessionId)).thenReturn(Optional.of(session));

        assertThatThrownBy(() -> proctoringEventService.create(
                sessionId,
                request,
                new UsernamePasswordAuthenticationToken(
                        "other-student@example.com",
                        null,
                        java.util.List.of(new SimpleGrantedAuthority("ROLE_STUDENT"))
                )
        ))
                .isInstanceOf(AccessDeniedException.class)
                .hasMessage("Students can only create events for their own sessions");
    }
}
