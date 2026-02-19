package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.*;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 面辅料料卷/箱明细实体
 *
 * 每行对应一个物理料卷或箱子，贴一张二维码标签。
 * 二维码内容 = roll_code（格式：MR + YYYYMMDD + 5位流水号）
 *
 * 状态流转：
 *   IN_STOCK → ISSUED  (仓管扫码确认发料)
 *   ISSUED   → IN_STOCK (退回入库，可选)
 */
@Data
@TableName("t_material_roll")
public class MaterialRoll implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.ASSIGN_ID)
    private String id;

    /** 料卷/箱编号，即二维码内容，全局唯一，格式：MR+YYYYMMDD+5位序号 */
    private String rollCode;

    /** 关联入库单ID */
    private String inboundId;

    /** 入库单号（冗余，便于展示） */
    private String inboundNo;

    /** 物料编码 */
    private String materialCode;

    /** 物料名称 */
    private String materialName;

    /** 物料类型：面料/辅料/其他 */
    private String materialType;

    /** 颜色 */
    private String color;

    /** 规格 */
    private String specifications;

    /** 单位（米/件/kg等） */
    private String unit;

    /** 本卷/箱数量 */
    private BigDecimal quantity;

    /** 存放仓库 */
    private String warehouseLocation;

    /**
     * 状态：
     *   IN_STOCK - 在库
     *   ISSUED   - 已发料（已扫码出库）
     *   RETURNED - 已退回
     */
    private String status;

    /** 发料关联裁剪单ID */
    private String issuedOrderId;

    /** 发料关联裁剪单号 */
    private String issuedOrderNo;

    /** 发料时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime issuedTime;

    /** 发料操作人ID */
    private String issuedById;

    /** 发料操作人姓名 */
    private String issuedByName;

    /** 供应商名称 */
    private String supplierName;

    /** 备注 */
    private String remark;

    /** 租户ID（多租户隔离） */
    private Long tenantId;

    @TableField(fill = FieldFill.INSERT)
    private String creatorId;

    @TableField(fill = FieldFill.INSERT)
    private String creatorName;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;

    @TableLogic
    private Integer deleteFlag;
}
