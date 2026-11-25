package com.example.crud.security;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;

/**
 * Builds the HMAC-SHA256 key that verifies the tokens issued by the inspection service.
 */
public final class JwtSigningKey {

    /** HS256 needs a key of at least 256 bits. */
    public static final int MIN_SECRET_BYTES = 32;

    private static final String HMAC_ALGORITHM = "HmacSHA256";

    private static final String MISSING_SECRET =
            "JWT_SECRET is not set. Set it to the same value the inspection service signs tokens with, at least "
                    + MIN_SECRET_BYTES + " bytes long.";

    private static final String SHORT_SECRET =
            "JWT_SECRET is too short: it must be at least " + MIN_SECRET_BYTES + " bytes long.";

    private JwtSigningKey() {
    }

    /**
     * @param secret the shared secret, as configured through {@code JWT_SECRET}
     * @return the verification key
     * @throws InvalidJwtSecretException if the secret is missing, blank, or shorter than
     *                                   {@link #MIN_SECRET_BYTES} bytes in UTF-8
     */
    public static SecretKey fromSecret(String secret) {
        if (secret == null || secret.isBlank()) {
            throw new InvalidJwtSecretException(MISSING_SECRET);
        }
        byte[] secretBytes = secret.getBytes(StandardCharsets.UTF_8);
        if (secretBytes.length < MIN_SECRET_BYTES) {
            throw new InvalidJwtSecretException(SHORT_SECRET);
        }
        return new SecretKeySpec(secretBytes, HMAC_ALGORITHM);
    }
}
