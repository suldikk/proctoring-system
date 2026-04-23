package com.proctoring.config;

import com.proctoring.domain.Role;
import com.proctoring.repository.UserRepository;
import com.proctoring.repository.entity.UserEntity;
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
    CommandLineRunner demoUsers(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        return args -> {
            createUserIfMissing(userRepository, passwordEncoder, "admin@example.com", "Admin Demo", Set.of(Role.ADMIN));
            createUserIfMissing(userRepository, passwordEncoder, "proctor@example.com", "Proctor Demo", Set.of(Role.PROCTOR));
            createUserIfMissing(userRepository, passwordEncoder, "student@example.com", "Student Demo", Set.of(Role.STUDENT));
        };
    }

    private void createUserIfMissing(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            String email,
            String fullName,
            Set<Role> roles
    ) {
        if (userRepository.existsByEmail(email)) {
            return;
        }

        UserEntity user = new UserEntity();
        user.setEmail(email);
        user.setFullName(fullName);
        user.setRoles(roles);
        user.setPasswordHash(passwordEncoder.encode("password123"));
        userRepository.save(user);
    }
}
