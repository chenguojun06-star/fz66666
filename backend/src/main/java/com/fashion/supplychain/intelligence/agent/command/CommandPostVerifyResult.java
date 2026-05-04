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
public class CommandPostVerifyResult {
    private boolean passed;
    private String reason;
    @Builder.Default
    private List<String> dataIntegrityChecks = new ArrayList<>();

    public static CommandPostVerifyResult ok() {
        return CommandPostVerifyResult.builder()
                .passed(true)
                .reason("后置校验通过")
                .build();
    }

    public static CommandPostVerifyResult fail(String reason) {
        return CommandPostVerifyResult.builder()
                .passed(false)
                .reason(reason)
                .build();
    }
}
