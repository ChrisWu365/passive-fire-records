package com.chris.register;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Integration tests for the snapshot endpoint, which the web app downloads for offline use.
 */
class RegisterSnapshotApiIntegrationTest extends RegisterApiIntegrationTestBase {

    @Test
    @DisplayName("AC-1.7 the snapshot of an empty register has a generation time and no projects")
    void emptySnapshot() throws Exception {
        mockMvc.perform(get(RegisterApiFixture.SNAPSHOT_PATH))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.generatedAt").isString())
                .andExpect(jsonPath("$.projects", hasSize(0)));
    }

    @Test
    @DisplayName("AC-1.7 the snapshot returns each active project with its active systems and their details")
    void snapshotContainsActiveProjectsWithActiveSystems() throws Exception {
        String projectId = api.createProject("HVA");
        String systemId = api.createSystem(projectId, "SYS-01");

        mockMvc.perform(get(RegisterApiFixture.SNAPSHOT_PATH))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.generatedAt").isString())
                .andExpect(jsonPath("$.projects", hasSize(1)))
                .andExpect(jsonPath("$.projects[0].id", is(projectId)))
                .andExpect(jsonPath("$.projects[0].code", is("HVA")))
                .andExpect(jsonPath("$.projects[0].name", is("Project HVA")))
                .andExpect(jsonPath("$.projects[0].address", is("1 Demo Street")))
                .andExpect(jsonPath("$.projects[0].systems", hasSize(1)))
                .andExpect(jsonPath("$.projects[0].systems[0].id", is(systemId)))
                .andExpect(jsonPath("$.projects[0].systems[0].code", is("SYS-01")))
                .andExpect(jsonPath("$.projects[0].systems[0].substrate", is("Plasterboard wall")))
                .andExpect(jsonPath("$.projects[0].systems[0].serviceType", is("Demo plastic pipe up to 50 mm")))
                .andExpect(jsonPath("$.projects[0].systems[0].fireRating", is("-/60/60")))
                .andExpect(jsonPath("$.projects[0].systems[0].materials", is("Demo collar A")))
                .andExpect(jsonPath("$.projects[0].systems[0].installationMethod",
                        is("Fit one collar on each side of the wall.")));
    }

    @Test
    @DisplayName("AC-1.7 the snapshot leaves out inactive systems and inactive projects with all their systems")
    void snapshotLeavesOutInactiveData() throws Exception {
        String activeProjectId = api.createProject("HVA");
        api.createSystem(activeProjectId, "SYS-01");
        deactivateSystem(activeProjectId, api.createSystem(activeProjectId, "SYS-02"), "SYS-02");
        String inactiveProjectId = api.createProject("OLD");
        api.createSystem(inactiveProjectId, "SYS-01");
        deactivateProject(inactiveProjectId, "OLD");

        mockMvc.perform(get(RegisterApiFixture.SNAPSHOT_PATH))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.projects", hasSize(1)))
                .andExpect(jsonPath("$.projects[0].code", is("HVA")))
                .andExpect(jsonPath("$.projects[0].systems", hasSize(1)))
                .andExpect(jsonPath("$.projects[0].systems[0].code", is("SYS-01")));
    }

    @Test
    @DisplayName("AC-1.7 an active project with no systems appears in the snapshot with an empty systems list")
    void snapshotContainsProjectWithoutSystems() throws Exception {
        api.createProject("HVA");

        mockMvc.perform(get(RegisterApiFixture.SNAPSHOT_PATH))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.projects", hasSize(1)))
                .andExpect(jsonPath("$.projects[0].systems", hasSize(0)));
    }

    private void deactivateProject(String projectId, String code) throws Exception {
        Map<String, Object> changes = RegisterApiFixture.projectBody(code);
        changes.put("active", false);
        api.putProject(projectId, changes).andExpect(status().isOk());
    }

    private void deactivateSystem(String projectId, String systemId, String code) throws Exception {
        Map<String, Object> changes = RegisterApiFixture.systemBody(code);
        changes.put("active", false);
        api.putSystem(projectId, systemId, changes).andExpect(status().isOk());
    }
}
