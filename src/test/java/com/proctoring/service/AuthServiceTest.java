package com.proctoring.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.proctoring.domain.Role;
import com.proctoring.dto.auth.RegisterRequest;
import com.proctoring.mapper.UserMapper;
import com.proctoring.repository.UserRepository;
import com.proctoring.repository.entity.UserEntity;
import com.proctoring.security.JwtService;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private JwtService jwtService;

    @Mock
    private AuditService auditService;

    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    @Test
    void registerCreatesUserWithEncodedPasswordAndRoles() {
        AuthService authService = new AuthService(
                userRepository,
                passwordEncoder,
                jwtService,
                new UserMapper(),
                auditService
        );
        RegisterRequest request = new RegisterRequest(
                "Student@Example.com",
                "password123",
                "Student One",
                Set.of(Role.STUDENT)
        );
        when(userRepository.existsByEmail("student@example.com")).thenReturn(false);
        when(userRepository.save(any(UserEntity.class))).thenAnswer(invocation -> {
            UserEntity user = invocation.getArgument(0);
            user.setId(UUID.randomUUID());
            return user;
        });

        var response = authService.register(request);

        ArgumentCaptor<UserEntity> captor = ArgumentCaptor.forClass(UserEntity.class);
        verify(userRepository).save(captor.capture());
        UserEntity saved = captor.getValue();
        assertThat(saved.getEmail()).isEqualTo("student@example.com");
        assertThat(passwordEncoder.matches("password123", saved.getPasswordHash())).isTrue();
        assertThat(response.roles()).containsExactly(Role.STUDENT);
        verify(auditService).record("student@example.com", "USER_REGISTERED", "USER", saved.getId().toString());
    }

    @Test
    void registerRejectsDuplicateEmail() {
        AuthService authService = new AuthService(
                userRepository,
                passwordEncoder,
                jwtService,
                new UserMapper(),
                auditService
        );
        RegisterRequest request = new RegisterRequest(
                "admin@example.com",
                "password123",
                "Admin",
                Set.of(Role.ADMIN)
        );
        when(userRepository.existsByEmail("admin@example.com")).thenReturn(true);

        assertThatThrownBy(() -> authService.register(request))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("User with this email already exists");
    }

    @Test
    void registerRejectsPrivilegedRoles() {
        AuthService authService = new AuthService(
                userRepository,
                passwordEncoder,
                jwtService,
                new UserMapper(),
                auditService
        );
        RegisterRequest request = new RegisterRequest(
                "admin@example.com",
                "password123",
                "Admin",
                Set.of(Role.ADMIN)
        );
        when(userRepository.existsByEmail("admin@example.com")).thenReturn(false);

        assertThatThrownBy(() -> authService.register(request))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Self-registration is only available for students");
    }
}
