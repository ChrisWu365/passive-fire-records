package com.chris.register.project;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface ProjectRepository extends JpaRepository<Project, UUID> {

    boolean existsByCode(String code);

    boolean existsByCodeAndIdNot(String code, UUID id);

    List<Project> findAllByOrderByCodeAsc();

    List<Project> findByActiveTrueOrderByCodeAsc();
}
