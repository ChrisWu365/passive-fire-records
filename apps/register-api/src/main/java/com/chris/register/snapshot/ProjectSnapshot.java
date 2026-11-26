package com.chris.register.snapshot;

import com.chris.register.project.Project;

import java.util.List;
import java.util.UUID;

/**
 * An active project with its active systems and areas, as they appear in the offline snapshot.
 */
public record ProjectSnapshot(UUID id, String code, String name, String address, List<SystemSnapshot> systems,
                              List<AreaSnapshot> areas) {

    public ProjectSnapshot {
        systems = List.copyOf(systems);
        areas = List.copyOf(areas);
    }

    public static ProjectSnapshot from(Project project, List<SystemSnapshot> systems, List<AreaSnapshot> areas) {
        return new ProjectSnapshot(
                project.getId(), project.getCode(), project.getName(), project.getAddress(), systems, areas);
    }
}
