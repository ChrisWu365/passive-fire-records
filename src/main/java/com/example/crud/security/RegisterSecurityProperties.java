package com.example.crud.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Security settings of the register service.
 *
 * @param jwtSecret the secret shared with the inspection service, which signs the tokens this service verifies
 */
@ConfigurationProperties(prefix = "register.security")
public record RegisterSecurityProperties(String jwtSecret) {
}
