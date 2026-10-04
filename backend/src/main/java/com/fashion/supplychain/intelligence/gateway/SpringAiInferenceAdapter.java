package com.fashion.supplychain.intelligence.gateway;

import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.agent.AiToolCall;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.service.AiAgentTokenBudgetService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.ai.tool.definition.ToolDefinition;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;

/**
 * Spring AI 2.0 推理适配器（D-743，自 1.0 范式重写）。
 *
 * <p>与 1.0 的关键差异：2.0 的 {@code ChatModel.call/stream} 只返回裸 tool_calls、
 * 不再内置工具执行循环（执行已移交 ChatClient Advisor 层，而本项目不经 ChatClient），
 * 与 AgentLoop 编排层「适配器回传 tool_calls → 编排层执行 → 回灌结果」的闭环天然一致，
 * 因此 {@code internalToolExecutionEnabled=false} 这类 1.0 开关在 2.0 已无需存在。
 */
@Slf4j
@Component
@Lazy
@ConditionalOnProperty(name = "spring-ai.adapter.enabled", havingValue = "true", matchIfMissing = true)
public class SpringAiInferenceAdapter implements AiInferenceGateway {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Autowired
    @Qualifier("springAiChatModel")
    private ObjectProvider<OpenAiChatModel> chatModelProvider;

    @Autowired
    private AiAgentTokenBudgetService tokenBudgetService;

    /**
     * 2.0 每次调用的 options 必须显式带模型名：留空时请求会带上 OpenAI SDK 的默认模型
     * （gpt-5-mini），DeepSeek 直接 400 "supported API model names are deepseek-flash,
     * deepseek-v4-pro"——真机冒烟（D-743）实证，不能依赖 builder 默认值的合并语义。
     */
    @org.springframework.beans.factory.annotation.Value("${spring-ai.adapter.model:deepseek-flash}")
    private String modelName;

    @Override
    public IntelligenceInferenceResult chat(String scene, String systemPrompt, String userMessage) {
        long start = System.currentTimeMillis();
        IntelligenceInferenceResult budgetCheck = checkTokenBudget(start);
        if (budgetCheck != null) return budgetCheck;

        Exception lastError = null;
        for (int attempt = 0; attempt < 3; attempt++) {
            try {
                OpenAiChatModel chatModel = chatModelProvider.getIfAvailable();
                if (chatModel == null) {
                    return buildErrorResult(new IllegalStateException("ChatModel bean not available"), start);
                }
                List<Message> messages = new ArrayList<>();
                if (systemPrompt != null && !systemPrompt.isBlank()) {
                    messages.add(new SystemMessage(systemPrompt));
                }
                messages.add(new UserMessage(userMessage));
                ChatResponse response = chatModel.call(new Prompt(messages, buildOptions(scene)));
                IntelligenceInferenceResult result = convertResult(response, start);
                recordTokenUsage(result);
                return result;
            } catch (Exception e) {
                lastError = e;
                if (isRetryable(e) && attempt < 2) {
                    long backoffMs = (long) Math.pow(2, attempt) * 500 + (long)(Math.random() * 200);
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
                OpenAiChatModel chatModel = chatModelProvider.getIfAvailable();
                if (chatModel == null) {
                    return buildErrorResult(new IllegalStateException("ChatModel bean not available"), start);
                }
                OpenAiChatOptions options = buildOptions(scene, tools);
                ChatResponse response = chatModel.call(new Prompt(convertMessages(messages), options));
                IntelligenceInferenceResult result = convertResult(response, start);
                extractToolCalls(response, result);
                recordTokenUsage(result);
                return result;
            } catch (Exception e) {
                lastError = e;
                if (isRetryable(e) && attempt < 2) {
                    long backoffMs = (long) Math.pow(2, attempt) * 500 + (long)(Math.random() * 200);
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
        // 网络超时/连接拒绝：快速降级不重试（网络问题短期不会恢复，重试浪费时间）
        if (msg.contains("timeout") || msg.contains("timed out")) return false;
        if (msg.contains("connection refused") || msg.contains("connection reset")
                || msg.contains("connection timed out") || msg.contains("connectexception")) return false;
        // 429限流、5xx服务端错误可重试（临时性错误，重试有意义）
        if (msg.contains("429") || msg.contains("rate") || msg.contains("too many")) return true;
        if (msg.contains("500") || msg.contains("502") || msg.contains("503") || msg.contains("504")) return true;
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

        OpenAiChatModel chatModel = chatModelProvider.getIfAvailable();
        if (chatModel == null) {
            return buildErrorResult(new IllegalStateException("ChatModel bean not available"), start);
        }
        try {
            StringBuilder contentBuilder = new StringBuilder();
            StringBuilder reasoningBuilder = new StringBuilder();
            boolean[] streamError = {false};
            // 工具定义必须随流式请求下发（D-743b：流式不带工具 → 模型永远无法发起工具调用，
            // AgentLoop 流式主循环整体哑火，用户只会拿到无实时数据的"裸"回答）。
            // 2.0 的 ChunkMerger 会把工具调用分片合并成完整调用，这里按 id 兜底去重聚合。
            Map<String, AiToolCall> toolCallAggregator = new java.util.LinkedHashMap<>();
            chatModel.stream(new Prompt(convertMessages(messages), buildOptions(scene, tools)))
                    .doOnNext(resp -> {
                        if (resp.getResult() == null || resp.getResult().getOutput() == null) {
                            return;
                        }
                        var output = resp.getResult().getOutput();
                        if (output.hasToolCalls()) {
                            for (var tc : output.getToolCalls()) {
                                String key = tc.id() != null && !tc.id().isBlank()
                                        ? tc.id() : tc.name() + "#" + toolCallAggregator.size();
                                AiToolCall merged = toolCallAggregator.get(key);
                                if (merged == null) {
                                    AiToolCall call = new AiToolCall();
                                    call.setId(tc.id());
                                    call.setType(tc.type());
                                    AiToolCall.AiFunctionCall fn = new AiToolCall.AiFunctionCall();
                                    fn.setName(tc.name());
                                    fn.setArguments(tc.arguments());
                                    call.setFunction(fn);
                                    toolCallAggregator.put(key, call);
                                } else if (tc.arguments() != null) {
                                    String prev = merged.getFunction().getArguments();
                                    merged.getFunction().setArguments(
                                            prev == null ? tc.arguments() : prev + tc.arguments());
                                }
                            }
                        }
                        if (output.getMetadata() != null) {
                            Object rc = output.getMetadata().get("reasoningContent");
                            if (rc instanceof String s && !s.isEmpty()) {
                                reasoningBuilder.append(s);
                            }
                        }
                        String chunk = output.getText();
                        if (chunk != null && !chunk.isEmpty()) {
                            contentBuilder.append(chunk);
                            chunkConsumer.accept(chunk, false);
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
            if (!reasoningBuilder.isEmpty()) {
                result.setReasoningContent(reasoningBuilder.toString());
            }
            if (!toolCallAggregator.isEmpty()) {
                List<AiToolCall> toolCalls = new ArrayList<>(toolCallAggregator.values());
                result.setToolCalls(toolCalls);
                result.setToolCallCount(toolCalls.size());
            }
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
        OpenAiChatModel chatModel = chatModelProvider.getIfAvailable();
        return chatModel != null;
    }

    @Override
    public boolean isVisionAvailable() {
        return false;
    }

    @Override
    public String getProviderName() {
        return "spring-ai";
    }

    @Override
    public IntelligenceInferenceResult chatWithVision(String scene, String systemPrompt, String userMessage, String imageUrl) {
        long start = System.currentTimeMillis();
        IntelligenceInferenceResult budgetCheck = checkTokenBudget(start);
        if (budgetCheck != null) return budgetCheck;

        Exception lastError = null;
        for (int attempt = 0; attempt < 3; attempt++) {
            try {
                OpenAiChatModel chatModel = chatModelProvider.getIfAvailable();
                if (chatModel == null) {
                    return buildErrorResult(new IllegalStateException("ChatModel bean not available"), start);
                }

                // 视觉主路径走 legacy（deepseek-flash 原生 image_url 格式更可靠），此处仅兜底
                String fullPrompt = userMessage + "\n\n[图片地址: " + imageUrl + "]";

                List<Message> messages = new ArrayList<>();
                if (systemPrompt != null && !systemPrompt.isBlank()) {
                    messages.add(new SystemMessage(systemPrompt));
                }
                messages.add(new UserMessage(fullPrompt));

                ChatResponse response = chatModel.call(new Prompt(messages, buildOptions(scene)));
                IntelligenceInferenceResult result = convertResult(response, start);
                recordTokenUsage(result);
                return result;
            } catch (Exception e) {
                lastError = e;
                if (isRetryable(e) && attempt < 2) {
                    long backoffMs = (long) Math.pow(2, attempt) * 500 + (long)(Math.random() * 200);
                    log.warn("[SpringAiAdapter] chatWithVision failed (attempt={}), retrying in {}ms: {}", attempt + 1, backoffMs, e.getMessage());
                    try { Thread.sleep(backoffMs); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); break; }
                } else {
                    break;
                }
            }
        }
        log.warn("[SpringAiAdapter] chatWithVision failed after retries: {}", lastError != null ? lastError.getMessage() : "unknown");
        return buildErrorResult(lastError, start);
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
                .model(modelName)
                .temperature(temperature)
                .maxTokens(maxTokens)
                .build();
    }

    private OpenAiChatOptions buildOptions(String scene, List<AiTool> tools) {
        OpenAiChatOptions base = buildOptions(scene);
        if (tools == null || tools.isEmpty()) {
            return base;
        }
        return OpenAiChatOptions.builder()
                .model(base.getModel())
                .temperature(base.getTemperature())
                .maxTokens(base.getMaxTokens())
                .toolCallbacks(convertToolCallbacks(tools))
                .build();
    }

    /** D-744b：在工具版 options 基础上支持 per-call 模型覆盖（模型分级路径用） */
    private OpenAiChatOptions buildOptions(String scene, List<AiTool> tools, String modelId) {
        OpenAiChatOptions base = buildOptions(scene, tools);
        if (modelId == null || modelId.isBlank() || modelId.equals(base.getModel())) {
            return base;
        }
        return OpenAiChatOptions.builder()
                .model(modelId)
                .temperature(base.getTemperature())
                .maxTokens(base.getMaxTokens())
                .toolCallbacks(base.getToolCallbacks())
                .build();
    }

    /**
     * 带模型 ID 的 options 构建（per-call model selection 支持）。
     *
     * @param scene   场景
     * @param modelId 模型 ID，null 则用默认模型
     */
    private OpenAiChatOptions buildOptionsWithModel(String scene, String modelId) {
        double temperature = resolveTemperature(scene);
        int maxTokens = resolveMaxTokens(scene);
        OpenAiChatOptions.Builder builder = OpenAiChatOptions.builder()
                .model(modelId != null && !modelId.isBlank() ? modelId : modelName)
                .temperature(temperature)
                .maxTokens(maxTokens);
        return builder.build();
    }

    /**
     * 带模型选择的聊天接口实现（per-call model selection）。
     * 如果 modelId 不为空，则覆盖默认模型配置；否则降级到标准 chat。
     */
    @Override
    public String chatWithModel(String prompt, Long tenantId, Long userId, String modelId) {
        long start = System.currentTimeMillis();
        IntelligenceInferenceResult budgetCheck = checkTokenBudget(start);
        if (budgetCheck != null) {
            return budgetCheck.getContent() != null ? budgetCheck.getContent() : "";
        }

        Exception lastError = null;
        for (int attempt = 0; attempt < 3; attempt++) {
            try {
                OpenAiChatModel chatModel = chatModelProvider.getIfAvailable();
                if (chatModel == null) {
                    log.warn("[SpringAiAdapter] chatWithModel: ChatModel bean not available, fallback to default");
                    IntelligenceInferenceResult result = chat("model-selection", null, prompt);
                    return result != null ? result.getContent() : "";
                }
                ChatResponse response = chatModel.call(new Prompt(List.of(new UserMessage(prompt)),
                        buildOptionsWithModel("model-selection", modelId)));
                IntelligenceInferenceResult result = convertResult(response, start);
                if (modelId != null && !modelId.isBlank()) {
                    result.setModel(modelId);
                }
                recordTokenUsage(result);
                log.info("[SpringAiAdapter] chatWithModel success modelId={} tokens={}/{}",
                        modelId, result.getPromptTokens(), result.getCompletionTokens());
                return result.getContent() != null ? result.getContent() : "";
            } catch (Exception e) {
                lastError = e;
                if (isRetryable(e) && attempt < 2) {
                    long backoffMs = (long) Math.pow(2, attempt) * 500 + (long)(Math.random() * 200);
                    log.warn("[SpringAiAdapter] chatWithModel failed (attempt={}), retrying in {}ms: {}",
                            attempt + 1, backoffMs, e.getMessage());
                    try { Thread.sleep(backoffMs); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); break; }
                } else {
                    break;
                }
            }
        }
        log.warn("[SpringAiAdapter] chatWithModel failed after retries, fallback to default chat: {}",
                lastError != null ? lastError.getMessage() : "unknown");
        // 降级到标准 chat
        IntelligenceInferenceResult fallback = chat("model-selection", null, prompt);
        return fallback != null ? fallback.getContent() : "";
    }

    /**
     * 带模型覆盖 + 完整消息/工具的聊天（D-744b：PREMIUM 分级路径专用）。
     * 模型 ID 覆盖默认模型，工具定义照常下发——分级场景不再丢失工具调用能力。
     */
    @Override
    public IntelligenceInferenceResult chatWithModel(String scene, List<AiMessage> messages, List<AiTool> tools, String modelId) {
        long start = System.currentTimeMillis();
        IntelligenceInferenceResult budgetCheck = checkTokenBudget(start);
        if (budgetCheck != null) return budgetCheck;

        Exception lastError = null;
        for (int attempt = 0; attempt < 3; attempt++) {
            try {
                OpenAiChatModel chatModel = chatModelProvider.getIfAvailable();
                if (chatModel == null) {
                    return buildErrorResult(new IllegalStateException("ChatModel bean not available"), start);
                }
                ChatResponse response = chatModel.call(new Prompt(convertMessages(messages),
                        buildOptions(scene, tools, modelId)));
                IntelligenceInferenceResult result = convertResult(response, start);
                extractToolCalls(response, result);
                if (modelId != null && !modelId.isBlank()) {
                    result.setModel(modelId);
                }
                recordTokenUsage(result);
                return result;
            } catch (Exception e) {
                lastError = e;
                if (isRetryable(e) && attempt < 2) {
                    long backoffMs = (long) Math.pow(2, attempt) * 500 + (long)(Math.random() * 200);
                    log.warn("[SpringAiAdapter] chatWithModel(messages) failed (attempt={}), retrying in {}ms: {}",
                            attempt + 1, backoffMs, e.getMessage());
                    try { Thread.sleep(backoffMs); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); break; }
                } else {
                    break;
                }
            }
        }
        log.warn("[SpringAiAdapter] chatWithModel(messages) failed after retries: {}",
                lastError != null ? lastError.getMessage() : "unknown");
        return buildErrorResult(lastError, start);
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
            var usage = response.getMetadata().getUsage();
            if (usage != null && usage.getPromptTokens() != null && usage.getCompletionTokens() != null) {
                result.setPromptTokens(Math.toIntExact(usage.getPromptTokens()));
                result.setCompletionTokens(Math.toIntExact(usage.getCompletionTokens()));
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

    /**
     * 工具定义转换。2.0 起请求侧只需 {@link ToolDefinition}（name/description/inputSchema），
     * 执行闭环在 IntelligenceInferenceOrchestrator——回调体永远不会被调用，仅作防御。
     */
    private List<ToolCallback> convertToolCallbacks(List<AiTool> aiTools) {
        List<ToolCallback> result = new ArrayList<>();
        for (AiTool tool : aiTools) {
            if (tool.getFunction() == null) continue;
            AiTool.AiFunction fn = tool.getFunction();
            String inputSchema = "{}";
            try {
                if (fn.getParameters() != null) {
                    inputSchema = MAPPER.writeValueAsString(fn.getParameters());
                }
            } catch (Exception e) {
                log.warn("[SpringAiAdapter] tool {} schema serialization failed, fallback to empty schema: {}",
                        fn.getName(), e.getMessage());
            }
            ToolDefinition definition = ToolDefinition.builder()
                    .name(fn.getName())
                    .description(fn.getDescription() != null ? fn.getDescription() : "")
                    .inputSchema(inputSchema)
                    .build();
            result.add(new NonExecutableToolCallback(definition));
        }
        return result;
    }

    private record NonExecutableToolCallback(ToolDefinition definition) implements ToolCallback {

        @Override
        public ToolDefinition getToolDefinition() {
            return definition;
        }

        @Override
        public String call(String toolInput) {
            throw new IllegalStateException("工具执行由编排层负责，推理适配器不执行工具: " + definition.name());
        }
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
