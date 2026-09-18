package com.example.ragchatbot.dto.auth;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;

class AuthRequestValidationTest {

    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    void rejectsInvalidRegistrationEmail() {
        RegisterRequest request = new RegisterRequest();
        request.setUsername("student");
        request.setEmail("not-an-email");
        request.setPassword("password123");

        assertThat(validator.validate(request))
                .extracting(violation -> violation.getPropertyPath().toString())
                .contains("email");
    }

    @Test
    void rejectsBlankLoginEmail() {
        LoginRequest request = new LoginRequest();
        request.setEmail(" ");
        request.setPassword("password123");

        assertThat(validator.validate(request))
                .extracting(violation -> violation.getPropertyPath().toString())
                .contains("email");
    }
}
