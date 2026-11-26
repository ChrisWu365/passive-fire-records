package com.chris.register.area;

import com.chris.register.error.DuplicateNameException;
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
 * Unit tests for the area rules. No Spring context and no database: both repositories are Mockito mocks.
 */
@ExtendWith(MockitoExtension.class)
class DefaultAreaServiceTest {

    private static final UUID PROJECT_ID = UUID.fromString("11111111-1111-1111-1111-111111111111");

    private static final UUID OTHER_PROJECT_ID = UUID.fromString("22222222-2222-2222-2222-222222222222");

    private static final UUID AREA_ID = UUID.fromString("33333333-3333-3333-3333-333333333333");

    private static final String NAME = "Level 3";

    private static final String OTHER_NAME = "Basement car park";

    @Mock
    private AreaRepository areaRepository;

    @Mock
    private ProjectRepository projectRepository;

    private DefaultAreaService areaService;

    @BeforeEach
    void setUp() {
        areaService = new DefaultAreaService(areaRepository, projectRepository);
    }

    @Test
    @DisplayName("AC-9.1 create stores a new area as active under its project and returns it")
    void createStoresActiveArea() {
        when(projectRepository.existsById(PROJECT_ID)).thenReturn(true);
        when(areaRepository.save(any(Area.class))).thenAnswer(invocation -> invocation.getArgument(0));

        AreaResponse response = areaService.create(PROJECT_ID, new AreaRequest(NAME, null));

        assertEquals(PROJECT_ID, response.projectId());
        assertEquals(NAME, response.name());
        assertTrue(response.active());
        assertEquals(PROJECT_ID, savedArea().getProjectId());
    }

    @Test
    @DisplayName("AC-9.1 create honours an explicit active false")
    void createInactiveArea() {
        when(projectRepository.existsById(PROJECT_ID)).thenReturn(true);
        when(areaRepository.save(any(Area.class))).thenAnswer(invocation -> invocation.getArgument(0));

        AreaResponse response = areaService.create(PROJECT_ID, new AreaRequest(NAME, false));

        assertFalse(response.active());
    }

    @Test
    @DisplayName("AC-9.1 create rejects a name the project already has and stores nothing")
    void createRejectsDuplicateName() {
        when(projectRepository.existsById(PROJECT_ID)).thenReturn(true);
        when(areaRepository.existsByProjectIdAndName(PROJECT_ID, NAME)).thenReturn(true);

        assertThrows(DuplicateNameException.class, () -> areaService.create(PROJECT_ID, new AreaRequest(NAME, null)));

        verify(areaRepository, never()).save(any(Area.class));
    }

    @Test
    @DisplayName("AC-9.1 create accepts a name that only a different project uses")
    void createAcceptsNameUsedByAnotherProject() {
        when(projectRepository.existsById(OTHER_PROJECT_ID)).thenReturn(true);
        when(areaRepository.existsByProjectIdAndName(OTHER_PROJECT_ID, NAME)).thenReturn(false);
        when(areaRepository.save(any(Area.class))).thenAnswer(invocation -> invocation.getArgument(0));

        AreaResponse response = areaService.create(OTHER_PROJECT_ID, new AreaRequest(NAME, null));

        assertEquals(OTHER_PROJECT_ID, response.projectId());
        verify(areaRepository, never()).existsByProjectIdAndName(PROJECT_ID, NAME);
    }

    @Test
    @DisplayName("AC-9.1 create fails with not-found for an unknown project and stores nothing")
    void createUnderUnknownProject() {
        when(projectRepository.existsById(PROJECT_ID)).thenReturn(false);

        assertThrows(ResourceNotFoundException.class,
                () -> areaService.create(PROJECT_ID, new AreaRequest(NAME, null)));

        verify(areaRepository, never()).save(any(Area.class));
    }

    @Test
    @DisplayName("AC-9.1 update renames the area")
    void updateRenamesArea() {
        when(areaRepository.findByIdAndProjectId(AREA_ID, PROJECT_ID))
                .thenReturn(Optional.of(existingArea(NAME, true)));
        when(areaRepository.save(any(Area.class))).thenAnswer(invocation -> invocation.getArgument(0));

        AreaResponse response = areaService.update(PROJECT_ID, AREA_ID, new AreaRequest(OTHER_NAME, null));

        assertEquals(AREA_ID, response.id());
        assertEquals(OTHER_NAME, response.name());
        assertEquals(OTHER_NAME, savedArea().getName());
    }

    @Test
    @DisplayName("AC-9.1 deactivating an area keeps it stored and never deletes it")
    void deactivateKeepsArea() {
        when(areaRepository.findByIdAndProjectId(AREA_ID, PROJECT_ID))
                .thenReturn(Optional.of(existingArea(NAME, true)));
        when(areaRepository.save(any(Area.class))).thenAnswer(invocation -> invocation.getArgument(0));

        AreaResponse response = areaService.update(PROJECT_ID, AREA_ID, new AreaRequest(NAME, false));

        assertFalse(response.active());
        assertFalse(savedArea().isActive());
        verify(areaRepository, never()).delete(any(Area.class));
        verify(areaRepository, never()).deleteById(any(UUID.class));
    }

    @Test
    @DisplayName("AC-9.1 update without an active flag leaves the area's active state unchanged")
    void updateWithoutActiveFlagKeepsState() {
        when(areaRepository.findByIdAndProjectId(AREA_ID, PROJECT_ID))
                .thenReturn(Optional.of(existingArea(NAME, false)));
        when(areaRepository.save(any(Area.class))).thenAnswer(invocation -> invocation.getArgument(0));

        AreaResponse response = areaService.update(PROJECT_ID, AREA_ID, new AreaRequest(NAME, null));

        assertFalse(response.active());
    }

    @Test
    @DisplayName("AC-9.1 update rejects a name that another area in the project has and stores nothing")
    void updateRejectsNameOfAnotherArea() {
        when(areaRepository.findByIdAndProjectId(AREA_ID, PROJECT_ID))
                .thenReturn(Optional.of(existingArea(NAME, true)));
        when(areaRepository.existsByProjectIdAndNameAndIdNot(PROJECT_ID, OTHER_NAME, AREA_ID)).thenReturn(true);

        assertThrows(DuplicateNameException.class,
                () -> areaService.update(PROJECT_ID, AREA_ID, new AreaRequest(OTHER_NAME, true)));

        verify(areaRepository, never()).save(any(Area.class));
    }

    @Test
    @DisplayName("AC-9.1 update fails with not-found when the area is not in that project and stores nothing")
    void updateAreaNotInProject() {
        when(areaRepository.findByIdAndProjectId(AREA_ID, OTHER_PROJECT_ID)).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class,
                () -> areaService.update(OTHER_PROJECT_ID, AREA_ID, new AreaRequest(NAME, true)));

        verify(areaRepository, never()).save(any(Area.class));
    }

    @Test
    @DisplayName("AC-9.1 findByProject returns the project's areas in the repository's name order")
    void findByProjectReturnsAreas() {
        when(projectRepository.existsById(PROJECT_ID)).thenReturn(true);
        when(areaRepository.findByProjectIdOrderByNameAsc(PROJECT_ID))
                .thenReturn(List.of(existingArea(OTHER_NAME, false), existingArea(NAME, true)));

        List<AreaResponse> areas = areaService.findByProject(PROJECT_ID);

        assertEquals(List.of(OTHER_NAME, NAME), areas.stream().map(AreaResponse::name).toList());
        assertFalse(areas.get(0).active());
    }

    @Test
    @DisplayName("AC-9.1 findByProject fails with not-found for an unknown project")
    void findByProjectUnknownProject() {
        when(projectRepository.existsById(PROJECT_ID)).thenReturn(false);

        assertThrows(ResourceNotFoundException.class, () -> areaService.findByProject(PROJECT_ID));
    }

    @Test
    @DisplayName("AC-9.1 findById fails with not-found when the area is not in that project")
    void findByIdAreaNotInProject() {
        when(areaRepository.findByIdAndProjectId(AREA_ID, OTHER_PROJECT_ID)).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class, () -> areaService.findById(OTHER_PROJECT_ID, AREA_ID));
    }

    private Area savedArea() {
        ArgumentCaptor<Area> captor = ArgumentCaptor.forClass(Area.class);
        verify(areaRepository).save(captor.capture());
        return captor.getValue();
    }

    private static Area existingArea(String name, boolean active) {
        Area area = new Area(PROJECT_ID, name, active);
        ReflectionTestUtils.setField(area, "id", AREA_ID);
        return area;
    }
}
