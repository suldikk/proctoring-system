package com.proctoring.mapper;

import com.proctoring.dto.event.ProctoringEventResponse;
import com.proctoring.repository.entity.ProctoringEventEntity;
import org.springframework.stereotype.Component;

@Component
public class ProctoringEventMapper {

    public ProctoringEventResponse toResponse(ProctoringEventEntity event) {
        return new ProctoringEventResponse(
                event.getId(),
                event.getSession().getId(),
                event.getType(),
                event.getSeverity(),
                event.getDetails(),
                event.getOccurredAt()
        );
    }
}
