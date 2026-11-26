package com.chris.register.firestop;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/register/projects/{projectId}/systems")
@Tag(name = "Firestop systems", description = "A project's approved firestop systems")
public class FirestopSystemController {

    private final FirestopSystemService firestopSystemService;

    public FirestopSystemController(FirestopSystemService firestopSystemService) {
        this.firestopSystemService = firestopSystemService;
    }

    @GetMapping
    @Operation(summary = "List a project's systems",
            description = "Returns every system of the project, active or not, ordered by code")
    public List<FirestopSystemResponse> findByProject(@PathVariable UUID projectId) {
        return firestopSystemService.findByProject(projectId);
    }

    @GetMapping("/{systemId}")
    @Operation(summary = "Find a system in a project")
    public FirestopSystemResponse findById(@PathVariable UUID projectId, @PathVariable UUID systemId) {
        return firestopSystemService.findById(projectId, systemId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Add a system to a project")
    public FirestopSystemResponse create(@PathVariable UUID projectId,
                                         @Valid @RequestBody FirestopSystemRequest request) {
        return firestopSystemService.create(projectId, request);
    }

    @PutMapping("/{systemId}")
    @Operation(summary = "Update a system",
            description = "Replaces the system's fields. Set active to false to deactivate; systems are never deleted")
    public FirestopSystemResponse update(@PathVariable UUID projectId, @PathVariable UUID systemId,
                                         @Valid @RequestBody FirestopSystemRequest request) {
        return firestopSystemService.update(projectId, systemId, request);
    }
}
