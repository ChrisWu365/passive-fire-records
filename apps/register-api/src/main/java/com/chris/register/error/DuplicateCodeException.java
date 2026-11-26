package com.chris.register.error;

/**
 * Thrown when a code that must be unique (a project code, or a system code within its project) is already in use.
 */
public class DuplicateCodeException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public DuplicateCodeException(String message) {
        super(message);
    }
}
