package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * 裁剪用料台账（D-823）
 *
 * <p>按「裁剪任务 × 物料」记录计划/领出/实际消耗/余料/回库，
 * 打通采购侧既有口径（t_material_purchase.usedQuantity：到货-已用=剩余）
 * 与裁剪侧的断层。
 */
@Data
@TableName("t_cutting_material_usage")
public class CuttingMaterialUsage {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String cuttingTaskId;

    private String productionOrderId;

    private String productionOrderNo;

    private String styleNo;

    private String materialCode;

    private String materialName;

    private String materialType;

    private String color;

    private String size;

    private String unit;

    /** 计划用量 = BOM单件用量 × 裁剪件数 × (1 + 损耗率) */
    private BigDecimal plannedAmount;

    /** 领出量（默认=计划量，登记时可按实际领料改） */
    private BigDecimal issuedAmount;

    /** 实际消耗（裁剪完工登记） */
    private BigDecimal actualUsed;

    /** 余料 = 领出 - 实际 */
    private BigDecimal remnantAmount;

    /** 余料状态：NONE / PENDING / INBOUNDED */
    private String remnantStatus;

    /** 余料回库入库单号 */
    private String remnantInboundNo;

    private BigDecimal unitPrice;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    @TableLogic
    private Integer deleteFlag;
}
