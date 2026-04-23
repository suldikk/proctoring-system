package com.proctoring.service;

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
    public List<ExamSessionResponse> findAll() {
        return examSessionRepository.findAll().stream()
                .map(examSessionMapper::toResponse)
                .toList();
    }

    @Transactional
    public ExamSessionResponse updateStatus(UUID id, SessionStatus status, Authentication authentication) {
        ExamSessionEntity session = examSessionRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Session not found"));
        session.setStatus(status);
        auditService.record(authentication.getName(), "SESSION_STATUS_UPDATED", "EXAM_SESSION", id.toString());
        return examSessionMapper.toResponse(session);
    }
}
