package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.AgentExecutionLog;
import com.fashion.supplychain.intelligence.entity.PatternDiscovery;
import com.fashion.supplychain.intelligence.mapper.AgentExecutionLogMapper;
import com.fashion.supplychain.intelligence.mapper.PatternDiscoveryMapper;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 规律发现编排器 — 阶段9核心：从历史执行日志中挖掘租户维度的时序模式与异常。
 *
 * <p>数据源：t_agent_execution_log + t_intelligence_feedback_record（同租户）</p>
 * <p>输出：结构化规律写入 t_pattern_discovery，可供目标拆解/例会引用</p>
 * <p>租户隔离：所有查询严格 tenant_id 过滤。</p>
 */
@Slf4j
@Service
public class PatternDiscoveryOrchestrator {

    @Autowired private PatternDiscoveryMapper patternMapper;
    @Autowired private AgentExecutionLogMapper executionLogMapper;
    @Autowired private IntelligenceInferenceOrchestrator inferenceOrchestrator;

    /**
     * 挖掘规律 — 分析最近N天内同租户的Agent执行记录，发现反复出现的模式。
     */
    @Transactional(rollbackFor = Exception.class)
    public List<PatternDiscovery> discoverPatterns(int lookbackDays) {
        Long tenantId = UserContext.tenantId();
        LocalDateTime since = LocalDateTime.now().minusDays(lookbackDays).withHour(0).withMinute(0).withSecond(0);

        // 1. 拉取执行日志统计（按 scene + route 聚合）
        List<Map<String, Object>> logStats = executionLogMapper.selectMaps(
                new QueryWrapper<AgentExecutionLog>()
                        .select("scene", "route", "COUNT(*) AS cnt",
                                "AVG(confidence_score) AS avg_conf",
                                "MIN(confidence_score) AS min_conf")
                        .eq("tenant_id", tenantId)
                        .ge("create_time", since)
                        .groupBy("scene", "route")
                        .having("COUNT(*) >= 3")
                        .orderByDesc("cnt"));

        if (logStats.isEmpty()) {
            log.info("[Pattern] 租户{} 近{}天无重复模式", tenantId, lookbackDays);
            return List.of();
        }

        // 2. 用 LLM 分析聚类提取规律
        String statsText = formatStats(logStats);
        String prompt = String.format(
                "以下是近%d天的Agent决策统计（场景|路由|次数|平均置信|最低置信）：\n%s\n"
                + "请识别3个最重要的规律/异常，每个用JSON对象表述：\n"
                + "[{\"name\":\"规律名\",\"description\":\"描述\",\"type\":\"recurring|anomaly|trend\","
                + "\"confidence\":0-100,\"impact\":0-100,\"action\":\"建议\"}]\n仅输出JSON数组。",
                lookbackDays, statsText);

        var result = inferenceOrchestrator.chat("pattern-discovery",
                "你是服装供应链数据分析师，擅长从Agent执行日志中发现业务规律和异常。仅输出JSON。", prompt);

        String patternsJson = (result.isSuccess() && result.getContent() != null)
                ? result.getContent().trim() : "[]";

        // 3. 解析并持久化
        List<PatternDiscovery> saved = parseAndSavePatterns(tenantId, patternsJson, lookbackDays, since);
        log.info("[Pattern] 租户{} 发现{}条规律", tenantId, saved.size());
        return saved;
    }

    /**
     * 查询租户历史规律。
     */
    public List<PatternDiscovery> listByTenant(Long tenantId, String patternType, int limit) {
        QueryWrapper<PatternDiscovery> qw = new QueryWrapper<PatternDiscovery>()
                .eq("tenant_id", tenantId)
                .eq("delete_flag", 0)
                .orderByDesc("confidence")
                .last("LIMIT " + Math.min(limit, 30));
        if (patternType != null && !patternType.isBlank()) {
            qw.eq("pattern_type", patternType);
        }
        return patternMapper.selectList(qw);
    }

    /**
     * 标记规律已被采纳/执行，记录执行效果。
     */
    @Transactional(rollbackFor = Exception.class)
    public void markApplied(Long patternId, String appliedResult) {
        Long tenantId = UserContext.tenantId();
        PatternDiscovery pd = patternMapper.selectOne(
                new QueryWrapper<PatternDiscovery>()
                        .eq("id", patternId).eq("tenant_id", tenantId).eq("delete_flag", 0));
        if (pd == null) return;
        pd.setStatus("applied");
        pd.setAppliedResult(appliedResult);
        pd.setUpdateTime(LocalDateTime.now());
        patternMapper.updateById(pd);
    }

    // ── private ──

    private String formatStats(List<Map<String, Object>> stats) {
        StringBuilder sb = new StringBuilder();
        for (Map<String, Object> row : stats) {
            sb.append(String.format("%s | %s | %s次 | 平均%.0f | 最低%.0f\n",
                    row.get("scene"), row.get("route"), row.get("cnt"),
                    toDouble(row.get("avg_conf")), toDouble(row.get("min_conf"))));
        }
        return sb.toString();
    }

    private double toDouble(Object v) {
        if (v instanceof Number) return ((Number) v).doubleValue();
        return 0.0;
    }

    private List<PatternDiscovery> parseAndSavePatterns(Long tenantId, String json, int lookbackDays, LocalDateTime since) {
        java.util.ArrayList<PatternDiscovery> saved = new java.util.ArrayList<>();
        try {
            // 简易JSON数组解析 — 按 },{ 拆分
            String trimmed = json.trim();
            if (!trimmed.startsWith("[")) return saved;
            trimmed = trimmed.substring(1, trimmed.length() - 1); // 去掉 [ ]
            String[] items = trimmed.split("\\},\\s*\\{");
            for (String item : items) {
                if (!item.startsWith("{")) item = "{" + item;
                if (!item.endsWith("}")) item = item + "}";
                PatternDiscovery pd = buildFromJsonItem(tenantId, item, lookbackDays, since);
                if (pd != null) {
                    patternMapper.insert(pd);
                    saved.add(pd);
                }
                if (saved.size() >= 5) break;
            }
        } catch (Exception e) {
            log.warn("[Pattern] 解析LLM输出异常", e);
        }
        return saved;
    }

    private PatternDiscovery buildFromJsonItem(Long tenantId, String json, int lookbackDays, LocalDateTime since) {
        PatternDiscovery pd = new PatternDiscovery();
        pd.setTenantId(tenantId);
        pd.setPatternType(extractField(json, "type", "recurring"));
        pd.setPatternName(extractField(json, "name", "未命名规律"));
        pd.setDescription(extractField(json, "description", ""));
        pd.setDataSource("agent_execution_log");
        pd.setTimeRangeStart(since);
        pd.setTimeRangeEnd(LocalDateTime.now());
        pd.setConfidence(parseIntField(json, "confidence", 50));
        pd.setImpactScore(parseIntField(json, "impact", 50));
        pd.setRecurrenceCount(0);
        pd.setLastSeen(LocalDateTime.now());
        pd.setSuggestedAction(extractField(json, "action", ""));
        pd.setIsActionable(pd.getConfidence() >= 60 ? 1 : 0);
        pd.setStatus("discovered");
        pd.setDeleteFlag(0);
        pd.setCreateTime(LocalDateTime.now());
        pd.setUpdateTime(LocalDateTime.now());
        return pd;
    }

    private String extractField(String json, String field, String def) {
        String key = "\"" + field + "\":\"";
        int idx = json.indexOf(key);
        if (idx < 0) return def;
        int start = idx + key.length();
        int end = json.indexOf('"', start);
        return end > start ? json.substring(start, end) : def;
    }

    private int parseIntField(String json, String field, int def) {
        String key = "\"" + field + "\":";
        int idx = json.indexOf(key);
        if (idx < 0) return def;
        int start = idx + key.length();
        StringBuilder sb = new StringBuilder();
        for (int i = start; i < json.length(); i++) {
            char c = json.charAt(i);
            if (Character.isDigit(c)) sb.append(c);
            else if (sb.length() > 0) break;
        }
        try { return Integer.parseInt(sb.toString()); } catch (Exception e) { return def; }
    }
}
