package com.fashion.supplychain.intelligence.engine.risk;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RiskItem {
    private String id;
    private RiskType type;
    private String severity;
    private double score;
    private String orderId;
    private String factoryId;
    private String description;
    private String suggestedAction;
    private LocalDateTime detectedAt;
    private Map<String, Object> metadata = new HashMap<>();

    public static RiskItem create(RiskType type, String severity, double score) {
        RiskItem item = RiskItem.builder()
                .id(UUID.randomUUID().toString())
                .type(type)
                .severity(severity)
                .score(score)
                .detectedAt(LocalDateTime.now())
                .metadata(new HashMap<>())
                .build();
        return item;
    }

    public boolean isHigh() {
        return "HIGH".equals(severity) || "CRITICAL".equals(severity);
    }

    public boolean isCritical() {
        return "CRITICAL".equals(severity);
    }
}
