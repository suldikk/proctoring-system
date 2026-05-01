package com.proctoring.mapper;

import com.proctoring.dto.media.ProctoringRecordingChunkResponse;
import com.proctoring.dto.media.ProctoringSnapshotResponse;
import com.proctoring.repository.entity.ProctoringRecordingChunkEntity;
import com.proctoring.repository.entity.ProctoringSnapshotEntity;
import org.springframework.stereotype.Component;

@Component
public class ProctoringMediaMapper {

    public ProctoringSnapshotResponse toResponse(ProctoringSnapshotEntity snapshot) {
        return new ProctoringSnapshotResponse(
                snapshot.getId(),
                snapshot.getSession().getId(),
                snapshot.getContentType(),
                snapshot.getSizeBytes(),
                snapshot.getSha256(),
                snapshot.getCapturedAt()
        );
    }

    public ProctoringRecordingChunkResponse toResponse(ProctoringRecordingChunkEntity chunk) {
        return new ProctoringRecordingChunkResponse(
                chunk.getId(),
                chunk.getSession().getId(),
                chunk.getChunkIndex(),
                chunk.getContentType(),
                chunk.getSizeBytes(),
                chunk.getSha256(),
                chunk.getUploadedAt()
        );
    }
}
