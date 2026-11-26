package com.chris.register.firestop;

import com.chris.register.RegisterFieldRules;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Body of a create or update request for a firestop system.
 *
 * @param code               short system code, unique within its project
 * @param substrate          wall or floor type the system applies to
 * @param serviceType        kind and size of service passing through the opening
 * @param fireRating         fire resistance rating, for example {@code -/60/60}
 * @param materials          materials the system requires
 * @param installationMethod how the system is installed
 * @param active             optional; defaults to {@code true} on create and is left unchanged on update when omitted
 */
public record FirestopSystemRequest(
        @NotBlank(message = "code is required")
        @Pattern(regexp = RegisterFieldRules.CODE_PATTERN, message = RegisterFieldRules.CODE_MESSAGE)
        String code,

        @NotBlank(message = "substrate is required")
        @Size(max = RegisterFieldRules.SUBSTRATE_MAX_LENGTH, message = "substrate must be at most 100 characters")
        String substrate,

        @NotBlank(message = "serviceType is required")
        @Size(max = RegisterFieldRules.SERVICE_TYPE_MAX_LENGTH,
                message = "serviceType must be at most 100 characters")
        String serviceType,

        @NotBlank(message = "fireRating is required")
        @Size(max = RegisterFieldRules.FIRE_RATING_MAX_LENGTH, message = "fireRating must be at most 20 characters")
        String fireRating,

        @NotBlank(message = "materials is required")
        @Size(max = RegisterFieldRules.MATERIALS_MAX_LENGTH, message = "materials must be at most 500 characters")
        String materials,

        @NotBlank(message = "installationMethod is required")
        @Size(max = RegisterFieldRules.INSTALLATION_METHOD_MAX_LENGTH,
                message = "installationMethod must be at most 1000 characters")
        String installationMethod,

        Boolean active) {
}
