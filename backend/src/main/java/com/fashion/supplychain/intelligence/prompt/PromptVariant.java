package com.fashion.supplychain.intelligence.prompt;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PromptVariant {
    private String variantId;
    private String segmentName;
    private String content;
    private double weight;
    private String status;
    private List<Double> scoreHistory = new ArrayList<>();
    private AtomicInteger exposureCount = new AtomicInteger(0);
    private LocalDateTime createdAt;
    private LocalDateTime lastUsedAt;
    private String parentVariantId;
    private String mutationReason;

    public PromptVariant(String variantId, String segmentName, String content, double weight) {
        this.variantId = variantId;
        this.segmentName = segmentName;
        this.content = content;
        this.weight = weight;
        this.status = "ACTIVE";
        this.createdAt = LocalDateTime.now();
    }

    public void recordScore(double score) {
        if (scoreHistory == null) scoreHistory = new ArrayList<>();
        scoreHistory.add(score);
        if (scoreHistory.size() > 200) scoreHistory = new ArrayList<>(scoreHistory.subList(scoreHistory.size() - 200, scoreHistory.size()));
        lastUsedAt = LocalDateTime.now();
        exposureCount.incrementAndGet();
    }

    public double averageScore() {
        if (scoreHistory == null || scoreHistory.isEmpty()) return 0.0;
        return scoreHistory.stream().mapToDouble(Double::doubleValue).average().orElse(0.0);
    }

    public int totalExposures() {
        return exposureCount.get();
    }

    public boolean hasMinimumSamples(int minSamples) {
        return totalExposures() >= minSamples;
    }
}
