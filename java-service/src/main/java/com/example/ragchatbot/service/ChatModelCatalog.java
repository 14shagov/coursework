package com.example.ragchatbot.service;

import com.example.ragchatbot.dto.ChatModelDto;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
public class ChatModelCatalog {
    private final String defaultModel;
    private final List<String> models;

    public ChatModelCatalog(@Value("${chat.models.default}") String defaultModel,
                            @Value("${chat.models.allowed}") String allowedModels) {
        this.defaultModel = defaultModel.trim();
        this.models = List.of(allowedModels.split(",")).stream()
                .map(String::trim)
                .filter(model -> !model.isEmpty())
                .distinct()
                .toList();
        if (!models.contains(this.defaultModel)) {
            throw new IllegalStateException("chat.models.default must be included in chat.models.allowed");
        }
    }

    public String resolve(String model) {
        String resolved = model == null || model.isBlank() ? defaultModel : model.trim();
        if (!models.contains(resolved)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported chat model");
        }
        return resolved;
    }

    public List<ChatModelDto> availableModels() {
        return models.stream().map(model -> new ChatModelDto(model, model.equals(defaultModel))).toList();
    }
}
