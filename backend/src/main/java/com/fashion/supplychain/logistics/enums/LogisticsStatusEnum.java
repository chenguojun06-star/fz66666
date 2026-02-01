package com.fashion.supplychain.logistics.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.Getter;

/**
 * 物流状态枚举
 * 预留用于物流跟踪状态管理
 */
@Getter
public enum LogisticsStatusEnum {
    PENDING(0, "待发货"),
    SHIPPED(1, "已发货"),
    IN_TRANSIT(2, "运输中"),
    ARRIVED(3, "已到达"),
    DELIVERED(4, "已签收"),
    EXCEPTION(5, "异常"),
    RETURNED(6, "已退回"),
    CANCELLED(7, "已取消");

    @EnumValue
    @JsonValue
    private final Integer code;
    private final String desc;

    LogisticsStatusEnum(Integer code, String desc) {
        this.code = code;
        this.desc = desc;
    }

    public static LogisticsStatusEnum getByCode(Integer code) {
        for (LogisticsStatusEnum status : values()) {
            if (status.getCode().equals(code)) {
                return status;
            }
        }
        return null;
    }
}
