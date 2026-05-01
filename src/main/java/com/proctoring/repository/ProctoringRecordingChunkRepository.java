package com.proctoring.repository;

import com.proctoring.repository.entity.ProctoringRecordingChunkEntity;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProctoringRecordingChunkRepository extends JpaRepository<ProctoringRecordingChunkEntity, UUID> {

    List<ProctoringRecordingChunkEntity> findBySessionIdOrderByChunkIndexAsc(UUID sessionId);
}
