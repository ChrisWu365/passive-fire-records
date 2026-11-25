package com.example.crud.register.snapshot;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/register/snapshot")
@Tag(name = "Snapshot", description = "Register data for offline use")
public class RegisterSnapshotController {

    private final RegisterSnapshotService registerSnapshotService;

    public RegisterSnapshotController(RegisterSnapshotService registerSnapshotService) {
        this.registerSnapshotService = registerSnapshotService;
    }

    @GetMapping
    @Operation(summary = "Download the register snapshot",
            description = "Returns every active project with its active systems, and when the snapshot was taken")
    public RegisterSnapshot currentSnapshot() {
        return registerSnapshotService.currentSnapshot();
    }
}
