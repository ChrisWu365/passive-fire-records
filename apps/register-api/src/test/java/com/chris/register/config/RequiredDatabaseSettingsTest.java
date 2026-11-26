package com.chris.register.config;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.mock.env.MockEnvironment;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Unit tests for the rule that a deployed register service must be told which database to use.
 */
class RequiredDatabaseSettingsTest {

    private static final String URL = "jdbc:postgresql://db.example.com:5432/postgres";

    private static final String USERNAME = "register";

    private static final String PASSWORD = "a-very-secret-password";

    private final RequiredDatabaseSettings check = new RequiredDatabaseSettings();

    private static GenericApplicationContext contextWith(MockEnvironment environment) {
        GenericApplicationContext context = new GenericApplicationContext();
        context.setEnvironment(environment);
        return context;
    }

    private static MockEnvironment completeEnvironment(String profile) {
        MockEnvironment environment = new MockEnvironment()
                .withProperty("REGISTER_DATABASE_URL", URL)
                .withProperty("REGISTER_DATABASE_USERNAME", USERNAME)
                .withProperty("REGISTER_DATABASE_PASSWORD", PASSWORD);
        environment.setActiveProfiles(profile);
        return environment;
    }

    @ParameterizedTest(name = "the {0} profile starts when all three settings are present")
    @ValueSource(strings = {"dev", "staging", "prod"})
    void deployedProfileWithAllSettingsStarts(String profile) {
        assertDoesNotThrow(() -> check.initialize(contextWith(completeEnvironment(profile))));
    }

    @ParameterizedTest(name = "the {0} profile needs no database settings")
    @ValueSource(strings = {"local", "test"})
    void profilesWithTheirOwnDatabaseNeedNoSettings(String profile) {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles(profile);

        assertDoesNotThrow(() -> check.initialize(contextWith(environment)));
    }

    @ParameterizedTest(name = "the {0} profile refuses to start with no database settings, naming all three")
    @ValueSource(strings = {"dev", "staging", "prod"})
    void deployedProfileWithoutSettingsIsRefused(String profile) {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles(profile);

        MissingDatabaseSettingsException exception = assertThrows(
                MissingDatabaseSettingsException.class, () -> check.initialize(contextWith(environment)));

        assertTrue(exception.getMessage().startsWith("Missing database settings: "
                + "REGISTER_DATABASE_URL, REGISTER_DATABASE_USERNAME, REGISTER_DATABASE_PASSWORD."));
    }

    @Test
    @DisplayName("only the settings that are missing are reported as missing")
    void onlyMissingSettingsAreReported() {
        MockEnvironment environment = completeEnvironment("prod");
        environment.setProperty("REGISTER_DATABASE_PASSWORD", "");

        MissingDatabaseSettingsException exception = assertThrows(
                MissingDatabaseSettingsException.class, () -> check.initialize(contextWith(environment)));

        assertTrue(exception.getMessage().startsWith("Missing database settings: REGISTER_DATABASE_PASSWORD."));
    }

    @Test
    @DisplayName("a setting that is present but blank counts as missing")
    void blankSettingCountsAsMissing() {
        MockEnvironment environment = completeEnvironment("prod");
        environment.setProperty("REGISTER_DATABASE_URL", "   ");

        MissingDatabaseSettingsException exception = assertThrows(
                MissingDatabaseSettingsException.class, () -> check.initialize(contextWith(environment)));

        assertTrue(exception.getMessage().startsWith("Missing database settings: REGISTER_DATABASE_URL."));
    }

    @Test
    @DisplayName("the refusal never repeats a value that was provided")
    void refusalDoesNotLeakValues() {
        MockEnvironment environment = completeEnvironment("prod");
        environment.setProperty("REGISTER_DATABASE_USERNAME", "");

        MissingDatabaseSettingsException exception = assertThrows(
                MissingDatabaseSettingsException.class, () -> check.initialize(contextWith(environment)));

        assertFalse(exception.getMessage().contains(PASSWORD));
        assertFalse(exception.getMessage().contains(URL));
    }

    @Test
    @DisplayName("with no profile at all, the settings are required")
    void noProfileRequiresSettings() {
        assertThrows(MissingDatabaseSettingsException.class,
                () -> check.initialize(contextWith(new MockEnvironment())));
    }
}
