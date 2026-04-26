package com.fashion.supplychain.intelligence.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 技能链定义：描述一个预定义的多步工具工作流模板。
 * <p>
 * 用于 SkillChainExecutionOrchestrator 内置注册表，后续可扩展为数据库持久化。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SkillChainDef {

    /** 技能唯一标识（小写下划线，如 monthly_finance_close） */
    private String id;

    /** 技能展示名称（中文，如"月底财务结算"） */
    private String name;

    /** 技能简要说明（一句话描述做什么） */
    private String description;

    /** 触发关键词（自然语言匹配，如["月底财务","关账","工资结算"]） */
    private List<String> triggers;

    /** 技能步骤列表（按顺序执行） */
    private List<SkillChainStep> steps;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SkillChainStep {

        /** 工具名称（对应已注册 AgentTool 的 getName()，如 tool_payroll_approve） */
        private String toolName;

        /** 步骤说明 */
        private String description;

        /** 默认参数提示（JSON 字符串，AI 填充或用户覆盖） */
        private String defaultArgsHint;
    }
}
