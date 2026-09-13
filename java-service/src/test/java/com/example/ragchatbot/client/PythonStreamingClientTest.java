package com.example.ragchatbot.client;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.ragchatbot.dto.ChatMessageDto;
import com.example.ragchatbot.dto.ChatRequestDto;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.reactive.function.client.WebClient;

class PythonStreamingClientTest {

    private HttpServer server;
    private final AtomicReference<HttpExchange> request = new AtomicReference<>();
    private final AtomicReference<String> requestBody = new AtomicReference<>();

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        server.createContext("/chat/stream", exchange -> {
            request.set(exchange);
            requestBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] body = ("data: {\"type\":\"reasoning\",\"text\":\"Thinking\"}\n\n"
                    + "data: {\"type\":\"content\",\"text\":\"Answer\"}\n\n")
                    .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "text/event-stream;charset=utf-8");
            exchange.sendResponseHeaders(200, 0);
            exchange.getResponseBody().write(body, 0, 19);
            exchange.getResponseBody().flush();
            exchange.getResponseBody().write(body, 19, body.length - 19);
            exchange.close();
        });
        server.start();
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    @Test
    void consumesSseResponseAndSendsExpectedRequest() {
        String baseUrl = "http://localhost:" + server.getAddress().getPort();
        PythonStreamingClient client = new PythonStreamingClient(WebClient.builder(), baseUrl);
        ChatRequestDto payload = new ChatRequestDto();
        payload.setMessages(List.of(new ChatMessageDto("user", "Hello")));

        List<String> events = client.chatStreaming(payload)
                .collectList()
                .block(Duration.ofSeconds(5));

        assertThat(events).containsExactly(
                "{\"type\":\"reasoning\",\"text\":\"Thinking\"}",
                "{\"type\":\"content\",\"text\":\"Answer\"}");
        assertThat(request.get()).isNotNull();
        assertThat(request.get().getRequestMethod()).isEqualTo("POST");
        assertThat(request.get().getRequestURI().getPath()).isEqualTo("/chat/stream");
        assertThat(request.get().getRequestHeaders().getFirst("Content-Type")).startsWith("application/json");
        assertThat(request.get().getRequestHeaders().getFirst("Accept")).contains("text/event-stream");
        assertThat(requestBody.get()).contains("\"role\":\"user\"", "\"content\":\"Hello\"");
    }
}
