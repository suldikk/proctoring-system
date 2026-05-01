package com.proctoring.config;

import com.proctoring.domain.Role;
import com.proctoring.repository.ExamSessionRepository;
import com.proctoring.repository.UserRepository;
import com.proctoring.repository.entity.ExamSessionEntity;
import com.proctoring.repository.entity.UserEntity;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Set;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration
@Profile("local")
public class LocalDemoDataConfig {

    @Bean
    CommandLineRunner demoUsers(
            UserRepository userRepository,
            ExamSessionRepository sessionRepository,
            PasswordEncoder passwordEncoder
    ) {
        return args -> {
            createUserIfMissing(userRepository, passwordEncoder, "admin@example.com", "Администратор Демо", Set.of(Role.ADMIN));
            UserEntity proctor = createUserIfMissing(userRepository, passwordEncoder, "proctor@example.com", "Проктор Демо", Set.of(Role.PROCTOR));
            UserEntity student = createUserIfMissing(userRepository, passwordEncoder, "student@example.com", "Студент Демо", Set.of(Role.STUDENT));
            createSessionIfMissing(sessionRepository, student, proctor);
        };
    }

    private UserEntity createUserIfMissing(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            String email,
            String fullName,
            Set<Role> roles
    ) {
        return userRepository.findByEmail(email).orElseGet(() -> {
            UserEntity user = new UserEntity();
            user.setEmail(email);
            user.setFullName(fullName);
            user.setRoles(roles);
            user.setPasswordHash(passwordEncoder.encode("password123"));
            return userRepository.save(user);
        });
    }

    private void createSessionIfMissing(
            ExamSessionRepository sessionRepository,
            UserEntity student,
            UserEntity proctor
    ) {
        if (sessionRepository.count() > 0) {
            return;
        }

        Instant startsAt = Instant.now().minus(15, ChronoUnit.MINUTES);
        ExamSessionEntity session = new ExamSessionEntity();
        session.setExamTitle("Демо-экзамен по Java с прокторингом");
        session.setStudent(student);
        session.setProctor(proctor);
        session.setStartsAt(startsAt);
        session.setEndsAt(startsAt.plus(2, ChronoUnit.HOURS));
        sessionRepository.save(session);
    }
}
