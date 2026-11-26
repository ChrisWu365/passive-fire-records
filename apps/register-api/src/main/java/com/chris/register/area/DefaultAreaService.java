package com.chris.register.area;

import com.chris.register.error.DuplicateNameException;
import com.chris.register.error.ResourceNotFoundException;
import com.chris.register.project.ProjectRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class DefaultAreaService implements AreaService {

    private static final Logger LOGGER = LoggerFactory.getLogger(DefaultAreaService.class);

    private static final String PROJECT_NOT_FOUND = "Project not found";

    private static final String AREA_NOT_FOUND = "Area not found";

    private static final String NAME_IN_USE = "The project already has an area named %s";

    private final AreaRepository areaRepository;

    private final ProjectRepository projectRepository;

    public DefaultAreaService(AreaRepository areaRepository, ProjectRepository projectRepository) {
        this.areaRepository = areaRepository;
        this.projectRepository = projectRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public List<AreaResponse> findByProject(UUID projectId) {
        requireProject(projectId);
        return areaRepository.findByProjectIdOrderByNameAsc(projectId).stream()
                .map(AreaResponse::from)
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public AreaResponse findById(UUID projectId, UUID areaId) {
        return AreaResponse.from(requireArea(projectId, areaId));
    }

    @Override
    @Transactional
    public AreaResponse create(UUID projectId, AreaRequest request) {
        requireProject(projectId);
        if (areaRepository.existsByProjectIdAndName(projectId, request.name())) {
            throw new DuplicateNameException(NAME_IN_USE.formatted(request.name()));
        }
        boolean active = request.active() == null || request.active();
        Area saved = areaRepository.save(new Area(projectId, request.name(), active));
        UUID areaId = saved.getId();
        LOGGER.info("Created area id={} in project id={}", areaId, projectId);
        return AreaResponse.from(saved);
    }

    @Override
    @Transactional
    public AreaResponse update(UUID projectId, UUID areaId, AreaRequest request) {
        Area area = requireArea(projectId, areaId);
        if (areaRepository.existsByProjectIdAndNameAndIdNot(projectId, request.name(), areaId)) {
            throw new DuplicateNameException(NAME_IN_USE.formatted(request.name()));
        }
        area.setName(request.name());
        if (request.active() != null) {
            area.setActive(request.active());
        }
        area.markUpdated();
        Area saved = areaRepository.save(area);
        LOGGER.info("Updated area id={} in project id={}", areaId, projectId);
        return AreaResponse.from(saved);
    }

    private void requireProject(UUID projectId) {
        if (!projectRepository.existsById(projectId)) {
            throw new ResourceNotFoundException(PROJECT_NOT_FOUND);
        }
    }

    private Area requireArea(UUID projectId, UUID areaId) {
        return areaRepository.findByIdAndProjectId(areaId, projectId)
                .orElseThrow(() -> new ResourceNotFoundException(AREA_NOT_FOUND));
    }
}
