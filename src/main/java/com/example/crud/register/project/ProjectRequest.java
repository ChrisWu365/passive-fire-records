package com.example.crud.register.project;

import com.example.crud.register.RegisterFieldRules;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Body of a create or update request for a project.
 *
 * @param code    short project code, unique across the register
 * @param name    project name
 * @param address optional site address
 * @param active  optional; defaults to {@code true} on create and is left unchanged on update when omitted
 */
public record ProjectRequest(
        @NotBlank(message = "code is required")
        @Pattern(regexp = RegisterFieldRules.CODE_PATTERN, message = RegisterFieldRules.CODE_MESSAGE)
        String code,

        @NotBlank(message = "name is required")
        @Size(max = RegisterFieldRules.NAME_MAX_LENGTH, message = "name must be at most 100 characters")
        String name,

        @Size(max = RegisterFieldRules.ADDRESS_MAX_LENGTH, message = "address must be at most 200 characters")
        String address,

        Boolean active) {
}
