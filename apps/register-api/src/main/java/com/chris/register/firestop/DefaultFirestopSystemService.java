package com.chris.register.firestop;

import com.chris.register.error.DuplicateCodeException;
import com.chris.register.error.ResourceNotFoundException;
import com.chris.register.project.ProjectRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class DefaultFirestopSystemService implements FirestopSystemService {

    private static final Logger LOGGER = LoggerFactory.getLogger(DefaultFirestopSystemService.class);

    private static final String PROJECT_NOT_FOUND = "Project not found";

    private static final String SYSTEM_NOT_FOUND = "Firestop system not found";

    private static final String CODE_IN_USE = "The project already has a system with code %s";

    private final FirestopSystemRepository firestopSystemRepository;

    private final ProjectRepository projectRepository;

    public DefaultFirestopSystemService(FirestopSystemRepository firestopSystemRepository,
                                        ProjectRepository projectRepository) {
        this.firestopSystemRepository = firestopSystemRepository;
        this.projectRepository = projectRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public List<FirestopSystemResponse> findByProject(UUID projectId) {
        requireProject(projectId);
        return firestopSystemRepository.findByProjectIdOrderByCodeAsc(projectId).stream()
                .map(FirestopSystemResponse::from)
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public FirestopSystemResponse findById(UUID projectId, UUID systemId) {
        return FirestopSystemResponse.from(requireSystem(projectId, systemId));
    }

    @Override
    @Transactional
    public FirestopSystemResponse create(UUID projectId, FirestopSystemRequest request) {
        requireProject(projectId);
        if (firestopSystemRepository.existsByProjectIdAndCode(projectId, request.code())) {
            throw new DuplicateCodeException(CODE_IN_USE.formatted(request.code()));
        }
        FirestopSystem system = new FirestopSystem(projectId, request.code());
        applyDetails(system, request);
        system.setActive(request.active() == null || request.active());
        FirestopSystem saved = firestopSystemRepository.save(system);
        UUID systemId = saved.getId();
        LOGGER.info("Created firestop system id={} in project id={}", systemId, projectId);
        return FirestopSystemResponse.from(saved);
    }

    @Override
    @Transactional
    public FirestopSystemResponse update(UUID projectId, UUID systemId, FirestopSystemRequest request) {
        FirestopSystem system = requireSystem(projectId, systemId);
        if (firestopSystemRepository.existsByProjectIdAndCodeAndIdNot(projectId, request.code(), systemId)) {
            throw new DuplicateCodeException(CODE_IN_USE.formatted(request.code()));
        }
        system.setCode(request.code());
        applyDetails(system, request);
        if (request.active() != null) {
            system.setActive(request.active());
        }
        system.markUpdated();
        FirestopSystem saved = firestopSystemRepository.save(system);
        LOGGER.info("Updated firestop system id={} in project id={}", systemId, projectId);
        return FirestopSystemResponse.from(saved);
    }

    private static void applyDetails(FirestopSystem system, FirestopSystemRequest request) {
        system.setSubstrate(request.substrate());
        system.setServiceType(request.serviceType());
        system.setFireRating(request.fireRating());
        system.setMaterials(request.materials());
        system.setInstallationMethod(request.installationMethod());
    }

    private void requireProject(UUID projectId) {
        if (!projectRepository.existsById(projectId)) {
            throw new ResourceNotFoundException(PROJECT_NOT_FOUND);
        }
    }

    private FirestopSystem requireSystem(UUID projectId, UUID systemId) {
        return firestopSystemRepository.findByIdAndProjectId(systemId, projectId)
                .orElseThrow(() -> new ResourceNotFoundException(SYSTEM_NOT_FOUND));
    }
}
