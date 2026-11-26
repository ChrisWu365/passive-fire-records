package com.chris.register.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;

import java.io.IOException;

/**
 * Answers 401: "Authentication required" when no token was sent, "Invalid or expired token" when one was sent
 * but could not be verified.
 */
public class JsonAuthenticationEntryPoint implements AuthenticationEntryPoint {

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response,
                         AuthenticationException authException) throws IOException {
        SecurityErrorMessage message = authException instanceof OAuth2AuthenticationException
                ? SecurityErrorMessage.INVALID_TOKEN
                : SecurityErrorMessage.AUTHENTICATION_REQUIRED;
        SecurityErrorWriter.write(response, HttpStatus.UNAUTHORIZED, message);
    }
}
