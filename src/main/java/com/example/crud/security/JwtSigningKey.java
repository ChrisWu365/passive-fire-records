package com.example.crud.security;

import javax.crypto.SecretKey;

/**
 * Builds the HMAC-SHA256 key that verifies the tokens issued by the inspection service.
 */
public final class JwtSigningKey {

    /** HS256 needs a key of at least 256 bits. */
    public static final int MIN_SECRET_BYTES = 32;

    private JwtSigningKey() {
    }

    /**
     * @param secret the shared secret, as configured through {@code JWT_SECRET}
     * @return the verification key
     * @throws InvalidJwtSecretException if the secret is missing, blank, or shorter than
     *                                   {@link #MIN_SECRET_BYTES} bytes in UTF-8
     */
    public static SecretKey fromSecret(String secret) {
        throw new UnsupportedOperationException("Not implemented yet");
    }
}
