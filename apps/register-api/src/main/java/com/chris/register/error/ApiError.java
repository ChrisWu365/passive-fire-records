package com.chris.register.error;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.Collections;
import java.util.Map;
import java.util.TreeMap;

/**
 * Body of every error response.
 *
 * @param error  what went wrong
 * @param fields one message per invalid field; left out of the response unless it is a validation error
 */
public record ApiError(String error, @JsonInclude(JsonInclude.Include.NON_EMPTY) Map<String, String> fields) {

    public ApiError {
        fields = Collections.unmodifiableMap(new TreeMap<>(fields));
    }

    public static ApiError of(String error) {
        return new ApiError(error, Map.of());
    }
}
