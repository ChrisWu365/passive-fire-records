package com.chris.register.area;

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
@RequestMapping("/api/register/projects/{projectId}/areas")
@Tag(name = "Areas", description = "A project's levels and areas")
public class AreaController {

    private final AreaService areaService;

    public AreaController(AreaService areaService) {
        this.areaService = areaService;
    }

    @GetMapping
    @Operation(summary = "List a project's areas",
            description = "Returns every area of the project, active or not, ordered by name")
    public List<AreaResponse> findByProject(@PathVariable UUID projectId) {
        return areaService.findByProject(projectId);
    }

    @GetMapping("/{areaId}")
    @Operation(summary = "Find an area in a project")
    public AreaResponse findById(@PathVariable UUID projectId, @PathVariable UUID areaId) {
        return areaService.findById(projectId, areaId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Add an area to a project")
    public AreaResponse create(@PathVariable UUID projectId, @Valid @RequestBody AreaRequest request) {
        return areaService.create(projectId, request);
    }

    @PutMapping("/{areaId}")
    @Operation(summary = "Update an area",
            description = "Replaces the area's name. Set active to false to deactivate; areas are never deleted")
    public AreaResponse update(@PathVariable UUID projectId, @PathVariable UUID areaId,
                               @Valid @RequestBody AreaRequest request) {
        return areaService.update(projectId, areaId, request);
    }
}
