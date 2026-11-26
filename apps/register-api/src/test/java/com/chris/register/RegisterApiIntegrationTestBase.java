package com.chris.register;

import com.chris.register.firestop.FirestopSystemRepository;
import com.chris.register.project.ProjectRepository;
import com.chris.register.security.AdminTokenMockMvcConfiguration;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Shared setup for the register integration tests: the full Spring context, the real controllers, services,
 * repositories and database, driven through MockMvc. The register tables are emptied before each test.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import({JacksonConfig.class, AdminTokenMockMvcConfiguration.class})
abstract class RegisterApiIntegrationTestBase {

    protected static final String UNKNOWN_ID = "99999999-9999-9999-9999-999999999999";

    @Autowired
    protected MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private ProjectRepository projectRepository;

    @Autowired
    private FirestopSystemRepository firestopSystemRepository;

    protected RegisterApiFixture api;

    @BeforeEach
    void resetRegister() {
        firestopSystemRepository.deleteAll();
        projectRepository.deleteAll();
        api = new RegisterApiFixture(mockMvc, objectMapper);
    }
}
