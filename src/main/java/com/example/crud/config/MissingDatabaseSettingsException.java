package com.example.crud.config;

/**
 * Thrown at startup when the register service is asked to run outside local development and tests
 * without being told which database to use.
 */
public class MissingDatabaseSettingsException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public MissingDatabaseSettingsException(String message) {
        super(message);
    }
}
