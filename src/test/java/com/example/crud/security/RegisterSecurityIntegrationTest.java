package com.example.crud.security;

import com.example.crud.register.firestop.FirestopSystem;
import com.example.crud.register.firestop.FirestopSystemRepository;
import com.example.crud.register.project.Project;
import com.example.crud.register.project.ProjectRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.List;

import static org.hamcrest.Matchers.is;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Integration tests for sign-in on the register API. Requests carry real token strings in the Authorization
 * header, so the service's own token verification runs; nothing about security is mocked.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class RegisterSecurityIntegrationTest {

    private static final String PROJECTS_PATH = "/api/register/projects";

    private static final String SNAPSHOT_PATH = "/api/register/snapshot";

    private static final String ADMIN = "ADMIN";

    private static final String AUTHENTICATION_REQUIRED = "Authentication required";

    private static final String INVALID_TOKEN = "Invalid or expired token";

    private static final String INSUFFICIENT_PERMISSIONS = "Insufficient permissions";

    private static final String EXISTING_PROJECT_NAME = "Existing Project";

    private static final String PROJECT_JSON = "{\"code\":\"NEW\",\"name\":\"New Project\"}";

    private static final String SYSTEM_JSON = "{\"code\":\"SYS-NEW\",\"substrate\":\"Plasterboard wall\","
            + "\"serviceType\":\"Demo plastic pipe\",\"fireRating\":\"-/60/60\",\"materials\":\"Demo collar A\","
            + "\"installationMethod\":\"Fit one collar on each side of the wall.\"}";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ProjectRepository projectRepository;

    @Autowired
    private FirestopSystemRepository firestopSystemRepository;

    private String projectPath;

    private String systemsPath;

    private String systemPath;

    @BeforeEach
    void seedOneProjectWithOneSystem() {
        firestopSystemRepository.deleteAll();
        projectRepository.deleteAll();
        Project project = projectRepository.save(new Project("OLD", EXISTING_PROJECT_NAME, "1 Demo Street", true));
        FirestopSystem system = new FirestopSystem(project.getId(), "SYS-OLD");
        system.setSubstrate("Concrete floor");
        system.setServiceType("Demo metal pipe");
        system.setFireRating("-/60/60");
        system.setMaterials("Demo sealant B");
        system.setInstallationMethod("Pack the gap, then seal the surface.");
        system.setActive(true);
        FirestopSystem savedSystem = firestopSystemRepository.save(system);
        projectPath = PROJECTS_PATH + "/" + project.getId();
        systemsPath = projectPath + "/systems";
        systemPath = systemsPath + "/" + savedSystem.getId();
    }

    @Test
    @DisplayName("AC-2.1 every read endpoint without a token returns 401 'Authentication required'")
    void readsWithoutTokenAreRejected() throws Exception {
        for (String path : readPaths()) {
            mockMvc.perform(get(path))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.error", is(AUTHENTICATION_REQUIRED)));
        }
    }

    @Test
    @DisplayName("AC-2.1 every write endpoint without a token returns 401 and changes nothing")
    void writesWithoutTokenAreRejected() throws Exception {
        for (MockHttpServletRequestBuilder write : writeRequests()) {
            mockMvc.perform(write)
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.error", is(AUTHENTICATION_REQUIRED)));
        }
        assertRegisterUnchanged();
    }

    @ParameterizedTest(name = "AC-2.1 a signed-in {0} can read every read endpoint")
    @ValueSource(strings = {ADMIN, "INSPECTOR", "VIEWER"})
    void everyRoleCanRead(String role) throws Exception {
        for (String path : readPaths()) {
            mockMvc.perform(get(path).header(HttpHeaders.AUTHORIZATION, bearer(TestTokens.forRole(role))))
                    .andExpect(status().isOk());
        }
    }

    @ParameterizedTest(name = "AC-2.1 a signed-in {0} gets 403 on every write endpoint and changes nothing")
    @ValueSource(strings = {"INSPECTOR", "VIEWER"})
    void nonAdminCannotWrite(String role) throws Exception {
        for (MockHttpServletRequestBuilder write : writeRequests()) {
            mockMvc.perform(write.header(HttpHeaders.AUTHORIZATION, bearer(TestTokens.forRole(role))))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.error", is(INSUFFICIENT_PERMISSIONS)));
        }
        assertRegisterUnchanged();
    }

    @Test
    @DisplayName("AC-2.1 an admin can create a project")
    void adminCreatesProject() throws Exception {
        mockMvc.perform(json(post(PROJECTS_PATH), PROJECT_JSON).header(HttpHeaders.AUTHORIZATION, adminBearer()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code", is("NEW")));
    }

    @Test
    @DisplayName("AC-2.1 an admin can update a project")
    void adminUpdatesProject() throws Exception {
        mockMvc.perform(json(put(projectPath), PROJECT_JSON).header(HttpHeaders.AUTHORIZATION, adminBearer()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name", is("New Project")));
    }

    @Test
    @DisplayName("AC-2.1 an admin can add a system to a project")
    void adminCreatesSystem() throws Exception {
        mockMvc.perform(json(post(systemsPath), SYSTEM_JSON).header(HttpHeaders.AUTHORIZATION, adminBearer()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code", is("SYS-NEW")));
    }

    @Test
    @DisplayName("AC-2.1 an admin can update a system")
    void adminUpdatesSystem() throws Exception {
        mockMvc.perform(json(put(systemPath), SYSTEM_JSON).header(HttpHeaders.AUTHORIZATION, adminBearer()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code", is("SYS-NEW")));
    }

    @Test
    @DisplayName("AC-2.1 a valid token with an unknown role gets 403 even on a read")
    void unknownRoleIsForbidden() throws Exception {
        mockMvc.perform(get(PROJECTS_PATH).header(HttpHeaders.AUTHORIZATION, bearer(TestTokens.forRole("GUEST"))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error", is(INSUFFICIENT_PERMISSIONS)));
    }

    @Test
    @DisplayName("AC-2.1 a valid token without a role claim gets 403 even on a read")
    void missingRoleIsForbidden() throws Exception {
        mockMvc.perform(get(PROJECTS_PATH).header(HttpHeaders.AUTHORIZATION, bearer(TestTokens.withoutRole())))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error", is(INSUFFICIENT_PERMISSIONS)));
    }

    @Test
    @DisplayName("AC-2.2 a token produced by the inspection service's own JWT library is accepted for reads")
    void tokenFromNodeLibraryCanRead() throws Exception {
        mockMvc.perform(get(PROJECTS_PATH)
                        .header(HttpHeaders.AUTHORIZATION, bearer(TestTokens.ISSUED_BY_NODE_LIBRARY_FOR_ADMIN)))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("AC-2.2 a token produced by the inspection service's own JWT library carries its ADMIN role")
    void tokenFromNodeLibraryCanWriteAsAdmin() throws Exception {
        mockMvc.perform(json(post(PROJECTS_PATH), PROJECT_JSON)
                        .header(HttpHeaders.AUTHORIZATION, bearer(TestTokens.ISSUED_BY_NODE_LIBRARY_FOR_ADMIN)))
                .andExpect(status().isCreated());
    }

    @ParameterizedTest(name = "AC-2.3 {0} stays open without a token")
    @ValueSource(strings = {
        "/actuator/prometheus", "/actuator/health", "/actuator/health/readiness", "/actuator/health/liveness"})
    void operationalEndpointsStayOpen(String path) throws Exception {
        mockMvc.perform(get(path))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("AC-2.5 an expired token returns 401 'Invalid or expired token'")
    void expiredTokenIsRejected() throws Exception {
        assertInvalidToken(bearer(TestTokens.expired(ADMIN)));
    }

    @Test
    @DisplayName("AC-2.5 a token signed with a different secret returns 401 'Invalid or expired token'")
    void tokenSignedWithOtherSecretIsRejected() throws Exception {
        assertInvalidToken(bearer(TestTokens.signedWithOtherSecret(ADMIN)));
    }

    @Test
    @DisplayName("AC-2.5 an unsigned token that declares the 'none' algorithm returns 401")
    void unsignedTokenIsRejected() throws Exception {
        assertInvalidToken(bearer(TestTokens.unsigned(ADMIN)));
    }

    @Test
    @DisplayName("AC-2.5 a token whose payload was altered after signing returns 401")
    void tamperedTokenIsRejected() throws Exception {
        String[] viewerParts = TestTokens.forRole("VIEWER").split("\\.");
        String[] adminParts = TestTokens.forRole(ADMIN).split("\\.");
        String adminPayloadWithViewerSignature = viewerParts[0] + "." + adminParts[1] + "." + viewerParts[2];

        assertInvalidToken(bearer(adminPayloadWithViewerSignature));
    }

    @Test
    @DisplayName("AC-2.5 a bearer value that is not a token returns 401 'Invalid or expired token'")
    void garbageTokenIsRejected() throws Exception {
        assertInvalidToken(bearer("not-a-token"));
    }

    @Test
    @DisplayName("AC-2.5 an invalid token is rejected on writes too, and changes nothing")
    void invalidTokenCannotWrite() throws Exception {
        for (MockHttpServletRequestBuilder write : writeRequests()) {
            mockMvc.perform(write.header(HttpHeaders.AUTHORIZATION, bearer(TestTokens.expired(ADMIN))))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.error", is(INVALID_TOKEN)));
        }
        assertRegisterUnchanged();
    }

    private void assertInvalidToken(String authorization) throws Exception {
        mockMvc.perform(get(PROJECTS_PATH).header(HttpHeaders.AUTHORIZATION, authorization))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error", is(INVALID_TOKEN)));
    }

    private void assertRegisterUnchanged() {
        assertEquals(1, projectRepository.count());
        assertEquals(1, firestopSystemRepository.count());
        assertEquals(EXISTING_PROJECT_NAME, projectRepository.findAll().get(0).getName());
        assertEquals("SYS-OLD", firestopSystemRepository.findAll().get(0).getCode());
    }

    private List<String> readPaths() {
        return List.of(PROJECTS_PATH, projectPath, systemsPath, systemPath, SNAPSHOT_PATH);
    }

    private List<MockHttpServletRequestBuilder> writeRequests() {
        return List.of(
                json(post(PROJECTS_PATH), PROJECT_JSON),
                json(put(projectPath), PROJECT_JSON),
                json(post(systemsPath), SYSTEM_JSON),
                json(put(systemPath), SYSTEM_JSON));
    }

    private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder request, String body) {
        return request.contentType(MediaType.APPLICATION_JSON).content(body);
    }

    private static String adminBearer() {
        return bearer(TestTokens.forRole(ADMIN));
    }

    private static String bearer(String token) {
        return "Bearer " + token;
    }
}
