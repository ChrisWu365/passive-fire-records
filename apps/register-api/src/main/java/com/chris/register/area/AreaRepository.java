package com.chris.register.area;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AreaRepository extends JpaRepository<Area, UUID> {

    boolean existsByProjectIdAndName(UUID projectId, String name);

    boolean existsByProjectIdAndNameAndIdNot(UUID projectId, String name, UUID id);

    Optional<Area> findByIdAndProjectId(UUID id, UUID projectId);

    List<Area> findByProjectIdOrderByNameAsc(UUID projectId);

    List<Area> findByActiveTrueAndProjectIdInOrderByNameAsc(Collection<UUID> projectIds);
}
