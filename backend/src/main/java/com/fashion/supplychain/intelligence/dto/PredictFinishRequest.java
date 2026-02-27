package com.fashion.supplychain.intelligence.dto;

import lombok.Data;

/**
 * 预测完成时间请求 DTO
 *
 * <p><b>优先路径：{@code orderId} + {@code stageName}</b>，后端自动从扫码记录和
 * 裁剪数据读取真实剩余件数，与进度球数据链路完全一致。
 *
 * <p>{@code currentProgress} 仅作备用降级：当无 orderId 或订单查不到时使用旧百分比模式。
 */
@Data
public class PredictFinishRequest {
    /** 生产订单 ID（优先） */
    private String orderId;
    /** 订单编号（orderId 不存在时备用） */
    private String orderNo;
    /** 款号（仅用于日志和展示，不参与计算） */
    private String styleNo;
    /** 父层工序阶段（对应进度球节点，如"车缝""尾部"） */
    private String stageName;
    /** 子工序名称（不传则仅按父阶段计算） */
    private String processName;
    /** 备用：前端计算的当前进度%，仅在 orderId 缺失时使用 */
    private Integer currentProgress;
}
