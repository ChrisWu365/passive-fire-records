package com.chris.register.area;

import com.chris.register.RegisterFieldRules;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Body of a create or update request for an area.
 *
 * @param name   what the level or area is called on site, unique within its project
 * @param active optional; defaults to {@code true} on create and is left unchanged on update when omitted
 */
public record AreaRequest(
        @NotBlank(message = "name is required")
        @Size(max = RegisterFieldRules.NAME_MAX_LENGTH, message = "name must be at most 100 characters")
        String name,
        Boolean active) {
}
