package com.chris.register.area;

import java.time.Instant;
import java.util.UUID;

public record AreaResponse(UUID id, UUID projectId, String name, boolean active, Instant createdAt, Instant updatedAt) {

    public static AreaResponse from(Area area) {
        return new AreaResponse(
                area.getId(), area.getProjectId(), area.getName(), area.isActive(),
                area.getCreatedAt(), area.getUpdatedAt());
    }
}
