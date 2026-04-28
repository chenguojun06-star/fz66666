package com.fashion.supplychain.intelligence.upgrade.phase2;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fashion.supplychain.intelligence.agent.AiTool;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Set;

@Service
public class StructuredOutputService {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Set<String> JSON_MODE_SCENES = Set.of(
            "nl-intent", "agent-loop", "critic_review", "daily-brief"
    );

    @Value("${ai.structured-output.enabled:true}")
    public boolean enabled;

    public String enhanceRequestBody(String requestBody, String scene, List<AiTool> tools) {
        if (!enabled) return requestBody;
        if (tools != null && !tools.isEmpty()) return requestBody;
        if (!JSON_MODE_SCENES.contains(scene)) return requestBody;
        try {
            ObjectNode root = (ObjectNode) MAPPER.readTree(requestBody);
            ObjectNode responseFormat = MAPPER.createObjectNode();
            responseFormat.put("type", "json_object");
            root.set("response_format", responseFormat);
            return MAPPER.writeValueAsString(root);
        } catch (Exception e) {
            return requestBody;
        }
    }

    public boolean shouldUseJsonMode(String scene, List<AiTool> tools) {
        if (!enabled) return false;
        if (tools != null && !tools.isEmpty()) return false;
        return JSON_MODE_SCENES.contains(scene);
    }

    public StructuredParseResult parseStructuredOutput(String content) {
        StructuredParseResult result = new StructuredParseResult();
        if (content == null || content.isBlank()) {
            result.valid = false;
            result.error = "empty content";
            return result;
        }
        try {
            String trimmed = content.trim();
            if (trimmed.startsWith("```json")) {
                trimmed = trimmed.substring(7);
                if (trimmed.endsWith("```")) trimmed = trimmed.substring(0, trimmed.length() - 3);
                trimmed = trimmed.trim();
            }
            JsonNode node = MAPPER.readTree(trimmed);
            result.valid = true;
            result.parsed = node;
            if (node.has("intent")) result.intent = node.get("intent").asText();
            if (node.has("confidence")) result.confidence = node.get("confidence").asInt(0);
            if (node.has("answer")) result.answer = node.get("answer").asText();
        } catch (Exception e) {
            result.valid = false;
            result.error = e.getMessage();
        }
        return result;
    }

    public static class StructuredParseResult {
        public boolean valid;
        public String error;
        public JsonNode parsed;
        public String intent;
        public int confidence;
        public String answer;
    }
}
