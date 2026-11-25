package com.example.crud.security;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Unit tests for the rule that the shared signing secret must be long enough to be safe.
 */
class JwtSigningKeyTest {

    private static final String SECRET_OF_32_BYTES = "0123456789abcdef0123456789abcdef";

    private static final String SECRET_OF_31_BYTES = "0123456789abcdef0123456789abcde";

    @Test
    @DisplayName("AC-2.4 a secret of exactly 32 bytes produces an HMAC-SHA256 key made of those bytes")
    void acceptsSecretOfMinimumLength() {
        SecretKey key = JwtSigningKey.fromSecret(SECRET_OF_32_BYTES);

        assertEquals("HmacSHA256", key.getAlgorithm());
        assertArrayEquals(SECRET_OF_32_BYTES.getBytes(StandardCharsets.UTF_8), key.getEncoded());
    }

    @Test
    @DisplayName("AC-2.4 a secret of 31 bytes is rejected with a message naming JWT_SECRET and the 32-byte minimum")
    void rejectsSecretOneByteTooShort() {
        InvalidJwtSecretException exception = assertThrows(
                InvalidJwtSecretException.class, () -> JwtSigningKey.fromSecret(SECRET_OF_31_BYTES));

        assertTrue(exception.getMessage().contains("JWT_SECRET"));
        assertTrue(exception.getMessage().contains("32"));
    }

    @Test
    @DisplayName("AC-2.4 the rejection message never contains the secret itself")
    void rejectionDoesNotLeakSecret() {
        InvalidJwtSecretException exception = assertThrows(
                InvalidJwtSecretException.class, () -> JwtSigningKey.fromSecret(SECRET_OF_31_BYTES));

        assertFalse(exception.getMessage().contains(SECRET_OF_31_BYTES));
    }

    @ParameterizedTest(name = "AC-2.4 a missing or blank secret is rejected [{index}]")
    @NullSource
    @ValueSource(strings = {"", "   ", "                                        "})
    void rejectsMissingOrBlankSecret(String secret) {
        assertThrows(InvalidJwtSecretException.class, () -> JwtSigningKey.fromSecret(secret));
    }
}
