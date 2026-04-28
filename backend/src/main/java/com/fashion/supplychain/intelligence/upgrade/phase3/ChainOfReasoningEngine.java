package com.fashion.supplychain.intelligence.upgrade.phase3;

import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
@Slf4j
public class ChainOfReasoningEngine {

    @Value("${ai.cort.enabled:true}")
    private boolean enabled;

    @Value("${ai.cort.max-iterations:5}")
    private int maxIterations;

    @Autowired
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;

    public CortResult reasonWithTools(String scene, String question,
                                       List<AiMessage> context, List<AiTool> tools) {
        if (!enabled) {
            CortResult r = new CortResult();
            r.success = false;
            r.reason = "CoRT disabled";
            return r;
        }

        List<ReasoningStep> steps = new ArrayList<>();
        List<AiMessage> workingContext = new ArrayList<>(context);
        workingContext.add(AiMessage.user(question));

        String currentThought = question;
        for (int i = 0; i < maxIterations; i++) {
            ReasoningStep step = new ReasoningStep();
            step.stepIndex = i;

            IntelligenceInferenceResult inf = inferenceOrchestrator.chat(
                    scene + ":cort-step", workingContext, tools);
            step.thought = inf.getContent();
            step.toolCalls = inf.getToolCallCount();
            step.success = inf.isSuccess();

            if (inf.getToolCallCount() > 0 && inf.getToolCalls() != null) {
                for (var tc : inf.getToolCalls()) {
                    step.toolInvocations.add(tc.getFunction().getName());
                }
            }

            steps.add(step);
            workingContext.add(AiMessage.assistant(inf.getContent()));

            if (looksComplete(inf.getContent())) {
                break;
            }
            currentThought = inf.getContent();
        }

        CortResult result = new CortResult();
        result.success = !steps.isEmpty();
        result.finalAnswer = currentThought;
        result.steps = steps;
        result.totalIterations = steps.size();
        return result;
    }

    private boolean looksComplete(String content) {
        if (content == null) return false;
        String lower = content.toLowerCase();
        return lower.contains("结论") || lower.contains("总结")
                || lower.contains("综上") || lower.contains("因此")
                || lower.contains("建议") || lower.contains("结果");
    }

    @Data
    public static class ReasoningStep {
        private int stepIndex;
        private String thought;
        private int toolCalls;
        private boolean success;
        private List<String> toolInvocations = new ArrayList<>();
    }

    @Data
    public static class CortResult {
        private boolean success;
        private String reason;
        private String finalAnswer;
        private List<ReasoningStep> steps;
        private int totalIterations;
    }
}
