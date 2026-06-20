package com.fashion.supplychain.intelligence.gateway;

import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import java.util.List;

public interface AiInferenceGateway {

    IntelligenceInferenceResult chat(String scene, String systemPrompt, String userMessage);

    IntelligenceInferenceResult chat(String scene, List<AiMessage> messages, List<AiTool> tools);

    IntelligenceInferenceResult chatStream(String scene, List<AiMessage> messages,
                                            List<AiTool> tools,
                                            StreamChunkConsumer chunkConsumer);

    IntelligenceInferenceResult chatWithVision(String scene, String systemPrompt, String userMessage, String imageUrl);

    boolean isAvailable();

    String getProviderName();

    /**
     * 带模型选择的聊天接口（per-call model selection）。
     *
     * <p>借鉴 Claude Agent SDK per-call model selection：每次调用可指定模型，
     * 简单查询用经济型模型，复杂推理用旗舰模型，避免一刀切浪费成本。
     *
     * @param prompt   完整提示词（已包含 system + user 内容）
     * @param tenantId 租户 ID（多租户隔离 + 成本追踪，可为 null）
     * @param userId   用户 ID（成本追踪，可为 null）
     * @param modelId  模型 ID（如 deepseek-chat / deepseek-reasoner / glm-4-plus），null 则用默认模型
     * @return LLM 回答文本
     */
    default String chatWithModel(String prompt, Long tenantId, Long userId, String modelId) {
        // 默认实现：降级到标准 chat 方法，忽略 modelId（向后兼容）
        IntelligenceInferenceResult result = chat("model-selection", null, prompt);
        return result != null ? result.getContent() : "";
    }
}
