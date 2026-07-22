package com.fashion.supplychain.intelligence.scan.graph;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 扫码状态机转换记录 DTO（P1-2 LangGraph State Graph）。
 *
 * <p>记录一次状态转换的完整信息：from → to、操作人、原因、时间戳、HITL 审批结果。</p>
 *
 * @author xiaoyun
 * @since 2026-07-22
 */
@Data
@Builder
public class ScanStateTransition {

    /** 日志主键 ID */
    private Long id;

    /** 租户 ID（P0 铁律4：多租户隔离） */
    private Long tenantId;

    /** 裁剪菲号 ID */
    private Long bundleId;

    /** 原状态（首次为 null） */
    private ScanState fromState;

    /** 目标状态 */
    private ScanState toState;

    /** 操作人 */
    private String operator;

    /** 转换原因 */
    private String reason;

    /** 转换时间戳 */
    private LocalDateTime timestamp;

    /** HITL 审批结果（null=非 HITL 转换；true=审批通过；false=审批拒绝） */
    private Boolean approved;
}
