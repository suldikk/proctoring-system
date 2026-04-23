package com.proctoring.dto.auth;

import com.proctoring.domain.Role;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.Set;

public record RegisterRequest(
        @Email @NotBlank String email,
        @NotBlank @Size(min = 8, max = 80) String password,
        @NotBlank @Size(max = 120) String fullName,
        @NotEmpty Set<Role> roles
) {
}
