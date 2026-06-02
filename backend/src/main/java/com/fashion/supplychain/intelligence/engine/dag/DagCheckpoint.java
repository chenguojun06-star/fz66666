package com.fashion.supplychain.intelligence.engine.dag;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class DagCheckpoint {
    private String threadId;
    private int stepIndex;
    private String nodeId;
    private Map<String, Object> state;
    private String status;
    private LocalDateTime timestamp;
    private long durationMs;

    public DagCheckpoint(String threadId, int stepIndex, String nodeId, Map<String, Object> state) {
        this.threadId = threadId;
        this.stepIndex = stepIndex;
        this.nodeId = nodeId;
        this.state = state == null ? new HashMap<>() : new HashMap<>(state);
        this.status = "OK";
        this.timestamp = LocalDateTime.now();
    }
}
