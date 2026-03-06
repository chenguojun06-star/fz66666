package com.fashion.supplychain.intelligence.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 客户进度门户 — 公开订单追踪响应
 * 通过 share token 无需认证即可访问
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OrderTrackResponse {

    // ─── 基本信息 ───────────────────────────────────────────────
    private String orderNo;
    private String styleName;
    private String factoryName;
    private Integer orderQuantity;
    private Integer completedQuantity;
    private Integer productionProgress;   // 0-100%
    private String  status;               // 订单状态（中文）
    private LocalDateTime expectedShipDate;
    private LocalDateTime actualStartDate;

    // ─── 工序阶段进度（6大工序） ────────────────────────────────
    private List<StageProgress> stages;

    // ─── 近期扫码动态（最新10条） ───────────────────────────────
    private List<ScanEntry> recentScans;

    // ─── AI 完工预测 ────────────────────────────────────────────
    private AiPrediction aiPrediction;

    // ─── 分享链接元信息 ─────────────────────────────────────────
    private ShareInfo shareInfo;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class StageProgress {
        private String stageName;   // 采购/裁剪/车缝/质检/入库/包装
        private Integer rate;       // 0-100%
        private String status;      // DONE / ACTIVE / PENDING
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ScanEntry {
        private String processName;
        private Integer quantity;
        private LocalDateTime scanTime;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class AiPrediction {
        private String predictedFinishDate;   // 格式 "MM月dd日"
        private Integer confidence;           // 0-100%
        private String riskLevel;             // LOW / MEDIUM / HIGH
        private String riskReason;            // 风险说明
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ShareInfo {
        private LocalDateTime expiresAt;
        private boolean tokenValid;
        private int accessCount;
    }
}
