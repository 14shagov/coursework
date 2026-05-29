package com.example.ragchatbot.util;

import java.util.List;
import java.util.stream.Collectors;

public final class VectorSqlFormatter {

    private VectorSqlFormatter() {
    }

    public static String toVectorLiteral(List<Float> vector) {
        if (vector == null || vector.isEmpty()) {
            return null;
        }

        return vector.stream()
                .map(v -> v != null ? v.toString() : "0.0")
                .collect(Collectors.joining(",", "[", "]"));
    }
}
