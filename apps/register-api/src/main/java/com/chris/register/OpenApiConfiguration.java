package com.chris.register;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

@Configuration
@Profile({"local", "dev", "test"})
public class OpenApiConfiguration {

    @Bean
    public OpenAPI registerOpenAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("Passive Fire Register API")
                        .version("v1")
                        .description("REST API for projects and their approved firestop systems"));
    }
}
