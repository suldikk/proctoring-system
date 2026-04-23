package com.proctoring.service;

import com.proctoring.repository.AuditLogRepository;
import com.proctoring.repository.entity.AuditLogEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuditService {

    private final AuditLogRepository auditLogRepository;

    public AuditService(AuditLogRepository auditLogRepository) {
        this.auditLogRepository = auditLogRepository;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(String actorEmail, String action, String resourceType, String resourceId) {
        AuditLogEntity auditLog = new AuditLogEntity();
        auditLog.setActorEmail(actorEmail);
        auditLog.setAction(action);
        auditLog.setResourceType(resourceType);
        auditLog.setResourceId(resourceId);
        auditLogRepository.save(auditLog);
    }
}
