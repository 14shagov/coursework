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
import com.example.ragchatbot.dto.MessageRole;
import com.example.ragchatbot.entity.Conversation;
import com.example.ragchatbot.entity.Message;
import com.example.ragchatbot.repository.ConversationRepository;
import com.example.ragchatbot.repository.MessageRepository;
import com.example.ragchatbot.repository.UserRepository;
import com.example.ragchatbot.service.RagService;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Flux;

class ChatServiceImplTest {

    private PythonStreamingClient pythonStreamingClient;
    private ConversationRepository conversationRepository;
    private MessageRepository messageRepository;
    private ChatServiceImpl chatService;

    @BeforeEach
    void setUp() {
        PythonServiceClient pythonServiceClient = mock(PythonServiceClient.class);
        pythonStreamingClient = mock(PythonStreamingClient.class);
        RagService ragService = mock(RagService.class);
        conversationRepository = mock(ConversationRepository.class);
        UserRepository userRepository = mock(UserRepository.class);
        messageRepository = mock(MessageRepository.class);
        chatService = new ChatServiceImpl(
                pythonServiceClient,
                pythonStreamingClient,
                ragService,
                conversationRepository,
                userRepository,
                messageRepository);
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
}
