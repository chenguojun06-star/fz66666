package com.fashion.supplychain.intelligence.agent.planning;

import lombok.Data;
import java.util.List;

@Data
public class AgentPlan {
    private String planId;
    private String goal;
    private List<PlanStep> steps;
    private List<String> riskWarnings;
    private String expectedOutcome;
    private long createdAt;
    private boolean requiresVerification;

    @Data
    public static class PlanStep {
        private int order;
        private String action;
        private String toolName;
        private String rationale;
        private String expectedOutput;
        private List<String> verificationCriteria;
        private StepStatus status = StepStatus.PENDING;

        public enum StepStatus { PENDING, EXECUTING, COMPLETED, SKIPPED, FAILED }
    }

    public int getStepCount() {
        return steps != null ? steps.size() : 0;
    }

    public PlanStep getCurrentStep() {
        if (steps == null) return null;
        return steps.stream()
                .filter(s -> s.status == PlanStep.StepStatus.PENDING)
                .findFirst().orElse(null);
    }

    public boolean isComplete() {
        return steps != null && steps.stream()
                .allMatch(s -> s.status == PlanStep.StepStatus.COMPLETED
                        || s.status == PlanStep.StepStatus.SKIPPED);
    }

    public String summarize() {
        if (steps == null || steps.isEmpty()) return "空计划";
        StringBuilder sb = new StringBuilder();
        sb.append("目标: ").append(goal).append("\n");
        for (PlanStep step : steps) {
            sb.append("  ").append(step.order).append(". ")
                    .append(step.action).append(" → ")
                    .append(step.toolName != null ? step.toolName : "思考")
                    .append(" [").append(step.status).append("]\n");
        }
        return sb.toString();
    }
}