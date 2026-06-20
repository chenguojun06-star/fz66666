package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * L4 程序性记忆实体（SOP / 流程 / 技能）。
 *
 * <p>显式存储人工编写的 SOP，AI 直接调用而非推理。
 * 解决"扫码流程怎么走""工资结算步骤"类流程问题回答不稳定。
 *
 * <p>多租户隔离（P0 铁律 4）：所有查询带 tenant_id WHERE。
 * 来源：manual（人工编写）/ crystallized（从 SkillTemplate 升级）。
 *
 * @see com.fashion.supplychain.intelligence.service.ProceduralMemoryService
 */
@Data
@TableName("t_procedural_memory")
public class ProceduralMemory {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 租户ID（P0 铁律 4：多租户隔离） */
    private Long tenantId;

    /** SOP 名称（租户内唯一） */
    private String sopName;

    /** SOP 类型：SCAN_WORKFLOW / WAGE_SETTLEMENT / DELIVERY_FORECAST / SUPPLIER_EVAL / QUALITY_CHECK */
    private String sopType;

    /** 步骤数组 JSON：[{step,action,tool,expected}] */
    private String stepsJson;

    /** 前置条件 JSON */
    private String preconditions;

    /** 后置校验 JSON */
    private String postcheck;

    /** 触发关键词，逗号分隔 */
    private String triggerKeywords;

    /** 置信度 0-100 */
    private BigDecimal confidence;

    /** 调用次数 */
    private Integer usageCount;

    /** 成功次数 */
    private Integer successCount;

    /** 版本号（SOP 过期时升级） */
    private Integer version;

    /** 来源：manual / crystallized */
    private String source;

    /** 是否启用：0=禁用 1=启用 */
    private Integer enabled;

    @TableLogic
    private Integer deleteFlag;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
