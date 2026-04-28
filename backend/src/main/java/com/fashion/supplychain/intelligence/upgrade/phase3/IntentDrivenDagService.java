package com.fashion.supplychain.intelligence.upgrade.phase3;

import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fashion.supplychain.intelligence.agent.dag.DagGraph;
import com.fashion.supplychain.intelligence.agent.dag.DagNode;
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
public class IntentDrivenDagService {

    @Value("${ai.intent-dag.enabled:true}")
    private boolean enabled;

    @Autowired
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;

    public DagPlanResult planFromIntent(String scene, String userQuery, List<AiMessage> context) {
        if (!enabled) {
            DagPlanResult r = new DagPlanResult();
            r.success = false;
            r.reason = "intent-dag disabled";
            return r;
        }

        String planPrompt = buildPlanPrompt(userQuery);
        List<AiMessage> messages = new ArrayList<>(context);
        messages.add(AiMessage.user(planPrompt));

        IntelligenceInferenceResult inf = inferenceOrchestrator.chat(scene + ":intent-plan", messages, null);

        DagPlanResult result = new DagPlanResult();
        result.intent = parseIntent(inf.getContent());
        result.targetEntity = parseTargetEntity(inf.getContent());
        result.dagGraph = buildDagFromPlan(inf.getContent());
        result.rawPlan = inf.getContent();
        result.success = result.dagGraph != null;
        return result;
    }

    private String buildPlanPrompt(String query) {
        return "分析用户意图并生成执行计划(JSON格式):\n"
                + "用户输入: " + query + "\n"
                + "返回格式: {\"intent\":\"...\",\"target\":\"...\",\"steps\":["
                + "{\"id\":\"step1\",\"tool\":\"toolName\",\"depends\":[],\"desc\":\"...\"}]}\n"
                + "可用工具: order_query, production_progress, scan_stats, delay_analysis, "
                + "root_cause_analysis, factory_bottleneck, supplier_scorecard, financial_report, "
                + "smart_report, deep_analysis, rca_analysis";
    }

    private String parseIntent(String content) {
        try {
            com.fasterxml.jackson.databind.JsonNode node = extractJson(content);
            if (node != null && node.has("intent")) return node.get("intent").asText();
        } catch (Exception ignored) {}
        return "unknown";
    }

    private String parseTargetEntity(String content) {
        try {
            com.fasterxml.jackson.databind.JsonNode node = extractJson(content);
            if (node != null && node.has("target")) return node.get("target").asText();
        } catch (Exception ignored) {}
        return null;
    }

    private DagGraph buildDagFromPlan(String content) {
        try {
            com.fasterxml.jackson.databind.JsonNode node = extractJson(content);
            if (node == null || !node.has("steps")) return null;

            DagGraph graph = new DagGraph("intent-dag", "意图驱动DAG");

            for (com.fasterxml.jackson.databind.JsonNode step : node.get("steps")) {
                String id = step.path("id").asText();
                String desc = step.path("desc").asText();

                List<String> depends = new ArrayList<>();
                if (step.has("depends") && step.get("depends").isArray()) {
                    for (com.fasterxml.jackson.databind.JsonNode dep : step.get("depends")) {
                        depends.add(dep.asText());
                    }
                }

                DagNode dagNode = new DagNode(id, desc, depends.toArray(new String[0]));
                graph.addNode(dagNode);
            }
            return graph;
        } catch (Exception e) {
            log.debug("[IntentDag] plan parse failed: {}", e.getMessage());
            return null;
        }
    }

    private com.fasterxml.jackson.databind.JsonNode extractJson(String content) {
        if (content == null) return null;
        try {
            String trimmed = content.trim();
            if (trimmed.startsWith("```json")) {
                trimmed = trimmed.substring(7);
                if (trimmed.endsWith("```")) trimmed = trimmed.substring(0, trimmed.length() - 3);
            } else if (trimmed.startsWith("```")) {
                trimmed = trimmed.substring(3);
                if (trimmed.endsWith("```")) trimmed = trimmed.substring(0, trimmed.length() - 3);
            }
            return new com.fasterxml.jackson.databind.ObjectMapper().readTree(trimmed.trim());
        } catch (Exception e) {
            int start = content.indexOf('{');
            int end = content.lastIndexOf('}');
            if (start >= 0 && end > start) {
                try {
                    return new com.fasterxml.jackson.databind.ObjectMapper().readTree(content.substring(start, end + 1));
                } catch (Exception ignored) {}
            }
            return null;
        }
    }

    @Data
    public static class DagPlanResult {
        private boolean success;
        private String reason;
        private String intent;
        private String targetEntity;
        private DagGraph dagGraph;
        private String rawPlan;
    }
}
