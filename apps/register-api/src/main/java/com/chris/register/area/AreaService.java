package com.chris.register.area;

import java.util.List;
import java.util.UUID;

/**
 * Business operations on a project's areas. Areas are deactivated, never deleted.
 */
public interface AreaService {

    /**
     * @return every area of the project, active or not, ordered by name
     * @throws com.chris.register.error.ResourceNotFoundException if the project does not exist
     */
    List<AreaResponse> findByProject(UUID projectId);

    /**
     * @throws com.chris.register.error.ResourceNotFoundException if the area does not exist in the project
     */
    AreaResponse findById(UUID projectId, UUID areaId);

    /**
     * @throws com.chris.register.error.ResourceNotFoundException if the project does not exist
     * @throws com.chris.register.error.DuplicateNameException    if the project already has an area with this name
     */
    AreaResponse create(UUID projectId, AreaRequest request);

    /**
     * @throws com.chris.register.error.ResourceNotFoundException if the area does not exist in the project
     * @throws com.chris.register.error.DuplicateNameException    if another area in the project has this name
     */
    AreaResponse update(UUID projectId, UUID areaId, AreaRequest request);
}
