package com.fashion.supplychain.intelligence.agent.command;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CompensationEntry {
    private String toolName;
    private CompensableTool tool;
    private LocalDateTime executedAt;
    @Builder.Default
    private Map<String, Object> execSnapshot = Collections.emptyMap();

    public Map<String, Object> getExecSnapshot() {
        return execSnapshot != null ? execSnapshot : Collections.emptyMap();
    }
}
