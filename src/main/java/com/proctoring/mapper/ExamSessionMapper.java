package com.proctoring.mapper;

import com.proctoring.dto.session.ExamSessionResponse;
import com.proctoring.repository.entity.ExamSessionEntity;
import java.util.Optional;
import org.springframework.stereotype.Component;

@Component
public class ExamSessionMapper {

    public ExamSessionResponse toResponse(ExamSessionEntity session) {
        return new ExamSessionResponse(
                session.getId(),
                session.getExamTitle(),
                session.getStudent().getId(),
                Optional.ofNullable(session.getProctor()).map(proctor -> proctor.getId()).orElse(null),
                session.getStatus(),
                session.getStartsAt(),
                session.getEndsAt()
        );
    }
}
