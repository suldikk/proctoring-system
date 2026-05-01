package com.proctoring.repository;

import com.proctoring.repository.entity.ProctoringEventEntity;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProctoringEventRepository extends JpaRepository<ProctoringEventEntity, UUID> {

    List<ProctoringEventEntity> findBySessionIdOrderByOccurredAtDesc(UUID sessionId);

    long deleteBySessionId(UUID sessionId);
}
