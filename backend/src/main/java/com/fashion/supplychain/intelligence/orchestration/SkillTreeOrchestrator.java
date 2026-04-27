package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.entity.AiSkillNode;
import com.fashion.supplychain.intelligence.mapper.AiSkillNodeMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 技能树自生长编排器 — AI 能力自动沉淀
 *
 * <p><b>核心思想</b>：系统从历史 AI 会话的成功工具调用链中自动提取"技能节点"，
 * 相当于 AI 每次成功完成任务都在学习并固化经验。
 *
 * <p><b>技能生命周期</b>：
 * <ol>
 *   <li><b>自动生成</b>：{@link #extractAndStore} — 在 PRM 评分≥1 时由 AI 会话后处理触发</li>
 *   <li><b>技能复用</b>：{@link #getActiveSkills} — AI Agent 回答问题时作为上下文提示提供</li>
 *   <li><b>质量演化</b>：成功/失败反馈通过 {@link AiSkillNodeMapper} 自动更新得分</li>
 *   <li><b>淘汰剪枝</b>：{@link #pruneStaleSkills} — 每日 3:30 清理低效技能（成功率 < 20%）</li>
 * </ol>
 *
 * <p><b>系统价值</b>：随着使用时间增长，AI 积累的技能库越来越精准，
 * 新问题的回答质量也随之提升（自我进化）。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SkillTreeOrchestrator {

    private final AiSkillNodeMapper skillNodeMapper;

    // ─────────────────────────────────────────────────────────────────────
    // ① 提取并存储技能（由 AI 会话成功后自动触发）
    // ─────────────────────────────────────────────────────────────────────

    /**
     * 从一次成功的 AI 会话中提取技能节点并沉淀到技能树。
     *
     * <p>逻辑：
     * <ul>
     *   <li>PRM 评分 {@code prmScore < 1} → 忽略（质量不足，不值得沉淀）</li>
     *   <li>已存在同名技能 → 更新成功计数和平均评分</li>
     *   <li>不存在 → 创建新技能节点</li>
     * </ul>
     *
     * @param sessionId   AI 会话 ID（可追溯来源）
     * @param toolName    本次会话调用的主要工具名（如 {@code tool_scan_undo}）
     * @param toolChainJson 完整工具调用链（JSON 数组，如 {@code ["tool_a","tool_b"]}），允许为 null
     * @param scene       用户场景描述（如"质检不合格处理"），用作技能名和触发模式
     * @param prmScore    PRM 过程奖励模型评分（0=失败，1=平均，2=优秀）
     */
    @Transactional(rollbackFor = Exception.class)
    public void extractAndStore(String sessionId, String toolName, String toolChainJson,
                                String scene, int prmScore) {
        if (prmScore < 1) {
            log.debug("[SkillTree] prmScore={} 不足，跳过技能沉淀 tool={}", prmScore, toolName);
            return;
        }

        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String skillName = buildSkillName(scene, toolName);

        // 查找已有技能（同租户 + 同工具名，不区分场景）
        AiSkillNode existing = skillNodeMapper.selectOne(new LambdaQueryWrapper<AiSkillNode>()
                .eq(AiSkillNode::getTenantId, tenantId)
                .eq(AiSkillNode::getSkillName, skillName)
                .eq(AiSkillNode::getDeleteFlag, 0)
                .last("LIMIT 1"));

        if (existing != null) {
            skillNodeMapper.recordSuccess(existing.getId(), prmScore * 50);
            log.debug("[SkillTree] 更新技能 id={} name={} prmScore={}", existing.getId(), skillName, prmScore);
        } else {
            // 新建技能节点
            AiSkillNode node = new AiSkillNode();
            node.setTenantId(tenantId);
            node.setSkillName(skillName);
            node.setSkillDomain(detectDomain(toolName));
            node.setTriggerPattern(scene != null ? scene : toolName);
            node.setToolChain(toolChainJson);
            node.setSuccessCount(1);
            node.setFailureCount(0);
            node.setAvgScore(BigDecimal.valueOf(prmScore * 50));
            node.setLastActivatedAt(LocalDateTime.now());
            node.setDeleteFlag(0);
            node.setCreateTime(LocalDateTime.now());
            node.setUpdateTime(LocalDateTime.now());
            skillNodeMapper.insert(node);
            log.info("[SkillTree] 新增技能节点 name={} domain={} session={}", skillName, node.getSkillDomain(), sessionId);
        }
    }

    /**
     * 记录技能执行失败（供 AiAgentOrchestrator 在工具调用异常时调用）。
     */
    public void recordFailure(String toolName, String scene) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String skillName = buildSkillName(scene, toolName);
        AiSkillNode existing = skillNodeMapper.selectOne(new LambdaQueryWrapper<AiSkillNode>()
                .eq(AiSkillNode::getTenantId, tenantId)
                .eq(AiSkillNode::getSkillName, skillName)
                .eq(AiSkillNode::getDeleteFlag, 0)
                .last("LIMIT 1"));
        if (existing != null) {
            skillNodeMapper.recordFailure(existing.getId());
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // ② 技能查询（AI Agent 回答问题时调用）
    // ─────────────────────────────────────────────────────────────────────

    /**
     * 获取当前租户指定领域下最活跃的技能节点（AI 回答时作为上下文提示）。
     *
     * <p>排序规则：avgScore × ln(successCount + 1)，兼顾质量与使用频率。
     *
     * @param domain 领域过滤（null 则不过滤）
     * @param limit  最多返回条数
     */
    public List<AiSkillNode> getActiveSkills(String domain, int limit) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        LambdaQueryWrapper<AiSkillNode> w = new LambdaQueryWrapper<AiSkillNode>()
                .eq(AiSkillNode::getDeleteFlag, 0)
                .eq(domain != null, AiSkillNode::getSkillDomain, domain)
                .and(q -> q.isNull(AiSkillNode::getTenantId)
                           .or(o -> o.eq(AiSkillNode::getTenantId, tenantId)))
                .gt(AiSkillNode::getSuccessCount, 0)
                .orderByDesc(AiSkillNode::getAvgScore)
                .last("LIMIT " + Math.max(1, limit));
        return skillNodeMapper.selectList(w);
    }

    /**
     * 获取完整技能树（包含层次结构）用于 UI 展示。
     *
     * @param domain 领域过滤（null 则返回全部）
     */
    public List<AiSkillNode> getSkillTree(String domain) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        return skillNodeMapper.selectList(new LambdaQueryWrapper<AiSkillNode>()
                .eq(AiSkillNode::getDeleteFlag, 0)
                .eq(domain != null, AiSkillNode::getSkillDomain, domain)
                .and(q -> q.isNull(AiSkillNode::getTenantId)
                           .or(o -> o.eq(AiSkillNode::getTenantId, tenantId)))
                .orderByAsc(AiSkillNode::getParentSkillId)
                .orderByDesc(AiSkillNode::getAvgScore));
    }

    // ─────────────────────────────────────────────────────────────────────
    // ③ 定时剪枝（淘汰低效技能）
    // ─────────────────────────────────────────────────────────────────────

    /**
     * 每日 05:00 运行技能剪枝：
     * 累计尝试次数 ≥ 50 且成功率 < 20% 的技能节点标记为逻辑删除。
     *
     * <p>意义：防止无效技能占用 AI 上下文窗口，保持技能库高质量。
     */
    @Scheduled(cron = "0 0 5 * * ?")
    @Transactional(rollbackFor = Exception.class)
    public void pruneStaleSkills() {
        try {
            // 逻辑删除：总次数≥50 且 successCount/(successCount+failureCount) < 0.2
            int pruned = skillNodeMapper.update(null, new LambdaUpdateWrapper<AiSkillNode>()
                    .set(AiSkillNode::getDeleteFlag, 1)
                    .set(AiSkillNode::getUpdateTime, LocalDateTime.now())
                    .eq(AiSkillNode::getDeleteFlag, 0)
                    .apply("(success_count + failure_count) >= 50")
                    .apply("success_count < (success_count + failure_count) * 0.2"));
            if (pruned > 0) {
                log.info("[SkillTree] 技能剪枝完成 pruned={} 条低效技能", pruned);
            }
        } catch (Exception e) {
            log.warn("[SkillTree] 剪枝异常: {}", e.getMessage());
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // 私有工具方法
    // ─────────────────────────────────────────────────────────────────────

    /** 从 scene + toolName 组合技能名（限长 100 字符） */
    private String buildSkillName(String scene, String toolName) {
        if (scene != null && scene.length() >= 4) {
            return scene.length() > 100 ? scene.substring(0, 100) : scene;
        }
        // 回退：用 toolName 构造可读名称
        return toolName != null ? toolName.replace("tool_", "").replace("_", "") + "操作" : "未知技能";
    }

    /**
     * 根据工具名推断所属领域。
     * 优先级：工具名前缀 > 默认 GENERAL。
     */
    private String detectDomain(String toolName) {
        if (toolName == null) return "GENERAL";
        String t = toolName.toLowerCase();
        if (t.contains("scan") || t.contains("production") || t.contains("cutting")) return "PRODUCTION";
        if (t.contains("finance") || t.contains("payroll") || t.contains("reconcil")) return "FINANCE";
        if (t.contains("warehouse") || t.contains("stock") || t.contains("material")) return "WAREHOUSE";
        if (t.contains("style") || t.contains("bom") || t.contains("quote")) return "STYLE";
        if (t.contains("user") || t.contains("system") || t.contains("permission")) return "SYSTEM";
        return "GENERAL";
    }
}
