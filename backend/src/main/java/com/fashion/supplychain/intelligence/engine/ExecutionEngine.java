package com.fashion.supplychain.intelligence.engine;

import com.fashion.supplychain.intelligence.engine.dto.ExecutionRequest;
import com.fashion.supplychain.intelligence.engine.dto.ExecutionResult;

public interface ExecutionEngine {
    ExecutionResult execute(ExecutionRequest req);

    ExecutionResult timeTravel(String threadId, int stepIndex);

    String selectBestPrompt(String intent);
}
