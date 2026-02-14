package com.fashion.supplychain.common.enums;

/**
 * 订单状态枚举
 * <p>
 * 定义生产订单的各种状态，用于状态流转控制
 * </p>
 */
public enum OrderStatusEnum {

    /**
     * 待处理
     */
    PENDING("pending", "待处理"),

    /**
     * 进行中
     */
    PROCESSING("processing", "进行中"),

    /**
     * 已完成
     */
    COMPLETED("completed", "已完成"),

    /**
     * 已取消
     */
    CANCELLED("cancelled", "已取消"),

    /**
     * 已关闭
     */
    CLOSED("closed", "已关闭"),

    /**
     * 已归档
     */
    ARCHIVED("archived", "已归档");

    /**
     * 状态编码
     */
    private final String code;

    /**
     * 状态描述
     */
    private final String description;

    OrderStatusEnum(String code, String description) {
        this.code = code;
        this.description = description;
    }

    /**
     * 获取状态编码
     *
     * @return 状态编码
     */
    public String getCode() {
        return code;
    }

    /**
     * 获取状态描述
     *
     * @return 状态描述
     */
    public String getDescription() {
        return description;
    }

    /**
     * 根据编码获取枚举
     *
     * @param code 状态编码
     * @return 订单状态枚举，找不到返回null
     */
    public static OrderStatusEnum getByCode(String code) {
        if (code == null || code.trim().isEmpty()) {
            return null;
        }
        for (OrderStatusEnum status : values()) {
            if (status.code.equalsIgnoreCase(code.trim())) {
                return status;
            }
        }
        return null;
    }

    /**
     * 判断是否为终态
     *
     * @return true表示终态（已完成、已取消、已关闭、已归档）
     */
    public boolean isFinalStatus() {
        return this == COMPLETED || this == CANCELLED || this == CLOSED || this == ARCHIVED;
    }

    /**
     * 判断是否可以取消
     *
     * @return true表示可以取消
     */
    public boolean canCancel() {
        return this == PENDING || this == PROCESSING;
    }

    /**
     * 判断是否可以关闭
     *
     * @return true表示可以关闭
     */
    public boolean canClose() {
        return this == PENDING || this == PROCESSING || this == COMPLETED;
    }
}
