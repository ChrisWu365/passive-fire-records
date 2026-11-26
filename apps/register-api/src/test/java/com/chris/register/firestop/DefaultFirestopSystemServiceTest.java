package com.chris.register.firestop;

import com.chris.register.error.DuplicateCodeException;
import com.chris.register.error.ResourceNotFoundException;
import com.chris.register.project.ProjectRepository;
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
 * Unit tests for the firestop system rules. No Spring context and no database: both repositories are Mockito mocks.
 */
@ExtendWith(MockitoExtension.class)
class DefaultFirestopSystemServiceTest {

    private static final UUID PROJECT_ID = UUID.fromString("11111111-1111-1111-1111-111111111111");

    private static final UUID OTHER_PROJECT_ID = UUID.fromString("22222222-2222-2222-2222-222222222222");

    private static final UUID SYSTEM_ID = UUID.fromString("33333333-3333-3333-3333-333333333333");

    private static final String CODE = "SYS-01";

    private static final String SUBSTRATE = "Plasterboard wall";

    private static final String SERVICE_TYPE = "Demo plastic pipe up to 50 mm";

    private static final String FIRE_RATING = "-/60/60";

    private static final String MATERIALS = "Demo collar A";

    private static final String METHOD = "Fit one collar on each side of the wall.";

    @Mock
    private FirestopSystemRepository firestopSystemRepository;

    @Mock
    private ProjectRepository projectRepository;

    private DefaultFirestopSystemService firestopSystemService;

    @BeforeEach
    void setUp() {
        firestopSystemService = new DefaultFirestopSystemService(firestopSystemRepository, projectRepository);
    }

    @Test
    @DisplayName("AC-1.1 create stores a new system as active under its project and returns it")
    void createStoresActiveSystem() {
        when(projectRepository.existsById(PROJECT_ID)).thenReturn(true);
        when(firestopSystemRepository.save(any(FirestopSystem.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        FirestopSystemResponse response = firestopSystemService.create(PROJECT_ID, request(CODE, null));

        assertEquals(PROJECT_ID, response.projectId());
        assertEquals(CODE, response.code());
        assertEquals(SUBSTRATE, response.substrate());
        assertEquals(SERVICE_TYPE, response.serviceType());
        assertEquals(FIRE_RATING, response.fireRating());
        assertEquals(MATERIALS, response.materials());
        assertEquals(METHOD, response.installationMethod());
        assertTrue(response.active());
        assertEquals(PROJECT_ID, savedSystem().getProjectId());
    }

    @Test
    @DisplayName("AC-1.1 findByProject returns the project's systems, active or not")
    void findByProjectReturnsSystems() {
        when(projectRepository.existsById(PROJECT_ID)).thenReturn(true);
        when(firestopSystemRepository.findByProjectIdOrderByCodeAsc(PROJECT_ID))
                .thenReturn(List.of(existingSystem(CODE, true), existingSystem("SYS-02", false)));

        List<FirestopSystemResponse> responses = firestopSystemService.findByProject(PROJECT_ID);

        assertEquals(List.of(CODE, "SYS-02"), responses.stream().map(FirestopSystemResponse::code).toList());
        assertFalse(responses.get(1).active());
    }

    @Test
    @DisplayName("AC-1.1 update changes the system's fields")
    void updateChangesFields() {
        when(firestopSystemRepository.findByIdAndProjectId(SYSTEM_ID, PROJECT_ID))
                .thenReturn(Optional.of(existingSystem(CODE, true)));
        when(firestopSystemRepository.save(any(FirestopSystem.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        FirestopSystemResponse response = firestopSystemService.update(PROJECT_ID, SYSTEM_ID,
                new FirestopSystemRequest("SYS-09", "Concrete floor", "Demo metal pipe", "-/120/120",
                        "Demo sealant B", "Pack the gap, then seal the surface.", true));

        assertEquals(SYSTEM_ID, response.id());
        assertEquals("SYS-09", response.code());
        assertEquals("Concrete floor", response.substrate());
        assertEquals("Demo metal pipe", response.serviceType());
        assertEquals("-/120/120", response.fireRating());
        assertEquals("Demo sealant B", response.materials());
        assertEquals("Pack the gap, then seal the surface.", response.installationMethod());
    }

    @Test
    @DisplayName("AC-1.1 deactivating a system keeps it stored and never deletes it")
    void deactivateKeepsSystem() {
        when(firestopSystemRepository.findByIdAndProjectId(SYSTEM_ID, PROJECT_ID))
                .thenReturn(Optional.of(existingSystem(CODE, true)));
        when(firestopSystemRepository.save(any(FirestopSystem.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        FirestopSystemResponse response = firestopSystemService.update(PROJECT_ID, SYSTEM_ID, request(CODE, false));

        assertFalse(response.active());
        assertFalse(savedSystem().isActive());
        verify(firestopSystemRepository, never()).delete(any(FirestopSystem.class));
        verify(firestopSystemRepository, never()).deleteById(any(UUID.class));
    }

    @Test
    @DisplayName("AC-1.1 update without an active flag leaves the system's active state unchanged")
    void updateWithoutActiveFlagKeepsState() {
        when(firestopSystemRepository.findByIdAndProjectId(SYSTEM_ID, PROJECT_ID))
                .thenReturn(Optional.of(existingSystem(CODE, false)));
        when(firestopSystemRepository.save(any(FirestopSystem.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        FirestopSystemResponse response = firestopSystemService.update(PROJECT_ID, SYSTEM_ID, request(CODE, null));

        assertFalse(response.active());
    }

    @Test
    @DisplayName("AC-1.2 create rejects a code the project already has and stores nothing")
    void createRejectsDuplicateCodeInSameProject() {
        when(projectRepository.existsById(PROJECT_ID)).thenReturn(true);
        when(firestopSystemRepository.existsByProjectIdAndCode(PROJECT_ID, CODE)).thenReturn(true);

        assertThrows(DuplicateCodeException.class, () -> firestopSystemService.create(PROJECT_ID, request(CODE, null)));

        verify(firestopSystemRepository, never()).save(any(FirestopSystem.class));
    }

    @Test
    @DisplayName("AC-1.2 update rejects a code that another system in the project has and stores nothing")
    void updateRejectsCodeOfAnotherSystemInProject() {
        when(firestopSystemRepository.findByIdAndProjectId(SYSTEM_ID, PROJECT_ID))
                .thenReturn(Optional.of(existingSystem(CODE, true)));
        when(firestopSystemRepository.existsByProjectIdAndCodeAndIdNot(PROJECT_ID, "SYS-02", SYSTEM_ID))
                .thenReturn(true);

        assertThrows(DuplicateCodeException.class,
                () -> firestopSystemService.update(PROJECT_ID, SYSTEM_ID, request("SYS-02", true)));

        verify(firestopSystemRepository, never()).save(any(FirestopSystem.class));
    }

    @Test
    @DisplayName("AC-1.3 create accepts a code that only a different project uses")
    void createAcceptsCodeUsedByAnotherProject() {
        when(projectRepository.existsById(OTHER_PROJECT_ID)).thenReturn(true);
        when(firestopSystemRepository.existsByProjectIdAndCode(OTHER_PROJECT_ID, CODE)).thenReturn(false);
        when(firestopSystemRepository.save(any(FirestopSystem.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        FirestopSystemResponse response = firestopSystemService.create(OTHER_PROJECT_ID, request(CODE, null));

        assertEquals(OTHER_PROJECT_ID, response.projectId());
        assertEquals(CODE, response.code());
        verify(firestopSystemRepository, never()).existsByProjectIdAndCode(PROJECT_ID, CODE);
    }

    @Test
    @DisplayName("AC-1.8 create fails with not-found for an unknown project and stores nothing")
    void createUnderUnknownProject() {
        when(projectRepository.existsById(PROJECT_ID)).thenReturn(false);

        assertThrows(ResourceNotFoundException.class,
                () -> firestopSystemService.create(PROJECT_ID, request(CODE, null)));

        verify(firestopSystemRepository, never()).save(any(FirestopSystem.class));
    }

    @Test
    @DisplayName("AC-1.8 findByProject fails with not-found for an unknown project")
    void findByProjectUnknownProject() {
        when(projectRepository.existsById(PROJECT_ID)).thenReturn(false);

        assertThrows(ResourceNotFoundException.class, () -> firestopSystemService.findByProject(PROJECT_ID));
    }

    @Test
    @DisplayName("AC-1.8 findById fails with not-found when the system is not in that project")
    void findByIdSystemNotInProject() {
        when(firestopSystemRepository.findByIdAndProjectId(SYSTEM_ID, OTHER_PROJECT_ID)).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class,
                () -> firestopSystemService.findById(OTHER_PROJECT_ID, SYSTEM_ID));
    }

    @Test
    @DisplayName("AC-1.8 update fails with not-found when the system is not in that project and stores nothing")
    void updateSystemNotInProject() {
        when(firestopSystemRepository.findByIdAndProjectId(SYSTEM_ID, OTHER_PROJECT_ID)).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class,
                () -> firestopSystemService.update(OTHER_PROJECT_ID, SYSTEM_ID, request(CODE, true)));

        verify(firestopSystemRepository, never()).save(any(FirestopSystem.class));
    }

    private FirestopSystem savedSystem() {
        ArgumentCaptor<FirestopSystem> captor = ArgumentCaptor.forClass(FirestopSystem.class);
        verify(firestopSystemRepository).save(captor.capture());
        return captor.getValue();
    }

    private static FirestopSystemRequest request(String code, Boolean active) {
        return new FirestopSystemRequest(code, SUBSTRATE, SERVICE_TYPE, FIRE_RATING, MATERIALS, METHOD, active);
    }

    private static FirestopSystem existingSystem(String code, boolean active) {
        FirestopSystem system = new FirestopSystem(PROJECT_ID, code);
        system.setSubstrate(SUBSTRATE);
        system.setServiceType(SERVICE_TYPE);
        system.setFireRating(FIRE_RATING);
        system.setMaterials(MATERIALS);
        system.setInstallationMethod(METHOD);
        system.setActive(active);
        ReflectionTestUtils.setField(system, "id", SYSTEM_ID);
        return system;
    }
}
