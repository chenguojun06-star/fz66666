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

    boolean isAvailable();

    String getProviderName();
}
