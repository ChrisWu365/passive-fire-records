package com.chris.register;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.jayway.jsonpath.JsonPath;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Sends register API requests for the integration tests and builds valid request bodies that a test can then alter.
 */
final class RegisterApiFixture {

    static final String PROJECTS_PATH = "/api/register/projects";

    static final String SNAPSHOT_PATH = "/api/register/snapshot";

    private final MockMvc mockMvc;

    private final ObjectMapper objectMapper;

    RegisterApiFixture(MockMvc mockMvc, ObjectMapper objectMapper) {
        this.mockMvc = mockMvc;
        this.objectMapper = objectMapper;
    }

    static String projectPath(String projectId) {
        return PROJECTS_PATH + "/" + projectId;
    }

    static String systemsPath(String projectId) {
        return projectPath(projectId) + "/systems";
    }

    static String systemPath(String projectId, String systemId) {
        return systemsPath(projectId) + "/" + systemId;
    }

    static Map<String, Object> projectBody(String code) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("code", code);
        body.put("name", "Project " + code);
        body.put("address", "1 Demo Street");
        return body;
    }

    static Map<String, Object> systemBody(String code) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("code", code);
        body.put("substrate", "Plasterboard wall");
        body.put("serviceType", "Demo plastic pipe up to 50 mm");
        body.put("fireRating", "-/60/60");
        body.put("materials", "Demo collar A");
        body.put("installationMethod", "Fit one collar on each side of the wall.");
        return body;
    }

    ResultActions postProject(Map<String, Object> body) throws Exception {
        return send(post(PROJECTS_PATH), body);
    }

    ResultActions putProject(String projectId, Map<String, Object> body) throws Exception {
        return send(put(projectPath(projectId)), body);
    }

    ResultActions postSystem(String projectId, Map<String, Object> body) throws Exception {
        return send(post(systemsPath(projectId)), body);
    }

    ResultActions putSystem(String projectId, String systemId, Map<String, Object> body) throws Exception {
        return send(put(systemPath(projectId, systemId)), body);
    }

    /** Creates a project that must succeed, and returns its id. */
    String createProject(String code) throws Exception {
        return idOf(postProject(projectBody(code)).andExpect(status().isCreated()));
    }

    /** Creates a system that must succeed, and returns its id. */
    String createSystem(String projectId, String code) throws Exception {
        return idOf(postSystem(projectId, systemBody(code)).andExpect(status().isCreated()));
    }

    private ResultActions send(MockHttpServletRequestBuilder request, Map<String, Object> body) throws Exception {
        return mockMvc.perform(request
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(body)));
    }

    private static String idOf(ResultActions result) throws Exception {
        return JsonPath.read(result.andReturn().getResponse().getContentAsString(), "$.id");
    }
}
