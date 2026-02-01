package com.fashion.supplychain.logistics.dto;

import com.fashion.supplychain.logistics.enums.ExpressCompanyEnum;
import com.fashion.supplychain.logistics.enums.LogisticsStatusEnum;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 物流查询请求DTO
 */
@Data
public class LogisticsQueryRequest {

    /**
     * 快递单号
     */
    private String trackingNo;

    /**
     * 快递公司
     */
    private ExpressCompanyEnum expressCompany;

    /**
     * 物流状态
     */
    private LogisticsStatusEnum logisticsStatus;

    /**
     * 关联订单号
     */
    private String orderNo;

    /**
     * 款式编号
     */
    private String styleNo;

    /**
     * 收货人姓名
     */
    private String receiverName;

    /**
     * 收货人电话
     */
    private String receiverPhone;

    /**
     * 发货开始时间
     */
    private LocalDateTime shipTimeStart;

    /**
     * 发货结束时间
     */
    private LocalDateTime shipTimeEnd;

    /**
     * 电商平台订单号
     */
    private String platformOrderNo;

    /**
     * 电商平台标识
     */
    private String platformCode;

    /**
     * 页码
     */
    private Integer pageNum = 1;

    /**
     * 每页大小
     */
    private Integer pageSize = 10;
}
