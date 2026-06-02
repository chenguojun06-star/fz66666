package com.fashion.supplychain.intelligence.engine.dag;

import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Data
@NoArgsConstructor
public class DagExecutionResult {
    private String threadId;
    private int stepIndex;
    private List<String> executedNodes = new ArrayList<>();
    private List<String> skippedNodes = new ArrayList<>();
    private List<String> failedNodes = new ArrayList<>();
    private Map<String, Object> finalState = new HashMap<>();
    private List<DagCheckpoint> checkpoints = new ArrayList<>();
    private boolean success;
    private long durationMs;
    private String errorMessage;
}
