package com.example.crud.register.firestop;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;
import java.util.UUID;

/**
 * One approved way of sealing a kind of opening on a project. Its code is unique within the project.
 */
@Entity
@Table(name = "firestop_system",
        uniqueConstraints = @UniqueConstraint(name = "uq_firestop_system_project_code",
                columnNames = {"project_id", "code"}))
public class FirestopSystem {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "project_id", nullable = false, updatable = false)
    private UUID projectId;

    @Column(nullable = false, length = 20)
    private String code;

    @Column(nullable = false, length = 100)
    private String substrate;

    @Column(name = "service_type", nullable = false, length = 100)
    private String serviceType;

    @Column(name = "fire_rating", nullable = false, length = 20)
    private String fireRating;

    @Column(nullable = false, length = 500)
    private String materials;

    @Column(name = "installation_method", nullable = false, length = 1000)
    private String installationMethod;

    @Column(nullable = false)
    private boolean active;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected FirestopSystem() {
    }

    public FirestopSystem(UUID projectId, String code) {
        this.projectId = projectId;
        this.code = code;
    }

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        createdAt = now;
        updatedAt = now;
    }

    /**
     * Records that the system was changed now. Called by the service so that the response carries the new time.
     */
    public void markUpdated() {
        updatedAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public UUID getProjectId() {
        return projectId;
    }

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public String getSubstrate() {
        return substrate;
    }

    public void setSubstrate(String substrate) {
        this.substrate = substrate;
    }

    public String getServiceType() {
        return serviceType;
    }

    public void setServiceType(String serviceType) {
        this.serviceType = serviceType;
    }

    public String getFireRating() {
        return fireRating;
    }

    public void setFireRating(String fireRating) {
        this.fireRating = fireRating;
    }

    public String getMaterials() {
        return materials;
    }

    public void setMaterials(String materials) {
        this.materials = materials;
    }

    public String getInstallationMethod() {
        return installationMethod;
    }

    public void setInstallationMethod(String installationMethod) {
        this.installationMethod = installationMethod;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
