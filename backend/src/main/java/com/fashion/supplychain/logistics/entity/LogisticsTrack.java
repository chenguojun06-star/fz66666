package com.fashion.supplychain.logistics.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 物流轨迹明细表
 * 预留用于存储物流跟踪详情
 */
@Data
@TableName("t_logistics_track")
public class LogisticsTrack {

    @TableId(type = IdType.ASSIGN_ID)
    private String id;

    /**
     * 快递单ID
     */
    private String expressOrderId;

    /**
     * 快递单号
     */
    private String trackingNo;

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
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    /**
     * 数据来源：1-API推送，2-手动录入
     */
    private Integer dataSource;
}
