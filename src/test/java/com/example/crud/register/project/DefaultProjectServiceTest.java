package com.example.crud.register.project;

import com.example.crud.register.error.DuplicateCodeException;
import com.example.crud.register.error.ResourceNotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for the project rules. No Spring context and no database: the repository is a Mockito mock.
 */
@ExtendWith(MockitoExtension.class)
class DefaultProjectServiceTest {

    private static final UUID PROJECT_ID = UUID.fromString("11111111-1111-1111-1111-111111111111");

    private static final String CODE = "HVA";

    private static final String NAME = "Harbour View Apartments";

    private static final String ADDRESS = "1 Quay Street";

    @Mock
    private ProjectRepository projectRepository;

    private DefaultProjectService projectService;

    @BeforeEach
    void setUp() {
        projectService = new DefaultProjectService(projectRepository);
    }

    @Test
    @DisplayName("AC-1.1 create stores a new project as active and returns it")
    void createStoresActiveProject() {
        when(projectRepository.save(any(Project.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ProjectResponse response = projectService.create(new ProjectRequest(CODE, NAME, ADDRESS, null));

        assertEquals(CODE, response.code());
        assertEquals(NAME, response.name());
        assertEquals(ADDRESS, response.address());
        assertTrue(response.active());
        assertTrue(savedProject().isActive());
    }

    @Test
    @DisplayName("AC-1.1 findAll returns every project, active or not")
    void findAllReturnsEveryProject() {
        Project inactive = existingProject("OLD", false);
        when(projectRepository.findAllByOrderByCodeAsc()).thenReturn(List.of(existingProject(CODE, true), inactive));

        List<ProjectResponse> responses = projectService.findAll();

        assertEquals(List.of(CODE, "OLD"), responses.stream().map(ProjectResponse::code).toList());
        assertFalse(responses.get(1).active());
    }

    @Test
    @DisplayName("AC-1.1 update changes the project's fields")
    void updateChangesFields() {
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.of(existingProject(CODE, true)));
        when(projectRepository.save(any(Project.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ProjectResponse response = projectService.update(
                PROJECT_ID, new ProjectRequest("HVB", "Harbour View Block B", "2 Quay Street", true));

        assertEquals(PROJECT_ID, response.id());
        assertEquals("HVB", response.code());
        assertEquals("Harbour View Block B", response.name());
        assertEquals("2 Quay Street", response.address());
    }

    @Test
    @DisplayName("AC-1.1 deactivating a project keeps it stored and never deletes it")
    void deactivateKeepsProject() {
        Project existing = existingProject(CODE, true);
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.of(existing));
        when(projectRepository.save(any(Project.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ProjectResponse response = projectService.update(PROJECT_ID, new ProjectRequest(CODE, NAME, ADDRESS, false));

        assertFalse(response.active());
        assertFalse(savedProject().isActive());
        verify(projectRepository, never()).delete(any(Project.class));
        verify(projectRepository, never()).deleteById(any(UUID.class));
    }

    @Test
    @DisplayName("AC-1.1 update without an active flag leaves the project's active state unchanged")
    void updateWithoutActiveFlagKeepsState() {
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.of(existingProject(CODE, false)));
        when(projectRepository.save(any(Project.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ProjectResponse response = projectService.update(PROJECT_ID, new ProjectRequest(CODE, NAME, ADDRESS, null));

        assertFalse(response.active());
    }

    @Test
    @DisplayName("AC-1.8 findById fails with not-found for an unknown project")
    void findByIdUnknownProject() {
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class, () -> projectService.findById(PROJECT_ID));
    }

    @Test
    @DisplayName("AC-1.8 update fails with not-found for an unknown project and stores nothing")
    void updateUnknownProject() {
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class,
                () -> projectService.update(PROJECT_ID, new ProjectRequest(CODE, NAME, ADDRESS, true)));

        verify(projectRepository, never()).save(any(Project.class));
    }

    @Test
    @DisplayName("AC-1.9 create rejects a code that another project already uses and stores nothing")
    void createRejectsDuplicateCode() {
        when(projectRepository.existsByCode(CODE)).thenReturn(true);

        assertThrows(DuplicateCodeException.class,
                () -> projectService.create(new ProjectRequest(CODE, NAME, ADDRESS, null)));

        verify(projectRepository, never()).save(any(Project.class));
    }

    @Test
    @DisplayName("AC-1.9 update rejects a code that another project already uses and stores nothing")
    void updateRejectsCodeOfAnotherProject() {
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.of(existingProject(CODE, true)));
        when(projectRepository.existsByCodeAndIdNot("TAKEN", PROJECT_ID)).thenReturn(true);

        assertThrows(DuplicateCodeException.class,
                () -> projectService.update(PROJECT_ID, new ProjectRequest("TAKEN", NAME, ADDRESS, true)));

        verify(projectRepository, never()).save(any(Project.class));
    }

    private Project savedProject() {
        ArgumentCaptor<Project> captor = ArgumentCaptor.forClass(Project.class);
        verify(projectRepository).save(captor.capture());
        return captor.getValue();
    }

    private static Project existingProject(String code, boolean active) {
        Project project = new Project(code, NAME, ADDRESS, active);
        ReflectionTestUtils.setField(project, "id", PROJECT_ID);
        return project;
    }
}
