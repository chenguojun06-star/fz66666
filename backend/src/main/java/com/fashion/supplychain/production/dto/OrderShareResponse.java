package com.fashion.supplychain.production.dto;

import lombok.Data;
import java.util.List;

/**
 * 客户订单分享页响应 DTO（公开接口，无需鉴权）
 * ⚠️ 仅包含可公开的字段，严禁暴露内部价格、工人信息、财务数据
 */
@Data
public class OrderShareResponse {

    /** 分享令牌（用于二次访问验证） */
    private String token;

    /** 订单编号 */
    private String orderNo;

    /** 款号 */
    private String styleNo;

    /** 款式名称 */
    private String styleName;

    /** 款式图 */
    private String styleCover;

    /** 颜色 */
    private String color;

    /** 尺码 */
    private String size;

    /** 订单数量（件） */
    private Integer orderQuantity;

    /** 已完成数量（件） */
    private Integer completedQuantity;

    /** 生产进度（0-100，百分比） */
    private Integer productionProgress;

    /** 当前状态（中文） */
    private String statusText;

    /** 计划交货日期（yyyy-MM-dd） */
    private String plannedEndDate;

    /** 实际完成日期（yyyy-MM-dd，仅已完成时有值） */
    private String actualEndDate;

    /** 创建时间（yyyy-MM-dd） */
    private String createTime;

    /** 最近一次扫码时间（拼装最新生产动态） */
    private String latestScanTime;

    /** 最近扫码工序名 */
    private String latestScanStage;

    /** 生产工厂名（可选公开，根据租户配置控制） */
    private String factoryName;

    /** 分享码有效期（UTC 毫秒时间戳） */
    private Long expiresAt;

    /** 租户公司名（品牌形象） */
    private String companyName;

    /** 订单备注 */
    private String remarks;

    /** 当前所处进度节点 */
    private String currentStage;

    /** 尺码数量分布 */
    private List<SizeQuantity> sizeQuantities;

    /** 颜色尺码数量分布 */
    private List<ColorSizeQuantity> colorSizeQuantities;

    /** 工序阶段进度 */
    private List<StageProgress> stages;

    /** 近期扫码动态 */
    private List<ScanEntry> recentScans;

    /** AI 预测信息 */
    private AiPrediction aiPrediction;

    @Data
    public static class StageProgress {
        private String stageName;
        private Integer rate;
        private String status;
    }

    @Data
    public static class SizeQuantity {
        private String size;
        private Integer quantity;
    }

    @Data
    public static class ColorSizeQuantity {
        private String color;
        private String size;
        private Integer quantity;
    }

    @Data
    public static class ScanEntry {
        private String processName;
        private Integer quantity;
        private String scanTime;
    }

    @Data
    public static class AiPrediction {
        private String predictedFinishDate;
        private Integer estimatedRemainingDays;
        private Integer confidence;
        private String riskLevel;
        private String riskReason;
    }
}
