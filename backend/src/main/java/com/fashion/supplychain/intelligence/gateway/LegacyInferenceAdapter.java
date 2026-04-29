package com.fashion.supplychain.intelligence.gateway;

import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Slf4j
@Component
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
    public boolean isAvailable() {
        return delegate.isAnyModelEnabled();
    }

    @Override
    public String getProviderName() {
        return "legacy";
    }
}
