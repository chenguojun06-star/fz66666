package com.fashion.supplychain.intelligence.dto;

import lombok.Data;

/**
 * AI决策助手请求 — 自然语言查询
 */
@Data
public class NlQueryRequest {
    /** 用户自然语言问题 */
    private String question;
}
