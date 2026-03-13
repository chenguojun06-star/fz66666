package com.fashion.supplychain.intelligence.dto;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.Data;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 多代理图共享执行状态 — 贯穿 Plan→Act→Reflect-Critique 全生命周期的上下文载体。
 * 所有 Orchestrator 节点通过读写此 DTO 协作，无需跨 Service 直调。
 */
@Data
public class AgentState {

    private Long tenantId;
    private List<String> orderIds = new ArrayList<>();

    /** 分析场景：delivery_risk | sourcing | compliance | logistics | full */
    private String scene;

    /** Supervisor 路由决策结果 */
    private String route;

    /** 当前分析摘要（各节点累积填写） */
    private String contextSummary;

    /** ReflectionEngine 输出的批判性反思内容（JSON 格式） */
    private String reflection;

    /** 综合置信度评分 0-100 */
    private int confidenceScore;

    /** ReflectionEngine 提炼的优化建议 */
    private String optimizationSuggestion;

    // ── 评分维度（用于 confidenceScore 权重计算）──────────────────────────

    /** 订单整体进度率 0-100（来自 ProductionOrderService，Phase 2 对接） */
    private double progressRate;

    /** 综合风险分 0-100（越高越危险） */
    private double riskScore;

    /** 知识库匹配度 0-100 */
    private double knowledgeMatch;

    // ── v4.1 扩展字段 ─────────────────────────────────────────────────────

    /** 用户原始问题 */
    private String question;

    /** 各 Specialist 分析结果（route → analysisText） */
    private Map<String, String> specialistResults = new HashMap<>();

    /** 数字孪生快照（JSON 格式的订单聚合数据） */
    private String digitalTwinSnapshot;

    /** 节点执行轨迹（按执行顺序记录节点名称） */
    private List<String> nodeTrace = new ArrayList<>();

    /** 唯一执行ID（用于日志关联） */
    private String executionId;

    // ── 工具方法 ──────────────────────────────────────────────────────────

    private static final ObjectMapper JSON = new ObjectMapper();

    public String toJson() {
        try {
            return JSON.writeValueAsString(this);
        } catch (Exception e) {
            return "{}";
        }
    }
}
