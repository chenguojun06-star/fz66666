package com.fashion.supplychain.intelligence.dto;

import lombok.Data;

import java.math.BigDecimal;

/**
 * L4程序性记忆 SOP 创建 DTO
 *
 * <p>用于 ProceduralMemoryController 创建接口与 ProceduralMemoryTool create 动作</p>
 *
 * @author xiaoyun
 * @since 2026-07-22
 */
@Data
public class ProceduralMemoryCreateDTO {

    /** SOP名称 */
    private String sopName;

    /** SOP类型：SCAN_WORKFLOW/WAGE_SETTLEMENT/DELIVERY_FORECAST/SUPPLIER_EVAL/QUALITY_CHECK/CRYSTALLIZED */
    private String sopType;

    /** 步骤数组JSON：[{step,action,tool,expected}] */
    private String stepsJson;

    /** 前置条件JSON */
    private String preconditions;

    /** 后置校验JSON */
    private String postcheck;

    /** 触发关键词，逗号分隔 */
    private String triggerKeywords;

    /** 置信度0-1.00（默认0.80） */
    private BigDecimal confidence;

    /** 来源：manual/crystallized */
    private String source;

    /** 是否启用（默认1） */
    private Integer enabled;
}
