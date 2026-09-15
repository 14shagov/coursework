package com.example.ragchatbot.service.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.ragchatbot.client.PythonServiceClient;
import com.example.ragchatbot.client.PythonStreamingClient;
import com.example.ragchatbot.dto.MessageDto;
import com.example.ragchatbot.dto.ChatRequestDto;
import com.example.ragchatbot.dto.MessageRole;
import com.example.ragchatbot.dto.RagContextResultDto;
import com.example.ragchatbot.dto.StreamingChatChunk;
import com.example.ragchatbot.entity.Conversation;
import com.example.ragchatbot.entity.Message;
import com.example.ragchatbot.repository.ConversationRepository;
import com.example.ragchatbot.repository.MessageRepository;
import com.example.ragchatbot.repository.UserRepository;
import com.example.ragchatbot.service.RagService;
import com.example.ragchatbot.service.ChatModelCatalog;
import java.util.List;
import java.util.Optional;
import org.mockito.InOrder;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Flux;

class ChatServiceImplTest {

    private PythonStreamingClient pythonStreamingClient;
    private RagService ragService;
    private ConversationRepository conversationRepository;
    private MessageRepository messageRepository;
    private ChatServiceImpl chatService;

    @BeforeEach
    void setUp() {
        PythonServiceClient pythonServiceClient = mock(PythonServiceClient.class);
        pythonStreamingClient = mock(PythonStreamingClient.class);
        ragService = mock(RagService.class);
        conversationRepository = mock(ConversationRepository.class);
        UserRepository userRepository = mock(UserRepository.class);
        messageRepository = mock(MessageRepository.class);
        chatService = new ChatServiceImpl(
                pythonServiceClient,
                pythonStreamingClient,
                ragService,
                conversationRepository,
                userRepository,
                messageRepository,
                new ChatModelCatalog("Qwen3.6-35B-A3B",
                        "DeepSeek-V4-Flash,DeepSeek-V4-Pro,glm-4.5-air,Qwen3.6-35B-A3B,step-3.7-flash"));
        org.springframework.test.util.ReflectionTestUtils.setField(chatService, "ragTopK", 5);
    }

    @Test
    void hidesConversationNotOwnedByAuthenticatedUser() {
        when(conversationRepository.findByIdAndUserId(22L, 7L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> chatService.getConversation(7L, 22L))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(error -> ((ResponseStatusException) error).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void savesPlainAssistantAnswerOnlyAfterNormalStreamCompletion() {
        Conversation conversation = new Conversation();
        conversation.setId(22L);
        conversation.setMode(com.example.ragchatbot.dto.ConversationMode.PLAIN);
        when(conversationRepository.findByIdAndUserId(22L, 7L)).thenReturn(Optional.of(conversation));
        when(messageRepository.findByConversationIdOrderByCreatedAtAsc(22L)).thenReturn(List.of());
        when(pythonStreamingClient.chatStreaming(any())).thenReturn(Flux.just(
                "{\"type\":\"content\",\"text\":\"Answer\"}",
                "{\"type\":\"done\",\"text\":\"\"}"));

        assertThat(chatService.sendMessageStreaming(7L, 22L, "Question").collectList().block())
                .extracting(chunk -> chunk.getType())
                .containsExactly(
                        com.example.ragchatbot.dto.StreamingChatChunk.Type.CONTENT,
                        com.example.ragchatbot.dto.StreamingChatChunk.Type.DONE);

        ArgumentCaptor<Message> saved = ArgumentCaptor.forClass(Message.class);
        verify(messageRepository, org.mockito.Mockito.times(2)).save(saved.capture());
        assertThat(saved.getAllValues())
                .extracting(Message::getRole, Message::getContent)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(MessageRole.USER, "Question"),
                        org.assertj.core.groups.Tuple.tuple(MessageRole.ASSISTANT, "Answer"));
    }

    @Test
    void forwardsProviderReasoningSeparatelyFromAssistantContent() {
        Conversation conversation = new Conversation();
        conversation.setId(22L);
        conversation.setMode(com.example.ragchatbot.dto.ConversationMode.PLAIN);
        when(conversationRepository.findByIdAndUserId(22L, 7L)).thenReturn(Optional.of(conversation));
        when(messageRepository.findByConversationIdOrderByCreatedAtAsc(22L)).thenReturn(List.of());
        when(pythonStreamingClient.chatStreaming(any())).thenReturn(Flux.just(
                "{\"type\":\"reasoning\",\"text\":\"Thought\"}",
                "{\"type\":\"content\",\"text\":\"Answer\"}",
                "{\"type\":\"done\",\"text\":\"\"}"));

        assertThat(chatService.sendMessageStreaming(7L, 22L, "Question").collectList().block())
                .extracting(chunk -> chunk.getType(), chunk -> chunk.getThinking(), chunk -> chunk.getContent())
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(com.example.ragchatbot.dto.StreamingChatChunk.Type.THINKING, "Thought", null),
                        org.assertj.core.groups.Tuple.tuple(com.example.ragchatbot.dto.StreamingChatChunk.Type.CONTENT, null, "Answer"),
                        org.assertj.core.groups.Tuple.tuple(com.example.ragchatbot.dto.StreamingChatChunk.Type.DONE, null, null));

        ArgumentCaptor<Message> saved = ArgumentCaptor.forClass(Message.class);
        verify(messageRepository, org.mockito.Mockito.times(2)).save(saved.capture());
        assertThat(saved.getAllValues().get(1))
                .extracting(Message::getContent, Message::getThinking)
                .containsExactly("Answer", "Thought");
    }

    @Test
    void forwardsConversationModelToStreamingProvider() {
        Conversation conversation = new Conversation();
        conversation.setId(22L);
        conversation.setMode(com.example.ragchatbot.dto.ConversationMode.PLAIN);
        conversation.setLlmModel("DeepSeek-V4-Flash");
        when(conversationRepository.findByIdAndUserId(22L, 7L)).thenReturn(Optional.of(conversation));
        when(messageRepository.findByConversationIdOrderByCreatedAtAsc(22L)).thenReturn(List.of());
        when(pythonStreamingClient.chatStreaming(any())).thenReturn(Flux.just(
                "{\"type\":\"content\",\"text\":\"Answer\"}",
                "{\"type\":\"done\",\"text\":\"\"}"));

        chatService.sendMessageStreaming(7L, 22L, "Question").collectList().block();

        ArgumentCaptor<ChatRequestDto> request = ArgumentCaptor.forClass(ChatRequestDto.class);
        verify(pythonStreamingClient).chatStreaming(request.capture());
        assertThat(request.getValue().getLlmModel()).isEqualTo("DeepSeek-V4-Flash");
    }

    @Test
    void returnsStoredAssistantThinkingInHistory() {
        Conversation conversation = new Conversation();
        conversation.setId(22L);
        Message assistant = new Message();
        assistant.setId(5L);
        assistant.setRole(MessageRole.ASSISTANT);
        assistant.setContent("Answer");
        assistant.setThinking("Thought");

        when(conversationRepository.findByIdAndUserId(22L, 7L)).thenReturn(Optional.of(conversation));
        when(messageRepository.findByConversationIdOrderByCreatedAtAsc(22L)).thenReturn(List.of(assistant));

        assertThat(chatService.getHistory(7L, 22L))
                .singleElement()
                .extracting(MessageDto::getContent, MessageDto::getThinking)
                .containsExactly("Answer", "Thought");
    }

    @Test
    void doesNotSavePartialAnswerWhenProviderStreamFails() {
        Conversation conversation = new Conversation();
        conversation.setId(22L);
        conversation.setMode(com.example.ragchatbot.dto.ConversationMode.PLAIN);
        when(conversationRepository.findByIdAndUserId(22L, 7L)).thenReturn(Optional.of(conversation));
        when(messageRepository.findByConversationIdOrderByCreatedAtAsc(22L)).thenReturn(List.of());
        when(pythonStreamingClient.chatStreaming(any())).thenReturn(Flux.concat(
                Flux.just("{\"type\":\"content\",\"text\":\"Partial\"}"),
                Flux.error(new IllegalStateException("provider failed"))));

        assertThat(chatService.sendMessageStreaming(7L, 22L, "Question").collectList().block())
                .extracting(chunk -> chunk.getType())
                .containsExactly(
                        com.example.ragchatbot.dto.StreamingChatChunk.Type.CONTENT,
                        com.example.ragchatbot.dto.StreamingChatChunk.Type.ERROR);

        ArgumentCaptor<Message> saved = ArgumentCaptor.forClass(Message.class);
        verify(messageRepository).save(saved.capture());
        assertThat(saved.getValue().getRole()).isEqualTo(MessageRole.USER);
    }

    @Test
    void emitsRagStepsAroundActualEmbeddingSearchAndGeneration() {
        Conversation conversation = new Conversation();
        conversation.setId(22L);
        conversation.setMode(com.example.ragchatbot.dto.ConversationMode.RAG);
        when(conversationRepository.findByIdAndUserId(22L, 7L)).thenReturn(Optional.of(conversation));
        when(messageRepository.findByConversationIdOrderByCreatedAtAsc(22L)).thenReturn(List.of());
        when(ragService.createQueryEmbedding(eq("Question"), any())).thenReturn(List.of(1.0f));
        when(ragService.searchContext(eq(List.of(1.0f)), eq(5), any()))
                .thenReturn(new RagContextResultDto(List.of(), 3, 0, 0.7d, 0.35d));

        List<StreamingChatChunk> chunks = chatService.sendMessageStreaming(7L, 22L, "Question")
                .collectList()
                .block();

        assertThat(chunks)
                .extracting(StreamingChatChunk::getType, StreamingChatChunk::getStep, StreamingChatChunk::getStatus)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(StreamingChatChunk.Type.RAG_STEP, "embedding", "start"),
                        org.assertj.core.groups.Tuple.tuple(StreamingChatChunk.Type.RAG_STEP, "embedding", "done"),
                        org.assertj.core.groups.Tuple.tuple(StreamingChatChunk.Type.RAG_STEP, "search", "start"),
                        org.assertj.core.groups.Tuple.tuple(StreamingChatChunk.Type.RAG_STEP, "search", "done"),
                        org.assertj.core.groups.Tuple.tuple(StreamingChatChunk.Type.RAG_SEARCH, null, null),
                        org.assertj.core.groups.Tuple.tuple(StreamingChatChunk.Type.RAG_STEP, "generation", "start"),
                        org.assertj.core.groups.Tuple.tuple(StreamingChatChunk.Type.CONTENT, null, null),
                        org.assertj.core.groups.Tuple.tuple(StreamingChatChunk.Type.RAG_STEP, "generation", "done"),
                        org.assertj.core.groups.Tuple.tuple(StreamingChatChunk.Type.DONE, null, null));

        InOrder calls = org.mockito.Mockito.inOrder(ragService);
        calls.verify(ragService).createQueryEmbedding(eq("Question"), any());
        calls.verify(ragService).searchContext(eq(List.of(1.0f)), eq(5), any());
    }
}
