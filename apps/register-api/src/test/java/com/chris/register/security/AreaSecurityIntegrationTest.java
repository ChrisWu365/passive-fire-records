package com.chris.register.security;

import com.chris.register.area.Area;
import com.chris.register.area.AreaRepository;
import com.chris.register.firestop.FirestopSystemRepository;
import com.chris.register.project.Project;
import com.chris.register.project.ProjectRepository;
import org.junit.jupiter.api.AfterEach;
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
 * Integration tests for who may read and change a project's areas. Requests carry real token strings, so
 * the service's own token verification runs; nothing about security is mocked.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AreaSecurityIntegrationTest {

    private static final String ADMIN = "ADMIN";

    private static final String EXISTING_AREA_NAME = "Level 1";

    private static final String AREA_JSON = "{\"name\":\"Level 9\"}";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ProjectRepository projectRepository;

    @Autowired
    private FirestopSystemRepository firestopSystemRepository;

    @Autowired
    private AreaRepository areaRepository;

    private String areasPath;

    private String areaPath;

    @BeforeEach
    void seedOneProjectWithOneArea() {
        areaRepository.deleteAll();
        firestopSystemRepository.deleteAll();
        projectRepository.deleteAll();
        Project project = projectRepository.save(new Project("OLD", "Existing Project", "1 Demo Street", true));
        Area area = areaRepository.save(new Area(project.getId(), EXISTING_AREA_NAME, true));
        areasPath = "/api/register/projects/" + project.getId() + "/areas";
        areaPath = areasPath + "/" + area.getId();
    }

    /** Areas refer to projects, so they are removed before another test class empties the project table. */
    @AfterEach
    void removeAreas() {
        areaRepository.deleteAll();
    }

    @Test
    @DisplayName("AC-9.1 the area endpoints without a token return 401 and change nothing")
    void requestsWithoutTokenAreRejected() throws Exception {
        for (String path : List.of(areasPath, areaPath)) {
            mockMvc.perform(get(path))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.error", is("Authentication required")));
        }
        for (MockHttpServletRequestBuilder write : writeRequests()) {
            mockMvc.perform(write)
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.error", is("Authentication required")));
        }
        assertAreasUnchanged();
    }

    @ParameterizedTest(name = "AC-9.1 a signed-in {0} can read a project''s areas")
    @ValueSource(strings = {ADMIN, "INSPECTOR", "VIEWER"})
    void everyRoleCanRead(String role) throws Exception {
        for (String path : List.of(areasPath, areaPath)) {
            mockMvc.perform(get(path).header(HttpHeaders.AUTHORIZATION, bearer(role)))
                    .andExpect(status().isOk());
        }
    }

    @ParameterizedTest(name = "AC-9.1 a signed-in {0} gets 403 on adding or changing an area and changes nothing")
    @ValueSource(strings = {"INSPECTOR", "VIEWER"})
    void nonAdminCannotWrite(String role) throws Exception {
        for (MockHttpServletRequestBuilder write : writeRequests()) {
            mockMvc.perform(write.header(HttpHeaders.AUTHORIZATION, bearer(role)))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.error", is("Insufficient permissions")));
        }
        assertAreasUnchanged();
    }

    @Test
    @DisplayName("AC-9.1 an admin can add an area and change one")
    void adminCanWrite() throws Exception {
        mockMvc.perform(json(put(areaPath)).header(HttpHeaders.AUTHORIZATION, bearer(ADMIN)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name", is("Level 9")));
        mockMvc.perform(post(areasPath).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Level 10\"}")
                        .header(HttpHeaders.AUTHORIZATION, bearer(ADMIN)))
                .andExpect(status().isCreated());

        assertEquals(2, areaRepository.count());
    }

    private void assertAreasUnchanged() {
        assertEquals(1, areaRepository.count());
        assertEquals(EXISTING_AREA_NAME, areaRepository.findAll().get(0).getName());
    }

    private List<MockHttpServletRequestBuilder> writeRequests() {
        return List.of(json(post(areasPath)), json(put(areaPath)));
    }

    private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder request) {
        return request.contentType(MediaType.APPLICATION_JSON).content(AREA_JSON);
    }

    private static String bearer(String role) {
        return "Bearer " + TestTokens.forRole(role);
    }
}
