package com.proctoring.repository;

import com.proctoring.repository.entity.ProctoringSnapshotEntity;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProctoringSnapshotRepository extends JpaRepository<ProctoringSnapshotEntity, UUID> {

    List<ProctoringSnapshotEntity> findBySessionIdOrderByCapturedAtDesc(UUID sessionId);

    long deleteBySessionId(UUID sessionId);
}
