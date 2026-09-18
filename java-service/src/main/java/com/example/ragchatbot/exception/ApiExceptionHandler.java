package com.example.ragchatbot.exception;

import java.util.LinkedHashMap;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

@Slf4j
@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> handleValidation(MethodArgumentNotValidException exception) {
        Map<String, String> fields = new LinkedHashMap<>();
        for (FieldError error : exception.getBindingResult().getFieldErrors()) {
            fields.putIfAbsent(error.getField(), validationMessage(error));
        }

        String message = String.join(" ", fields.values());
        return ResponseEntity.badRequest().body(new ApiError(message, fields));
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ApiError> handleResponseStatus(ResponseStatusException exception) {
        String message = exception.getReason() == null ? "Не удалось выполнить запрос." : exception.getReason();
        return ResponseEntity.status(exception.getStatusCode()).body(new ApiError(message, Map.of()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> handleUnexpected(Exception exception) {
        log.error("Unhandled API error", exception);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(new ApiError("Внутренняя ошибка сервера. Попробуйте ещё раз позже.", Map.of()));
    }

    private String validationMessage(FieldError error) {
        return switch (error.getField()) {
            case "username" -> "Имя пользователя должно содержать от 3 до 100 символов.";
            case "email" -> "Укажите корректный email.";
            case "password" -> "Пароль должен содержать от 8 до 128 символов.";
            default -> "Проверьте значение поля «" + error.getField() + "».";
        };
    }
}
