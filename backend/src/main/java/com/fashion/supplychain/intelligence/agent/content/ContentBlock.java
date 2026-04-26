package com.fashion.supplychain.intelligence.agent.content;

import com.fasterxml.jackson.annotation.JsonTypeInfo;
import com.fasterxml.jackson.annotation.JsonTypeName;

import java.util.List;
import java.util.Map;

@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY, property = "type")
public sealed interface ContentBlock permits
        ContentBlock.TextBlock,
        ContentBlock.ThinkingBlock,
        ContentBlock.ToolUseBlock,
        ContentBlock.ToolResultBlock,
        ContentBlock.ChartBlock,
        ContentBlock.ActionCardBlock,
        ContentBlock.InsightCardBlock,
        ContentBlock.StepWizardBlock {

    @JsonTypeName("text")
    record TextBlock(String text) implements ContentBlock {}

    @JsonTypeName("thinking")
    record ThinkingBlock(String thinking) implements ContentBlock {}

    @JsonTypeName("tool_use")
    record ToolUseBlock(String id, String name, Map<String, Object> input) implements ContentBlock {}

    @JsonTypeName("tool_result")
    record ToolResultBlock(String toolUseId, String content, boolean isError) implements ContentBlock {}

    @JsonTypeName("chart")
    record ChartBlock(String chartType, String title, Object data) implements ContentBlock {}

    @JsonTypeName("action_card")
    record ActionCardBlock(String title, String desc, List<ActionItem> actions) implements ContentBlock {}

    @JsonTypeName("insight_card")
    record InsightCardBlock(String title, String summary, String severity, Map<String, Object> metadata) implements ContentBlock {}

    @JsonTypeName("step_wizard")
    record StepWizardBlock(String title, List<StepItem> steps, int currentStep) implements ContentBlock {}

    record ActionItem(String label, String type, Map<String, Object> params) {}
    record StepItem(String title, String description, boolean completed) {}
}
