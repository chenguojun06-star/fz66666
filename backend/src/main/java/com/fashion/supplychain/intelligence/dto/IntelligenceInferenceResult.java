package com.fashion.supplychain.intelligence.dto;

import lombok.Data;

/**
 * 智能推理结果。
 *
 * <p>用于在模型网关编排器、观测编排器、上层业务调用方之间传递统一结果。</p>
 */
@Data
public class IntelligenceInferenceResult {

    private boolean success;
    private boolean fallbackUsed;
    private String provider;
    private String model;
    private String content;
    private String errorMessage;
    private long latencyMs;
    private int promptChars;
    private int responseChars;
}
