package com.proctoring.mapper;

import com.proctoring.dto.user.UserResponse;
import com.proctoring.repository.entity.UserEntity;
import org.springframework.stereotype.Component;

@Component
public class UserMapper {

    public UserResponse toResponse(UserEntity user) {
        return new UserResponse(
                user.getId(),
                user.getEmail(),
                user.getFullName(),
                user.getRoles(),
                user.getCreatedAt()
        );
    }
}
