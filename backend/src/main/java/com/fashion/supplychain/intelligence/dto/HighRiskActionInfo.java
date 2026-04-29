package com.fashion.supplychain.intelligence.dto;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 操作确认警示（双重确认机制）。
 *
 * <p>当 AI 对话执行了需要确认的工具时，响应的 highRiskActions 字段会带上每个工具的确认条目，
 * 前端可据此弹出确认对话框。</p>
 *
 * <p>确认层级：</p>
 * <ul>
 *   <li>high_risk：高风险写操作，需详细预览+风险提示</li>
 *   <li>write：普通写操作，需简洁预览</li>
 * </ul>
 */
public class HighRiskActionInfo {

    private String toolName;
    private String description;
    private String severity = "warn";
    private String confirmLevel = "high_risk";
    private String operationLabel;
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

    public String getConfirmLevel() { return confirmLevel; }
    public void setConfirmLevel(String confirmLevel) { this.confirmLevel = confirmLevel; }

    public String getOperationLabel() { return operationLabel; }
    public void setOperationLabel(String operationLabel) { this.operationLabel = operationLabel; }

    public Map<String, Object> getPayload() { return payload; }
    public void setPayload(Map<String, Object> payload) { this.payload = payload; }
}
