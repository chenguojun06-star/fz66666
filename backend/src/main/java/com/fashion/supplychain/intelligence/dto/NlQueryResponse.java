package com.fashion.supplychain.intelligence.dto;

import java.util.List;
import java.util.Map;
import lombok.Data;

/**
 * AI决策助手响应 — 结构化数据 + 解释文案
 */
@Data
public class NlQueryResponse {
    /** 识别到的意图 */
    private String intent;
    /** AI 回复文案 */
    private String answer;
    /** 置信度 0-100 */
    private int confidence;
    /** 结构化数据 */
    private Map<String, Object> data;
    /** 相关建议（后续可追问） */
    /** 要渲染的前端图表组件名（可选） */
    private String componentName;
    private List<String> suggestions;
    /** DeepSeek直接生成的AI洞察（仅当intent=ai_direct时有值） */
    private String aiInsight;
}
