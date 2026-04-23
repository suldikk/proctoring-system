package com.proctoring.repository;

import com.proctoring.repository.entity.ExamSessionEntity;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ExamSessionRepository extends JpaRepository<ExamSessionEntity, UUID> {

    List<ExamSessionEntity> findByStudentId(UUID studentId);
}
