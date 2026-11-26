package com.chris.register.project;

import com.chris.register.error.DuplicateCodeException;
import com.chris.register.error.ResourceNotFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class DefaultProjectService implements ProjectService {

    private static final Logger LOGGER = LoggerFactory.getLogger(DefaultProjectService.class);

    private static final String PROJECT_NOT_FOUND = "Project not found";

    private static final String CODE_IN_USE = "A project with code %s already exists";

    private final ProjectRepository projectRepository;

    public DefaultProjectService(ProjectRepository projectRepository) {
        this.projectRepository = projectRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public List<ProjectResponse> findAll() {
        return projectRepository.findAllByOrderByCodeAsc().stream()
                .map(ProjectResponse::from)
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public ProjectResponse findById(UUID id) {
        return ProjectResponse.from(requireProject(id));
    }

    @Override
    @Transactional
    public ProjectResponse create(ProjectRequest request) {
        if (projectRepository.existsByCode(request.code())) {
            throw new DuplicateCodeException(CODE_IN_USE.formatted(request.code()));
        }
        boolean active = request.active() == null || request.active();
        Project saved = projectRepository.save(
                new Project(request.code(), request.name(), request.address(), active));
        UUID projectId = saved.getId();
        LOGGER.info("Created project id={}", projectId);
        return ProjectResponse.from(saved);
    }

    @Override
    @Transactional
    public ProjectResponse update(UUID id, ProjectRequest request) {
        Project project = requireProject(id);
        if (projectRepository.existsByCodeAndIdNot(request.code(), id)) {
            throw new DuplicateCodeException(CODE_IN_USE.formatted(request.code()));
        }
        project.setCode(request.code());
        project.setName(request.name());
        project.setAddress(request.address());
        if (request.active() != null) {
            project.setActive(request.active());
        }
        project.markUpdated();
        Project saved = projectRepository.save(project);
        LOGGER.info("Updated project id={}", id);
        return ProjectResponse.from(saved);
    }

    private Project requireProject(UUID id) {
        return projectRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException(PROJECT_NOT_FOUND));
    }
}
