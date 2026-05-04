package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * 物料采购实体类
 */
@Data
@TableName("t_material_purchase")
public class MaterialPurchase {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String purchaseNo;

    private String materialId;

    private String materialCode;

    private String materialName;

    private String materialType;

    private String specifications;

    private String unit;

    private BigDecimal purchaseQuantity;

    /**
     * 米重换算值（米/公斤，参考值）
     */
    private BigDecimal conversionRate;

    private Integer arrivedQuantity;

    /**
     * 入库记录ID（关联最新入库单）
     */
    private String inboundRecordId;

    private String supplierId;

    private String supplierName;

    /**
     * 供应商联系人
     */
    private String supplierContactPerson;

    /**
     * 供应商联系电话
     */
    private String supplierContactPhone;

    private BigDecimal unitPrice;

    private BigDecimal totalAmount;

    private String receiverId;

    private String receiverName;

    private LocalDateTime receivedTime;

    private String remark;

    private String orderId;

    private String orderNo;

    private String styleId;

    private String styleNo;

    private String styleName;

    private String styleCover;

    /**
     * 颜色（从样衣同步）
     */
    private String color;

    /**
     * 尺码（从样衣同步）
     */
    private String size;

    /**
     * 各码用量（非DB字段，从款号BOM运行时填充，JSON格式：{"S":"1.50","M":"1.60"...}）
     */
    @TableField(exist = false)
    private String sizeUsageMap;

    private Integer returnConfirmed;

    private BigDecimal returnQuantity;

    private String returnConfirmerId;

    private String returnConfirmerName;

    private LocalDateTime returnConfirmTime;

    /**
     * 状态(pending:待采购, received:已领取, partial:部分到货, partial_arrival:部分到货,
     * awaiting_confirm:待确认完成, completed:全部到货, cancelled:已取消, warehouse_pending:待仓库出库)
     */
    private String status;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    private Integer deleteFlag;

    // ==================== 操作人字段（自动填充）====================

    @TableField(fill = FieldFill.INSERT)
    private String creatorId;

    @TableField(fill = FieldFill.INSERT)
    private String creatorName;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updaterId;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updaterName;

    // ==================== 到货日期字段（新增）====================

    /**
     * 预计到货日期
     */
    private LocalDateTime expectedArrivalDate;

    /**
     * 实际到货日期
     */
    private LocalDateTime actualArrivalDate;

    /**
     * 预计出货日期
     */
    private java.time.LocalDate expectedShipDate;

    // ==================== 采购来源字段（区分样衣/订单/批量采购）====================

    /**
     * 采购来源类型: order=生产订单, sample=样衣开发, batch=批量采购, stock=安全库存补货
     */
    private String sourceType;

    /**
     * 样衣生产ID（样衣采购时关联）
     */
    private String patternProductionId;

    /**
     * 生产方名称（来自关联的生产订单，非数据库字段）
     */
    @TableField(exist = false)
    private String factoryName;

    /**
     * 生产方类型（来自关联的生产订单，非数据库字段）: INTERNAL / EXTERNAL
     */
    @TableField(exist = false)
    private String factoryType;

    /**
     * 下单类型（来自关联的生产订单，非数据库字段）: CMT / FOB / ODM / OEM
     */
    @TableField(exist = false)
    private String orderBizType;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    /**
     * 回料确认时上传的凭证图片 URL，多个用逗号分隔
     */
    @TableField("evidence_image_urls")
    private String evidenceImageUrls;

    /**
     * 面料成分（从物料资料库同步）
     */
    private String fabricComposition;

    /**
     * 面料幅宽（从物料资料库同步）
     */
    private String fabricWidth;

    /**
     * 面料克重（从物料资料库同步）
     */
    private String fabricWeight;

    /**
     * 发票/单据图片URL列表（JSON数组字符串），用于财务留底
     * 示例：["/api/file/tenant-download/1/invoice-xxx.jpg","..."]
     */
    @TableField("invoice_urls")
    private String invoiceUrls;

    // ==================== 初审工作流字段 ====================

    /**
     * 初审状态：pending_audit=待初审，passed=初审通过，rejected=初审驳回
     * 仅内部采购（factoryType=INTERNAL）使用，completed 之后须经过初审才能生成对账单
     */
    @TableField("audit_status")
    private String auditStatus;

    /**
     * 初审驳回原因（rejected 时必填）
     */
    @TableField("audit_reason")
    private String auditReason;

    /**
     * 初审操作时间
     */
    @TableField("audit_time")
    private java.time.LocalDateTime auditTime;

    /**
     * 初审操作人ID
     */
    @TableField("audit_operator_id")
    private String auditOperatorId;

    /**
     * 初审操作人姓名
     */
    @TableField("audit_operator_name")
    private String auditOperatorName;
}
