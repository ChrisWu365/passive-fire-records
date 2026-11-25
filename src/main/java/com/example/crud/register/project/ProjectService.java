package com.example.crud.register.project;

import java.util.List;
import java.util.UUID;

/**
 * Business operations on projects. Projects are deactivated, never deleted.
 */
public interface ProjectService {

    List<ProjectResponse> findAll();

    /**
     * @throws com.example.crud.register.error.ResourceNotFoundException if no project has this id
     */
    ProjectResponse findById(UUID id);

    /**
     * @throws com.example.crud.register.error.DuplicateCodeException if the code is already used by a project
     */
    ProjectResponse create(ProjectRequest request);

    /**
     * @throws com.example.crud.register.error.ResourceNotFoundException if no project has this id
     * @throws com.example.crud.register.error.DuplicateCodeException    if the code is used by another project
     */
    ProjectResponse update(UUID id, ProjectRequest request);
}
