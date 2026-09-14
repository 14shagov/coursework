package com.example.ragchatbot.eval;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.ragchatbot.RagChatbotApplication;
import com.example.ragchatbot.dto.ConversationMode;
import com.example.ragchatbot.dto.EmbeddingJobResponseDto;
import com.example.ragchatbot.dto.MessageResponseDto;
import com.example.ragchatbot.dto.RagContextResultDto;
import com.example.ragchatbot.entity.Conversation;
import com.example.ragchatbot.entity.EmbeddingJobStatus;
import com.example.ragchatbot.entity.User;
import com.example.ragchatbot.repository.ConversationRepository;
import com.example.ragchatbot.repository.UserRepository;
import com.example.ragchatbot.service.ChatService;
import com.example.ragchatbot.service.EmbeddingJobService;
import com.example.ragchatbot.service.RagService;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.images.builder.ImageFromDockerfile;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@SpringBootTest(classes = RagChatbotApplication.class, properties = {
        "chat.rag.top-k=5",
        "chat.rag.min-similarity=0.7"
})
@Testcontainers
@EnabledIfSystemProperty(named = "rag.live-eval.enabled", matches = "true")
@EnabledIfEnvironmentVariable(named = "GITHUB_TOKEN", matches = ".+\\S.+")
@EnabledIfEnvironmentVariable(named = "EMBEDDING_GITHUB_TOKEN", matches = ".+\\S.+")
@EnabledIfEnvironmentVariable(named = "LLM_MODEL", matches = ".+\\S.+")
@EnabledIfEnvironmentVariable(named = "EMBEDDING_MODEL", matches = ".+\\S.+")
@EnabledIfEnvironmentVariable(named = "CHAT_API_BASE_URL", matches = ".+\\S.+")
@EnabledIfEnvironmentVariable(named = "EMBEDDING_API_BASE_URL", matches = ".+\\S.+")
class RagLiveEvalIntegrationTest {

    private static final List<EvalCase> CASES = List.of(
            new EvalCase("Что такое звезда?", "горячий шар плазмы", List.of("плазм", "термоядер")),
            new EvalCase("Какими методами обнаруживают экзопланеты?", "методом транзита",
                    List.of("транзит", "радиальн")),
            new EvalCase("К какому спектральному классу относится Солнце?", "спектральному классу G2V",
                    List.of("g2v")));

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(
            DockerImageName.parse("pgvector/pgvector:pg16"));

    @Container
    static final GenericContainer<?> PYTHON_SERVICE = new GenericContainer<>(pythonServiceImage())
            .withExposedPorts(8000)
            .withEnv("GITHUB_TOKEN", System.getenv("GITHUB_TOKEN"))
            .withEnv("EMBEDDING_GITHUB_TOKEN", System.getenv("EMBEDDING_GITHUB_TOKEN"))
            .withEnv("LLM_MODEL", System.getenv("LLM_MODEL"))
            .withEnv("EMBEDDING_MODEL", System.getenv("EMBEDDING_MODEL"))
            .withEnv("CHAT_API_BASE_URL", System.getenv("CHAT_API_BASE_URL"))
            .withEnv("EMBEDDING_API_BASE_URL", System.getenv("EMBEDDING_API_BASE_URL"))
            .waitingFor(Wait.forHttp("/health").forStatusCode(200));

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("python.service.base-url", () -> "http://" + PYTHON_SERVICE.getHost()
                + ":" + PYTHON_SERVICE.getMappedPort(8000));
    }

    @Autowired
    private JdbcTemplate jdbcTemplate;
    @Autowired
    private EmbeddingJobService embeddingJobService;
    @Autowired
    private RagService ragService;
    @Autowired
    private ChatService chatService;
    @Autowired
    private UserRepository userRepository;
    @Autowired
    private ConversationRepository conversationRepository;

    @Test
    void comparesRealPlainAndRagAnswers() throws InterruptedException {
        resetConversationSequence();
        EmbeddingJobResponseDto job = waitForJob(embeddingJobService.startJob(1L).id());
        assertThat(job.status()).isEqualTo(EmbeddingJobStatus.COMPLETED);
        assertThat(job.failedChunks()).isZero();

        User user = userRepository.findById(1L).orElseThrow();
        int ragKeywords = 0;
        int plainKeywords = 0;
        int expectedKeywords = 0;

        for (EvalCase evalCase : CASES) {
            RagContextResultDto context = ragService.retrieveContext(evalCase.question(), 5, "live-eval");
            assertThat(context.getChunks())
                    .anySatisfy(chunk -> assertThat(chunk.getContent()).containsIgnoringCase(evalCase.expectedChunk()));

            MessageResponseDto plain = ask(user, ConversationMode.PLAIN, evalCase.question());
            MessageResponseDto rag = ask(user, ConversationMode.RAG, evalCase.question());
            assertThat(plain.isUsedContext()).isFalse();
            assertThat(rag.isUsedContext()).isTrue();

            plainKeywords += matches(plain.getContent(), evalCase.keywords());
            ragKeywords += matches(rag.getContent(), evalCase.keywords());
            expectedKeywords += evalCase.keywords().size();
            System.out.printf("%nQuestion: %s%nPLAIN: %s%nRAG: %s%n", evalCase.question(),
                    plain.getContent(), rag.getContent());
        }

        System.out.printf(Locale.ROOT, "RAG keyword recall: %.0f%%; PLAIN keyword recall: %.0f%%%n",
                100.0 * ragKeywords / expectedKeywords, 100.0 * plainKeywords / expectedKeywords);
    }

    private EmbeddingJobResponseDto waitForJob(long jobId) throws InterruptedException {
        Instant deadline = Instant.now().plus(Duration.ofMinutes(10));
        while (Instant.now().isBefore(deadline)) {
            EmbeddingJobResponseDto job = embeddingJobService.getJob(jobId);
            if (job.status() == EmbeddingJobStatus.COMPLETED || job.status() == EmbeddingJobStatus.FAILED) {
                return job;
            }
            Thread.sleep(1_000);
        }
        throw new AssertionError("Embedding job timed out");
    }

    private MessageResponseDto ask(User user, ConversationMode mode, String question) {
        Conversation conversation = new Conversation();
        conversation.setUser(user);
        conversation.setMode(mode);
        conversation.setTitle("Live eval");
        conversation.setCreatedAt(Instant.now());
        Conversation saved = conversationRepository.saveAndFlush(conversation);
        return chatService.sendMessage(user.getId(), saved.getId(), question);
    }

    private void resetConversationSequence() {
        jdbcTemplate.execute("SELECT setval('conversations_id_seq', "
                + "COALESCE((SELECT MAX(id) FROM conversations), 1), true)");
    }

    private static int matches(String answer, List<String> keywords) {
        String normalized = answer == null ? "" : answer.toLowerCase(Locale.ROOT);
        return (int) keywords.stream().filter(normalized::contains).count();
    }

    private static ImageFromDockerfile pythonServiceImage() {
        return new ImageFromDockerfile("rag-python-live-eval", false)
                .withFileFromPath(".", pythonServiceDirectory())
                .withDockerfilePath("Dockerfile");
    }

    private static Path pythonServiceDirectory() {
        for (Path path : List.of(Path.of("..", "python-service"), Path.of("python-service"))) {
            Path directory = path.toAbsolutePath().normalize();
            if (Files.isRegularFile(directory.resolve("Dockerfile"))) {
                return directory;
            }
        }
        throw new IllegalStateException("python-service Dockerfile is missing");
    }

    record EvalCase(String question, String expectedChunk, List<String> keywords) {
    }
}
