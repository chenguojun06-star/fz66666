package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.FieldFill;
import java.time.LocalDateTime;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
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
        /**
         * 领取/开始时间
         */
        @TableField("receive_time")
        private LocalDateTime receiveTime;

        /**
         * 录入结果/完成时间
         */
        @TableField("confirm_time")
        private LocalDateTime confirmTime;

    private String settlementStatus;

    private String payrollSettlementId;

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
     * SKU追踪字段 - Phase 3新增
     * 扫码模式(ORDER/BUNDLE/SKU)
     */
    private String scanMode;

    /**
     * SKU完成数
     */
    private Integer skuCompletedCount;

    /**
     * SKU总数
     */
    private Integer skuTotalCount;

    /**
     * 工序单价 - Phase 5新增（识别的工序对应的单价）
     */
    private BigDecimal processUnitPrice;

    /**
     * 本次扫码工序成本 = processUnitPrice * quantity
     */
    private BigDecimal scanCost;

    /**
     * 指派目标类型（Phase 6新增）
     * internal=内部员工, external=外部工厂, none=未指派
     */
    private String delegateTargetType;

    /**
     * 指派目标ID（Phase 6新增）
     * 员工ID或工厂ID
     */
    private String delegateTargetId;

    /**
     * 指派目标名称（Phase 6新增）
     * 员工名或工厂名
     */
    private String delegateTargetName;

    /**
     * 实际操作员ID（Phase 6新增）
     * 记录谁实际扫的码（追溯用）
     */
    private String actualOperatorId;

    /**
     * 实际操作员名称（Phase 6新增）
     */
    private String actualOperatorName;

    /**
     * 裁剪详情（非数据库字段，仅用于API返回）
     * 格式：[{"size": "S", "quantity": 10}, {"size": "M", "quantity": 10}, ...]
     */
    @TableField(exist = false)
    private List<Map<String, Object>> cuttingDetails;

    /**
     * 床号（裁剪批次编号，非数据库字段，关联自 t_cutting_bundle.bed_no）
     */
    @TableField(exist = false)
    private Integer bedNo;

    /**
     * 创建时间
     */
    private LocalDateTime createTime;

    /**
     * 更新时间
     */
    private LocalDateTime updateTime;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
