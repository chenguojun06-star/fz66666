package com.fashion.supplychain.intelligence.engine.dto;

import lombok.Data;
import java.util.List;
import java.util.Map;

@Data
public class ExecutionResult {
    private String answer;
    private List<String> executedNodes;
    private Map<String, Object> state;
    private String threadId;
    private int stepIndex;
    private boolean success;
    private String errorMessage;
}
