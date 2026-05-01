package com.proctoring.service;

import com.proctoring.domain.Role;
import com.proctoring.domain.SessionStatus;
import com.proctoring.dto.session.CreateExamSessionRequest;
import com.proctoring.dto.session.ExamSessionResponse;
import com.proctoring.mapper.ExamSessionMapper;
import com.proctoring.repository.ExamSessionRepository;
import com.proctoring.repository.UserRepository;
import com.proctoring.repository.entity.ExamSessionEntity;
import com.proctoring.repository.entity.UserEntity;
import java.util.List;
import java.util.UUID;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ExamSessionService {

    private final ExamSessionRepository examSessionRepository;
    private final UserRepository userRepository;
    private final ExamSessionMapper examSessionMapper;
    private final AuditService auditService;

    public ExamSessionService(
            ExamSessionRepository examSessionRepository,
            UserRepository userRepository,
            ExamSessionMapper examSessionMapper,
            AuditService auditService
    ) {
        this.examSessionRepository = examSessionRepository;
        this.userRepository = userRepository;
        this.examSessionMapper = examSessionMapper;
        this.auditService = auditService;
    }

    @Transactional
    public ExamSessionResponse create(CreateExamSessionRequest request, Authentication authentication) {
        if (!request.endsAt().isAfter(request.startsAt())) {
            throw new IllegalArgumentException("Session end time must be after start time");
        }

        UserEntity student = userRepository.findById(request.studentId())
                .orElseThrow(() -> new IllegalArgumentException("Student not found"));
        UserEntity proctor = request.proctorId() == null ? null : userRepository.findById(request.proctorId())
                .orElseThrow(() -> new IllegalArgumentException("Proctor not found"));
        if (!student.getRoles().contains(Role.STUDENT)) {
            throw new IllegalArgumentException("Selected studentId does not belong to a student");
        }
        if (proctor != null && !proctor.getRoles().contains(Role.PROCTOR)) {
            throw new IllegalArgumentException("Selected proctorId does not belong to a proctor");
        }

        ExamSessionEntity session = new ExamSessionEntity();
        session.setExamTitle(request.examTitle());
        session.setStudent(student);
        session.setProctor(proctor);
        session.setStartsAt(request.startsAt());
        session.setEndsAt(request.endsAt());

        ExamSessionEntity saved = examSessionRepository.save(session);
        auditService.record(authentication.getName(), "SESSION_CREATED", "EXAM_SESSION", saved.getId().toString());
        return examSessionMapper.toResponse(saved);
    }

    @Transactional(readOnly = true)
    public List<ExamSessionResponse> findVisible(Authentication authentication) {
        if (hasRole(authentication, "ROLE_ADMIN")) {
            return examSessionRepository.findAll().stream()
                    .map(examSessionMapper::toResponse)
                    .toList();
        }

        UserEntity currentUser = userRepository.findByEmail(authentication.getName())
                .orElseThrow(() -> new AccessDeniedException("Authenticated user was not found"));

        List<ExamSessionEntity> sessions;
        if (hasRole(authentication, "ROLE_PROCTOR")) {
            sessions = examSessionRepository.findByProctorId(currentUser.getId());
        } else if (hasRole(authentication, "ROLE_STUDENT")) {
            sessions = examSessionRepository.findByStudentId(currentUser.getId());
        } else {
            throw new AccessDeniedException("Unsupported role");
        }

        return sessions.stream()
                .map(examSessionMapper::toResponse)
                .toList();
    }

    @Transactional
    public ExamSessionResponse updateStatus(UUID id, SessionStatus status, Authentication authentication) {
        ExamSessionEntity session = examSessionRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Session not found"));
        if (hasRole(authentication, "ROLE_STUDENT")) {
            throw new AccessDeniedException("Students cannot update session status");
        }
        session.setStatus(status);
        auditService.record(authentication.getName(), "SESSION_STATUS_UPDATED", "EXAM_SESSION", id.toString());
        return examSessionMapper.toResponse(session);
    }

    private boolean hasRole(Authentication authentication, String role) {
        return authentication.getAuthorities().stream()
                .anyMatch(authority -> role.equals(authority.getAuthority()));
    }
}
