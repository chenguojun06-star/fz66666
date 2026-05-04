package com.fashion.supplychain.intelligence.agent.command;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CommandResult {
    private boolean success;
    private String message;
    private Map<String, Object> data;
    private String errorTraceId;
    private List<String> affectedEntities;
    private Map<String, Object> execSnapshot;

    public static CommandResult ok(String message) {
        return CommandResult.builder()
                .success(true)
                .message(message)
                .data(new LinkedHashMap<>())
                .execSnapshot(new LinkedHashMap<>())
                .build();
    }

    public static CommandResult ok(String message, Map<String, Object> data) {
        return CommandResult.builder()
                .success(true)
                .message(message)
                .data(data != null ? data : new LinkedHashMap<>())
                .execSnapshot(data != null ? data : new LinkedHashMap<>())
                .build();
    }

    public static CommandResult fail(String message, String errorTraceId) {
        return CommandResult.builder()
                .success(false)
                .message(message)
                .errorTraceId(errorTraceId)
                .data(new LinkedHashMap<>())
                .build();
    }
}
