package com.proctoring.service;

import com.proctoring.dto.media.ProctoringRecordingChunkResponse;
import com.proctoring.dto.media.ProctoringCleanupResponse;
import com.proctoring.dto.media.ProctoringSnapshotResponse;
import com.proctoring.mapper.ProctoringMediaMapper;
import com.proctoring.repository.ExamSessionRepository;
import com.proctoring.repository.ProctoringEventRepository;
import com.proctoring.repository.ProctoringRecordingChunkRepository;
import com.proctoring.repository.ProctoringSnapshotRepository;
import com.proctoring.repository.entity.ExamSessionEntity;
import com.proctoring.repository.entity.ProctoringRecordingChunkEntity;
import com.proctoring.repository.entity.ProctoringSnapshotEntity;
import java.util.List;
import java.util.UUID;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
public class ProctoringMediaService {

    private final ExamSessionRepository sessionRepository;
    private final ProctoringEventRepository eventRepository;
    private final ProctoringSnapshotRepository snapshotRepository;
    private final ProctoringRecordingChunkRepository recordingChunkRepository;
    private final ProctoringMediaMapper mediaMapper;
    private final ProctoringFileStorageService fileStorageService;
    private final AuditService auditService;

    public ProctoringMediaService(
            ExamSessionRepository sessionRepository,
            ProctoringEventRepository eventRepository,
            ProctoringSnapshotRepository snapshotRepository,
            ProctoringRecordingChunkRepository recordingChunkRepository,
            ProctoringMediaMapper mediaMapper,
            ProctoringFileStorageService fileStorageService,
            AuditService auditService
    ) {
        this.sessionRepository = sessionRepository;
        this.eventRepository = eventRepository;
        this.snapshotRepository = snapshotRepository;
        this.recordingChunkRepository = recordingChunkRepository;
        this.mediaMapper = mediaMapper;
        this.fileStorageService = fileStorageService;
        this.auditService = auditService;
    }

    @Transactional
    public ProctoringSnapshotResponse createSnapshot(UUID sessionId, MultipartFile file, Authentication authentication) {
        ExamSessionEntity session = visibleSession(sessionId, authentication);
        String contentType = requireContentType(file, "image/");
        String extension = MediaType.IMAGE_PNG_VALUE.equals(contentType) ? ".png" : ".jpg";
        StoredProctoringFile storedFile = fileStorageService.store(
                sessionId,
                "snapshots",
                UUID.randomUUID() + extension,
                file
        );

        ProctoringSnapshotEntity snapshot = new ProctoringSnapshotEntity();
        snapshot.setSession(session);
        snapshot.setFilePath(storedFile.filePath());
        snapshot.setContentType(storedFile.contentType());
        snapshot.setSizeBytes(storedFile.sizeBytes());
        snapshot.setSha256(storedFile.sha256());

        ProctoringSnapshotEntity saved = snapshotRepository.save(snapshot);
        auditService.record(authentication.getName(), "PROCTORING_SNAPSHOT_CREATED", "PROCTORING_SNAPSHOT", saved.getId().toString());
        return mediaMapper.toResponse(saved);
    }

    @Transactional(readOnly = true)
    public List<ProctoringSnapshotResponse> findSnapshots(UUID sessionId, Authentication authentication) {
        visibleSession(sessionId, authentication);
        return snapshotRepository.findBySessionIdOrderByCapturedAtDesc(sessionId).stream()
                .map(mediaMapper::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public ProctoringFileContent loadSnapshot(UUID sessionId, UUID snapshotId, Authentication authentication) {
        visibleSession(sessionId, authentication);
        ProctoringSnapshotEntity snapshot = snapshotRepository.findById(snapshotId)
                .orElseThrow(() -> new IllegalArgumentException("Snapshot not found"));
        if (!snapshot.getSession().getId().equals(sessionId)) {
            throw new IllegalArgumentException("Snapshot does not belong to the selected session");
        }
        return new ProctoringFileContent(fileStorageService.load(snapshot.getFilePath()), snapshot.getContentType());
    }

    @Transactional
    public ProctoringRecordingChunkResponse createRecordingChunk(
            UUID sessionId,
            int chunkIndex,
            MultipartFile file,
            Authentication authentication
    ) {
        ExamSessionEntity session = visibleSession(sessionId, authentication);
        requireContentType(file, "video/");
        StoredProctoringFile storedFile = fileStorageService.store(
                sessionId,
                "recordings",
                String.format("%06d-%s.webm", chunkIndex, UUID.randomUUID()),
                file
        );

        ProctoringRecordingChunkEntity chunk = new ProctoringRecordingChunkEntity();
        chunk.setSession(session);
        chunk.setChunkIndex(chunkIndex);
        chunk.setFilePath(storedFile.filePath());
        chunk.setContentType(storedFile.contentType());
        chunk.setSizeBytes(storedFile.sizeBytes());
        chunk.setSha256(storedFile.sha256());

        ProctoringRecordingChunkEntity saved = recordingChunkRepository.save(chunk);
        auditService.record(authentication.getName(), "PROCTORING_RECORDING_CHUNK_CREATED", "PROCTORING_RECORDING_CHUNK", saved.getId().toString());
        return mediaMapper.toResponse(saved);
    }

    @Transactional(readOnly = true)
    public List<ProctoringRecordingChunkResponse> findRecordingChunks(UUID sessionId, Authentication authentication) {
        visibleSession(sessionId, authentication);
        return recordingChunkRepository.findBySessionIdOrderByChunkIndexAsc(sessionId).stream()
                .map(mediaMapper::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public ProctoringFileContent loadRecordingChunk(UUID sessionId, UUID chunkId, Authentication authentication) {
        visibleSession(sessionId, authentication);
        ProctoringRecordingChunkEntity chunk = recordingChunkRepository.findById(chunkId)
                .orElseThrow(() -> new IllegalArgumentException("Recording chunk not found"));
        if (!chunk.getSession().getId().equals(sessionId)) {
            throw new IllegalArgumentException("Recording chunk does not belong to the selected session");
        }
        return new ProctoringFileContent(fileStorageService.load(chunk.getFilePath()), chunk.getContentType());
    }

    @Transactional
    public ProctoringCleanupResponse cleanupSessionArtifacts(UUID sessionId, Authentication authentication) {
        visibleProctorSession(sessionId, authentication);
        long deletedEvents = eventRepository.deleteBySessionId(sessionId);
        long deletedSnapshots = snapshotRepository.deleteBySessionId(sessionId);
        long deletedRecordingChunks = recordingChunkRepository.deleteBySessionId(sessionId);
        fileStorageService.deleteSessionFiles(sessionId);
        auditService.record(authentication.getName(), "PROCTORING_ARTIFACTS_CLEARED", "EXAM_SESSION", sessionId.toString());
        return new ProctoringCleanupResponse(sessionId, deletedEvents, deletedSnapshots, deletedRecordingChunks);
    }

    private ExamSessionEntity visibleSession(UUID sessionId, Authentication authentication) {
        ExamSessionEntity session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("Session not found"));
        if (hasRole(authentication, "ROLE_ADMIN")) {
            return session;
        }
        if (hasRole(authentication, "ROLE_STUDENT")
                && authentication.getName().equalsIgnoreCase(session.getStudent().getEmail())) {
            return session;
        }
        if (hasRole(authentication, "ROLE_PROCTOR")
                && session.getProctor() != null
                && authentication.getName().equalsIgnoreCase(session.getProctor().getEmail())) {
            return session;
        }
        throw new AccessDeniedException("Session is not visible to the current user");
    }

    private ExamSessionEntity visibleProctorSession(UUID sessionId, Authentication authentication) {
        ExamSessionEntity session = visibleSession(sessionId, authentication);
        if (hasRole(authentication, "ROLE_ADMIN") || hasRole(authentication, "ROLE_PROCTOR")) {
            return session;
        }
        throw new AccessDeniedException("Only proctors and admins can clear proctoring artifacts");
    }

    private String requireContentType(MultipartFile file, String expectedPrefix) {
        String contentType = file.getContentType();
        if (contentType == null || !contentType.startsWith(expectedPrefix)) {
            throw new IllegalArgumentException("Unsupported media type");
        }
        return contentType;
    }

    private boolean hasRole(Authentication authentication, String role) {
        return authentication.getAuthorities().stream()
                .anyMatch(authority -> role.equals(authority.getAuthority()));
    }
}
