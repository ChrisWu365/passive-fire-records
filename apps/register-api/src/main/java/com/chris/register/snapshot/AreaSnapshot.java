package com.chris.register.snapshot;

import com.chris.register.area.Area;

import java.util.UUID;

/**
 * An active area as it appears in the offline snapshot.
 */
public record AreaSnapshot(UUID id, String name) {

    public static AreaSnapshot from(Area area) {
        return new AreaSnapshot(area.getId(), area.getName());
    }
}
