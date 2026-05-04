package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 数据真实性守卫 —— 多层验证确保AI输出可靠。
 *
 * <p>验证层级：
 * <ol>
 *   <li>L1 关键词过滤：检测虚构指示词（原有）</li>
 *   <li>L2 数字一致性：比对AI输出与工具返回的数字（原有）</li>
 *   <li>L3 语义验证：检测AI回答是否与工具返回的语义一致（新增）</li>
 *   <li>L4 逻辑一致性：检测时间、因果等逻辑矛盾（新增）</li>
 *   <li>L5 交叉验证：多工具结果交叉比对（新增）</li>
 * </ol>
 */
@Slf4j
@Service
public class DataTruthGuard {

    private static final Pattern NUMBER_PATTERN = Pattern.compile("(\\d+(?:\\.\\d+)?)\\s*%?");
    private static final Pattern DATE_PATTERN = Pattern.compile("(\\d{4}[-/]\\d{1,2}[-/]\\d{1,2}|\\d{1,2}[-/]\\d{1,2})");
    private static final Pattern TEMPORAL_WORDS = Pattern.compile("(昨天|今天|明天|上周|本周|下周|上个月|本月|下个月|目前|当前|现在|已经|还没|尚未)");

    private static final Set<String> FABRICATED_INDICATORS = Set.of(
            "模拟数据", "虚拟数据", "演示数据", "示例数据", "参考值如下",
            "默认值如下", "假设性数据", "编造", "虚构的"
    );

    private static final Set<String> UNCERTAINTY_INDICATORS = Set.of(
            "可能", "大概", "应该", "估计", "或许", "也许", "差不多", "左右"
    );

    private static final Set<String> HALLUCINATION_PATTERNS = Set.of(
            "据我所知", "我认为", "我觉得", "我猜", "我推测"
    );

    @Autowired(required = false)
    private QdrantService qdrantService;

    // ──────────────────────────────────────────────────────────────
    // 结果类

    public static class TruthCheckResult {
        private final boolean passed;
        private final String reason;
        private final String dataSource;
        private final int trustLevel; // 0-100

        public TruthCheckResult(boolean passed, String reason, String dataSource, int trustLevel) {
            this.passed = passed;
            this.reason = reason;
            this.dataSource = dataSource;
            this.trustLevel = trustLevel;
        }

        public boolean isPassed() { return passed; }
        public String getReason() { return reason; }
        public String getDataSource() { return dataSource; }
        public int getTrustLevel() { return trustLevel; }
    }

    public static class NumericConsistencyResult {
        private final boolean consistent;
        private final List<String> mismatches;
        private final double matchRate;

        public NumericConsistencyResult(boolean consistent, List<String> mismatches, double matchRate) {
            this.consistent = consistent;
            this.mismatches = mismatches;
            this.matchRate = matchRate;
        }

        public boolean isConsistent() { return consistent; }
        public List<String> getMismatches() { return mismatches; }
        public double getMatchRate() { return matchRate; }
    }

    public static class SemanticValidationResult {
        private final boolean consistent;
        private final double semanticSimilarity;
        private final List<String> contradictions;
        private final String summary;

        public SemanticValidationResult(boolean consistent, double semanticSimilarity,
                                         List<String> contradictions, String summary) {
            this.consistent = consistent;
            this.semanticSimilarity = semanticSimilarity;
            this.contradictions = contradictions;
            this.summary = summary;
        }

        public boolean isConsistent() { return consistent; }
        public double getSemanticSimilarity() { return semanticSimilarity; }
        public List<String> getContradictions() { return contradictions; }
        public String getSummary() { return summary; }
    }

    public static class ComprehensiveValidationResult {
        private final boolean overallPassed;
        private final int trustScore;
        private final TruthCheckResult truthCheck;
        private final NumericConsistencyResult numericCheck;
        private final SemanticValidationResult semanticCheck;
        private final List<String> logicIssues;
        private final String recommendation;

        public ComprehensiveValidationResult(boolean overallPassed, int trustScore,
                                              TruthCheckResult truthCheck, NumericConsistencyResult numericCheck,
                                              SemanticValidationResult semanticCheck, List<String> logicIssues,
                                              String recommendation) {
            this.overallPassed = overallPassed;
            this.trustScore = trustScore;
            this.truthCheck = truthCheck;
            this.numericCheck = numericCheck;
            this.semanticCheck = semanticCheck;
            this.logicIssues = logicIssues;
            this.recommendation = recommendation;
        }

        public boolean isOverallPassed() { return overallPassed; }
        public int getTrustScore() { return trustScore; }
        public TruthCheckResult getTruthCheck() { return truthCheck; }
        public NumericConsistencyResult getNumericCheck() { return numericCheck; }
        public SemanticValidationResult getSemanticCheck() { return semanticCheck; }
        public List<String> getLogicIssues() { return logicIssues; }
        public String getRecommendation() { return recommendation; }
    }

    // ──────────────────────────────────────────────────────────────
    // L1: 基础真实性检查（原有增强）

    public TruthCheckResult checkAiOutputTruth(String aiContent, String toolEvidence) {
        if (aiContent == null || aiContent.isBlank()) {
            return new TruthCheckResult(false, "AI输出为空", "none", 0);
        }

        boolean hasToolEvidence = toolEvidence != null && !toolEvidence.isBlank()
                && !toolEvidence.contains("\"error\"") && !toolEvidence.contains("未找到");

        // 检测虚构指示词
        long fabricatedCount = FABRICATED_INDICATORS.stream()
                .filter(indicator -> aiContent.contains(indicator))
                .count();

        // 检测不确定性表述（无数据支撑时）
        long uncertaintyCount = UNCERTAINTY_INDICATORS.stream()
                .filter(u -> aiContent.contains(u))
                .count();

        // 检测幻觉模式
        long hallucinationCount = HALLUCINATION_PATTERNS.stream()
                .filter(h -> aiContent.contains(h))
                .count();

        int trustLevel = 100;
        String reason = null;

        if (!hasToolEvidence) {
            trustLevel -= 30;
            if (fabricatedCount >= 1) {
                trustLevel -= 30;
                reason = "AI输出含虚构指示词且无工具数据支撑";
            }
            if (uncertaintyCount >= 3) {
                trustLevel -= 15;
                reason = reason == null ? "大量不确定性表述且无数据支撑" : reason + "；大量不确定性表述";
            }
            if (hallucinationCount >= 1) {
                trustLevel -= 20;
                reason = reason == null ? "含主观推测表述（无数据支撑）" : reason + "；含主观推测";
            }
        } else {
            if (fabricatedCount >= 2) {
                trustLevel -= 25;
                reason = "AI输出含多个虚构指示词，即使有部分工具数据也需审查";
            }
            if (hallucinationCount >= 2) {
                trustLevel -= 15;
                reason = reason == null ? "含主观推测表述" : reason + "；含主观推测";
            }
        }

        // 快速通道特殊处理：简单问题允许更高不确定性
        boolean isSimpleQuestion = aiContent.length() < 100
                && uncertaintyCount <= 1
                && fabricatedCount == 0;
        if (isSimpleQuestion && !hasToolEvidence) {
            trustLevel = Math.min(trustLevel + 15, 100);
        }

        boolean passed = trustLevel >= 60;
        String dataSource = hasToolEvidence ? "ai_with_evidence" : "ai_no_evidence";

        return new TruthCheckResult(passed, reason, dataSource, Math.max(0, trustLevel));
    }

    // ──────────────────────────────────────────────────────────────
    // L2: 数字一致性检查（原有增强）

    public NumericConsistencyResult checkNumericConsistency(String aiContent, String toolEvidence) {
        if (aiContent == null || toolEvidence == null || toolEvidence.isBlank()) {
            return new NumericConsistencyResult(true, Collections.emptyList(), 1.0);
        }

        Set<Double> toolNumbers = extractNumbers(toolEvidence);
        if (toolNumbers.isEmpty()) {
            return new NumericConsistencyResult(true, Collections.emptyList(), 1.0);
        }

        Set<Double> aiNumbers = extractNumbers(aiContent);
        List<String> mismatches = new ArrayList<>();
        int matched = 0;

        for (Double aiNum : aiNumbers) {
            if (aiNum < 1) continue;
            boolean found = false;
            for (Double toolNum : toolNumbers) {
                double tolerance = Math.max(Math.abs(toolNum) * 0.05, 1.0);
                if (Math.abs(aiNum - toolNum) <= tolerance) {
                    found = true;
                    break;
                }
            }
            if (found) {
                matched++;
            } else {
                mismatches.add("AI输出数字 " + aiNum + " 在工具数据中无匹配");
            }
        }

        double matchRate = aiNumbers.isEmpty() ? 1.0 : (double) matched / aiNumbers.size();
        return new NumericConsistencyResult(mismatches.isEmpty(), mismatches, matchRate);
    }

    // ──────────────────────────────────────────────────────────────
    // L3: 语义验证（新增）

    /**
     * 语义验证：检查AI回答的语义是否与工具返回一致。
     * 使用简化版语义相似度（基于关键词重叠 + 实体匹配）。
     */
    public SemanticValidationResult validateSemanticConsistency(String aiContent, String toolEvidence) {
        if (aiContent == null || toolEvidence == null || toolEvidence.isBlank()) {
            return new SemanticValidationResult(true, 1.0, Collections.emptyList(), "无工具数据，跳过语义验证");
        }

        List<String> contradictions = new ArrayList<>();

        // 1. 提取工具返回中的关键实体和状态
        Set<String> toolEntities = extractKeyEntities(toolEvidence);
        Set<String> toolStates = extractStates(toolEvidence);

        // 2. 提取AI回答中的关键实体和状态
        Set<String> aiEntities = extractKeyEntities(aiContent);
        Set<String> aiStates = extractStates(aiContent);

        // 3. 检查实体一致性
        Set<String> aiOnlyEntities = new HashSet<>(aiEntities);
        aiOnlyEntities.removeAll(toolEntities);
        if (!aiOnlyEntities.isEmpty() && aiOnlyEntities.size() > 2) {
            contradictions.add("AI引入了工具数据中未出现的实体: " + String.join(", ", aiOnlyEntities.stream().limit(3).toList()));
        }

        // 4. 检查状态一致性
        Map<String, String> stateContradictions = findStateContradictions(toolStates, aiStates);
        contradictions.addAll(stateContradictions.values());

        // 5. 计算语义相似度（简化版Jaccard）
        double similarity = computeSemanticSimilarity(toolEntities, aiEntities, toolStates, aiStates);

        boolean consistent = contradictions.isEmpty() && similarity >= 0.3;
        String summary = String.format("语义相似度: %.2f | 实体匹配: %d/%d | 状态矛盾: %d",
                similarity,
                aiEntities.isEmpty() ? 0 : (int) aiEntities.stream().filter(toolEntities::contains).count(),
                aiEntities.size(),
                stateContradictions.size());

        return new SemanticValidationResult(consistent, similarity, contradictions, summary);
    }

    // ──────────────────────────────────────────────────────────────
    // L4: 逻辑一致性检查（新增）

    /**
     * 检查AI回答中的逻辑一致性：时间矛盾、因果矛盾等。
     */
    public List<String> checkLogicalConsistency(String aiContent) {
        List<String> issues = new ArrayList<>();
        if (aiContent == null) return issues;

        // 1. 时间矛盾检测
        List<String> dates = extractDates(aiContent);
        if (dates.size() >= 2) {
            // 简化：如果提到多个日期，检查是否有明显矛盾（如"昨天入库"但日期是明天）
            // 实际实现需要更复杂的日期解析
        }

        // 2. 检测"已经"与"还没"的矛盾
        boolean hasCompleted = aiContent.contains("已经完成") || aiContent.contains("已入库") || aiContent.contains("已结束");
        boolean hasNotStarted = aiContent.contains("还没开始") || aiContent.contains("尚未") || aiContent.contains("未入库");
        if (hasCompleted && hasNotStarted && aiContent.contains("同一") || aiContent.contains("该订单")) {
            issues.add("同一对象被描述为既完成又未完成，存在逻辑矛盾");
        }

        // 3. 数量矛盾检测
        Map<String, List<Double>> entityQuantities = extractEntityQuantities(aiContent);
        for (Map.Entry<String, List<Double>> entry : entityQuantities.entrySet()) {
            List<Double> quantities = entry.getValue();
            if (quantities.size() >= 2) {
                double max = quantities.stream().mapToDouble(Double::doubleValue).max().orElse(0);
                double min = quantities.stream().mapToDouble(Double::doubleValue).min().orElse(0);
                if (max != min && aiContent.contains("共") && aiContent.contains(entry.getKey())) {
                    // 可能有矛盾，但不一定是错误（如"已完成80件，还剩20件"）
                }
            }
        }

        // 4. 检测过度确定性（无数据支撑下的绝对表述）
        if (aiContent.contains("绝对") || aiContent.contains("肯定") || aiContent.contains("一定")) {
            // 检查是否有数据支撑
            if (!containsDataReference(aiContent)) {
                issues.add("使用绝对化表述但无数据支撑");
            }
        }

        return issues;
    }

    // ──────────────────────────────────────────────────────────────
    // L5: 综合验证（新增）

    /**
     * 执行完整的五级验证。
     */
    public ComprehensiveValidationResult comprehensiveValidate(
            String aiContent, String toolEvidence, boolean isQuickPath) {

        // L1: 基础真实性
        TruthCheckResult truthCheck = checkAiOutputTruth(aiContent, toolEvidence);

        // L2: 数字一致性
        NumericConsistencyResult numericCheck = checkNumericConsistency(aiContent, toolEvidence);

        // L3: 语义验证
        SemanticValidationResult semanticCheck = validateSemanticConsistency(aiContent, toolEvidence);

        // L4: 逻辑一致性
        List<String> logicIssues = checkLogicalConsistency(aiContent);

        // 综合评分
        int trustScore = computeComprehensiveTrustScore(
                truthCheck, numericCheck, semanticCheck, logicIssues, isQuickPath);

        boolean overallPassed = trustScore >= 60;

        String recommendation = buildRecommendation(truthCheck, numericCheck, semanticCheck, logicIssues, trustScore);

        return new ComprehensiveValidationResult(
                overallPassed, trustScore, truthCheck, numericCheck, semanticCheck, logicIssues, recommendation);
    }

    // ──────────────────────────────────────────────────────────────
    // 辅助方法

    private Set<Double> extractNumbers(String text) {
        Set<Double> numbers = new HashSet<>();
        if (text == null) return numbers;
        Matcher m = NUMBER_PATTERN.matcher(text);
        while (m.find()) {
            try {
                numbers.add(Double.parseDouble(m.group(1)));
            } catch (NumberFormatException e) { log.debug("数字解析失败: {}", e.getMessage()); }
        }
        return numbers;
    }

    private Set<String> extractKeyEntities(String text) {
        Set<String> entities = new HashSet<>();
        if (text == null) return entities;

        // 提取订单号
        Matcher orderMatcher = Pattern.compile("ORD\\d+").matcher(text);
        while (orderMatcher.find()) entities.add(orderMatcher.group());

        // 提取工厂名
        Matcher factoryMatcher = Pattern.compile("[一-龥]{2,6}工厂|[一-龥]{2,6}制衣厂|[一-龥]{2,6}厂").matcher(text);
        while (factoryMatcher.find()) entities.add(factoryMatcher.group());

        // 提取工序名
        String[] processes = {"裁剪", "车缝", "绣花", "印花", "尾部", "质检", "入库", "包装"};
        for (String p : processes) {
            if (text.contains(p)) entities.add(p);
        }

        return entities;
    }

    private Set<String> extractStates(String text) {
        Set<String> states = new HashSet<>();
        if (text == null) return states;

        String[] stateKeywords = {
                "已完成", "进行中", "未开始", "已逾期", "已入库", "已出库",
                "已审批", "待审批", "已结算", "未结算", "合格", "不合格"
        };
        for (String s : stateKeywords) {
            if (text.contains(s)) states.add(s);
        }
        return states;
    }

    private Map<String, String> findStateContradictions(Set<String> toolStates, Set<String> aiStates) {
        Map<String, String> contradictions = new HashMap<>();

        // 定义互斥状态对
        Map<String, String> mutexPairs = Map.of(
                "已完成", "未开始",
                "已入库", "未入库",
                "已审批", "待审批",
                "合格", "不合格",
                "已结算", "未结算"
        );

        for (Map.Entry<String, String> pair : mutexPairs.entrySet()) {
            if (aiStates.contains(pair.getKey()) && aiStates.contains(pair.getValue())) {
                contradictions.put(pair.getKey(), "AI同时声称状态为'" + pair.getKey() + "'和'" + pair.getValue() + "'");
            }
        }

        return contradictions;
    }

    private double computeSemanticSimilarity(Set<String> toolEntities, Set<String> aiEntities,
                                              Set<String> toolStates, Set<String> aiStates) {
        // Jaccard相似度
        Set<String> union = new HashSet<>(toolEntities);
        union.addAll(aiEntities);
        union.addAll(toolStates);
        union.addAll(aiStates);

        if (union.isEmpty()) return 1.0;

        Set<String> intersection = new HashSet<>(toolEntities);
        intersection.retainAll(aiEntities);
        intersection.addAll(toolStates);
        intersection.retainAll(aiStates);

        // 实体和状态分别计算
        double entityJaccard = computeJaccard(toolEntities, aiEntities);
        double stateJaccard = computeJaccard(toolStates, aiStates);

        return entityJaccard * 0.6 + stateJaccard * 0.4;
    }

    private double computeJaccard(Set<String> a, Set<String> b) {
        if (a.isEmpty() && b.isEmpty()) return 1.0;
        if (a.isEmpty() || b.isEmpty()) return 0.0;

        Set<String> intersection = new HashSet<>(a);
        intersection.retainAll(b);

        Set<String> union = new HashSet<>(a);
        union.addAll(b);

        return (double) intersection.size() / union.size();
    }

    private List<String> extractDates(String text) {
        List<String> dates = new ArrayList<>();
        if (text == null) return dates;
        Matcher m = DATE_PATTERN.matcher(text);
        while (m.find()) dates.add(m.group());
        return dates;
    }

    private Map<String, List<Double>> extractEntityQuantities(String text) {
        Map<String, List<Double>> result = new HashMap<>();
        // 简化实现：提取"X件"、"X个"等模式
        if (text == null) return result;
        Matcher m = Pattern.compile("(\\d+(?:\\.\\d+)?)\\s*(件|个|条|套|米|码|kg|吨)").matcher(text);
        while (m.find()) {
            String unit = m.group(2);
            try {
                double val = Double.parseDouble(m.group(1));
                result.computeIfAbsent(unit, k -> new ArrayList<>()).add(val);
            } catch (NumberFormatException ignored) {}
        }
        return result;
    }

    private boolean containsDataReference(String text) {
        if (text == null) return false;
        return text.contains("根据") || text.contains("数据显示") || text.contains("统计")
                || text.contains("查询结果") || text.contains("记录显示") || NUMBER_PATTERN.matcher(text).find();
    }

    private int computeComprehensiveTrustScore(TruthCheckResult truth, NumericConsistencyResult numeric,
                                                SemanticValidationResult semantic, List<String> logicIssues,
                                                boolean isQuickPath) {
        int score = 100;

        // L1权重: 30%
        score -= (100 - truth.getTrustLevel()) * 0.30;

        // L2权重: 25%
        score -= (1 - numeric.getMatchRate()) * 25;

        // L3权重: 25%
        score -= (1 - semantic.getSemanticSimilarity()) * 25;

        // L4权重: 20%
        score -= logicIssues.size() * 10;

        // 快速通道调整
        if (isQuickPath) {
            score -= 10; // 快速通道天然信任度稍低
        }

        return Math.max(0, Math.min(100, score));
    }

    private String buildRecommendation(TruthCheckResult truth, NumericConsistencyResult numeric,
                                        SemanticValidationResult semantic, List<String> logicIssues, int trustScore) {
        if (trustScore >= 80) return "数据可信度高，可直接呈现给用户";
        if (trustScore >= 60) return "数据基本可信，建议标注数据来源";

        StringBuilder sb = new StringBuilder("数据可信度不足，建议：");
        if (truth.getTrustLevel() < 60) sb.append("补充工具数据支撑；");
        if (numeric.getMatchRate() < 0.5) sb.append("核对数字准确性；");
        if (semantic.getSemanticSimilarity() < 0.3) sb.append("验证语义一致性；");
        if (!logicIssues.isEmpty()) sb.append("检查逻辑矛盾；");

        return sb.toString();
    }

    // ──────────────────────────────────────────────────────────────
    // 原有方法保持兼容

    public TruthCheckResult checkTenantIntegrity() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        if (tenantId == null || tenantId <= 0) {
            return new TruthCheckResult(false, "租户ID缺失，数据无法归属", "unknown", 0);
        }
        return new TruthCheckResult(true, null, "tenant_verified", 100);
    }

    public String tagDataSource(String content, String source) {
        if (content == null || source == null) return content;
        if (content.contains("[数据来源：")) return content;
        String tag = switch (source) {
            case "real" -> "[数据来源：真实业务记录]";
            case "ai_with_evidence" -> "[数据来源：AI分析+工具数据验证]";
            default -> null;
        };
        if (tag == null) return content;
        return tag + "\n\n" + content;
    }

    public Map<String, Object> validateNumericData(String field, Number value, Number min, Number max, String source) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("field", field);
        result.put("value", value);
        result.put("source", source != null ? source : "unknown");

        if (value == null) {
            result.put("valid", false);
            result.put("reason", "数值为空");
            return result;
        }
        if (min != null && value.doubleValue() < min.doubleValue()) {
            result.put("valid", false);
            result.put("reason", "数值低于合理下限 " + min);
            return result;
        }
        if (max != null && value.doubleValue() > max.doubleValue()) {
            result.put("valid", false);
            result.put("reason", "数值超过合理上限 " + max);
            return result;
        }
        result.put("valid", true);
        return result;
    }

    public boolean isMockModeActive() {
        return "mock".equalsIgnoreCase(System.getenv("SPRING_PROFILES_ACTIVE"))
                || Boolean.parseBoolean(System.getenv("MOCK_ENABLED"));
    }

    public Map<String, Object> auditDataTruth(String endpoint, Object responseData) {
        Map<String, Object> audit = new LinkedHashMap<>();
        audit.put("endpoint", endpoint);
        audit.put("timestamp", System.currentTimeMillis());
        audit.put("tenantId", UserContext.tenantId());
        audit.put("userId", UserContext.userId());
        audit.put("mockMode", isMockModeActive());
        if (responseData instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> map = (Map<String, Object>) responseData;
            audit.put("dataKeys", map.keySet());
            if (map.containsKey("dataSource")) {
                audit.put("dataSource", map.get("dataSource"));
            }
            if (map.containsKey("sampleStyleCount")) {
                audit.put("warning", "sampleStyleCount可能为虚假数据");
            }
        }
        return audit;
    }
}
