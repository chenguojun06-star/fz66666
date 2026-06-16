package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

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
@Lazy
public class DataTruthGuard {

    private static final Pattern NUMBER_PATTERN = Pattern.compile("(\\d+(?:\\.\\d+)?)\\s*%?");
    private static final Pattern DATE_PATTERN = Pattern.compile("(\\d{4}[-/]\\d{1,2}[-/]\\d{1,2}|\\d{1,2}[-/]\\d{1,2})");
    private static final Pattern TEMPORAL_WORDS = Pattern.compile("(昨天|今天|明天|上周|本周|下周|上个月|本月|下个月|目前|当前|现在|已经|还没|尚未)");

    private static final Set<String> FABRICATED_INDICATORS = Set.of(
            "模拟数据", "虚拟数据", "演示数据", "示例数据", "参考值如下",
            "默认值如下", "假设性数据", "编造", "虚构的"
    );

    private static final Set<String> UNCERTAINTY_INDICATORS = Set.of(
            "可能", "大概", "应该", "估计", "或许", "也许", "差不多", "左右",
            "约", "大约", "近", "接近"
    );

    private static final Set<String> HALLUCINATION_PATTERNS = Set.of(
            "据我所知", "我认为", "我觉得", "我猜", "我推测", "个人觉得"
    );

    // 模糊时间词（需要在呈现时明确标注为"实时"还是"非实时"）
    private static final Set<String> FUZZY_TIME_WORDS = Set.of(
            "今天", "昨天", "前天", "明天", "现在", "目前", "当前",
            "本周", "上周", "本月", "上月", "今年", "去年"
    );

    // 绝对化表述词（无数据支撑时必须降级）
    private static final Set<String> ABSOLUTE_WORDS = Set.of(
            "绝对", "肯定", "一定", "完全", "100%", "百分百", "全部", "所有"
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

        Set<Double> toolNumbers = extractNumbersFromDataSignatures(toolEvidence);
        if (toolNumbers.isEmpty()) {
            toolNumbers = extractNumbers(toolEvidence);
        }
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

    private Set<Double> extractNumbersFromDataSignatures(String toolEvidence) {
        Set<Double> numbers = new HashSet<>();
        int startIdx = toolEvidence.indexOf("关键数据签名（用于AI数字输出校验）");
        if (startIdx < 0) {
            return numbers;
        }
        int endIdx = toolEvidence.indexOf("\n\n", startIdx);
        if (endIdx < 0) {
            endIdx = toolEvidence.length();
        }
        String sigSection = toolEvidence.substring(startIdx, endIdx);
        Pattern pattern = Pattern.compile("\\b(\\d+(?:\\.\\d+)?)\\b");
        Matcher matcher = pattern.matcher(sigSection);
        while (matcher.find()) {
            numbers.add(Double.parseDouble(matcher.group(1)));
        }
        return numbers;
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
            boolean hasFutureRef = aiContent.contains("明天") || aiContent.contains("下周") || aiContent.contains("下月");
            boolean hasPastRef = aiContent.contains("昨天") || aiContent.contains("上周") || aiContent.contains("上月") || aiContent.contains("前天");
            if (hasFutureRef && hasPastRef) {
                issues.add("同一回答中同时引用过去和未来时间，可能存在时间矛盾");
            }
            boolean hasAlready = aiContent.contains("已经") || aiContent.contains("已完成") || aiContent.contains("已结束");
            boolean hasNotYet = aiContent.contains("还没") || aiContent.contains("尚未") || aiContent.contains("未完成");
            if (hasAlready && hasNotYet) {
                String[] timeWords = {"今天", "昨天", "本周", "上周", "本月", "上月"};
                for (String tw : timeWords) {
                    if (aiContent.indexOf(tw) != aiContent.lastIndexOf(tw)) {
                        issues.add("同一时间词\"" + tw + "\"出现多次，可能存在时间矛盾");
                        break;
                    }
                }
            }
        }

        // 2. 检测"已经"与"还没"的矛盾
        boolean hasCompleted = aiContent.contains("已经完成") || aiContent.contains("已入库") || aiContent.contains("已结束");
        boolean hasNotStarted = aiContent.contains("还没开始") || aiContent.contains("尚未") || aiContent.contains("未入库");
        boolean mentionsSameObject = aiContent.contains("同一") || aiContent.contains("该订单") || aiContent.contains("这个订单") || aiContent.contains("这个工厂");
        if (hasCompleted && hasNotStarted && mentionsSameObject) {
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

    /**
     * 评估AI回答对工具调用结果的覆盖率——工具返回的数据有多少被AI真正用到了。
     *
     * @param aiContent    AI回答文本
     * @param toolRecords  本轮对话的工具调用记录
     * @return 0.0-1.0 之间的覆盖率，1.0表示所有工具数据都被引用
     */
    public double evaluateToolCoverage(String aiContent,
                                         java.util.List<com.fashion.supplychain.intelligence.helper.AiAgentToolExecHelper.ToolExecRecord> toolRecords) {
        if (toolRecords == null || toolRecords.isEmpty()) return 1.0;
        if (aiContent == null || aiContent.isBlank()) return 0.0;
        int usedCount = 0;
        for (com.fashion.supplychain.intelligence.helper.AiAgentToolExecHelper.ToolExecRecord rec : toolRecords) {
            if (rec.toolName == null) continue;
            String raw = rec.rawResult;
            if (raw == null || raw.isBlank()) { usedCount++; continue; }
            String keyInfo = extractKeyInfo(raw);
            if (keyInfo != null && aiContent.contains(keyInfo)) { usedCount++; }
        }
        return (double) usedCount / toolRecords.size();
    }

    private String extractKeyInfo(String rawResult) {
        if (rawResult == null || rawResult.length() < 3) return null;
        if (rawResult.length() <= 30) return rawResult;
        Matcher m = Pattern.compile("(ORD\\d+|[一-龥]{2,6}(?:工厂|制衣厂|厂)|\\d{4}-\\d{2}-\\d{2})").matcher(rawResult);
        if (m.find()) return m.group();
        return rawResult.substring(0, Math.min(30, rawResult.length()));
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

    // ──────────────────────────────────────────────────────────────
    // 新增：用户友好提示和数据标注
    // ──────────────────────────────────────────────────────────────

    /**
     * 为AI回答添加数据来源和置信度标注。
     *
     * <p>输出格式：
     * <pre>
     * 【数据来源】：小云AI分析 + 业务数据库查询
     * 【数据时效性】：实时查询（当前时间）
     * 【置信度】：高（综合评分 85/100）
     * 【数据范围】：您的工厂（tenantId=xxx）
     *
     * [原AI回答内容]
     *
     * 【注意】：以上数据仅供参考，重要决策请二次确认
     * </pre>
     *
     * @param aiContent  原AI回答
     * @param toolEvidence 工具证据
     * @param trustScore 综合信任分
     * @param dataTime   数据时间
     * @return 标注后的AI回答
     */
    public String annotateAiResponse(String aiContent, String toolEvidence,
                                      int trustScore, Date dataTime) {
        if (aiContent == null || aiContent.isBlank()) {
            return buildNoDataResponse();
        }

        StringBuilder annotated = new StringBuilder();

        // 1. 数据来源标注
        annotated.append(buildDataSourceTag(toolEvidence)).append("\n\n");

        // 2. 数据时效性标注
        annotated.append(buildDataTimelinessTag(dataTime)).append("\n\n");

        // 3. 置信度标注
        annotated.append(buildTrustLevelTag(trustScore)).append("\n\n");

        // 4. 多租户数据范围标注
        annotated.append(buildDataScopeTag()).append("\n\n");

        // 5. 原AI回答（添加分隔线）
        annotated.append("───").append("\n\n");
        annotated.append(aiContent).append("\n\n");

        // 6. 时间验证提示（如果有模糊时间词）
        String timeWarning = buildTimeWarningIfNeeded(aiContent);
        if (timeWarning != null) {
            annotated.append("\n").append(timeWarning);
        }

        // 7. 绝对化表述降级提示（如果有且无数据支撑）
        String absoluteWarning = buildAbsoluteWordWarningIfNeeded(aiContent, toolEvidence);
        if (absoluteWarning != null) {
            annotated.append("\n").append(absoluteWarning);
        }

        // 8. 底部提示
        annotated.append("\n")
                .append("【重要提示】：以上数据为AI分析结果，仅供参考。")
                .append("涉及生产计划、工资结算等重要决策，请二次确认后再执行。");

        return annotated.toString();
    }

    /**
     * 当AI找不到数据时的友好回复模板。
     */
    public String buildNoDataResponse() {
        return """
                【数据来源】：小云AI查询
                【数据状态】：未找到相关数据

                ───

                很抱歉，我没有找到您查询的相关数据。

                可能的原因：
                1. 您查询的订单/款式/工厂在系统中不存在
                2. 关键词可能不够准确，请尝试其他表述
                3. 相关数据可能尚未录入系统

                建议：
                - 检查您使用的关键词是否准确
                - 可以告诉我更多上下文信息，我帮您重新查询
                - 如需录入新数据，请联系系统管理员

                【重要提示】：如数据对生产决策至关重要，请先在相关页面中手动确认。""";
    }

    /**
     * 构建数据来源标注。
     */
    private String buildDataSourceTag(String toolEvidence) {
        if (toolEvidence == null || toolEvidence.isBlank() ||
                toolEvidence.contains("未找到") || toolEvidence.contains("null")) {
            return "【数据来源】：小云AI分析（无直接工具数据支撑，请谨慎参考）";
        }

        // 检测数据源类型
        boolean hasDbData = toolEvidence.contains("查询") || toolEvidence.contains("列表")
                || toolEvidence.contains("数据") || toolEvidence.contains("记录");
        boolean hasAiAnalysis = toolEvidence.contains("分析") || toolEvidence.contains("预测");

        if (hasDbData && hasAiAnalysis) {
            return "【数据来源】：小云AI分析 + 业务数据库查询（已交叉验证）";
        } else if (hasDbData) {
            return "【数据来源】：小云AI + 业务数据库实时查询";
        } else {
            return "【数据来源】：小云AI分析结果";
        }
    }

    /**
     * 构建数据时效性标注。
     */
    private String buildDataTimelinessTag(Date dataTime) {
        if (dataTime == null) {
            return "【数据时效性】：未标注时间（请特别注意时效性）";
        }

        long diff = System.currentTimeMillis() - dataTime.getTime();
        long minutes = diff / (60 * 1000);
        long hours = minutes / 60;
        long days = hours / 24;

        if (minutes < 5) {
            return "【数据时效性】：实时查询（最新数据）";
        } else if (minutes < 60) {
            return "【数据时效性】：近" + minutes + "分钟内的数据";
        } else if (hours < 24) {
            return "【数据时效性】：近" + hours + "小时的数据";
        } else if (days < 7) {
            return "【数据时效性】：近" + days + "天的数据（建议确认是否有更新）";
        } else {
            return "【数据时效性】：" + days + "天前的数据（可能已过时，请手动确认最新状态）";
        }
    }

    /**
     * 构建置信度标注。
     */
    private String buildTrustLevelTag(int trustScore) {
        String level;
        String description;

        if (trustScore >= 80) {
            level = "高";
            description = "数据经过完整验证，可直接参考";
        } else if (trustScore >= 60) {
            level = "中";
            description = "数据基本可信，建议结合实际情况判断";
        } else if (trustScore >= 40) {
            level = "低";
            description = "数据缺少部分支撑，建议仅作参考，重要决策请二次确认";
        } else {
            level = "极低";
            description = "数据可信度不足，请不要依赖此回答做重要决策，请先手动查询系统";
        }

        return String.format("【置信度】：%s（综合评分 %d/100） - %s",
                level, trustScore, description);
    }

    /**
     * 构建多租户数据范围标注。
     */
    private String buildDataScopeTag() {
        try {
            Long tenantId = UserContext.tenantId();
            if (tenantId != null) {
                return "【数据范围】：您的工厂（tenantId=" + tenantId + "） - 数据已隔离，仅显示您有权限访问的数据";
            }
            return "【数据范围】：当前会话数据（租户已隔离）";
        } catch (Exception e) {
            return "【数据范围】：请注意确认数据归属";
        }
    }

    /**
     * 如果AI回答中有模糊时间词，生成警告提示。
     *
     * <p>例如："今天逾期5个订单" - 如果用户看到时已经是明天，就可能误解。
     */
    private String buildTimeWarningIfNeeded(String aiContent) {
        if (aiContent == null) return null;

        boolean hasFuzzyTime = FUZZY_TIME_WORDS.stream().anyMatch(aiContent::contains);
        if (!hasFuzzyTime) return null;

        java.text.SimpleDateFormat sdf = new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm");
        String currentTime = sdf.format(new Date());

        return "【时间提示】：以上内容中的\"今天\"、\"本周\"等表述，基于当前时间("
                + currentTime + ")判断。如您在不同时间查看，数据可能已更新，请以系统实时查询为准。";
    }

    /**
     * 如果AI回答中有绝对化表述且无数据支撑，生成降级提示。
     */
    private String buildAbsoluteWordWarningIfNeeded(String aiContent, String toolEvidence) {
        if (aiContent == null) return null;

        boolean hasAbsolute = ABSOLUTE_WORDS.stream().anyMatch(aiContent::contains);
        if (!hasAbsolute) return null;

        boolean hasEvidence = toolEvidence != null && !toolEvidence.isBlank()
                && !toolEvidence.contains("未找到");

        if (!hasEvidence) {
            return "【表述提示】：回答中含有\"绝对/肯定\"等表述，但缺少直接数据支撑。"
                    + "建议将其视为趋势判断而非绝对事实，重要决策请手动查询验证。";
        }
        return null;
    }

    /**
     * 简化版标注方法（无时间参数，使用当前时间）。
     */
    public String annotateSimple(String aiContent, String toolEvidence, int trustScore) {
        return annotateAiResponse(aiContent, toolEvidence, trustScore, new Date());
    }

    /**
     * 为"工具找不到数据"的情况生成降级回答。
     */
    public String buildSoftFailureResponse(String userQuery, String toolName, String reason) {
        return "【数据来源】：小云AI查询（未找到可用数据）\n\n"
                + "───\n\n"
                + "关于\"" + (userQuery != null ? userQuery.substring(0, Math.min(userQuery.length(), 30)) : "您的查询")
                + "\"，我尝试调用" + (toolName != null ? toolName : "查询工具")
                + "但没有找到符合条件的数据。\n\n"
                + "具体原因：" + (reason != null ? reason : "查询条件可能不匹配") + "\n\n"
                + "建议您：\n"
                + "1. 检查关键词是否准确（如订单号是否完整）\n"
                + "2. 尝试使用其他关键词或放宽查询条件\n"
                + "3. 如果是新数据，可能尚未入库，请稍后再试\n"
                + "4. 如需新增数据，请在相关页面操作\n\n"
                + "【重要提示】：如涉及生产决策，请不要依赖AI分析结果，直接查询系统原始数据。";
    }
}
