package com.fashion.supplychain.logistics.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.Getter;

/**
 * 发货类型枚举
 */
@Getter
public enum ShipmentTypeEnum {
    NORMAL(1, "普通发货"),
    URGENT(2, "加急发货"),
    SAMPLE(3, "样品发货"),
    RETURN(4, "退货发货"),
    EXCHANGE(5, "换货发货"),
    WHOLESALE(6, "批发发货"),
    RETAIL(7, "零售发货");

    @EnumValue
    @JsonValue
    private final Integer code;
    private final String desc;

    ShipmentTypeEnum(Integer code, String desc) {
        this.code = code;
        this.desc = desc;
    }

    public static ShipmentTypeEnum getByCode(Integer code) {
        for (ShipmentTypeEnum type : values()) {
            if (type.getCode().equals(code)) {
                return type;
            }
        }
        return NORMAL;
    }
}
