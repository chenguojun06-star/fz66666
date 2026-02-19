package com.fashion.supplychain.integration.logistics;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 物流轨迹信息
 * 物流追踪的每一条记录
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TrackingInfo {

    /**
     * 轨迹时间
     */
    private LocalDateTime time;

    /**
     * 轨迹描述
     */
    private String description;

    /**
     * 当前所在地
     */
    private String location;

    /**
     * 轨迹状态
     */
    private TrackingStatus status;

    /**
     * 操作人（快递员姓名）
     */
    private String operator;

    /**
     * 操作人电话
     */
    private String operatorPhone;

    /**
     * 备注
     */
    private String remark;

    /**
     * 轨迹状态枚举
     */
    public enum TrackingStatus {
        /**
         * 已揽件
         */
        PICKED_UP("已揽件"),

        /**
         * 运输中
         */
        IN_TRANSIT("运输中"),

        /**
         * 到达派件网点
         */
        ARRIVED_AT_STATION("到达派件网点"),

        /**
         * 派送中
         */
        OUT_FOR_DELIVERY("派送中"),

        /**
         * 已签收
         */
        DELIVERED("已签收"),

        /**
         * 异常
         */
        EXCEPTION("异常");

        private final String displayName;

        TrackingStatus(String displayName) {
            this.displayName = displayName;
        }

        public String getDisplayName() {
            return displayName;
        }
    }

    /**
     * 格式化显示
     */
    public String getFormattedInfo() {
        return String.format("[%s] %s - %s",
                time.toString(),
                location != null ? location : "未知",
                description);
    }
}
