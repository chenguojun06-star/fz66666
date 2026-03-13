package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.RootCauseAnalysis;
import com.fashion.supplychain.intelligence.mapper.RootCauseAnalysisMapper;
import java.time.LocalDateTime;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 根因分析编排器 — 阶段9核心：5-Why递归 + 鱼骨图6M分类。
 *
 * <p>触发来源：① 巡检预警 ② 手动发起 ③ MAS反思置信度过低时自动触发</p>
 * <p>租户隔离：所有操作严格带 tenant_id，不跨租户读写。</p>
 */
@Slf4j
@Service
public class RootCauseAnalysisOrchestrator {

    private static final int MAX_WHY_DEPTH = 5;

    @Autowired private RootCauseAnalysisMapper rcaMapper;
    @Autowired private IntelligenceInferenceOrchestrator inferenceOrchestrator;

    /**
     * 发起5-Why根因分析 — AI递归追问至根因。
     */
    @Transactional(rollbackFor = Exception.class)
    public RootCauseAnalysis analyze(String triggerType, String triggerDescription, String linkedOrderIds) {
        Long tenantId = UserContext.tenantId();

        // 1. 用 LLM 做 5-Why 递归
        String whyChainJson = run5WhyChain(triggerDescription);

        // 2. 用 LLM 做鱼骨图分类
        String fishboneAndCategory = classifyRootCause(triggerDescription, whyChainJson);

        // 3. 解析 LLM 输出
        String rootCause = parseField(fishboneAndCategory, "root_cause", triggerDescription);
        String category = parseField(fishboneAndCategory, "category", "method");
        String fishboneJson = parseField(fishboneAndCategory, "fishbone", "{}");
        String suggestedActions = parseField(fishboneAndCategory, "actions", "[]");
        String severity = parseField(fishboneAndCategory, "severity", "medium");

        // 4. 持久化
        RootCauseAnalysis rca = new RootCauseAnalysis();
        rca.setTenantId(tenantId);
        rca.setTriggerType(triggerType);
        rca.setTriggerDescription(triggerDescription);
        rca.setLinkedOrderIds(linkedOrderIds);
        rca.setWhyChain(whyChainJson);
        rca.setRootCause(rootCause);
        rca.setRootCauseCategory(category);
        rca.setFishboneData(fishboneJson);
        rca.setSuggestedActions(suggestedActions);
        rca.setSeverity(severity);
        rca.setStatus("analyzed");
        rca.setDeleteFlag(0);
        rca.setCreateTime(LocalDateTime.now());
        rca.setUpdateTime(LocalDateTime.now());
        rcaMapper.insert(rca);

        log.info("[RCA] 5-Why分析完成 id={} tenant={} category={} severity={}", rca.getId(), tenantId, category, severity);
        return rca;
    }

    /**
     * 查询租户历史根因分析记录。
     */
    public List<RootCauseAnalysis> listByTenant(Long tenantId, String category, int limit) {
        QueryWrapper<RootCauseAnalysis> qw = new QueryWrapper<RootCauseAnalysis>()
                .eq("tenant_id", tenantId)
                .eq("delete_flag", 0)
                .orderByDesc("create_time")
                .last("LIMIT " + Math.min(limit, 50));
        if (category != null && !category.isBlank()) {
            qw.eq("root_cause_category", category);
        }
        return rcaMapper.selectList(qw);
    }

    /**
     * 更新处置结论。
     */
    @Transactional(rollbackFor = Exception.class)
    public void resolve(Long rcaId, String resolutionNote) {
        Long tenantId = UserContext.tenantId();
        RootCauseAnalysis rca = rcaMapper.selectOne(
                new QueryWrapper<RootCauseAnalysis>()
                        .eq("id", rcaId).eq("tenant_id", tenantId).eq("delete_flag", 0));
        if (rca == null) return;
        rca.setResolutionNote(resolutionNote);
        rca.setStatus("resolved");
        rca.setUpdateTime(LocalDateTime.now());
        rcaMapper.updateById(rca);
    }

    // ── private ──

    private String run5WhyChain(String problem) {
        StringBuilder sb = new StringBuilder();
        sb.append("[");
        String currentProblem = problem;
        for (int i = 1; i <= MAX_WHY_DEPTH; i++) {
            String prompt = String.format("问题：%s\n请用一句话回答「为什么会发生这个问题？」，直接给出原因。", currentProblem);
            var result = inferenceOrchestrator.chat("rca-5why",
                    "你是服装供应链根因分析专家，用5-Why方法追溯问题根因。回答简短精确，一句话。", prompt);
            String why = (result.isSuccess() && result.getContent() != null)
                    ? result.getContent().trim() : "无法进一步分析";
            if (i > 1) sb.append(",");
            sb.append(String.format("{\"level\":%d,\"question\":\"为什么%s\",\"answer\":\"%s\"}",
                    i, escapeJson(currentProblem), escapeJson(why)));
            if ("无法进一步分析".equals(why)) break;
            currentProblem = why;
        }
        sb.append("]");
        return sb.toString();
    }

    private String classifyRootCause(String problem, String whyChain) {
        String prompt = String.format(
                "原始问题：%s\n5-Why链路：%s\n"
                + "请用JSON格式回答：{\"root_cause\":\"最终根因\",\"category\":\"6M分类(material|labor|machine|method|environment|management)\","
                + "\"fishbone\":{\"material\":[],\"labor\":[],\"machine\":[],\"method\":[],\"environment\":[],\"management\":[]},"
                + "\"actions\":[\"建议1\",\"建议2\"],\"severity\":\"high|medium|low\"}\n"
                + "仅输出JSON，不要其他文字。",
                problem, whyChain);
        var result = inferenceOrchestrator.chat("rca-classify",
                "你是服装供应链质量专家，用鱼骨图6M模型分类问题根因。仅输出JSON。", prompt);
        return (result.isSuccess() && result.getContent() != null) ? result.getContent().trim() : "{}";
    }

    private String parseField(String json, String field, String defaultVal) {
        try {
            String key = "\"" + field + "\":";
            int idx = json.indexOf(key);
            if (idx < 0) return defaultVal;
            int start = idx + key.length();
            char first = json.charAt(start);
            if (first == '"') {
                int end = json.indexOf('"', start + 1);
                return end > start ? json.substring(start + 1, end) : defaultVal;
            } else if (first == '[' || first == '{') {
                int depth = 0;
                for (int i = start; i < json.length(); i++) {
                    char c = json.charAt(i);
                    if (c == '[' || c == '{') depth++;
                    else if (c == ']' || c == '}') depth--;
                    if (depth == 0) return json.substring(start, i + 1);
                }
            }
        } catch (Exception e) {
            log.debug("[RCA] JSON解析fallback field={}", field);
        }
        return defaultVal;
    }

    private String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n");
    }
}
