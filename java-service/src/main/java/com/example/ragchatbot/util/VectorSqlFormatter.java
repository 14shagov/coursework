package com.example.ragchatbot.util;

import java.util.List;
import java.util.Objects;
import java.util.stream.Collectors;

public final class VectorSqlFormatter {

    private VectorSqlFormatter() {
    }

    public static String toVectorLiteral(List<Float> vector, int expectedDimensions) {
        validate(vector, expectedDimensions);

        return vector.stream()
                .map(value -> value.toString())
                .collect(Collectors.joining(",", "[", "]"));
    }

    public static void validate(List<Float> vector, int expectedDimensions) {
        if (vector == null || vector.isEmpty()) {
            throw new IllegalArgumentException("Embedding vector must not be empty");
        }
        if (vector.size() != expectedDimensions) {
            throw new IllegalArgumentException("Embedding vector has incompatible dimensions");
        }
        if (vector.stream().anyMatch(Objects::isNull)) {
            throw new IllegalArgumentException("Embedding vector must not contain null values");
        }
    }
}
