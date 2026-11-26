package com.chris.register.snapshot;

import com.chris.register.firestop.FirestopSystem;

import java.util.UUID;

/**
 * An active firestop system as it appears in the offline snapshot.
 */
public record SystemSnapshot(
        UUID id,
        String code,
        String substrate,
        String serviceType,
        String fireRating,
        String materials,
        String installationMethod) {

    public static SystemSnapshot from(FirestopSystem system) {
        return new SystemSnapshot(
                system.getId(),
                system.getCode(),
                system.getSubstrate(),
                system.getServiceType(),
                system.getFireRating(),
                system.getMaterials(),
                system.getInstallationMethod());
    }
}
