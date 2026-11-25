package com.example.crud.security;

import java.util.Arrays;
import java.util.Optional;

/**
 * The roles the inspection service puts in a token's {@code role} claim.
 */
public enum RegisterRole {

    ADMIN,
    INSPECTOR,
    VIEWER;

    /**
     * @return the role with exactly this name, or empty when the claim is missing or not a known role
     */
    public static Optional<RegisterRole> fromClaim(String claim) {
        return Arrays.stream(values())
                .filter(role -> role.name().equals(claim))
                .findFirst();
    }

    /**
     * @return the names of every role, for rules that any signed-in user satisfies
     */
    public static String[] allNames() {
        return Arrays.stream(values())
                .map(RegisterRole::name)
                .toArray(String[]::new);
    }
}
