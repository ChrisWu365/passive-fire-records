package com.chris.register.security;

/**
 * The sign-in error messages, worded the same as the inspection service's.
 */
enum SecurityErrorMessage {

    AUTHENTICATION_REQUIRED("Authentication required"),
    INVALID_TOKEN("Invalid or expired token"),
    INSUFFICIENT_PERMISSIONS("Insufficient permissions");

    private final String text;

    SecurityErrorMessage(String text) {
        this.text = text;
    }

    String message() {
        return text;
    }
}
