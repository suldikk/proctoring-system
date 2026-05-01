package com.proctoring.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.proctoring.domain.Role;
import com.proctoring.dto.session.CreateExamSessionRequest;
import com.proctoring.mapper.ExamSessionMapper;
import com.proctoring.repository.ExamSessionRepository;
import com.proctoring.repository.UserRepository;
import com.proctoring.repository.entity.UserEntity;
import java.time.Instant;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

@ExtendWith(MockitoExtension.class)
class ExamSessionServiceTest {

    @Mock
    private ExamSessionRepository examSessionRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private AuditService auditService;

    @Test
    void createRejectsNonStudentAsStudent() {
        ExamSessionService examSessionService = new ExamSessionService(
                examSessionRepository,
                userRepository,
                new ExamSessionMapper(),
                auditService
        );
        UUID studentId = UUID.randomUUID();
        UserEntity nonStudent = new UserEntity();
        nonStudent.setId(studentId);
        nonStudent.setEmail("proctor@example.com");
        nonStudent.setRoles(Set.of(Role.PROCTOR));
        CreateExamSessionRequest request = new CreateExamSessionRequest(
                "Java Exam",
                studentId,
                null,
                Instant.now().plusSeconds(3600),
                Instant.now().plusSeconds(7200)
        );

        when(userRepository.findById(studentId)).thenReturn(java.util.Optional.of(nonStudent));

        assertThatThrownBy(() -> examSessionService.create(
                request,
                new UsernamePasswordAuthenticationToken("admin@example.com", null, java.util.List.of())
        ))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Selected studentId does not belong to a student");
    }

    @Test
    void createRejectsNonProctorAsProctor() {
        ExamSessionService examSessionService = new ExamSessionService(
                examSessionRepository,
                userRepository,
                new ExamSessionMapper(),
                auditService
        );
        UUID studentId = UUID.randomUUID();
        UUID proctorId = UUID.randomUUID();
        UserEntity student = new UserEntity();
        student.setId(studentId);
        student.setEmail("student@example.com");
        student.setRoles(Set.of(Role.STUDENT));
        UserEntity nonProctor = new UserEntity();
        nonProctor.setId(proctorId);
        nonProctor.setEmail("admin@example.com");
        nonProctor.setRoles(Set.of(Role.ADMIN));
        CreateExamSessionRequest request = new CreateExamSessionRequest(
                "Java Exam",
                studentId,
                proctorId,
                Instant.now().plusSeconds(3600),
                Instant.now().plusSeconds(7200)
        );

        when(userRepository.findById(studentId)).thenReturn(java.util.Optional.of(student));
        when(userRepository.findById(proctorId)).thenReturn(java.util.Optional.of(nonProctor));

        assertThatThrownBy(() -> examSessionService.create(
                request,
                new UsernamePasswordAuthenticationToken("admin@example.com", null, java.util.List.of())
        ))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Selected proctorId does not belong to a proctor");
    }

    @Test
    void findVisibleReturnsOnlyStudentSessionsForStudent() {
        ExamSessionService examSessionService = new ExamSessionService(
                examSessionRepository,
                userRepository,
                new ExamSessionMapper(),
                auditService
        );
        UUID studentId = UUID.randomUUID();
        UserEntity student = new UserEntity();
        student.setId(studentId);
        student.setEmail("student@example.com");
        student.setRoles(Set.of(Role.STUDENT));

        when(userRepository.findByEmail("student@example.com")).thenReturn(Optional.of(student));
        when(examSessionRepository.findByStudentId(studentId)).thenReturn(java.util.List.of());

        examSessionService.findVisible(new UsernamePasswordAuthenticationToken(
                "student@example.com",
                null,
                java.util.List.of(new SimpleGrantedAuthority("ROLE_STUDENT"))
        ));

        verify(examSessionRepository).findByStudentId(studentId);
    }

    @Test
    void findVisibleReturnsOnlyAssignedSessionsForProctor() {
        ExamSessionService examSessionService = new ExamSessionService(
                examSessionRepository,
                userRepository,
                new ExamSessionMapper(),
                auditService
        );
        UUID proctorId = UUID.randomUUID();
        UserEntity proctor = new UserEntity();
        proctor.setId(proctorId);
        proctor.setEmail("proctor@example.com");
        proctor.setRoles(Set.of(Role.PROCTOR));

        when(userRepository.findByEmail("proctor@example.com")).thenReturn(Optional.of(proctor));
        when(examSessionRepository.findByProctorId(proctorId)).thenReturn(java.util.List.of());

        examSessionService.findVisible(new UsernamePasswordAuthenticationToken(
                "proctor@example.com",
                null,
                java.util.List.of(new SimpleGrantedAuthority("ROLE_PROCTOR"))
        ));

        verify(examSessionRepository).findByProctorId(proctorId);
    }
}
