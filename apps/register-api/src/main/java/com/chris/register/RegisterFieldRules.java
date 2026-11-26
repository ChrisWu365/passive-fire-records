package com.chris.register;

/**
 * Limits and formats shared by the register's request validation.
 */
public final class RegisterFieldRules {

    /** Capital letters, digits and hyphens, starting with a letter or digit, at most 20 characters. */
    public static final String CODE_PATTERN = "^[A-Z0-9][A-Z0-9-]{0,19}$";

    public static final String CODE_MESSAGE =
            "code must use capital letters, digits and hyphens only, and be at most 20 characters";

    public static final int NAME_MAX_LENGTH = 100;

    public static final int ADDRESS_MAX_LENGTH = 200;

    public static final int SUBSTRATE_MAX_LENGTH = 100;

    public static final int SERVICE_TYPE_MAX_LENGTH = 100;

    public static final int FIRE_RATING_MAX_LENGTH = 20;

    public static final int MATERIALS_MAX_LENGTH = 500;

    public static final int INSTALLATION_METHOD_MAX_LENGTH = 1000;

    private RegisterFieldRules() {
    }
}
