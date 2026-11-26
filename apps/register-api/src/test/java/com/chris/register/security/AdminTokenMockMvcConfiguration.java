package com.chris.register.security;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.http.HttpHeaders;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/**
 * For tests that are about register behaviour and not about sign-in: every MockMvc request that sets no
 * Authorization header of its own is sent as a signed-in admin. Import it explicitly; it is not picked up
 * by component scanning, so the security tests still send exactly the tokens they choose.
 */
@TestConfiguration(proxyBeanMethods = false)
public class AdminTokenMockMvcConfiguration {

    @Bean
    MockMvcBuilderCustomizer adminTokenByDefault() {
        String authorization = "Bearer " + TestTokens.forRole("ADMIN");
        return builder -> builder.defaultRequest(get("/").header(HttpHeaders.AUTHORIZATION, authorization));
    }
}
