package com.fashion.supplychain.intelligence.agent.dag;

import lombok.Data;

import java.util.Map;
import java.util.Set;

@Data
public class DagExecutionResult {

    private final String graphId;
    private final Set<String> completedNodes;
    private final Set<String> failedNodes;
    private final Map<String, Object> nodeResults;
    private final long latencyMs;

    public boolean isSuccess() {
        return failedNodes.isEmpty();
    }

    public int totalNodes() {
        return completedNodes.size() + failedNodes.size();
    }
}
