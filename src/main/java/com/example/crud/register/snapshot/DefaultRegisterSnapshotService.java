package com.example.crud.register.snapshot;

import com.example.crud.register.firestop.FirestopSystem;
import com.example.crud.register.firestop.FirestopSystemRepository;
import com.example.crud.register.project.Project;
import com.example.crud.register.project.ProjectRepository;
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

    private final Clock clock;

    public DefaultRegisterSnapshotService(ProjectRepository projectRepository,
                                          FirestopSystemRepository firestopSystemRepository,
                                          Clock clock) {
        this.projectRepository = projectRepository;
        this.firestopSystemRepository = firestopSystemRepository;
        this.clock = clock;
    }

    @Override
    @Transactional(readOnly = true)
    public RegisterSnapshot currentSnapshot() {
        List<Project> projects = projectRepository.findByActiveTrueOrderByCodeAsc();
        Map<UUID, List<SystemSnapshot>> systemsByProject = activeSystemsByProject(projects);
        List<ProjectSnapshot> projectSnapshots = projects.stream()
                .map(project -> ProjectSnapshot.from(
                        project, systemsByProject.getOrDefault(project.getId(), List.of())))
                .toList();
        return new RegisterSnapshot(clock.instant(), projectSnapshots);
    }

    private Map<UUID, List<SystemSnapshot>> activeSystemsByProject(List<Project> projects) {
        if (projects.isEmpty()) {
            return Map.of();
        }
        List<UUID> projectIds = projects.stream().map(Project::getId).toList();
        return firestopSystemRepository.findByActiveTrueAndProjectIdInOrderByCodeAsc(projectIds).stream()
                .collect(Collectors.groupingBy(
                        FirestopSystem::getProjectId,
                        Collectors.mapping(SystemSnapshot::from, Collectors.toList())));
    }
}
