package com.chris.register.firestop;

import java.time.Instant;
import java.util.UUID;

public record FirestopSystemResponse(
        UUID id,
        UUID projectId,
        String code,
        String substrate,
        String serviceType,
        String fireRating,
        String materials,
        String installationMethod,
        boolean active,
        Instant createdAt,
        Instant updatedAt) {

    public static FirestopSystemResponse from(FirestopSystem system) {
        return new FirestopSystemResponse(
                system.getId(),
                system.getProjectId(),
                system.getCode(),
                system.getSubstrate(),
                system.getServiceType(),
                system.getFireRating(),
                system.getMaterials(),
                system.getInstallationMethod(),
                system.isActive(),
                system.getCreatedAt(),
                system.getUpdatedAt());
    }
}
