package com.example.ragchatbot.search;

import com.example.ragchatbot.config.SearchProperties;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

@Component
@RequiredArgsConstructor
public class ElasticsearchGateway {
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(10);
    private static final MediaType NDJSON = MediaType.parseMediaType("application/x-ndjson");
    private static final String INDEX_SETTINGS = """
            {
              "settings": {"analysis": {"analyzer": {"chat_russian": {
                "tokenizer": "standard",
                "filter": ["lowercase", "russian_stop", "russian_stemmer"]
              }}, "filter": {
                "russian_stop": {"type": "stop", "stopwords": "_russian_"},
                "russian_stemmer": {"type": "stemmer", "language": "russian"}
              }}},
              "mappings": {"properties": {
                "kind": {"type": "keyword"},
                "userId": {"type": "keyword"},
                "conversationId": {"type": "keyword"},
                "messageId": {"type": "keyword"},
                "role": {"type": "keyword"},
                "title": {"type": "text", "analyzer": "chat_russian"},
                "content": {"type": "text", "analyzer": "chat_russian"},
                "createdAt": {"type": "date"},
                "lastMessageAt": {"type": "date"}
              }}
            }
            """;

    private final WebClient.Builder webClientBuilder;
    private final SearchProperties properties;
    private final ObjectMapper objectMapper;

    private WebClient client() {
        return webClientBuilder.baseUrl(properties.url()).build();
    }

    public boolean enabled() {
        return properties.enabled();
    }

    public String alias() {
        return properties.alias();
    }

    public boolean ensureAlias() {
        if (!enabled() || exists(properties.alias())) return false;
        String index = baseIndex();
        boolean created = false;
        if (!exists(index)) {
            client().put().uri("/{index}", index).contentType(MediaType.APPLICATION_JSON).bodyValue(INDEX_SETTINGS)
                    .retrieve().toBodilessEntity().block(REQUEST_TIMEOUT);
            created = true;
        }
        setAlias(index);
        return created;
    }

    public void createIndex(String index) {
        client().put().uri("/{index}", index).contentType(MediaType.APPLICATION_JSON).bodyValue(INDEX_SETTINGS)
                .retrieve().toBodilessEntity().block(REQUEST_TIMEOUT);
    }

    public void setAlias(String index) {
        Map<String, Object> body = Map.of("actions", List.of(
                Map.of("remove", Map.of("index", properties.alias() + "-*", "alias", properties.alias(), "must_exist", false)),
                Map.of("add", Map.of("index", index, "alias", properties.alias(), "is_write_index", true))));
        client().post().uri("/_aliases").contentType(MediaType.APPLICATION_JSON).bodyValue(body)
                .retrieve().toBodilessEntity().block(REQUEST_TIMEOUT);
    }

    public void bulkUpsert(String index, List<SearchDocument> documents) {
        if (documents.isEmpty()) return;
        StringBuilder ndjson = new StringBuilder();
        for (SearchDocument document : documents) {
            try {
                ndjson.append(objectMapper.writeValueAsString(Map.of("index", Map.of("_index", index, "_id", document.id())))).append('\n');
                ndjson.append(objectMapper.writeValueAsString(document.source())).append('\n');
            } catch (JsonProcessingException exception) {
                throw new IllegalStateException("Cannot serialize Elasticsearch document", exception);
            }
        }
        String response = client().post().uri("/_bulk").contentType(NDJSON).bodyValue(ndjson.toString())
                .retrieve().bodyToMono(String.class).block(REQUEST_TIMEOUT);
        try {
            if (objectMapper.readTree(response).path("errors").asBoolean(false)) {
                throw new IllegalStateException("Elasticsearch bulk request contains errors");
            }
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Cannot parse Elasticsearch bulk response", exception);
        }
    }

    public void deleteByConversationId(String index, long conversationId) {
        Map<String, Object> query = Map.of("query", Map.of("term", Map.of("conversationId", String.valueOf(conversationId))));
        client().post().uri("/{index}/_delete_by_query", index).contentType(MediaType.APPLICATION_JSON).bodyValue(query)
                .retrieve().toBodilessEntity().block(REQUEST_TIMEOUT);
    }

    public JsonNode search(Map<String, Object> query) {
        String response = client().post().uri("/{alias}/_search", properties.alias()).contentType(MediaType.APPLICATION_JSON)
                .bodyValue(query).retrieve().bodyToMono(String.class).block(REQUEST_TIMEOUT);
        try {
            return objectMapper.readTree(response);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Cannot parse Elasticsearch response", exception);
        }
    }

    public void refresh(String index) {
        client().post().uri("/{index}/_refresh", index).retrieve().toBodilessEntity().block(REQUEST_TIMEOUT);
    }

    private boolean exists(String name) {
        Boolean result = client().method(HttpMethod.HEAD).uri("/{name}", name).exchangeToMono(response ->
                response.releaseBody().thenReturn(response.statusCode().is2xxSuccessful())).block(REQUEST_TIMEOUT);
        return Boolean.TRUE.equals(result);
    }

    private String baseIndex() {
        return properties.alias() + "-v1";
    }
}
