package com.chris.register.error;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Turns register errors into the API's single error shape.
 */
@RestControllerAdvice
public class RegisterExceptionHandler {

    private static final Logger LOGGER = LoggerFactory.getLogger(RegisterExceptionHandler.class);

    private static final String VALIDATION_FAILED = "Validation failed";

    private static final String UNREADABLE_BODY = "Request body is missing or is not valid JSON";

    private static final String DATA_CONFLICT = "The change conflicts with existing data";

    private static final String INVALID_FIELD = "is invalid";

    @ExceptionHandler(ResourceNotFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public ApiError handleNotFound(ResourceNotFoundException exception) {
        return ApiError.of(exception.getMessage());
    }

    @ExceptionHandler(DuplicateCodeException.class)
    @ResponseStatus(HttpStatus.CONFLICT)
    public ApiError handleDuplicateCode(DuplicateCodeException exception) {
        return ApiError.of(exception.getMessage());
    }

    /**
     * Two requests can pass the uniqueness check at the same moment; the database constraint then rejects one.
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    @ResponseStatus(HttpStatus.CONFLICT)
    public ApiError handleDataConflict(DataIntegrityViolationException exception) {
        LOGGER.warn("Database constraint rejected a register change", exception);
        return ApiError.of(DATA_CONFLICT);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ApiError handleValidation(MethodArgumentNotValidException exception) {
        Map<String, String> fields = new LinkedHashMap<>();
        for (FieldError fieldError : exception.getBindingResult().getFieldErrors()) {
            String message = fieldError.getDefaultMessage() == null ? INVALID_FIELD : fieldError.getDefaultMessage();
            fields.putIfAbsent(fieldError.getField(), message);
        }
        return new ApiError(VALIDATION_FAILED, fields);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ApiError handleUnreadableBody(HttpMessageNotReadableException exception) {
        return ApiError.of(UNREADABLE_BODY);
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ApiError handleTypeMismatch(MethodArgumentTypeMismatchException exception) {
        return ApiError.of("Invalid value for '" + exception.getName() + "'");
    }
}
