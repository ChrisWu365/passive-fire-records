package com.chris.register.error;

/**
 * Thrown when a name that must be unique (an area's name within its project) is already in use.
 */
public class DuplicateNameException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public DuplicateNameException(String message) {
        super(message);
    }
}
