package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.entity.GoalDecomposition;
import com.fashion.supplychain.intelligence.mapper.GoalDecompositionMapper;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 目标拆解编排器 — 阶段9核心：接收高层目标，AI递归分解为可执行子目标。
 *
 * <p>支持树状目标结构（parent_goal_id），支持进度追踪和关联规律/根因。</p>
 * <p>租户隔离：所有操作严格带 tenant_id。</p>
 */
@Slf4j
@Service
public class GoalDecompositionOrchestrator {

    @Autowired private GoalDecompositionMapper goalMapper;
    @Autowired private IntelligenceInferenceOrchestrator inferenceOrchestrator;

    /**
     * 创建顶层目标并AI自动拆解子目标。
     */
    @Transactional(rollbackFor = Exception.class)
    public GoalDecomposition createAndDecompose(String goalType, String title, String description,
                                                 String metricName, BigDecimal metricTarget, String metricUnit,
                                                 LocalDateTime deadline) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        // 1. 创建顶层目标
        GoalDecomposition root = new GoalDecomposition();
        root.setTenantId(tenantId);
        root.setGoalType(goalType);
        root.setTitle(title);
        root.setDescription(description);
        root.setMetricName(metricName);
        root.setMetricTarget(metricTarget);
        root.setMetricUnit(metricUnit);
        root.setPriority("high");
        root.setDeadline(deadline);
        root.setProgress(0);
        root.setAiSource("goal_decomposition");
        root.setStatus("active");
        root.setDeleteFlag(0);
        root.setCreateTime(LocalDateTime.now());
        root.setUpdateTime(LocalDateTime.now());
        goalMapper.insert(root);

        // 2. AI拆解子目标
        List<GoalDecomposition> subs = aiDecompose(root);
        log.info("[GoalDecomp] 创建目标 id={} 子目标{}个 tenant={}", root.getId(), subs.size(), tenantId);
        return root;
    }

    /**
     * 查询租户目标树（顶层 + 子目标）。
     */
    public List<GoalDecomposition> listGoalTree(Long tenantId) {
        return goalMapper.selectList(
                new QueryWrapper<GoalDecomposition>()
                        .eq("tenant_id", tenantId)
                        .eq("delete_flag", 0)
                        .orderByAsc("parent_goal_id", "priority"));
    }

    /**
     * 更新目标进度。
     */
    @Transactional(rollbackFor = Exception.class)
    public void updateProgress(Long goalId, int progress, BigDecimal metricCurrent) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        GoalDecomposition goal = goalMapper.selectOne(
                new QueryWrapper<GoalDecomposition>()
                        .eq("id", goalId).eq("tenant_id", tenantId).eq("delete_flag", 0));
        if (goal == null) return;
        goal.setProgress(Math.min(progress, 100));
        goal.setMetricCurrent(metricCurrent);
        if (progress >= 100) {
            goal.setStatus("completed");
            goal.setCompletionNote("达成目标指标");
        }
        goal.setUpdateTime(LocalDateTime.now());
        goalMapper.updateById(goal);

        // 子目标完成后，检查父目标进度
        if (goal.getParentGoalId() != null) {
            recalcParentProgress(goal.getParentGoalId(), tenantId);
        }
    }

    // ── private ──

    private List<GoalDecomposition> aiDecompose(GoalDecomposition root) {
        String prompt = String.format(
                "目标：%s\n描述：%s\n指标：%s 目标值%s%s\n截止日期：%s\n"
                + "请拆解为3-5个子目标，用JSON数组表述：\n"
                + "[{\"title\":\"子目标标题\",\"description\":\"简述\",\"metric_name\":\"指标名\","
                + "\"metric_target\":数值,\"metric_unit\":\"单位\",\"priority\":1-5}]\n仅输出JSON。",
                root.getTitle(), root.getDescription(),
                root.getMetricName(), root.getMetricTarget(), root.getMetricUnit(),
                root.getDeadline());

        var result = inferenceOrchestrator.chat("goal-decompose",
                "你是服装供应链目标管理专家，擅长将高层目标拆解为可量化的子目标。仅输出JSON。", prompt);

        List<GoalDecomposition> subs = new ArrayList<>();
        if (!result.isSuccess() || result.getContent() == null) return subs;

        try {
            String content = result.getContent().trim();
            if (!content.startsWith("[")) return subs;
            content = content.substring(1, content.length() - 1);
            String[] items = content.split("\\},\\s*\\{");
            int order = 1;
            for (String item : items) {
                if (!item.startsWith("{")) item = "{" + item;
                if (!item.endsWith("}")) item = item + "}";
                GoalDecomposition sub = new GoalDecomposition();
                sub.setTenantId(root.getTenantId());
                sub.setParentGoalId(root.getId());
                sub.setGoalType(root.getGoalType());
                sub.setTitle(extractStr(item, "title", "子目标" + order));
                sub.setDescription(extractStr(item, "description", ""));
                sub.setMetricName(extractStr(item, "metric_name", root.getMetricName()));
                sub.setMetricUnit(extractStr(item, "metric_unit", root.getMetricUnit()));
                sub.setPriority(String.valueOf(order));
                sub.setDeadline(root.getDeadline());
                sub.setProgress(0);
                sub.setAiSource("goal_decomposition");
                sub.setStatus("active");
                sub.setDeleteFlag(0);
                sub.setCreateTime(LocalDateTime.now());
                sub.setUpdateTime(LocalDateTime.now());
                goalMapper.insert(sub);
                subs.add(sub);
                order++;
                if (order > 5) break;
            }
        } catch (Exception e) {
            log.warn("[GoalDecomp] AI拆解解析失败", e);
        }
        return subs;
    }

    private void recalcParentProgress(Long parentId, Long tenantId) {
        List<GoalDecomposition> siblings = goalMapper.selectList(
                new QueryWrapper<GoalDecomposition>()
                        .eq("parent_goal_id", parentId)
                        .eq("tenant_id", tenantId)
                        .eq("delete_flag", 0));
        if (siblings.isEmpty()) return;
        int avg = (int) siblings.stream().mapToInt(GoalDecomposition::getProgress).average().orElse(0);
        GoalDecomposition parent = goalMapper.selectOne(
                new QueryWrapper<GoalDecomposition>()
                        .eq("id", parentId).eq("tenant_id", tenantId).eq("delete_flag", 0));
        if (parent == null) return;
        parent.setProgress(avg);
        if (avg >= 100) {
            parent.setStatus("completed");
            parent.setCompletionNote("所有子目标已完成");
        }
        parent.setUpdateTime(LocalDateTime.now());
        goalMapper.updateById(parent);
    }

    private String extractStr(String json, String field, String def) {
        String key = "\"" + field + "\":\"";
        int idx = json.indexOf(key);
        if (idx < 0) return def;
        int start = idx + key.length();
        int end = json.indexOf('"', start);
        return end > start ? json.substring(start, end) : def;
    }
}
