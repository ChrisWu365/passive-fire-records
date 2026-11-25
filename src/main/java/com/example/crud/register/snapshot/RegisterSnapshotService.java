package com.example.crud.register.snapshot;

public interface RegisterSnapshotService {

    /**
     * @return the active projects with their active systems, as of now
     */
    RegisterSnapshot currentSnapshot();
}
