package com.proctoring.controller;

import com.proctoring.dto.media.ProctoringRecordingChunkResponse;
import com.proctoring.dto.media.ProctoringSnapshotResponse;
import com.proctoring.service.ProctoringFileContent;
import com.proctoring.service.ProctoringMediaService;
import java.util.List;
import java.util.UUID;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/sessions/{sessionId}")
public class ProctoringMediaController {

    private final ProctoringMediaService mediaService;

    public ProctoringMediaController(ProctoringMediaService mediaService) {
        this.mediaService = mediaService;
    }

    @PostMapping(value = "/snapshots", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasAnyRole('ADMIN', 'PROCTOR', 'STUDENT')")
    public ProctoringSnapshotResponse createSnapshot(
            @PathVariable UUID sessionId,
            @RequestPart("file") MultipartFile file,
            Authentication authentication
    ) {
        return mediaService.createSnapshot(sessionId, file, authentication);
    }

    @GetMapping("/snapshots")
    @PreAuthorize("hasAnyRole('ADMIN', 'PROCTOR', 'STUDENT')")
    public List<ProctoringSnapshotResponse> findSnapshots(
            @PathVariable UUID sessionId,
            Authentication authentication
    ) {
        return mediaService.findSnapshots(sessionId, authentication);
    }

    @GetMapping("/snapshots/{snapshotId}/file")
    @PreAuthorize("hasAnyRole('ADMIN', 'PROCTOR', 'STUDENT')")
    public ResponseEntity<Resource> loadSnapshot(
            @PathVariable UUID sessionId,
            @PathVariable UUID snapshotId,
            Authentication authentication
    ) {
        return fileResponse(mediaService.loadSnapshot(sessionId, snapshotId, authentication));
    }

    @PostMapping(value = "/recordings/chunks", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasAnyRole('ADMIN', 'PROCTOR', 'STUDENT')")
    public ProctoringRecordingChunkResponse createRecordingChunk(
            @PathVariable UUID sessionId,
            @RequestParam int chunkIndex,
            @RequestPart("file") MultipartFile file,
            Authentication authentication
    ) {
        return mediaService.createRecordingChunk(sessionId, chunkIndex, file, authentication);
    }

    @GetMapping("/recordings/chunks")
    @PreAuthorize("hasAnyRole('ADMIN', 'PROCTOR', 'STUDENT')")
    public List<ProctoringRecordingChunkResponse> findRecordingChunks(
            @PathVariable UUID sessionId,
            Authentication authentication
    ) {
        return mediaService.findRecordingChunks(sessionId, authentication);
    }

    @GetMapping("/recordings/chunks/{chunkId}/file")
    @PreAuthorize("hasAnyRole('ADMIN', 'PROCTOR', 'STUDENT')")
    public ResponseEntity<Resource> loadRecordingChunk(
            @PathVariable UUID sessionId,
            @PathVariable UUID chunkId,
            Authentication authentication
    ) {
        return fileResponse(mediaService.loadRecordingChunk(sessionId, chunkId, authentication));
    }

    private ResponseEntity<Resource> fileResponse(ProctoringFileContent content) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .contentType(MediaType.parseMediaType(content.contentType()))
                .body(content.resource());
    }
}
