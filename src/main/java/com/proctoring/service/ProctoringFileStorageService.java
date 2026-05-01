package com.proctoring.service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.PathResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

@Service
public class ProctoringFileStorageService {

    private final Path storageRoot;

    public ProctoringFileStorageService(@Value("${proctoring.storage.root:storage/proctoring}") String storageRoot) {
        this.storageRoot = Path.of(storageRoot).toAbsolutePath().normalize();
    }

    public StoredProctoringFile store(UUID sessionId, String category, String fileName, MultipartFile file) {
        if (file.isEmpty()) {
            throw new IllegalArgumentException("Uploaded file is empty");
        }

        try {
            Path directory = storageRoot.resolve(sessionId.toString()).resolve(category).normalize();
            if (!directory.startsWith(storageRoot)) {
                throw new IllegalArgumentException("Invalid storage path");
            }
            Files.createDirectories(directory);

            String safeFileName = StringUtils.cleanPath(fileName);
            Path target = directory.resolve(safeFileName).normalize();
            if (!target.startsWith(directory)) {
                throw new IllegalArgumentException("Invalid file name");
            }

            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (InputStream input = new DigestInputStream(file.getInputStream(), digest)) {
                Files.copy(input, target);
            }

            return new StoredProctoringFile(
                    storageRoot.relativize(target).toString().replace('\\', '/'),
                    safeContentType(file),
                    Files.size(target),
                    HexFormat.of().formatHex(digest.digest())
            );
        } catch (IOException exception) {
            throw new IllegalArgumentException("Could not store uploaded file");
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 digest is not available", exception);
        }
    }

    public Resource load(String storedPath) {
        Path path = storageRoot.resolve(storedPath).normalize();
        if (!path.startsWith(storageRoot) || !Files.exists(path)) {
            throw new IllegalArgumentException("Stored file was not found");
        }
        return new PathResource(path);
    }

    public void deleteSessionFiles(UUID sessionId) {
        Path directory = storageRoot.resolve(sessionId.toString()).normalize();
        if (!directory.startsWith(storageRoot) || !Files.exists(directory)) {
            return;
        }

        try (var paths = Files.walk(directory)) {
            paths.sorted(Comparator.reverseOrder())
                    .forEach(path -> {
                        try {
                            Files.deleteIfExists(path);
                        } catch (IOException exception) {
                            throw new IllegalArgumentException("Could not delete stored proctoring files");
                        }
                    });
        } catch (IOException exception) {
            throw new IllegalArgumentException("Could not delete stored proctoring files");
        }
    }

    private String safeContentType(MultipartFile file) {
        return file.getContentType() == null ? "application/octet-stream" : file.getContentType();
    }
}
