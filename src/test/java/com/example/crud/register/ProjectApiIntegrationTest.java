package com.example.crud.register;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.util.Map;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Integration tests for the project endpoints of the register API.
 */
class ProjectApiIntegrationTest extends RegisterApiIntegrationTestBase {

    private static final int NAME_MAX_LENGTH = 100;

    @Test
    @DisplayName("AC-1.1 creating a project returns 201 with its id, fields, active flag and timestamps")
    void createProject() throws Exception {
        api.postProject(RegisterApiFixture.projectBody("HVA"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isString())
                .andExpect(jsonPath("$.code", is("HVA")))
                .andExpect(jsonPath("$.name", is("Project HVA")))
                .andExpect(jsonPath("$.address", is("1 Demo Street")))
                .andExpect(jsonPath("$.active", is(true)))
                .andExpect(jsonPath("$.createdAt").isString())
                .andExpect(jsonPath("$.updatedAt").isString());
    }

    @Test
    @DisplayName("AC-1.1 a created project can be read by id and appears in the list")
    void readProject() throws Exception {
        String projectId = api.createProject("HVA");

        mockMvc.perform(get(RegisterApiFixture.projectPath(projectId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is(projectId)))
                .andExpect(jsonPath("$.code", is("HVA")));

        mockMvc.perform(get(RegisterApiFixture.PROJECTS_PATH))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].id", is(projectId)));
    }

    @Test
    @DisplayName("AC-1.1 updating a project changes its fields")
    void updateProject() throws Exception {
        String projectId = api.createProject("HVA");
        Map<String, Object> changes = RegisterApiFixture.projectBody("HVB");
        changes.put("name", "Harbour View Block B");
        changes.put("address", "2 Quay Street");

        api.putProject(projectId, changes)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is(projectId)))
                .andExpect(jsonPath("$.code", is("HVB")));

        mockMvc.perform(get(RegisterApiFixture.projectPath(projectId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code", is("HVB")))
                .andExpect(jsonPath("$.name", is("Harbour View Block B")))
                .andExpect(jsonPath("$.address", is("2 Quay Street")));
    }

    @Test
    @DisplayName("AC-1.1 a deactivated project is kept: still readable and listed, with active false")
    void deactivateProject() throws Exception {
        String projectId = api.createProject("HVA");
        Map<String, Object> changes = RegisterApiFixture.projectBody("HVA");
        changes.put("active", false);

        api.putProject(projectId, changes)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active", is(false)));

        mockMvc.perform(get(RegisterApiFixture.projectPath(projectId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active", is(false)));
        mockMvc.perform(get(RegisterApiFixture.PROJECTS_PATH))
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].active", is(false)));
    }

    @Test
    @DisplayName("AC-1.1 a project cannot be deleted: DELETE returns 405 and the project remains")
    void deleteProjectIsNotAllowed() throws Exception {
        String projectId = api.createProject("HVA");

        mockMvc.perform(delete(RegisterApiFixture.projectPath(projectId)))
                .andExpect(status().isMethodNotAllowed());

        mockMvc.perform(get(RegisterApiFixture.projectPath(projectId)))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("AC-1.4 a blank project name returns 400 with a message for the name field")
    void blankNameIsRejected() throws Exception {
        Map<String, Object> body = RegisterApiFixture.projectBody("HVA");
        body.put("name", "   ");

        api.postProject(body)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").isNotEmpty())
                .andExpect(jsonPath("$.fields.name").isNotEmpty());
    }

    @Test
    @DisplayName("AC-1.4 a missing project code returns 400 with a message for the code field")
    void missingCodeIsRejected() throws Exception {
        Map<String, Object> body = RegisterApiFixture.projectBody("HVA");
        body.remove("code");

        api.postProject(body)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.code").isNotEmpty());
    }

    @Test
    @DisplayName("AC-1.4 a project code with lower-case letters or spaces returns 400 for the code field")
    void malformedCodeIsRejected() throws Exception {
        api.postProject(RegisterApiFixture.projectBody("hva 1"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.code").isNotEmpty());
    }

    @Test
    @DisplayName("AC-1.4 a project name longer than 100 characters returns 400 for the name field")
    void tooLongNameIsRejected() throws Exception {
        Map<String, Object> body = RegisterApiFixture.projectBody("HVA");
        body.put("name", "x".repeat(NAME_MAX_LENGTH + 1));

        api.postProject(body)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.name").isNotEmpty());
    }

    @Test
    @DisplayName("AC-1.4 every invalid field of a project is reported in the same 400 response")
    void allInvalidFieldsAreReported() throws Exception {
        Map<String, Object> body = RegisterApiFixture.projectBody("hva 1");
        body.put("name", "");

        api.postProject(body)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.code").isNotEmpty())
                .andExpect(jsonPath("$.fields.name").isNotEmpty());
    }

    @Test
    @DisplayName("AC-1.4 an invalid project update returns 400 and leaves the project unchanged")
    void invalidUpdateChangesNothing() throws Exception {
        String projectId = api.createProject("HVA");
        Map<String, Object> changes = RegisterApiFixture.projectBody("HVB");
        changes.put("name", "");

        api.putProject(projectId, changes)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.name").isNotEmpty());

        mockMvc.perform(get(RegisterApiFixture.projectPath(projectId)))
                .andExpect(jsonPath("$.code", is("HVA")))
                .andExpect(jsonPath("$.name", is("Project HVA")));
    }

    @Test
    @DisplayName("AC-1.4 a request body that is not valid JSON returns 400 with an error message")
    void unreadableBodyIsRejected() throws Exception {
        mockMvc.perform(post(RegisterApiFixture.PROJECTS_PATH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{ not json"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").isNotEmpty());
    }

    @Test
    @DisplayName("AC-1.4 a project id that is not a UUID returns 400 with an error message")
    void malformedIdIsRejected() throws Exception {
        mockMvc.perform(get(RegisterApiFixture.projectPath("not-a-uuid")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").isNotEmpty());
    }

    @Test
    @DisplayName("AC-1.8 reading an unknown project returns 404 with an error message")
    void readUnknownProject() throws Exception {
        mockMvc.perform(get(RegisterApiFixture.projectPath(UNKNOWN_ID)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error", is("Project not found")));
    }

    @Test
    @DisplayName("AC-1.8 updating an unknown project returns 404 with an error message")
    void updateUnknownProject() throws Exception {
        api.putProject(UNKNOWN_ID, RegisterApiFixture.projectBody("HVA"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error", is("Project not found")));
    }

    @Test
    @DisplayName("AC-1.9 a second project with an existing code returns 409 and is not stored")
    void duplicateCodeIsRejected() throws Exception {
        api.createProject("HVA");

        api.postProject(RegisterApiFixture.projectBody("HVA"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").isNotEmpty());

        mockMvc.perform(get(RegisterApiFixture.PROJECTS_PATH))
                .andExpect(jsonPath("$", hasSize(1)));
    }

    @Test
    @DisplayName("AC-1.9 changing a project's code to another project's code returns 409 and changes nothing")
    void updateToExistingCodeIsRejected() throws Exception {
        api.createProject("HVA");
        String secondId = api.createProject("HVB");

        api.putProject(secondId, RegisterApiFixture.projectBody("HVA"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").isNotEmpty());

        mockMvc.perform(get(RegisterApiFixture.projectPath(secondId)))
                .andExpect(jsonPath("$.code", is("HVB")));
    }
}
