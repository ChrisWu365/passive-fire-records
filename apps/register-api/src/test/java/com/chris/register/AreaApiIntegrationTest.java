package com.chris.register;

import com.chris.register.area.AreaRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Integration tests for the area endpoints of the register API, and for areas in the offline snapshot.
 */
class AreaApiIntegrationTest extends RegisterApiIntegrationTestBase {

    private static final int NAME_MAX_LENGTH = 100;

    private static final String LEVEL_3 = "Level 3";

    private static final String BASEMENT = "Basement car park";

    private static final ObjectMapper JSON = new ObjectMapper();

    @Autowired
    private AreaRepository areaRepository;

    /** Areas refer to projects, so they are removed before the shared setup empties the project table. */
    @AfterEach
    void removeAreas() {
        areaRepository.deleteAll();
    }

    @Test
    @DisplayName("AC-9.1 adding an area returns 201 with its id, project, name, active flag and timestamps")
    void createArea() throws Exception {
        String projectId = api.createProject("HVA");

        postArea(projectId, areaBody(LEVEL_3))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isString())
                .andExpect(jsonPath("$.projectId", is(projectId)))
                .andExpect(jsonPath("$.name", is(LEVEL_3)))
                .andExpect(jsonPath("$.active", is(true)))
                .andExpect(jsonPath("$.createdAt").isString())
                .andExpect(jsonPath("$.updatedAt").isString());
    }

    @Test
    @DisplayName("AC-9.1 an added area can be read by id, and the project's areas are listed in name order")
    void readAreas() throws Exception {
        String projectId = api.createProject("HVA");
        String levelId = createArea(projectId, LEVEL_3);
        createArea(projectId, BASEMENT);

        mockMvc.perform(get(areaPath(projectId, levelId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is(levelId)))
                .andExpect(jsonPath("$.name", is(LEVEL_3)));

        mockMvc.perform(get(areasPath(projectId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].name", contains(BASEMENT, LEVEL_3)));
    }

    @Test
    @DisplayName("AC-9.1 renaming an area changes its name and keeps its id")
    void renameArea() throws Exception {
        String projectId = api.createProject("HVA");
        String areaId = createArea(projectId, LEVEL_3);

        putArea(projectId, areaId, areaBody("Level 3 east"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is(areaId)));

        mockMvc.perform(get(areaPath(projectId, areaId)))
                .andExpect(jsonPath("$.name", is("Level 3 east")));
    }

    @Test
    @DisplayName("AC-9.1 a deactivated area is kept and listed with active false, and can be reactivated")
    void deactivateAndReactivateArea() throws Exception {
        String projectId = api.createProject("HVA");
        String areaId = createArea(projectId, LEVEL_3);

        putArea(projectId, areaId, areaBody(LEVEL_3, false))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active", is(false)));
        mockMvc.perform(get(areasPath(projectId)))
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].active", is(false)));

        putArea(projectId, areaId, areaBody(LEVEL_3, true))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active", is(true)));
    }

    @Test
    @DisplayName("AC-9.1 an area cannot be deleted: DELETE returns 405 and the area remains")
    void deleteAreaIsNotAllowed() throws Exception {
        String projectId = api.createProject("HVA");
        String areaId = createArea(projectId, LEVEL_3);

        mockMvc.perform(delete(areaPath(projectId, areaId)))
                .andExpect(status().isMethodNotAllowed());

        mockMvc.perform(get(areaPath(projectId, areaId)))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("AC-9.1 a second area with the same name in the same project returns 409 and is not stored")
    void duplicateNameInSameProjectIsRejected() throws Exception {
        String projectId = api.createProject("HVA");
        createArea(projectId, LEVEL_3);

        postArea(projectId, areaBody(LEVEL_3))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error", is("The project already has an area named Level 3")));

        mockMvc.perform(get(areasPath(projectId)))
                .andExpect(jsonPath("$", hasSize(1)));
    }

    @Test
    @DisplayName("AC-9.1 renaming an area to another area's name in the project returns 409 and changes nothing")
    void renameToExistingNameIsRejected() throws Exception {
        String projectId = api.createProject("HVA");
        createArea(projectId, LEVEL_3);
        String basementId = createArea(projectId, BASEMENT);

        putArea(projectId, basementId, areaBody(LEVEL_3))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").isNotEmpty());

        mockMvc.perform(get(areaPath(projectId, basementId)))
                .andExpect(jsonPath("$.name", is(BASEMENT)));
    }

    @Test
    @DisplayName("AC-9.1 updating an area while keeping its own name is not a duplicate")
    void updateKeepingOwnNameIsAccepted() throws Exception {
        String projectId = api.createProject("HVA");
        String areaId = createArea(projectId, LEVEL_3);

        putArea(projectId, areaId, areaBody(LEVEL_3))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name", is(LEVEL_3)));
    }

    @Test
    @DisplayName("AC-9.1 the same area name is accepted in two different projects")
    void sameNameInTwoProjectsIsAccepted() throws Exception {
        String firstProjectId = api.createProject("HVA");
        String secondProjectId = api.createProject("HVB");

        postArea(firstProjectId, areaBody(LEVEL_3)).andExpect(status().isCreated());
        postArea(secondProjectId, areaBody(LEVEL_3)).andExpect(status().isCreated());

        mockMvc.perform(get(areasPath(firstProjectId))).andExpect(jsonPath("$", hasSize(1)));
        mockMvc.perform(get(areasPath(secondProjectId))).andExpect(jsonPath("$", hasSize(1)));
    }

    @Test
    @DisplayName("AC-9.1 an area without a name returns 400 with a message for the name field")
    void missingNameIsRejected() throws Exception {
        String projectId = api.createProject("HVA");

        postArea(projectId, new LinkedHashMap<>())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").isNotEmpty())
                .andExpect(jsonPath("$.fields.name").isNotEmpty());

        mockMvc.perform(get(areasPath(projectId)))
                .andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    @DisplayName("AC-9.1 a blank name, or one longer than 100 characters, returns 400 for the name field")
    void invalidNameIsRejected() throws Exception {
        String projectId = api.createProject("HVA");

        postArea(projectId, areaBody("   "))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.name").isNotEmpty());
        postArea(projectId, areaBody("L".repeat(NAME_MAX_LENGTH + 1)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.name").isNotEmpty());
    }

    @Test
    @DisplayName("AC-9.1 adding or listing areas under an unknown project returns 404 'Project not found'")
    void unknownProject() throws Exception {
        postArea(UNKNOWN_ID, areaBody(LEVEL_3))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error", is("Project not found")));

        mockMvc.perform(get(areasPath(UNKNOWN_ID)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error", is("Project not found")));
    }

    @Test
    @DisplayName("AC-9.1 an unknown area, or an area requested under a different project, returns 404")
    void unknownAreaOrWrongProject() throws Exception {
        String ownerProjectId = api.createProject("HVA");
        String otherProjectId = api.createProject("HVB");
        String areaId = createArea(ownerProjectId, LEVEL_3);

        mockMvc.perform(get(areaPath(ownerProjectId, UNKNOWN_ID)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error", is("Area not found")));
        mockMvc.perform(get(areaPath(otherProjectId, areaId)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error", is("Area not found")));
        putArea(otherProjectId, areaId, areaBody("Renamed"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error", is("Area not found")));

        mockMvc.perform(get(areaPath(ownerProjectId, areaId)))
                .andExpect(jsonPath("$.name", is(LEVEL_3)));
    }

    @Test
    @DisplayName("AC-9.2 the snapshot returns each active project's active areas with id and name, in name order")
    void snapshotContainsActiveAreas() throws Exception {
        String projectId = api.createProject("HVA");
        String levelId = createArea(projectId, LEVEL_3);
        String basementId = createArea(projectId, BASEMENT);

        mockMvc.perform(get(RegisterApiFixture.SNAPSHOT_PATH))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.projects", hasSize(1)))
                .andExpect(jsonPath("$.projects[0].areas", hasSize(2)))
                .andExpect(jsonPath("$.projects[0].areas[0].id", is(basementId)))
                .andExpect(jsonPath("$.projects[0].areas[0].name", is(BASEMENT)))
                .andExpect(jsonPath("$.projects[0].areas[1].id", is(levelId)))
                .andExpect(jsonPath("$.projects[0].areas[1].name", is(LEVEL_3)));
    }

    @Test
    @DisplayName("AC-9.2 the snapshot leaves out inactive areas, and the areas of inactive projects")
    void snapshotLeavesOutInactiveAreas() throws Exception {
        String activeProjectId = api.createProject("HVA");
        createArea(activeProjectId, LEVEL_3);
        String retiredAreaId = createArea(activeProjectId, BASEMENT);
        putArea(activeProjectId, retiredAreaId, areaBody(BASEMENT, false)).andExpect(status().isOk());
        String inactiveProjectId = api.createProject("OLD");
        createArea(inactiveProjectId, LEVEL_3);
        Map<String, Object> inactiveProject = RegisterApiFixture.projectBody("OLD");
        inactiveProject.put("active", false);
        api.putProject(inactiveProjectId, inactiveProject).andExpect(status().isOk());

        mockMvc.perform(get(RegisterApiFixture.SNAPSHOT_PATH))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.projects", hasSize(1)))
                .andExpect(jsonPath("$.projects[0].code", is("HVA")))
                .andExpect(jsonPath("$.projects[0].areas[*].name", contains(LEVEL_3)));
    }

    @Test
    @DisplayName("AC-9.2 a project with no areas appears in the snapshot with an empty areas list")
    void snapshotContainsProjectWithoutAreas() throws Exception {
        api.createProject("HVA");

        mockMvc.perform(get(RegisterApiFixture.SNAPSHOT_PATH))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.projects[0].areas", hasSize(0)));
    }

    @Test
    @DisplayName("AC-9.2 a project's areas appear only under that project in the snapshot")
    void snapshotKeepsAreasWithTheirProject() throws Exception {
        String firstProjectId = api.createProject("HVA");
        String secondProjectId = api.createProject("HVB");
        createArea(firstProjectId, LEVEL_3);
        createArea(secondProjectId, BASEMENT);

        mockMvc.perform(get(RegisterApiFixture.SNAPSHOT_PATH))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.projects[0].code", is("HVA")))
                .andExpect(jsonPath("$.projects[0].areas[*].name", contains(LEVEL_3)))
                .andExpect(jsonPath("$.projects[1].code", is("HVB")))
                .andExpect(jsonPath("$.projects[1].areas[*].name", contains(BASEMENT)));
    }

    private static String areasPath(String projectId) {
        return RegisterApiFixture.projectPath(projectId) + "/areas";
    }

    private static String areaPath(String projectId, String areaId) {
        return areasPath(projectId) + "/" + areaId;
    }

    private static Map<String, Object> areaBody(String name) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", name);
        return body;
    }

    private static Map<String, Object> areaBody(String name, boolean active) {
        Map<String, Object> body = areaBody(name);
        body.put("active", active);
        return body;
    }

    private ResultActions postArea(String projectId, Map<String, Object> body) throws Exception {
        return mockMvc.perform(post(areasPath(projectId))
                .contentType(MediaType.APPLICATION_JSON)
                .content(JSON.writeValueAsString(body)));
    }

    private ResultActions putArea(String projectId, String areaId, Map<String, Object> body) throws Exception {
        return mockMvc.perform(put(areaPath(projectId, areaId))
                .contentType(MediaType.APPLICATION_JSON)
                .content(JSON.writeValueAsString(body)));
    }

    /** Creates an area that must succeed, and returns its id. */
    private String createArea(String projectId, String name) throws Exception {
        String response = postArea(projectId, areaBody(name))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(response, "$.id");
    }
}
