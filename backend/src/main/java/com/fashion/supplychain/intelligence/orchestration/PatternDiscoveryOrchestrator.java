package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.common.util.LlmJsonUtils;
import com.fashion.supplychain.intelligence.entity.AgentExecutionLog;
import com.fashion.supplychain.intelligence.entity.PatternDiscovery;
import com.fashion.supplychain.intelligence.mapper.AgentExecutionLogMapper;
import com.fashion.supplychain.intelligence.mapper.PatternDiscoveryMapper;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.context.annotation.Lazy;

/**
 * 规律发现编排器 — 阶段9核心：从历史执行日志中挖掘租户维度的时序模式与异常。
 *
 * <p>数据源：t_agent_execution_log + t_intelligence_feedback_record（同租户）</p>
 * <p>输出：结构化规律写入 t_pattern_discovery，可供目标拆解/例会引用</p>
 * <p>租户隔离：所有查询严格 tenant_id 过滤。</p>
 */
@Slf4j
@Service
@Lazy
public class PatternDiscoveryOrchestrator {

    /** 单轮最多落库几条规律（模型一次可能给一堆，落太多反而没人看） */
    private static final int MAX_PATTERNS_PER_ROUND = 5;

    /** 从"80分"这类文本里抠数字 */
    private static final Pattern NUMBER_IN_TEXT = Pattern.compile("-?\\d+");

    @Autowired private PatternDiscoveryMapper patternMapper;
    @Autowired private AgentExecutionLogMapper executionLogMapper;
    @Autowired private IntelligenceInferenceOrchestrator inferenceOrchestrator;

    /**
     * 挖掘规律 — 分析最近N天内同租户的Agent执行记录，发现反复出现的模式。
     */
    @Transactional(rollbackFor = Exception.class)
    public List<PatternDiscovery> discoverPatterns(int lookbackDays) {
        TenantAssert.assertTenantContext();
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
        TenantAssert.assertTenantContext();
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

    /**
     * 解析模型输出并落库。
     *
     * <p><b>2026-10-13 重写</b>：原实现是手写"简易 JSON 数组解析"——按 {@code },{ 拆串 +
     * 正则抠字段。它有三处硬伤，线上都踩过：
     * <ol>
     *   <li>模型加 Markdown 围栏或前后加解释 → {@code startsWith("[")} 为假 → 整轮白跑；</li>
     *   <li>输出被长度截断时 {@code substring(1, len-1)} 会砍掉一个有效字符；</li>
     *   <li>字符串值里出现 {@code },{ 就被拆坏（description 里写个代码片段就中招）。</li>
     * </ol>
     * 现在统一走 {@link LlmJsonUtils}（去围栏 → 抠最外层数组 → 截断时修补结构），
     * 再交给 Jackson 按节点取字段 —— 值里有花括号、有转义引号都不会错。
     */
    private List<PatternDiscovery> parseAndSavePatterns(Long tenantId, String raw, int lookbackDays,
                                                       LocalDateTime since) {
        List<PatternDiscovery> saved = new ArrayList<>();
        String json = LlmJsonUtils.extractJson(raw);
        if (json == null) {
            log.warn("[Pattern] 模型输出里找不到 JSON 数组，跳过本轮（原始输出前 200 字: {}）",
                    left(raw, 200));
            return saved;
        }
        try {
            JsonNode root = LlmJsonUtils.parse(json, JsonNode.class);
            if (!root.isArray()) {
                log.warn("[Pattern] 期望 JSON 数组，实际是 {}，跳过本轮", root.getNodeType());
                return saved;
            }
            for (JsonNode item : root) {
                PatternDiscovery pd = buildFromJsonItem(tenantId, item, lookbackDays, since);
                if (pd != null) {
                    patternMapper.insert(pd);
                    saved.add(pd);
                }
                if (saved.size() >= MAX_PATTERNS_PER_ROUND) {
                    break;
                }
            }
            log.info("[Pattern] 本轮落库 {} 条规律（模型返回 {} 条）", saved.size(), root.size());
        } catch (Exception e) {
            // 解析不了就这轮不产出，绝不抛给调度器
            log.warn("[Pattern] 解析 LLM 输出失败: {}", e.getMessage());
        }
        return saved;
    }

    private PatternDiscovery buildFromJsonItem(Long tenantId, JsonNode item, int lookbackDays,
                                               LocalDateTime since) {
        PatternDiscovery pd = new PatternDiscovery();
        pd.setTenantId(tenantId);
        pd.setPatternType(text(item, "type", "recurring"));
        pd.setPatternName(text(item, "name", "未命名规律"));
        pd.setDescription(text(item, "description", ""));
        pd.setDataSource("agent_execution_log");
        pd.setTimeRangeStart(since);
        pd.setTimeRangeEnd(LocalDateTime.now());
        pd.setConfidence(intOf(item, "confidence", 50));
        pd.setImpactScore(intOf(item, "impact", 50));
        pd.setRecurrenceCount(0);
        pd.setLastSeen(LocalDateTime.now());
        pd.setSuggestedAction(text(item, "action", ""));
        pd.setIsActionable(pd.getConfidence() >= 60 ? 1 : 0);
        pd.setStatus("discovered");
        pd.setDeleteFlag(0);
        pd.setCreateTime(LocalDateTime.now());
        pd.setUpdateTime(LocalDateTime.now());
        return pd;
    }

    /** 取字符串字段；缺失/为 null 时给默认值 */
    private static String text(JsonNode node, String field, String def) {
        JsonNode v = node.get(field);
        return v == null || v.isNull() ? def : v.asText(def);
    }

    /** 取整数字段；模型偶尔写成 "80分" 这种，抠出数字，抠不到给默认值 */
    private static int intOf(JsonNode node, String field, int def) {
        JsonNode v = node.get(field);
        if (v == null || v.isNull()) {
            return def;
        }
        if (v.isNumber()) {
            return v.asInt(def);
        }
        Matcher m = NUMBER_IN_TEXT.matcher(v.asText(""));
        if (m.find()) {
            try {
                return Integer.parseInt(m.group());
            } catch (NumberFormatException ignore) {
                return def;
            }
        }
        return def;
    }

    private static String left(String s, int n) {
        if (s == null) {
            return "";
        }
        String t = s.replace('\n', ' ');
        return t.length() <= n ? t : t.substring(0, n) + "…";
    }
}
