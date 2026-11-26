package com.chris.register.snapshot;

import com.chris.register.project.Project;

import java.util.List;
import java.util.UUID;

/**
 * An active project and its active systems as they appear in the offline snapshot.
 */
public record ProjectSnapshot(UUID id, String code, String name, String address, List<SystemSnapshot> systems) {

    public ProjectSnapshot {
        systems = List.copyOf(systems);
    }

    public static ProjectSnapshot from(Project project, List<SystemSnapshot> systems) {
        return new ProjectSnapshot(
                project.getId(), project.getCode(), project.getName(), project.getAddress(), systems);
    }
}
