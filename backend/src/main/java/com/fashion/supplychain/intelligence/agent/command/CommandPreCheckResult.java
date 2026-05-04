package com.fashion.supplychain.intelligence.agent.command;

import java.util.ArrayList;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CommandPreCheckResult {
    private boolean passed;
    private String reason;
    @Builder.Default
    private List<String> warnings = new ArrayList<>();

    public static CommandPreCheckResult ok() {
        return CommandPreCheckResult.builder().passed(true).reason("前置校验通过").build();
    }

    public static CommandPreCheckResult reject(String reason) {
        return CommandPreCheckResult.builder().passed(false).reason(reason).build();
    }
}
