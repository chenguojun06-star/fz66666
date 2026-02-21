package com.fashion.supplychain.websocket.enums;

import lombok.Getter;

/**
 * WebSocket消息类型枚举
 */
@Getter
public enum WebSocketMessageType {

    // 扫码相关
    SCAN_SUCCESS("scan:success", "扫码成功"),
    SCAN_UNDO("scan:undo", "撤销扫码"),

    // 订单相关
    ORDER_CREATED("order:created", "订单创建"),
    ORDER_UPDATED("order:updated", "订单更新"),
    ORDER_STATUS_CHANGED("order:status:changed", "订单状态变更"),
    ORDER_PROGRESS_CHANGED("order:progress:changed", "订单进度变更"),

    // 任务相关
    TASK_RECEIVED("task:received", "领取任务"),
    TASK_COMPLETED("task:completed", "完成任务"),

    // 质检相关
    QUALITY_CHECKED("quality:checked", "质检完成"),

    // 入库相关
    WAREHOUSE_IN("warehouse:in", "入库操作"),
    WAREHOUSE_OUT("warehouse:out", "出库操作"),

    // 支付相关
    PAYMENT_CREATED("payment:created", "支付发起"),
    PAYMENT_SUCCESS("payment:success", "支付成功"),

    // 通用数据变更
    DATA_CHANGED("data:changed", "数据变更"),
    REFRESH_ALL("refresh:all", "刷新所有数据"),

    // 注册审批
    WORKER_REGISTRATION_PENDING("worker:registration:pending", "工人注册待审批"),
    TENANT_APPLICATION_PENDING("tenant:application:pending", "工厂入驻申请待审批"),

    // 系统消息
    PING("ping", "心跳"),
    PONG("pong", "心跳响应"),
    ERROR("error", "错误");

    private final String code;
    private final String description;

    WebSocketMessageType(String code, String description) {
        this.code = code;
        this.description = description;
    }

    /**
     * 根据code获取枚举
     */
    public static WebSocketMessageType fromCode(String code) {
        for (WebSocketMessageType type : values()) {
            if (type.getCode().equals(code)) {
                return type;
            }
        }
        return null;
    }
}
