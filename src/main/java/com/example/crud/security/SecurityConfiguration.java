package com.example.crud.security;

import jakarta.servlet.DispatcherType;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.AccessDeniedHandler;

/**
 * Sign-in for the register service. It issues no tokens: it verifies the HS256 tokens that the inspection
 * service issues, using the shared secret, and applies role rules to the register API.
 */
@Configuration
@EnableConfigurationProperties(RegisterSecurityProperties.class)
public class SecurityConfiguration {

    private static final String REGISTER_API = "/api/register/**";

    private static final String[] OPEN_PATHS = {
        "/actuator/health", "/actuator/health/**", "/actuator/prometheus",
        "/v3/api-docs", "/v3/api-docs/**", "/swagger-ui.html", "/swagger-ui/**"
    };

    @Bean
    public JwtDecoder jwtDecoder(RegisterSecurityProperties properties) {
        return NimbusJwtDecoder.withSecretKey(JwtSigningKey.fromSecret(properties.jwtSecret()))
                .macAlgorithm(MacAlgorithm.HS256)
                .build();
    }

    @Bean
    public JwtAuthenticationConverter jwtAuthenticationConverter() {
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(new RoleClaimAuthoritiesConverter());
        return converter;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http,
                                                   JwtAuthenticationConverter jwtAuthenticationConverter)
            throws Exception {
        AuthenticationEntryPoint entryPoint = new JsonAuthenticationEntryPoint();
        AccessDeniedHandler accessDeniedHandler = new JsonAccessDeniedHandler();
        http
                // Tokens travel in the Authorization header and no session or cookie is used, so there is no
                // cross-site request forgery to defend against.
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(authorize -> authorize
                        .dispatcherTypeMatchers(DispatcherType.ERROR).permitAll()
                        .requestMatchers(OPEN_PATHS).permitAll()
                        .requestMatchers(HttpMethod.GET, REGISTER_API).hasAnyRole(RegisterRole.allNames())
                        .requestMatchers(REGISTER_API).hasRole(RegisterRole.ADMIN.name())
                        .anyRequest().authenticated())
                .oauth2ResourceServer(resourceServer -> resourceServer
                        .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter))
                        .authenticationEntryPoint(entryPoint)
                        .accessDeniedHandler(accessDeniedHandler))
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint(entryPoint)
                        .accessDeniedHandler(accessDeniedHandler));
        return http.build();
    }
}
