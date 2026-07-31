package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 工序级产能配置（APS 高级排产约束求解引擎）
 *
 * <p>用途：按工厂 + 工序粒度配置日产能与单位成本，供 ApsSchedulingOrchestrator 约束求解使用</p>
 *
 * <p>多租户隔离（P0 铁律 4）：所有查询带 tenant_id WHERE</p>
 *
 * @author xiaoyun
 * @since 2026-08-01
 */
@Data
@TableName("t_process_capacity")
public class ProcessCapacity {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 租户ID（P0铁律4：多租户隔离） */
    private Long tenantId;

    /** 工厂ID（关联 t_factory.id，UUID） */
    private String factoryId;

    /** 工厂名称（冗余，便于展示与按名称关联 Factory 表） */
    private String factoryName;

    /** 工序名称（采购/裁剪/二次工艺/车缝/尾部/质检/入库） */
    private String processName;

    /** 日产能（件/天） */
    private Integer dailyCapacity;

    /** 单位工序成本（元/件） */
    private BigDecimal unitCost;

    /** 是否启用：0=禁用 1=启用 */
    private Integer enabled;

    /** 逻辑删除：0=正常 1=已删除 */
    private Integer deleteFlag;

    /** 创建时间 */
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    /** 更新时间 */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
