package com.chris.register.security;

/**
 * Thrown at startup when the shared token signing secret is missing or too short to be safe.
 */
public class InvalidJwtSecretException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public InvalidJwtSecretException(String message) {
        super(message);
    }
}
