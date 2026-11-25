package com.example.crud.register.project;

import java.time.Instant;
import java.util.UUID;

public record ProjectResponse(
        UUID id,
        String code,
        String name,
        String address,
        boolean active,
        Instant createdAt,
        Instant updatedAt) {

    public static ProjectResponse from(Project project) {
        return new ProjectResponse(
                project.getId(),
                project.getCode(),
                project.getName(),
                project.getAddress(),
                project.isActive(),
                project.getCreatedAt(),
                project.getUpdatedAt());
    }
}
