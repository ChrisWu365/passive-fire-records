package com.example.crud.security;

import org.springframework.core.convert.converter.Converter;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

/**
 * Maps the token's single {@code role} claim to a Spring Security authority. A token whose role is missing or
 * unknown gets no authority, so it is signed in but allowed nothing.
 */
public class RoleClaimAuthoritiesConverter implements Converter<Jwt, Collection<GrantedAuthority>> {

    private static final String ROLE_CLAIM = "role";

    private static final String AUTHORITY_PREFIX = "ROLE_";

    @Override
    public Collection<GrantedAuthority> convert(Jwt jwt) {
        Optional<RegisterRole> role = RegisterRole.fromClaim(jwt.getClaimAsString(ROLE_CLAIM));
        if (role.isEmpty()) {
            return List.of();
        }
        return List.of(new SimpleGrantedAuthority(AUTHORITY_PREFIX + role.get().name()));
    }
}
