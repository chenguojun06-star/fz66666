package com.fashion.supplychain.intelligence.agent.command;

import java.util.Collections;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CompensationResult {
    private boolean success;
    @Builder.Default
    private List<String> rolledBack = Collections.emptyList();
    @Builder.Default
    private List<String> failed = Collections.emptyList();
    @Builder.Default
    private List<String> unrecoverable = Collections.emptyList();
    private String error;

    public static CompensationResult empty() {
        return CompensationResult.builder()
                .success(true)
                .rolledBack(Collections.emptyList())
                .failed(Collections.emptyList())
                .unrecoverable(Collections.emptyList())
                .build();
    }

    public static CompensationResult ok(List<String> rolledBack) {
        return CompensationResult.builder()
                .success(true)
                .rolledBack(rolledBack)
                .failed(Collections.emptyList())
                .unrecoverable(Collections.emptyList())
                .build();
    }

    public static CompensationResult fail(String error) {
        return CompensationResult.builder()
                .success(false)
                .error(error)
                .rolledBack(Collections.emptyList())
                .failed(Collections.emptyList())
                .unrecoverable(Collections.emptyList())
                .build();
    }
}
