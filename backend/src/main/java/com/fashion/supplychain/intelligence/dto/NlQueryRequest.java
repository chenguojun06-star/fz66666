package com.fashion.supplychain.intelligence.dto;

import lombok.Data;

/**
 * AI决策助手请求 — 自然语言查询
 */
@Data
public class NlQueryRequest {
    /** 用户自然语言问题 */
    private String question;
    /**
     * 会话标识（可选）— 用于多轮对话上下文车车车车车关联；前端可不传，系统自动以 tenantId 展开单一默认 session
     */
    private String sessionId;
}
