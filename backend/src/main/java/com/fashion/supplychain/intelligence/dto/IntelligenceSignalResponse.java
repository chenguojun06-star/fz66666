package com.fashion.supplychain.intelligence.dto;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import lombok.Data;

/**
 * 智能信号采集响应 DTO
 *
 * <p>由 {@code IntelligenceSignalOrchestrator.collectAndAnalyze()} 返回，
 * 包含此次扫描发现的全部信号以及摘要统计。
 */
@Data
public class IntelligenceSignalResponse {

    /** 本次采集时间 */
    private LocalDateTime collectedAt = LocalDateTime.now();

    /** 共发现信号数量 */
    private int totalSignals;

    /** 严重(critical)信号数 */
    private int criticalCount;

    /** 警告(warning)信号数 */
    private int warningCount;

    /** 信息(info)信号数 */
    private int infoCount;

    /** AI 是否参与分析 */
    private boolean aiAnalysisEnabled;

    /** 信号明细列表 */
    private List<SignalItem> signals = new ArrayList<>();

    @Data
    public static class SignalItem {
        private Long id;
        private String signalType;
        private String signalCode;
        private String signalLevel;          // critical / warning / info
        private String sourceDomain;
        private String sourceId;
        private String signalTitle;
        private String signalDetail;
        private String signalAnalysis;       // AI 生成的类人化分析
        private int priorityScore;           // 0-100
        private String status;              // open / handling / resolved
    }
}
