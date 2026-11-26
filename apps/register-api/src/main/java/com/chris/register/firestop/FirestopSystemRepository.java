package com.chris.register.firestop;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface FirestopSystemRepository extends JpaRepository<FirestopSystem, UUID> {

    boolean existsByProjectIdAndCode(UUID projectId, String code);

    boolean existsByProjectIdAndCodeAndIdNot(UUID projectId, String code, UUID id);

    Optional<FirestopSystem> findByIdAndProjectId(UUID id, UUID projectId);

    List<FirestopSystem> findByProjectIdOrderByCodeAsc(UUID projectId);

    List<FirestopSystem> findByActiveTrueAndProjectIdInOrderByCodeAsc(Collection<UUID> projectIds);
}
