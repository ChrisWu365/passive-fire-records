package com.example.crud.register;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.Map;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Integration tests for the firestop system endpoints of the register API.
 */
class FirestopSystemApiIntegrationTest extends RegisterApiIntegrationTestBase {

    private static final int FIRE_RATING_MAX_LENGTH = 20;

    @Test
    @DisplayName("AC-1.1 adding a system returns 201 with its id, project, fields, active flag and timestamps")
    void createSystem() throws Exception {
        String projectId = api.createProject("HVA");

        api.postSystem(projectId, RegisterApiFixture.systemBody("SYS-01"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isString())
                .andExpect(jsonPath("$.projectId", is(projectId)))
                .andExpect(jsonPath("$.code", is("SYS-01")))
                .andExpect(jsonPath("$.substrate", is("Plasterboard wall")))
                .andExpect(jsonPath("$.serviceType", is("Demo plastic pipe up to 50 mm")))
                .andExpect(jsonPath("$.fireRating", is("-/60/60")))
                .andExpect(jsonPath("$.materials", is("Demo collar A")))
                .andExpect(jsonPath("$.installationMethod", is("Fit one collar on each side of the wall.")))
                .andExpect(jsonPath("$.active", is(true)))
                .andExpect(jsonPath("$.createdAt").isString())
                .andExpect(jsonPath("$.updatedAt").isString());
    }

    @Test
    @DisplayName("AC-1.1 an added system can be read by id and appears in its project's list")
    void readSystem() throws Exception {
        String projectId = api.createProject("HVA");
        String systemId = api.createSystem(projectId, "SYS-01");

        mockMvc.perform(get(RegisterApiFixture.systemPath(projectId, systemId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is(systemId)))
                .andExpect(jsonPath("$.code", is("SYS-01")));

        mockMvc.perform(get(RegisterApiFixture.systemsPath(projectId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].id", is(systemId)));
    }

    @Test
    @DisplayName("AC-1.1 editing a system changes its fields")
    void updateSystem() throws Exception {
        String projectId = api.createProject("HVA");
        String systemId = api.createSystem(projectId, "SYS-01");
        Map<String, Object> changes = RegisterApiFixture.systemBody("SYS-09");
        changes.put("substrate", "Concrete floor");
        changes.put("fireRating", "-/120/120");

        api.putSystem(projectId, systemId, changes)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is(systemId)));

        mockMvc.perform(get(RegisterApiFixture.systemPath(projectId, systemId)))
                .andExpect(jsonPath("$.code", is("SYS-09")))
                .andExpect(jsonPath("$.substrate", is("Concrete floor")))
                .andExpect(jsonPath("$.fireRating", is("-/120/120")));
    }

    @Test
    @DisplayName("AC-1.1 a deactivated system is kept: still readable and listed, with active false")
    void deactivateSystem() throws Exception {
        String projectId = api.createProject("HVA");
        String systemId = api.createSystem(projectId, "SYS-01");
        Map<String, Object> changes = RegisterApiFixture.systemBody("SYS-01");
        changes.put("active", false);

        api.putSystem(projectId, systemId, changes)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active", is(false)));

        mockMvc.perform(get(RegisterApiFixture.systemsPath(projectId)))
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].active", is(false)));
    }

    @Test
    @DisplayName("AC-1.1 a system cannot be deleted: DELETE returns 405 and the system remains")
    void deleteSystemIsNotAllowed() throws Exception {
        String projectId = api.createProject("HVA");
        String systemId = api.createSystem(projectId, "SYS-01");

        mockMvc.perform(delete(RegisterApiFixture.systemPath(projectId, systemId)))
                .andExpect(status().isMethodNotAllowed());

        mockMvc.perform(get(RegisterApiFixture.systemPath(projectId, systemId)))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("AC-1.2 a second system with the same code in the same project returns 409 and is not stored")
    void duplicateCodeInSameProjectIsRejected() throws Exception {
        String projectId = api.createProject("HVA");
        api.createSystem(projectId, "SYS-01");

        api.postSystem(projectId, RegisterApiFixture.systemBody("SYS-01"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").isNotEmpty());

        mockMvc.perform(get(RegisterApiFixture.systemsPath(projectId)))
                .andExpect(jsonPath("$", hasSize(1)));
    }

    @Test
    @DisplayName("AC-1.2 changing a system's code to another system's code in the project returns 409")
    void updateToExistingCodeIsRejected() throws Exception {
        String projectId = api.createProject("HVA");
        api.createSystem(projectId, "SYS-01");
        String secondId = api.createSystem(projectId, "SYS-02");

        api.putSystem(projectId, secondId, RegisterApiFixture.systemBody("SYS-01"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").isNotEmpty());

        mockMvc.perform(get(RegisterApiFixture.systemPath(projectId, secondId)))
                .andExpect(jsonPath("$.code", is("SYS-02")));
    }

    @Test
    @DisplayName("AC-1.2 editing a system while keeping its own code is not a duplicate")
    void updateKeepingOwnCodeIsAccepted() throws Exception {
        String projectId = api.createProject("HVA");
        String systemId = api.createSystem(projectId, "SYS-01");
        Map<String, Object> changes = RegisterApiFixture.systemBody("SYS-01");
        changes.put("materials", "Demo collar B");

        api.putSystem(projectId, systemId, changes)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.materials", is("Demo collar B")));
    }

    @Test
    @DisplayName("AC-1.3 the same system code is accepted in two different projects")
    void sameCodeInTwoProjectsIsAccepted() throws Exception {
        String firstProjectId = api.createProject("HVA");
        String secondProjectId = api.createProject("HVB");

        api.postSystem(firstProjectId, RegisterApiFixture.systemBody("SYS-01")).andExpect(status().isCreated());
        api.postSystem(secondProjectId, RegisterApiFixture.systemBody("SYS-01")).andExpect(status().isCreated());

        mockMvc.perform(get(RegisterApiFixture.systemsPath(firstProjectId)))
                .andExpect(jsonPath("$", hasSize(1)));
        mockMvc.perform(get(RegisterApiFixture.systemsPath(secondProjectId)))
                .andExpect(jsonPath("$", hasSize(1)));
    }

    @ParameterizedTest(name = "AC-1.4 a system without {0} returns 400 with a message for that field")
    @ValueSource(strings = {"code", "substrate", "serviceType", "fireRating", "materials", "installationMethod"})
    void missingRequiredFieldIsRejected(String field) throws Exception {
        String projectId = api.createProject("HVA");
        Map<String, Object> body = RegisterApiFixture.systemBody("SYS-01");
        body.remove(field);

        api.postSystem(projectId, body)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").isNotEmpty())
                .andExpect(jsonPath("$.fields." + field).isNotEmpty());

        mockMvc.perform(get(RegisterApiFixture.systemsPath(projectId)))
                .andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    @DisplayName("AC-1.4 a system code with lower-case letters or spaces returns 400 for the code field")
    void malformedCodeIsRejected() throws Exception {
        String projectId = api.createProject("HVA");

        api.postSystem(projectId, RegisterApiFixture.systemBody("sys 01"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.code").isNotEmpty());
    }

    @Test
    @DisplayName("AC-1.4 a fire rating longer than 20 characters returns 400 for the fireRating field")
    void tooLongFireRatingIsRejected() throws Exception {
        String projectId = api.createProject("HVA");
        Map<String, Object> body = RegisterApiFixture.systemBody("SYS-01");
        body.put("fireRating", "6".repeat(FIRE_RATING_MAX_LENGTH + 1));

        api.postSystem(projectId, body)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.fireRating").isNotEmpty());
    }

    @Test
    @DisplayName("AC-1.4 an invalid system update returns 400 and leaves the system unchanged")
    void invalidUpdateChangesNothing() throws Exception {
        String projectId = api.createProject("HVA");
        String systemId = api.createSystem(projectId, "SYS-01");
        Map<String, Object> changes = RegisterApiFixture.systemBody("SYS-09");
        changes.put("substrate", "");

        api.putSystem(projectId, systemId, changes)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.substrate").isNotEmpty());

        mockMvc.perform(get(RegisterApiFixture.systemPath(projectId, systemId)))
                .andExpect(jsonPath("$.code", is("SYS-01")));
    }

    @Test
    @DisplayName("AC-1.8 adding a system to an unknown project returns 404 with an error message")
    void createUnderUnknownProject() throws Exception {
        api.postSystem(UNKNOWN_ID, RegisterApiFixture.systemBody("SYS-01"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error", is("Project not found")));
    }

    @Test
    @DisplayName("AC-1.8 listing the systems of an unknown project returns 404 with an error message")
    void listUnderUnknownProject() throws Exception {
        mockMvc.perform(get(RegisterApiFixture.systemsPath(UNKNOWN_ID)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error", is("Project not found")));
    }

    @Test
    @DisplayName("AC-1.8 reading an unknown system returns 404 with an error message")
    void readUnknownSystem() throws Exception {
        String projectId = api.createProject("HVA");

        mockMvc.perform(get(RegisterApiFixture.systemPath(projectId, UNKNOWN_ID)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error", is("Firestop system not found")));
    }

    @Test
    @DisplayName("AC-1.8 a system requested or updated under a different project returns 404")
    void systemUnderDifferentProject() throws Exception {
        String ownerProjectId = api.createProject("HVA");
        String otherProjectId = api.createProject("HVB");
        String systemId = api.createSystem(ownerProjectId, "SYS-01");

        mockMvc.perform(get(RegisterApiFixture.systemPath(otherProjectId, systemId)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error", is("Firestop system not found")));
        api.putSystem(otherProjectId, systemId, RegisterApiFixture.systemBody("SYS-09"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error", is("Firestop system not found")));

        mockMvc.perform(get(RegisterApiFixture.systemPath(ownerProjectId, systemId)))
                .andExpect(jsonPath("$.code", is("SYS-01")));
    }
}
