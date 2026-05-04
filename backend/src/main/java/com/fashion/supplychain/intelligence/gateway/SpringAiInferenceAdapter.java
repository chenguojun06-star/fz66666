package com.fashion.supplychain.intelligence.gateway;

import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.agent.AiToolCall;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.service.AiAgentTokenBudgetService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.ai.openai.api.OpenAiApi;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@ConditionalOnProperty(name = "spring-ai.adapter.enabled", havingValue = "true")
public class SpringAiInferenceAdapter implements AiInferenceGateway {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Autowired
    @Qualifier("springAiChatClient")
    private ObjectProvider<ChatClient> chatClientProvider;

    @Autowired
    private AiAgentTokenBudgetService tokenBudgetService;

    @Override
    public IntelligenceInferenceResult chat(String scene, String systemPrompt, String userMessage) {
        long start = System.currentTimeMillis();
        IntelligenceInferenceResult budgetCheck = checkTokenBudget(start);
        if (budgetCheck != null) return budgetCheck;

        Exception lastError = null;
        for (int attempt = 0; attempt < 3; attempt++) {
            try {
                ChatClient chatClient = chatClientProvider.getIfAvailable();
                if (chatClient == null) {
                    return buildErrorResult(new IllegalStateException("ChatClient bean not available"), start);
                }
                ChatResponse response = chatClient.prompt()
                        .system(systemPrompt)
                        .user(userMessage)
                        .options(buildOptions(scene))
                        .call()
                        .chatResponse();
                IntelligenceInferenceResult result = convertResult(response, start);
                recordTokenUsage(result);
                return result;
            } catch (Exception e) {
                lastError = e;
                if (isRetryable(e) && attempt < 2) {
                    long backoffMs = (long) Math.pow(2, attempt) * 1000 + (long)(Math.random() * 500);
                    log.warn("[SpringAiAdapter] chat failed (attempt={}), retrying in {}ms: {}", attempt + 1, backoffMs, e.getMessage());
                    try { Thread.sleep(backoffMs); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); break; }
                } else {
                    break;
                }
            }
        }
        log.warn("[SpringAiAdapter] chat failed after retries: {}", lastError != null ? lastError.getMessage() : "unknown");
        return buildErrorResult(lastError, start);
    }

    @Override
    public IntelligenceInferenceResult chat(String scene, List<AiMessage> messages, List<AiTool> tools) {
        long start = System.currentTimeMillis();
        IntelligenceInferenceResult budgetCheck = checkTokenBudget(start);
        if (budgetCheck != null) return budgetCheck;

        Exception lastError = null;
        for (int attempt = 0; attempt < 3; attempt++) {
            try {
                ChatClient chatClient = chatClientProvider.getIfAvailable();
                if (chatClient == null) {
                    return buildErrorResult(new IllegalStateException("ChatClient bean not available"), start);
                }
                ChatClient.ChatClientRequestSpec requestSpec = chatClient.prompt();
                for (Message msg : convertMessages(messages)) {
                    if (msg instanceof SystemMessage sm) {
                        requestSpec = requestSpec.system(sm.getText());
                    } else if (msg instanceof UserMessage um) {
                        requestSpec = requestSpec.user(um.getText());
                    }
                }
                OpenAiChatOptions options = buildOptions(scene);
                if (tools != null && !tools.isEmpty()) {
                    List<OpenAiApi.FunctionTool> functionTools = convertToOpenAiTools(tools);
                    options = OpenAiChatOptions.builder()
                            .model(options.getModel())
                            .temperature(options.getTemperature())
                            .maxTokens(options.getMaxTokens())
                            .tools(functionTools)
                            .build();
                }
                requestSpec = requestSpec.options(options);
                ChatResponse response = requestSpec.call().chatResponse();
                IntelligenceInferenceResult result = convertResult(response, start);
                extractToolCalls(response, result);
                recordTokenUsage(result);
                return result;
            } catch (Exception e) {
                lastError = e;
                if (isRetryable(e) && attempt < 2) {
                    long backoffMs = (long) Math.pow(2, attempt) * 1000 + (long)(Math.random() * 500);
                    log.warn("[SpringAiAdapter] chat failed (attempt={}), retrying in {}ms: {}", attempt + 1, backoffMs, e.getMessage());
                    try { Thread.sleep(backoffMs); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); break; }
                } else {
                    break;
                }
            }
        }
        log.warn("[SpringAiAdapter] chat with messages failed after retries: {}", lastError != null ? lastError.getMessage() : "unknown");
        return buildErrorResult(lastError, start);
    }

    private boolean isRetryable(Exception e) {
        if (e == null) return false;
        String msg = e.getMessage() != null ? e.getMessage().toLowerCase() : "";
        // 429限流、5xx服务端错误、网络超时可重试
        if (msg.contains("429") || msg.contains("rate") || msg.contains("too many")) return true;
        if (msg.contains("500") || msg.contains("502") || msg.contains("503") || msg.contains("504")) return true;
        if (msg.contains("timeout") || msg.contains("timed out") || msg.contains("connection")) return true;
        // reasoning_content之类的400错误不可重试（需要修数据）
        return false;
    }

    @Override
    public IntelligenceInferenceResult chatStream(String scene, List<AiMessage> messages,
                                                   List<AiTool> tools,
                                                   StreamChunkConsumer chunkConsumer) {
        long start = System.currentTimeMillis();
        IntelligenceInferenceResult budgetCheck = checkTokenBudget(start);
        if (budgetCheck != null) return budgetCheck;

        ChatClient chatClient = chatClientProvider.getIfAvailable();
        if (chatClient == null) {
            return buildErrorResult(new IllegalStateException("ChatClient bean not available"), start);
        }
        try {
            StringBuilder contentBuilder = new StringBuilder();
            boolean[] streamError = {false};
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
                    .doOnError(err -> {
                        streamError[0] = true;
                        log.warn("[SpringAiAdapter] chatStream error: {}", err.getMessage());
                        if (contentBuilder.length() > 0) {
                            chunkConsumer.accept(contentBuilder.toString(), true);
                        }
                    })
                    .doOnComplete(() -> {
                        if (!streamError[0]) {
                            chunkConsumer.accept("", true);
                        }
                    })
                    .blockLast();

            IntelligenceInferenceResult result = new IntelligenceInferenceResult();
            result.setSuccess(!streamError[0]);
            result.setProvider("spring-ai");
            result.setContent(contentBuilder.toString());
            result.setLatencyMs(System.currentTimeMillis() - start);
            result.setResponseChars(contentBuilder.length());
            int estimatedPrompt = messages.toString().length() / 4;
            int estimatedCompletion = contentBuilder.length() / 2;
            result.setPromptTokens(estimatedPrompt);
            result.setCompletionTokens(estimatedCompletion);
            if (streamError[0]) {
                result.setErrorMessage("stream partially delivered, " + contentBuilder.length() + " chars before error");
            }
            recordTokenUsage(result);
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

    private IntelligenceInferenceResult checkTokenBudget(long startMs) {
        if (!tokenBudgetService.canInvoke()) {
            IntelligenceInferenceResult r = new IntelligenceInferenceResult();
            r.setSuccess(false);
            r.setProvider("spring-ai");
            r.setErrorMessage("tenant-daily-token-quota-exceeded");
            r.setContent("当前租户今日 AI 调用已达上限（" + tokenBudgetService.getDailyLimit() + " tokens），请明日再试或联系管理员调整额度。");
            r.setTraceId(UUID.randomUUID().toString());
            r.setLatencyMs(System.currentTimeMillis() - startMs);
            return r;
        }
        return null;
    }

    private void recordTokenUsage(IntelligenceInferenceResult result) {
        if (result != null && result.isSuccess()) {
            tokenBudgetService.recordUsage(result.getPromptTokens(), result.getCompletionTokens());
        }
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
        if (response != null && response.getResult() != null && response.getResult().getOutput() != null) {
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

    private List<OpenAiApi.FunctionTool> convertToOpenAiTools(List<AiTool> aiTools) {
        List<OpenAiApi.FunctionTool> result = new ArrayList<>();
        for (AiTool tool : aiTools) {
            if (tool.getFunction() == null) continue;
            AiTool.AiFunction fn = tool.getFunction();
            Map<String, Object> paramsMap = null;
            if (fn.getParameters() != null) {
                paramsMap = MAPPER.convertValue(fn.getParameters(), Map.class);
            }
            OpenAiApi.FunctionTool.Function function = new OpenAiApi.FunctionTool.Function(
                    fn.getDescription(),
                    fn.getName(),
                    paramsMap,
                    null
            );
            result.add(new OpenAiApi.FunctionTool(function));
        }
        return result;
    }

    private void extractToolCalls(ChatResponse response, IntelligenceInferenceResult result) {
        if (response == null || response.getResult() == null) return;
        var output = response.getResult().getOutput();
        if (output == null || !output.hasToolCalls()) return;
        List<AiToolCall> toolCalls = new ArrayList<>();
        for (var tc : output.getToolCalls()) {
            AiToolCall call = new AiToolCall();
            call.setId(tc.id());
            call.setType(tc.type());
            AiToolCall.AiFunctionCall fn = new AiToolCall.AiFunctionCall();
            fn.setName(tc.name());
            fn.setArguments(tc.arguments());
            call.setFunction(fn);
            toolCalls.add(call);
        }
        result.setToolCalls(toolCalls);
        result.setToolCallCount(toolCalls.size());
    }
}
