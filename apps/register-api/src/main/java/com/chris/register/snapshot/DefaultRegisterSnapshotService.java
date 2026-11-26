package com.chris.register.snapshot;

import com.chris.register.area.Area;
import com.chris.register.area.AreaRepository;
import com.chris.register.firestop.FirestopSystem;
import com.chris.register.firestop.FirestopSystemRepository;
import com.chris.register.project.Project;
import com.chris.register.project.ProjectRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class DefaultRegisterSnapshotService implements RegisterSnapshotService {

    private final ProjectRepository projectRepository;

    private final FirestopSystemRepository firestopSystemRepository;

    private final AreaRepository areaRepository;

    private final Clock clock;

    public DefaultRegisterSnapshotService(ProjectRepository projectRepository,
                                          FirestopSystemRepository firestopSystemRepository,
                                          AreaRepository areaRepository,
                                          Clock clock) {
        this.projectRepository = projectRepository;
        this.firestopSystemRepository = firestopSystemRepository;
        this.areaRepository = areaRepository;
        this.clock = clock;
    }

    @Override
    @Transactional(readOnly = true)
    public RegisterSnapshot currentSnapshot() {
        List<Project> projects = projectRepository.findByActiveTrueOrderByCodeAsc();
        List<UUID> projectIds = projects.stream().map(Project::getId).toList();
        Map<UUID, List<SystemSnapshot>> systemsByProject = activeSystemsByProject(projectIds);
        Map<UUID, List<AreaSnapshot>> areasByProject = activeAreasByProject(projectIds);
        List<ProjectSnapshot> projectSnapshots = projects.stream()
                .map(project -> ProjectSnapshot.from(
                        project,
                        systemsByProject.getOrDefault(project.getId(), List.of()),
                        areasByProject.getOrDefault(project.getId(), List.of())))
                .toList();
        return new RegisterSnapshot(clock.instant(), projectSnapshots);
    }

    private Map<UUID, List<SystemSnapshot>> activeSystemsByProject(List<UUID> projectIds) {
        if (projectIds.isEmpty()) {
            return Map.of();
        }
        return firestopSystemRepository.findByActiveTrueAndProjectIdInOrderByCodeAsc(projectIds).stream()
                .collect(Collectors.groupingBy(
                        FirestopSystem::getProjectId,
                        Collectors.mapping(SystemSnapshot::from, Collectors.toList())));
    }

    private Map<UUID, List<AreaSnapshot>> activeAreasByProject(List<UUID> projectIds) {
        if (projectIds.isEmpty()) {
            return Map.of();
        }
        return areaRepository.findByActiveTrueAndProjectIdInOrderByNameAsc(projectIds).stream()
                .collect(Collectors.groupingBy(
                        Area::getProjectId,
                        Collectors.mapping(AreaSnapshot::from, Collectors.toList())));
    }
}
