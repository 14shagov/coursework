package com.example.ragchatbot.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.Collections;
import org.junit.jupiter.api.Test;

class VectorSqlFormatterTest {

    @Test
    void formatsVectorWithExpectedDimensions() {
        assertEquals("[1.0,2.0,3.0]",
                VectorSqlFormatter.toVectorLiteral(java.util.List.of(1.0f, 2.0f, 3.0f), 3));
    }

    @Test
    void rejectsEmptyVector() {
        assertThrows(IllegalArgumentException.class,
                () -> VectorSqlFormatter.toVectorLiteral(Collections.emptyList(), 3072));
    }

    @Test
    void rejectsWrongVectorDimensions() {
        assertThrows(IllegalArgumentException.class,
                () -> VectorSqlFormatter.toVectorLiteral(java.util.List.of(1.0f), 3072));
    }
}
