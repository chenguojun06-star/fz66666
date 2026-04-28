package com.fashion.supplychain.intelligence.upgrade.phase4;

import lombok.Data;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class ConfidenceDecisionService {

    public DecisionPanel buildPanel(String answer, int confidence,
                                     String dataSource, String toolName,
                                     List<String> reasoningSteps,
                                     Map<String, Object> supportingData) {
        DecisionPanel panel = new DecisionPanel();
        panel.answer = answer;
        panel.confidence = confidence;
        panel.confidenceLevel = resolveLevel(confidence);
        panel.confidenceColor = resolveColor(confidence);

        DecisionRationale rationale = new DecisionRationale();
        rationale.dataSource = dataSource != null ? dataSource : "工具计算结果";
        rationale.toolName = toolName;
        rationale.reasoningSteps = reasoningSteps != null ? reasoningSteps : Collections.emptyList();
        rationale.supportingData = supportingData != null ? supportingData : Collections.emptyMap();
        panel.rationale = rationale;

        if (confidence < 50) {
            panel.warnings = List.of("置信度较低，建议人工核实");
        } else if (confidence < 80) {
            panel.warnings = List.of("置信度中等，建议参考决策理由判断");
        } else {
            panel.warnings = Collections.emptyList();
        }

        return panel;
    }

    public ConfidenceTrend analyzeTrend(List<Integer> recentConfidences) {
        ConfidenceTrend trend = new ConfidenceTrend();
        if (recentConfidences == null || recentConfidences.isEmpty()) {
            trend.average = 0;
            trend.trend = "no_data";
            return trend;
        }
        trend.average = (int) recentConfidences.stream().mapToInt(i -> i).average().orElse(0);
        trend.min = recentConfidences.stream().mapToInt(i -> i).min().orElse(0);
        trend.max = recentConfidences.stream().mapToInt(i -> i).max().orElse(0);
        trend.sampleSize = recentConfidences.size();

        if (recentConfidences.size() >= 3) {
            int firstHalf = (int) recentConfidences.subList(0, recentConfidences.size() / 2).stream()
                    .mapToInt(i -> i).average().orElse(0);
            int secondHalf = (int) recentConfidences.subList(recentConfidences.size() / 2, recentConfidences.size()).stream()
                    .mapToInt(i -> i).average().orElse(0);
            if (secondHalf > firstHalf + 5) trend.trend = "improving";
            else if (secondHalf < firstHalf - 5) trend.trend = "declining";
            else trend.trend = "stable";
        } else {
            trend.trend = "insufficient_data";
        }
        return trend;
    }

    private String resolveLevel(int confidence) {
        if (confidence >= 80) return "high";
        if (confidence >= 50) return "medium";
        return "low";
    }

    private String resolveColor(int confidence) {
        if (confidence >= 80) return "green";
        if (confidence >= 50) return "yellow";
        return "red";
    }

    @Data
    public static class DecisionPanel {
        private String answer;
        private int confidence;
        private String confidenceLevel;
        private String confidenceColor;
        private DecisionRationale rationale;
        private List<String> warnings;
    }

    @Data
    public static class DecisionRationale {
        private String dataSource;
        private String toolName;
        private List<String> reasoningSteps;
        private Map<String, Object> supportingData;
    }

    @Data
    public static class ConfidenceTrend {
        private int average;
        private int min;
        private int max;
        private int sampleSize;
        private String trend;
    }
}
