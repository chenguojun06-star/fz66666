package com.fashion.supplychain.intelligence.engine.dto;

import lombok.Data;
import java.util.List;
import java.util.Map;

@Data
public class MultiIntentResult {
    private List<IntentCandidate> candidates;
    private Map<String, Object> modifiers;
    private Long tenantId;

    @Data
    public static class IntentCandidate {
        private String intent;
        private double confidence;

        public IntentCandidate() {}
        public IntentCandidate(String intent, double confidence) {
            this.intent = intent;
            this.confidence = confidence;
        }
    }
}
