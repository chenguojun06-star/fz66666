package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import java.time.LocalDateTime;
import java.math.BigDecimal;
import lombok.Data;

/**
 * 扫码记录实体类
 */
@Data
@TableName("t_scan_record")
public class ScanRecord {

    /**
     * 主键ID
     */
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String scanCode;

    private String requestId;

    /**
     * 订单ID
     */
    private String orderId;

    /**
     * 订单号
     */
    private String orderNo;

    /**
     * 款号ID
     */
    private String styleId;

    /**
     * 款号
     */
    private String styleNo;

    private String color;

    private String size;

    private Integer quantity;

    private BigDecimal unitPrice;

    private BigDecimal totalAmount;

    private String settlementStatus;

    private String processCode;

    private String progressStage;

    private String processName;

    /**
     * 操作员ID
     */
    private String operatorId;

    /**
     * 操作员名称
     */
    private String operatorName;

    /**
     * 扫码时间
     */
    private LocalDateTime scanTime;

    /**
     * 扫码类型(material:物料扫码, production:生产扫码, quality:质检扫码, warehouse:入库扫码)
     */
    private String scanType;

    /**
     * 扫码结果(success:成功, failure:失败)
     */
    private String scanResult;

    /**
     * 备注
     */
    private String remark;

    private String scanIp;

    private String cuttingBundleId;

    private Integer cuttingBundleNo;

    private String cuttingBundleQrCode;

    /**
     * 创建时间
     */
    private LocalDateTime createTime;

    /**
     * 更新时间
     */
    private LocalDateTime updateTime;
}
