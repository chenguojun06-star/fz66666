package com.fashion.supplychain.intelligence.dto;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 高风险工具执行警示（功能 G 二次确认）。
 *
 * <p>当 AI 对话执行了需要二次确认的工具（如 scan_undo / order_edit / payroll_approve）时，
 * 响应的 highRiskActions 字段会带上每个工具的警示条目，前端可据此弹出确认对话框。
 */
public class HighRiskActionInfo {

    private String toolName;
    private String description;
    private String severity = "warn";
    private Map<String, Object> payload = new LinkedHashMap<>();

    public HighRiskActionInfo() {}

    public HighRiskActionInfo(String toolName, String description, String severity) {
        this.toolName = toolName;
        this.description = description;
        this.severity = severity;
    }

    public String getToolName() { return toolName; }
    public void setToolName(String toolName) { this.toolName = toolName; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getSeverity() { return severity; }
    public void setSeverity(String severity) { this.severity = severity; }

    public Map<String, Object> getPayload() { return payload; }
    public void setPayload(Map<String, Object> payload) { this.payload = payload; }
}
