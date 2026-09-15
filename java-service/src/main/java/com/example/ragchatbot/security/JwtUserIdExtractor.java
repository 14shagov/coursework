package com.example.ragchatbot.security;

import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.server.ResponseStatusException;

public final class JwtUserIdExtractor {

    private JwtUserIdExtractor() {
    }

    public static long extract(Jwt jwt) {
        Object uid = jwt == null ? null : jwt.getClaim("uid");
        if (uid instanceof Number number) {
            return number.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(uid));
        } catch (NumberFormatException exception) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "JWT does not contain a valid uid claim");
        }
    }
}
