package com.example.crud.config;

import org.springframework.context.ApplicationContextInitializer;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.util.StringUtils;

import java.util.List;

/**
 * Stops the service before any bean is created when it would otherwise start without its database
 * settings. The local profile falls back to a PostgreSQL on the developer's machine and the test profile
 * starts its own throwaway PostgreSQL, so neither needs any. Every other profile must name its database, so
 * that a forgotten setting is a clear startup error.
 */
public class RequiredDatabaseSettings implements ApplicationContextInitializer<ConfigurableApplicationContext> {

    static final List<String> REQUIRED_SETTINGS =
            List.of("REGISTER_DATABASE_URL", "REGISTER_DATABASE_USERNAME", "REGISTER_DATABASE_PASSWORD");

    private static final Profiles PROFILES_WITH_OWN_DATABASE = Profiles.of("local", "test");

    @Override
    public void initialize(ConfigurableApplicationContext applicationContext) {
        Environment environment = applicationContext.getEnvironment();
        if (environment.acceptsProfiles(PROFILES_WITH_OWN_DATABASE)) {
            return;
        }
        List<String> missing = REQUIRED_SETTINGS.stream()
                .filter(name -> !StringUtils.hasText(environment.getProperty(name)))
                .toList();
        if (!missing.isEmpty()) {
            // Names only: a value, when present, is a credential and must not reach a log.
            throw new MissingDatabaseSettingsException(
                    "Missing database settings: " + String.join(", ", missing)
                            + ". Outside the local and test profiles the register service needs "
                            + String.join(", ", REQUIRED_SETTINGS)
                            + " as environment variables, or in a .env file (see .env.example).");
        }
    }
}
