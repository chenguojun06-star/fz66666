package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_cutting_bundle")
public class CuttingBundle {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String rootBundleId;

    private String parentBundleId;

    private String sourceBundleId;

    private String productionOrderId;

    private String productionOrderNo;

    private String styleId;

    private String styleNo;

    private String color;

    private String size;

    private Integer bundleNo;

    private String bundleLabel;

    private Integer quantity;

    /**
     * 床号（裁剪批次编号，按租户递增，用于打印裁剪单）
     */
    private Integer bedNo;

    /**
     * 子床次编号（同一订单追加裁剪时递增：首次为 null，追加为 1、2…）
     * 显示格式：bedNo=16,bedSubNo=null → "16"；bedSubNo=1 → "16-1"
     */
    @TableField("bed_sub_no")
    private Integer bedSubNo;

    private String qrCode;

    private String status;

    private String splitStatus;

    private Integer splitSeq;

    private String splitProcessName;

    private Integer splitProcessOrder;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    // ==================== 操作人字段（自动填充）====================

    @TableField(fill = FieldFill.INSERT)
    private String creatorId;

    @TableField(fill = FieldFill.INSERT)
    private String creatorName;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String operatorId;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String operatorName;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
