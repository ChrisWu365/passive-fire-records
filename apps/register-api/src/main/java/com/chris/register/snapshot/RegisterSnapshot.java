package com.chris.register.snapshot;

import java.time.Instant;
import java.util.List;

/**
 * Everything a device needs in order to create records offline: the active projects with their active systems.
 *
 * @param generatedAt when the snapshot was taken
 * @param projects    active projects ordered by code
 */
public record RegisterSnapshot(Instant generatedAt, List<ProjectSnapshot> projects) {

    public RegisterSnapshot {
        projects = List.copyOf(projects);
    }
}
