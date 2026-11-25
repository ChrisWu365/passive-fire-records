package com.example.crud.security;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.time.Instant;
import java.util.Base64;

/**
 * Builds HS256 tokens for the security tests with plain JDK cryptography, independently of the library the
 * service uses to verify them. The claims match what the inspection service issues: sub, email, name, role,
 * iat and exp.
 */
final class TestTokens {

    /** Signing secret of the test profile; see application-test.yml. Never used outside tests. */
    static final String SECRET = "test-only-jwt-secret-0123456789-abcdefghij";

    /**
     * A token produced by the inspection service's own library (jsonwebtoken 9, HS256) with {@link #SECRET},
     * the demo admin's claims, and an expiry about 100 years ahead.
     */
    static final String ISSUED_BY_NODE_LIBRARY_FOR_ADMIN =
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
            + ".eyJzdWIiOiJ1c2VyLWFkbWluIiwiZW1haWwiOiJhZG1pbkBleGFtcGxlLmNvbSIsIm5hbWUiOiJEZW1vIEFkbWluIiwi"
            + "cm9sZSI6IkFETUlOIiwiaWF0IjoxNzk1NTk1NTQxLCJleHAiOjQ5NDkxOTU1NDF9"
            + ".oa3x3GBBkgoQKAW4Q_3nIVMKHsIrG5_s2IO9ukIYetc";

    private static final String HS256_HEADER = "{\"alg\":\"HS256\",\"typ\":\"JWT\"}";

    private static final String UNSIGNED_HEADER = "{\"alg\":\"none\",\"typ\":\"JWT\"}";

    private static final String HMAC_ALGORITHM = "HmacSHA256";

    private static final long ONE_HOUR_SECONDS = 3600;

    private TestTokens() {
    }

    /** A valid token for the given role, signed with the test secret, expiring in one hour. */
    static String forRole(String role) {
        return signed(claims(roleClaim(role), ONE_HOUR_SECONDS), SECRET);
    }

    /** A token for the given role that expired one hour ago. */
    static String expired(String role) {
        return signed(claims(roleClaim(role), -ONE_HOUR_SECONDS), SECRET);
    }

    /** A token for the given role signed with a secret the service does not know. */
    static String signedWithOtherSecret(String role) {
        return signed(claims(roleClaim(role), ONE_HOUR_SECONDS), "another-secret-that-is-32-bytes-long!!");
    }

    /** A validly signed token that carries no role claim. */
    static String withoutRole() {
        return signed(claims("", ONE_HOUR_SECONDS), SECRET);
    }

    /** A token that declares the "none" algorithm and carries no signature. */
    static String unsigned(String role) {
        return encode(UNSIGNED_HEADER) + "." + encode(claims(roleClaim(role), ONE_HOUR_SECONDS)) + ".";
    }

    private static String roleClaim(String role) {
        return "\"role\":\"" + role + "\",";
    }

    private static String claims(String roleClaim, long secondsUntilExpiry) {
        long now = Instant.now().getEpochSecond();
        return "{\"sub\":\"user-test\",\"email\":\"test@example.com\",\"name\":\"Test User\","
                + roleClaim
                + "\"iat\":" + (now - 1) + ",\"exp\":" + (now + secondsUntilExpiry) + "}";
    }

    private static String signed(String claims, String secret) {
        String content = encode(HS256_HEADER) + "." + encode(claims);
        return content + "." + Base64.getUrlEncoder().withoutPadding().encodeToString(hmac(content, secret));
    }

    private static String encode(String json) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(json.getBytes(StandardCharsets.UTF_8));
    }

    private static byte[] hmac(String content, String secret) {
        try {
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM));
            return mac.doFinal(content.getBytes(StandardCharsets.UTF_8));
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("Could not sign the test token", exception);
        }
    }
}
