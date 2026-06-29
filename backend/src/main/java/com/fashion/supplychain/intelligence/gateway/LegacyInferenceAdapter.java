package com.fashion.supplychain.intelligence.gateway;

import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

@Slf4j
@Component
@Lazy
public class LegacyInferenceAdapter implements AiInferenceGateway {

    @Autowired
    private IntelligenceInferenceOrchestrator delegate;

    @Override
    public IntelligenceInferenceResult chat(String scene, String systemPrompt, String userMessage) {
        return delegate.chat(scene, systemPrompt, userMessage);
    }

    @Override
    public IntelligenceInferenceResult chat(String scene, List<AiMessage> messages, List<AiTool> tools) {
        return delegate.chat(scene, messages, tools);
    }

    @Override
    public IntelligenceInferenceResult chatStream(String scene, List<AiMessage> messages,
                                                   List<AiTool> tools,
                                                   StreamChunkConsumer chunkConsumer) {
        IntelligenceInferenceOrchestrator.StreamChunkConsumer adapted =
                (chunk, isDone) -> chunkConsumer.accept(chunk, isDone);
        return delegate.chatStream(scene, messages, tools, adapted);
    }

    @Override
    public IntelligenceInferenceResult chatWithVision(String scene, String systemPrompt, String userMessage, String imageUrl) {
        // 合并 systemPrompt 和 userMessage 传递给 delegate
        String fullPrompt = (systemPrompt != null ? systemPrompt + "\n\n" : "") + userMessage;
        String resultText = delegate.chatWithVision(imageUrl, fullPrompt);
        
        IntelligenceInferenceResult result = new IntelligenceInferenceResult();
        result.setSuccess(true);
        result.setProvider("legacy");
        result.setContent(resultText);
        result.setPromptTokens(0);
        result.setCompletionTokens(0);
        result.setLatencyMs(0);
        
        return result;
    }

    @Override
    public boolean isAvailable() {
        return delegate.isAnyModelEnabled();
    }

    @Override
    public boolean isVisionAvailable() {
        return delegate.isVisionModelEnabled();
    }

    @Override
    public String getProviderName() {
        return "legacy";
    }

    /**
     * 带模型选择的聊天接口实现（per-call model selection）。
     * Legacy 适配器不支持 per-call model 覆盖，降级到标准 chat。
     * modelId 仅记录日志，不真正生效（向后兼容）。
     */
    @Override
    public String chatWithModel(String prompt, Long tenantId, Long userId, String modelId) {
        log.info("[LegacyAdapter] chatWithModel: modelId={} (legacy adapter does not support per-call model, fallback to default)",
                modelId != null ? modelId : "default");
        IntelligenceInferenceResult result = chat("model-selection", null, prompt);
        return result != null ? result.getContent() : "";
    }
}
