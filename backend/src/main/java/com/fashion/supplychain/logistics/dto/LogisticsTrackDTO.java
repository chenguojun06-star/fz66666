package com.fashion.supplychain.logistics.dto;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 物流轨迹DTO
 */
@Data
public class LogisticsTrackDTO {

    private String id;

    /**
     * 轨迹时间
     */
    private LocalDateTime trackTime;

    /**
     * 轨迹描述
     */
    private String trackDesc;

    /**
     * 轨迹地点
     */
    private String trackLocation;

    /**
     * 操作码
     */
    private String actionCode;

    /**
     * 操作名称
     */
    private String actionName;

    /**
     * 快递员名称
     */
    private String courierName;

    /**
     * 快递员电话
     */
    private String courierPhone;

    /**
     * 是否已签收
     */
    private Boolean signed;

    /**
     * 创建时间
     */
    private LocalDateTime createTime;
}
