package com.chris.register.firestop;

import java.util.List;
import java.util.UUID;

/**
 * Business operations on a project's approved firestop systems. Systems are deactivated, never deleted.
 */
public interface FirestopSystemService {

    /**
     * @throws com.chris.register.error.ResourceNotFoundException if the project does not exist
     */
    List<FirestopSystemResponse> findByProject(UUID projectId);

    /**
     * @throws com.chris.register.error.ResourceNotFoundException if the system does not exist in the project
     */
    FirestopSystemResponse findById(UUID projectId, UUID systemId);

    /**
     * @throws com.chris.register.error.ResourceNotFoundException if the project does not exist
     * @throws com.chris.register.error.DuplicateCodeException    if the project already has this code
     */
    FirestopSystemResponse create(UUID projectId, FirestopSystemRequest request);

    /**
     * @throws com.chris.register.error.ResourceNotFoundException if the system does not exist in the project
     * @throws com.chris.register.error.DuplicateCodeException    if another system in the project has this code
     */
    FirestopSystemResponse update(UUID projectId, UUID systemId, FirestopSystemRequest request);
}
