package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * AI 技能节点 — 技能树自生长系统核心实体
 *
 * <p>系统从历史 AI 会话中自动提取成功执行的工具组合，形成可复用的"技能节点"。
 * 例如：「质检异常处理」技能 = tool_scan_undo + tool_order_edit + tool_payroll_approve 的组合模式。
 *
 * <p>技能生命周期：
 * <ol>
 *   <li>由 {@code SkillTreeOrchestrator.extractAndStore()} 在 AI 会话成功后自动创建/更新</li>
 *   <li>由 {@code getActiveSkills()} 在 AI 回答时作为上下文提示提供</li>
 *   <li>成功率低于 20% 且累计尝试 50+ 次后由定时任务自动剪枝</li>
 * </ol>
 */
@Data
@TableName("t_ai_skill_node")
public class AiSkillNode {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 租户 ID，NULL 表示平台级通用技能 */
    private Long tenantId;

    /** 技能名称，例如"质检异常快速处理"，由 AI 从对话中提取 */
    private String skillName;

    /**
     * 技能所属领域，对应 AgentTool.getDomain()。
     * 枚举值：PRODUCTION / FINANCE / WAREHOUSE / STYLE / SYSTEM / GENERAL
     */
    private String skillDomain;

    /**
     * 触发模式 — 描述何种用户意图会激活本技能。
     * 例如："user says 质检不合格" → 触发"质检异常处理"技能。
     * 可包含关键词或正则模式。
     */
    private String triggerPattern;

    /**
     * 工具链描述 — 本技能涉及的工具调用序列（JSON 格式）。
     * 例如：{@code ["tool_scan_undo","tool_quality_check","tool_order_edit"]}
     */
    private String toolChain;

    /** 成功执行次数（正反馈） */
    private Integer successCount;

    /** 失败执行次数（负反馈） */
    private Integer failureCount;

    /**
     * 平均评分 0-100，来自 PRM（过程奖励模型）评分。
     * 高分技能优先推荐给 AI Agent。
     */
    private BigDecimal avgScore;

    /** 最后一次被激活的时间 */
    private LocalDateTime lastActivatedAt;

    /**
     * 父技能节点 ID，用于构建技能层次。
     * NULL 表示顶层技能（如"生产订单管理"）；
     * 非 NULL 表示子技能（如"订单状态修改"）。
     */
    private Long parentSkillId;

    /** 向量嵌入 ID，用于语义搜索触发（关联 Qdrant） */
    private String embeddingId;

    private Integer deleteFlag;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
