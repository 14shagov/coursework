package com.example.ragchatbot.service.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.ragchatbot.dto.auth.LoginRequest;
import com.example.ragchatbot.dto.auth.RegisterRequest;
import com.example.ragchatbot.entity.User;
import com.example.ragchatbot.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

class AuthServiceTest {

    private UserRepository userRepository;
    private PasswordEncoder passwordEncoder;
    private JwtService jwtService;
    private AuthService authService;

    @BeforeEach
    void setUp() {
        userRepository = mock(UserRepository.class);
        passwordEncoder = mock(PasswordEncoder.class);
        jwtService = mock(JwtService.class);
        authService = new AuthService(userRepository, passwordEncoder, jwtService);
        ReflectionTestUtils.setField(authService, "ttlMinutes", 120L);
    }

    @Test
    void registersNormalizedEmail() {
        RegisterRequest request = new RegisterRequest();
        request.setUsername("student");
        request.setEmail(" Student@Example.COM ");
        request.setPassword("password123");
        when(passwordEncoder.encode("password123")).thenReturn("hash");
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> {
            User user = invocation.getArgument(0);
            user.setId(7L);
            return user;
        });
        when(jwtService.generateToken(7L, "student")).thenReturn("jwt");

        assertThat(authService.register(request).accessToken()).isEqualTo("jwt");

        ArgumentCaptor<User> savedUser = ArgumentCaptor.forClass(User.class);
        verify(userRepository).existsByEmail("student@example.com");
        verify(userRepository).save(savedUser.capture());
        assertThat(savedUser.getValue().getEmail()).isEqualTo("student@example.com");
    }

    @Test
    void rejectsDuplicateEmail() {
        RegisterRequest request = new RegisterRequest();
        request.setUsername("student");
        request.setEmail("student@example.com");
        request.setPassword("password123");
        when(userRepository.existsByEmail("student@example.com")).thenReturn(true);

        assertThatThrownBy(() -> authService.register(request))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(error -> ((ResponseStatusException) error).getStatusCode())
                .isEqualTo(HttpStatus.CONFLICT);
    }

    @Test
    void logsInWithNormalizedEmail() {
        LoginRequest request = new LoginRequest();
        request.setEmail(" Student@Example.COM ");
        request.setPassword("password123");
        User user = new User();
        user.setId(7L);
        user.setUsername("student");
        user.setEmail("student@example.com");
        user.setPasswordHash("hash");
        when(userRepository.findByEmail("student@example.com")).thenReturn(java.util.Optional.of(user));
        when(passwordEncoder.matches("password123", "hash")).thenReturn(true);
        when(jwtService.generateToken(7L, "student")).thenReturn("jwt");

        assertThat(authService.login(request).accessToken()).isEqualTo("jwt");
        verify(userRepository).findByEmail("student@example.com");
    }
}
