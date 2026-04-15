package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class ConstraintFormalizationOrchestrator {

    private final IntelligenceInferenceOrchestrator inferenceOrchestrator;
    private final ObjectMapper objectMapper;

    @Data
    public static class FormalizedConstraints {
        private String objective;
        private List<HardConstraint> hardConstraints = new ArrayList<>();
        private List<SoftConstraint> softConstraints = new ArrayList<>();
        private String rawLlmOutput;
    }

    @Data
    public static class HardConstraint {
        private String type;
        private String key;
        private String operator;
        private String value;
    }

    @Data
    public static class SoftConstraint {
        private String type;
        private String key;
        private double weight;
    }

    public FormalizedConstraints formalize(String userRequest, String businessContext) {
        String prompt = """
                你是一个约束提取专家。将以下业务请求转化为结构化约束条件。
                
                业务请求：%s
                业务上下文：%s
                
                严格输出以下JSON格式，不要输出其他内容：
                {
                  "objective": "minimize_cost" 或 "minimize_time" 或 "maximize_quality" 或 "maximize_delivery_rate",
                  "hard_constraints": [
                    {"type": "deadline", "key": "order_id", "operator": "<=", "value": "2026-05-20"},
                    {"type": "capacity", "key": "factory_id", "operator": "<=", "value": "500"}
                  ],
                  "soft_constraints": [
                    {"type": "preference", "key": "factory_id:A", "weight": 10.0}
                  ]
                }
                """.formatted(userRequest, businessContext);

        try {
            var result = inferenceOrchestrator.chat("nl-intent", prompt, "");
            String content = result.getContent();
            FormalizedConstraints fc = new FormalizedConstraints();
            fc.setRawLlmOutput(content);

            String jsonStr = extractJson(content);
            if (jsonStr != null) {
                JsonNode root = objectMapper.readTree(jsonStr);
                fc.setObjective(root.path("objective").asText("minimize_cost"));
                JsonNode hcs = root.path("hard_constraints");
                if (hcs.isArray()) {
                    for (JsonNode hc : hcs) {
                        HardConstraint c = new HardConstraint();
                        c.setType(hc.path("type").asText());
                        c.setKey(hc.path("key").asText());
                        c.setOperator(hc.path("operator").asText("<="));
                        c.setValue(hc.path("value").asText());
                        fc.getHardConstraints().add(c);
                    }
                }
                JsonNode scs = root.path("soft_constraints");
                if (scs.isArray()) {
                    for (JsonNode sc : scs) {
                        SoftConstraint c = new SoftConstraint();
                        c.setType(sc.path("type").asText());
                        c.setKey(sc.path("key").asText());
                        c.setWeight(sc.path("weight").asDouble(1.0));
                        fc.getSoftConstraints().add(c);
                    }
                }
            }
            return fc;
        } catch (Exception e) {
            log.warn("[ConstraintFormalization] failed: {}", e.getMessage());
            FormalizedConstraints fc = new FormalizedConstraints();
            fc.setObjective("minimize_cost");
            return fc;
        }
    }

    private String extractJson(String text) {
        int start = text.indexOf('{');
        int end = text.lastIndexOf('}');
        if (start >= 0 && end > start) return text.substring(start, end + 1);
        return null;
    }
}
