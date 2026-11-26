package com.chris.register.error;

/**
 * Thrown when a project or firestop system that a request refers to does not exist.
 */
public class ResourceNotFoundException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public ResourceNotFoundException(String message) {
        super(message);
    }
}
