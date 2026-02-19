package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * 质检入库实体类（表：t_product_warehousing）
 */
@Data
@TableName("t_product_warehousing")
public class ProductWarehousing {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String warehousingNo;

    private String orderId;

    private String orderNo;

    private String styleId;

    private String styleNo;

    private String styleName;

    private Integer warehousingQuantity;

    private Integer qualifiedQuantity;

    private Integer unqualifiedQuantity;

    private String warehousingType;

    private String warehouse;

    // ==================== 入库时间/人员字段 ====================

    /**
     * 入库开始时间
     */
    private LocalDateTime warehousingStartTime;

    /**
     * 入库完成时间
     */
    private LocalDateTime warehousingEndTime;

    /**
     * 入库人员ID
     */
    private String warehousingOperatorId;

    /**
     * 入库人员姓名
     */
    private String warehousingOperatorName;

    private String qualityStatus;

    private String cuttingBundleId;

    private Integer cuttingBundleNo;

    private String cuttingBundleQrCode;

    private String unqualifiedImageUrls;

    private String defectCategory;

    private String defectRemark;

    private String repairRemark;

    private String receiverId;

    private String receiverName;

    private LocalDateTime receivedTime;

    private String inspectionStatus;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    private Integer deleteFlag;

    // ==================== 颜色尺码字段（临时字段，查询时填充）====================

    /**
     * 颜色（从菲号CuttingBundle填充）
     */
    @TableField(exist = false)
    private String color;

    /**
     * 尺码（从菲号CuttingBundle填充）
     */
    @TableField(exist = false)
    private String size;

    /**
     * 裁剪数（从菲号CuttingBundle.quantity填充）
     */
    @TableField(exist = false)
    private Integer cuttingQuantity;

    /**
     * 扫码内容/菲号（从ScanRecord填充）
     */
    @TableField(exist = false)
    private String scanCode;

    // ==================== 质检人员字段（新增数据库字段）====================

    /**
     * 质检人员ID
     */
    private String qualityOperatorId;

    /**
     * 质检人员姓名
     */
    private String qualityOperatorName;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
