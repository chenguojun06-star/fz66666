package com.fashion.supplychain.intelligence.gateway;

import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@ConditionalOnProperty(name = "spring-ai.adapter.enabled", havingValue = "true")
public class SpringAiInferenceAdapter implements AiInferenceGateway {

    @Autowired
    @Qualifier("springAiChatClient")
    private ObjectProvider<ChatClient> chatClientProvider;

    @Override
    public IntelligenceInferenceResult chat(String scene, String systemPrompt, String userMessage) {
        long start = System.currentTimeMillis();
        ChatClient chatClient = chatClientProvider.getIfAvailable();
        if (chatClient == null) {
            return buildErrorResult(new IllegalStateException("ChatClient bean not available"), start);
        }
        try {
            ChatResponse response = chatClient.prompt()
                    .system(systemPrompt)
                    .user(userMessage)
                    .options(buildOptions(scene))
                    .call()
                    .chatResponse();

            return convertResult(response, start);
        } catch (Exception e) {
            log.warn("[SpringAiAdapter] chat failed: {}", e.getMessage());
            return buildErrorResult(e, start);
        }
    }

    @Override
    public IntelligenceInferenceResult chat(String scene, List<AiMessage> messages, List<AiTool> tools) {
        long start = System.currentTimeMillis();
        ChatClient chatClient = chatClientProvider.getIfAvailable();
        if (chatClient == null) {
            return buildErrorResult(new IllegalStateException("ChatClient bean not available"), start);
        }
        try {
            ChatClient.ChatClientRequestSpec requestSpec = chatClient.prompt();
            for (Message msg : convertMessages(messages)) {
                if (msg instanceof SystemMessage sm) {
                    requestSpec = requestSpec.system(sm.getText());
                } else if (msg instanceof UserMessage um) {
                    requestSpec = requestSpec.user(um.getText());
                }
            }
            requestSpec = requestSpec.options(buildOptions(scene));

            ChatResponse response = requestSpec.call().chatResponse();
            return convertResult(response, start);
        } catch (Exception e) {
            log.warn("[SpringAiAdapter] chat with messages failed: {}", e.getMessage());
            return buildErrorResult(e, start);
        }
    }

    @Override
    public IntelligenceInferenceResult chatStream(String scene, List<AiMessage> messages,
                                                   List<AiTool> tools,
                                                   StreamChunkConsumer chunkConsumer) {
        long start = System.currentTimeMillis();
        ChatClient chatClient = chatClientProvider.getIfAvailable();
        if (chatClient == null) {
            return buildErrorResult(new IllegalStateException("ChatClient bean not available"), start);
        }
        try {
            StringBuilder contentBuilder = new StringBuilder();

            ChatClient.ChatClientRequestSpec requestSpec = chatClient.prompt();
            for (Message msg : convertMessages(messages)) {
                if (msg instanceof SystemMessage sm) {
                    requestSpec = requestSpec.system(sm.getText());
                } else if (msg instanceof UserMessage um) {
                    requestSpec = requestSpec.user(um.getText());
                }
            }
            requestSpec = requestSpec.options(buildOptions(scene));

            requestSpec.stream()
                    .chatResponse()
                    .doOnNext(resp -> {
                        if (resp.getResult() != null && resp.getResult().getOutput() != null) {
                            String chunk = resp.getResult().getOutput().getText();
                            if (chunk != null && !chunk.isEmpty()) {
                                contentBuilder.append(chunk);
                                chunkConsumer.accept(chunk, false);
                            }
                        }
                    })
                    .doOnComplete(() -> chunkConsumer.accept("", true))
                    .blockLast();

            IntelligenceInferenceResult result = new IntelligenceInferenceResult();
            result.setSuccess(true);
            result.setProvider("spring-ai");
            result.setContent(contentBuilder.toString());
            result.setLatencyMs(System.currentTimeMillis() - start);
            result.setResponseChars(contentBuilder.length());
            return result;
        } catch (Exception e) {
            log.warn("[SpringAiAdapter] chatStream failed: {}", e.getMessage());
            return buildErrorResult(e, start);
        }
    }

    @Override
    public boolean isAvailable() {
        ChatClient chatClient = chatClientProvider.getIfAvailable();
        return chatClient != null;
    }

    @Override
    public String getProviderName() {
        return "spring-ai";
    }

    private OpenAiChatOptions buildOptions(String scene) {
        double temperature = resolveTemperature(scene);
        int maxTokens = resolveMaxTokens(scene);
        return OpenAiChatOptions.builder()
                .temperature(temperature)
                .maxTokens(maxTokens)
                .build();
    }

    private double resolveTemperature(String scene) {
        if (scene == null) return 0.3;
        return switch (scene) {
            case "agent-loop" -> 0.3;
            case "critic_review" -> 0.1;
            case "nl-intent" -> 0.0;
            case "daily-brief" -> 0.0;
            case "memory_summarize" -> 0.2;
            case "history-compact" -> 0.1;
            case "memory-extract" -> 0.3;
            default -> 0.3;
        };
    }

    private int resolveMaxTokens(String scene) {
        if (scene == null) return 2048;
        return switch (scene) {
            case "agent-loop" -> 4096;
            case "critic_review" -> 1024;
            case "nl-intent" -> 256;
            case "daily-brief" -> 512;
            case "memory_summarize" -> 256;
            case "history-compact" -> 256;
            case "memory-extract" -> 256;
            default -> 2048;
        };
    }

    private List<Message> convertMessages(List<AiMessage> messages) {
        List<Message> result = new ArrayList<>();
        if (messages == null) return result;
        for (AiMessage msg : messages) {
            String role = msg.getRole();
            String content = msg.getContent();
            if ("system".equals(role)) {
                result.add(new SystemMessage(content));
            } else if ("user".equals(role)) {
                result.add(new UserMessage(content));
            } else if ("assistant".equals(role)) {
                result.add(new AssistantMessage(content));
            }
        }
        return result;
    }

    private IntelligenceInferenceResult convertResult(ChatResponse response, long startMs) {
        IntelligenceInferenceResult result = new IntelligenceInferenceResult();
        result.setSuccess(true);
        result.setProvider("spring-ai");
        result.setLatencyMs(System.currentTimeMillis() - startMs);

        if (response != null && response.getResult() != null
                && response.getResult().getOutput() != null) {
            result.setContent(response.getResult().getOutput().getText());
        }
        if (result.getContent() != null) {
            result.setResponseChars(result.getContent().length());
        }

        if (response != null && response.getMetadata() != null) {
            result.setModel(response.getMetadata().getModel());
            if (response.getMetadata().getUsage() != null) {
                result.setPromptTokens(Math.toIntExact(response.getMetadata().getUsage().getPromptTokens()));
                result.setCompletionTokens(Math.toIntExact(response.getMetadata().getUsage().getCompletionTokens()));
            }
        }

        result.setTraceId(UUID.randomUUID().toString());
        return result;
    }

    private IntelligenceInferenceResult buildErrorResult(Exception e, long startMs) {
        IntelligenceInferenceResult result = new IntelligenceInferenceResult();
        result.setSuccess(false);
        result.setProvider("spring-ai");
        result.setErrorMessage(e.getMessage());
        result.setLatencyMs(System.currentTimeMillis() - startMs);
        result.setTraceId(UUID.randomUUID().toString());
        return result;
    }
}
