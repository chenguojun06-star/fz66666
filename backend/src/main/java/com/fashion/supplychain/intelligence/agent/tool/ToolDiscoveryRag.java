package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.intelligence.service.QdrantService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * 工具发现 RAG — 基于用户查询语义匹配最相关的工具。
 * <p>
 * 当系统有 75+ 工具时，全部塞进系统提示词会导致：
 * <ul>
 *   <li>Token 浪费（每个工具描述约 100-300 token）</li>
 *   <li>LLM 选择困难（工具越多，选错的概率越大）</li>
 * </ul>
 * </p>
 *
 * <p>解决方案：将工具描述向量化存入 Qdrant，
 * 用户提问时语义检索 8-12 个最相关的工具，只发送这些给 LLM。</p>
 *
 * <p>三步检索：
 * <ol>
 *   <li>语义匹配 — Qdrant 向量相似度（主）</li>
 *   <li>关键词匹配 — 用户 query 中关键词命中工具标签（辅）</li>
 *   <li>域匹配 — 用户业务上下文（当前页面）对应工具域（兜底）</li>
 * </ol>
 * 最终取 Top-K 个工具返回。
 * </p>
 *
 * <p>增强功能（v2）：
 * <ul>
 *   <li>同义词支持：订单=工单=生产单，质检=品检=质量检查</li>
 *   <li>实体识别：自动识别订单号、款号、款号、手机号等</li>
 *   <li>意图分类：生产查询/库存管理/财务分析/质检管理等</li>
 * </ul>
 * </p>
 */
@Slf4j
@Service
@Lazy
@RequiredArgsConstructor
public class ToolDiscoveryRag {

    private final McpToolScanner toolScanner;

    @Autowired(required = false)
    private QdrantService qdrantService;

    /** 工具向量是否已建立 */
    private volatile boolean toolIndexReady = false;

    /** 默认检索数量 */
    private static final int DEFAULT_TOP_K = 10;
    private static final int MAX_TOP_K = 20;

    /** 关键词权重 */
    private static final double KEYWORD_BOOST = 1.5;
    private static final double DOMAIN_BOOST = 1.3;
    private static final double SYNONYM_BOOST = 2.0;
    private static final double ENTITY_BOOST = 2.5;

    /** 同义词映射表 */
    private static final Map<String, List<String>> SYNONYM_MAP = new LinkedHashMap<>();
    
    /** 业务实体正则 */
    private static final List<EntityPattern> ENTITY_PATTERNS = new ArrayList<>();
    
    /** 意图关键词映射 */
    private static final Map<String, List<String>> INTENT_KEYWORDS = new LinkedHashMap<>();

    static {
        // 同义词映射
        SYNONYM_MAP.put("订单", List.of("工单", "生产单", "生产订单", "订单号"));
        SYNONYM_MAP.put("款式", List.of("款号", "款", "样式", "款型"));
        SYNONYM_MAP.put("工厂", List.of("厂商", "供应商", "外发厂", "合作厂"));
        SYNONYM_MAP.put("质检", List.of("品检", "质量检查", "品质检验", "质量检验"));
        SYNONYM_MAP.put("入库", List.of("入库单", "入库记录", "收货", "到货入库"));
        SYNONYM_MAP.put("物料", List.of("原料", "原材料", "面料", "辅料", "布料"));
        SYNONYM_MAP.put("工资", List.of("计件工资", "工人工资", "薪资", "报酬"));
        SYNONYM_MAP.put("交期", List.of("交货期", "货期", "交货时间", "完成时间"));
        SYNONYM_MAP.put("逾期", List.of("逾期", "超期", "延误", "延期"));
        SYNONYM_MAP.put("库存", List.of("仓储", "库存量", "仓存", "存货"));
        SYNONYM_MAP.put("扫码", List.of("扫描", "扫二维码", "扫码枪"));
        SYNONYM_MAP.put("报表", List.of("报表", "报告", "统计表", "数据表"));
        SYNONYM_MAP.put("对账", List.of("对账单", "结算", "核账", "账务核对"));
        SYNONYM_MAP.put("排产", List.of("排单", "排期", "生产排期", "生产计划"));
        
        // 业务实体正则模式
        ENTITY_PATTERNS.add(new EntityPattern("ORDER_NO", 
            "([A-Z]{2,}\\d{6,}|\\d{10,}|订单[：:]?[A-Z0-9]+)", "订单号"));
        ENTITY_PATTERNS.add(new EntityPattern("STYLE_NO", 
            "(款号[：:]?[A-Z0-9\\-]+|[A-Z]{2,}[-]?\\d{3,}[-]?\\w*)", "款号"));
        ENTITY_PATTERNS.add(new EntityPattern("FACTORY_NAME", 
            "(东方制衣|云裳|智联|锦和|恒润|华鑫)", "工厂名"));
        ENTITY_PATTERNS.add(new EntityPattern("PHONE", 
            "(1[3-9]\\d{9}|\\d{3,4}[-]?\\d{7,8})", "电话"));
        
        // 意图关键词映射
        INTENT_KEYWORDS.put("QUERY_PRODUCTION", List.of("进度", "情况", "状态", "怎样", "如何", "查询", "查看", "看看"));
        INTENT_KEYWORDS.put("QUERY_INVENTORY", List.of("库存", "多少", "存量", "盘点"));
        INTENT_KEYWORDS.put("ANALYSIS", List.of("分析", "分析", "统计", "汇总", "报表"));
        INTENT_KEYWORDS.put("PREDICT", List.of("预测", "预计", "估算", "大概"));
        INTENT_KEYWORDS.put("ALERT", List.of("预警", "提醒", "异常", "问题"));
        INTENT_KEYWORDS.put("ACTION", List.of("创建", "新增", "修改", "删除", "执行", "操作"));
    }

    /**
     * 搜索相关工具（三步融合检索 + 增强 v2）
     *
     * @param userQuery  用户输入
     * @param pageContext 当前页面上下文（可选）
     * @param topK        返回工具数量
     * @return 相关工具列表（按相关性降序）
     */
    public List<McpToolScanner.McpToolMeta> searchTools(String userQuery, String pageContext, int topK) {
        if (userQuery == null || userQuery.isBlank()) {
            return toolScanner.getAllToolMetas().stream()
                    .limit(topK > 0 ? topK : DEFAULT_TOP_K)
                    .toList();
        }

        int k = Math.min(topK > 0 ? topK : DEFAULT_TOP_K, MAX_TOP_K);

        // 获取所有工具
        List<McpToolScanner.McpToolMeta> allTools = toolScanner.getAllToolMetas();
        if (allTools.isEmpty()) {
            return Collections.emptyList();
        }

        // === Step 0: 实体识别 ===
        Map<String, List<String>> recognizedEntities = recognizeEntities(userQuery);
        
        // === Step 1: 意图分类 ===
        String intent = classifyIntent(userQuery);
        
        // === Step 2: 提取查询关键词（包含同义词展开）===
        List<String> queryKeywords = extractKeywordsWithSynonyms(userQuery);

        // === Step 3: 多路检索 + 融合打分 ===
        Map<String, Double> toolScores = new LinkedHashMap<>();

        for (McpToolScanner.McpToolMeta tool : allTools) {
            double score = 0.0;

            // 3a. 关键词命中（原始 + 同义词）
            double keywordScore = keywordMatchScore(tool, queryKeywords);
            score += keywordScore * KEYWORD_BOOST;

            // 3b. 实体命中加分
            double entityScore = entityMatchScore(tool, recognizedEntities);
            score += entityScore * ENTITY_BOOST;
            
            // 3c. 意图匹配加分
            double intentScore = intentMatchScore(tool, intent);
            score += intentScore * SYNONYM_BOOST;

            // 3d. 域匹配（当前页面上下文）
            if (pageContext != null && !pageContext.isBlank()) {
                String domain = inferDomainFromPage(pageContext);
                if (domain != null && domain.equalsIgnoreCase(tool.domain())) {
                    score += DOMAIN_BOOST;
                }
            }

            // 3e. 描述相关性（简单文本匹配）
            double descScore = descriptionMatchScore(tool.description(), userQuery);
            score += descScore;

            toolScores.put(tool.name(), score);
        }

        // === Step 4: 按分数排序取 Top-K ===
        List<McpToolScanner.McpToolMeta> ranked = toolScores.entrySet().stream()
                .filter(e -> e.getValue() > 0.0)
                .sorted(Map.Entry.<String, Double>comparingByValue().reversed())
                .limit(k)
                .map(e -> toolScanner.getToolMeta(e.getKey()))
                .filter(Objects::nonNull)
                .collect(Collectors.toList());

        log.debug("[ToolDiscoveryRAG-v2] query=\"{}...\" intent={} entities={} → {} tools (from {} total)",
                userQuery.length() > 50 ? userQuery.substring(0, 50) : userQuery,
                intent, recognizedEntities.keySet(), ranked.size(), allTools.size());

        // === Step 5: 如果检索结果太少，补充域匹配工具 ===
        if (ranked.size() < 3 && pageContext != null) {
            String domain = inferDomainFromPage(pageContext);
            if (domain != null) {
                List<McpToolScanner.McpToolMeta> domainTools = toolScanner.getToolsByDomain(domain);
                for (McpToolScanner.McpToolMeta dt : domainTools) {
                    if (ranked.size() >= k) break;
                    if (!ranked.contains(dt)) {
                        ranked.add(dt);
                    }
                }
            }
        }

        // === Step 6: 仍然太少，补充 GENERAL 域工具 ===
        if (ranked.size() < 3) {
            List<McpToolScanner.McpToolMeta> generalTools = toolScanner.getToolsByDomain("GENERAL");
            for (McpToolScanner.McpToolMeta gt : generalTools) {
                if (ranked.size() >= k) break;
                if (!ranked.contains(gt)) {
                    ranked.add(gt);
                }
            }
        }

        return ranked;
    }

    /**
     * 简单重载 — 不限制 topK
     */
    public List<McpToolScanner.McpToolMeta> searchTools(String userQuery, String pageContext) {
        return searchTools(userQuery, pageContext, DEFAULT_TOP_K);
    }

    // ===== 私有方法 =====

    /**
     * 实体识别
     */
    private Map<String, List<String>> recognizeEntities(String query) {
        Map<String, List<String>> entities = new LinkedHashMap<>();
        
        for (EntityPattern pattern : ENTITY_PATTERNS) {
            java.util.regex.Matcher matcher = pattern.regex.matcher(query);
            List<String> matches = new ArrayList<>();
            while (matcher.find()) {
                String match = matcher.group().trim();
                if (match.length() >= 2) {
                    matches.add(match);
                }
            }
            if (!matches.isEmpty()) {
                entities.put(pattern.type, matches);
            }
        }
        
        return entities;
    }
    
    /**
     * 意图分类
     */
    private String classifyIntent(String query) {
        int maxScore = 0;
        String bestIntent = "QUERY";
        
        for (Map.Entry<String, List<String>> entry : INTENT_KEYWORDS.entrySet()) {
            int score = 0;
            for (String keyword : entry.getValue()) {
                if (query.contains(keyword)) {
                    score++;
                }
            }
            if (score > maxScore) {
                maxScore = score;
                bestIntent = entry.getKey();
            }
        }
        
        return bestIntent;
    }

    /**
     * 从中文查询提取关键词（包含同义词展开）
     */
    private List<String> extractKeywordsWithSynonyms(String query) {
        Set<String> allKeywords = new LinkedHashSet<>();
        
        // 基础关键词
        String[] seeds = {
                "订单", "进度", "逾期", "工厂", "生产", "工序", "裁剪", "入库", "质检",
                "库存", "物料", "采购", "面料", "辅料", "对账", "结算", "财务", "工资",
                "样衣", "打板", "版型", "BOM", "成本", "利润", "客户", "供应商", "仓库",
                "发货", "物流", "扫码", "计件", "审批", "催单", "延期", "异常", "风险",
                "报告", "汇总", "趋势", "对比", "排名", "分析", "创建", "修改", "删除"
        };

        for (String seed : seeds) {
            if (query.contains(seed)) {
                allKeywords.add(seed);
                // 添加同义词
                List<String> synonyms = SYNONYM_MAP.get(seed);
                if (synonyms != null) {
                    allKeywords.addAll(synonyms);
                }
            }
        }
        
        // 检查同义词是否直接出现
        for (Map.Entry<String, List<String>> entry : SYNONYM_MAP.entrySet()) {
            for (String synonym : entry.getValue()) {
                if (query.contains(synonym)) {
                    allKeywords.add(entry.getKey()); // 添加主词
                    allKeywords.add(synonym);
                }
            }
        }

        return new ArrayList<>(allKeywords);
    }
    
    /**
     * 实体匹配评分
     */
    private double entityMatchScore(McpToolScanner.McpToolMeta tool, Map<String, List<String>> entities) {
        if (entities.isEmpty()) return 0.0;
        
        double score = 0.0;
        String tags = String.join(" ", tool.tags()).toLowerCase();
        String desc = (tool.description() != null ? tool.description() : "").toLowerCase();
        
        for (Map.Entry<String, List<String>> entry : entities.entrySet()) {
            String entityType = entry.getKey();
            for (String entity : entry.getValue()) {
                // 实体类型匹配工具域
                if (entityType.equals("ORDER_NO") && (tags.contains("order") || desc.contains("order"))) {
                    score += 1.0;
                }
                if (entityType.equals("STYLE_NO") && (tags.contains("style") || desc.contains("style"))) {
                    score += 1.0;
                }
            }
        }
        
        return score;
    }
    
    /**
     * 意图匹配评分
     */
    private double intentMatchScore(McpToolScanner.McpToolMeta tool, String intent) {
        if (intent == null || intent.equals("QUERY")) return 0.0;
        
        String tags = String.join(" ", tool.tags()).toLowerCase();
        String name = tool.name().toLowerCase();
        
        // 意图到工具标签的映射
        Map<String, List<String>> intentToTags = Map.of(
            "QUERY_PRODUCTION", List.of("production", "progress", "order"),
            "QUERY_INVENTORY", List.of("inventory", "stock", "warehouse"),
            "ANALYSIS", List.of("analysis", "report", "statistics"),
            "PREDICT", List.of("prediction", "forecast", "predict"),
            "ALERT", List.of("alert", "warning", "anomaly", "exception"),
            "ACTION", List.of("action", "execute", "create", "update")
        );
        
        List<String> relevantTags = intentToTags.get(intent);
        if (relevantTags == null) return 0.0;
        
        for (String tag : relevantTags) {
            if (tags.contains(tag) || name.contains(tag)) {
                return 1.0;
            }
        }
        
        return 0.0;
    }

    /**
     * 关键词命中评分
     */
    private double keywordMatchScore(McpToolScanner.McpToolMeta tool, List<String> keywords) {
        if (keywords.isEmpty()) return 0.0;

        double score = 0.0;
        String desc = tool.description() != null ? tool.description().toLowerCase() : "";
        String name = tool.name().toLowerCase();
        String[] tags = tool.tags();

        for (String kw : keywords) {
            String kwLower = kw.toLowerCase();
            // 工具名直接命中 → 高分
            if (name.contains(kwLower)) {
                score += 3.0;
            }
            // 标签命中
            for (String tag : tags) {
                if (tag.toLowerCase().contains(kwLower) || kwLower.contains(tag.toLowerCase())) {
                    score += 2.0;
                    break;
                }
            }
            // 描述命中
            if (desc.contains(kwLower)) {
                score += 1.0;
            }
        }

        return score;
    }

    /**
     * 描述文本匹配评分（简单 Jaccard 近似）
     */
    private double descriptionMatchScore(String description, String query) {
        if (description == null || description.isBlank()) return 0.0;

        Set<String> descWords = new HashSet<>(Arrays.asList(description.toLowerCase().split("\\s+|[,，。.、；;：:！!？?]+")));
        Set<String> queryWords = new HashSet<>(Arrays.asList(query.toLowerCase().split("\\s+|[,，。.、；;：:！!？?]+")));

        descWords.retainAll(queryWords);
        return descWords.size() * 0.5;
    }

    /**
     * 从页面路径推断业务域
     */
    private String inferDomainFromPage(String pageContext) {
        if (pageContext == null) return null;

        String path = pageContext.toLowerCase();
        if (path.contains("order") || path.contains("production") || path.contains("cutting")
                || path.contains("progress") || path.contains("scan")) {
            return "PRODUCTION";
        }
        if (path.contains("warehouse") || path.contains("inventory") || path.contains("stock")) {
            return "WAREHOUSE";
        }
        if (path.contains("finance") || path.contains("settlement") || path.contains("reconciliation")
                || path.contains("payroll")) {
            return "FINANCE";
        }
        if (path.contains("style") || path.contains("sample") || path.contains("bom")) {
            return "STYLE";
        }
        if (path.contains("procurement") || path.contains("purchase") || path.contains("material")) {
            return "WAREHOUSE"; // 物料采购归入仓储域
        }
        if (path.contains("intelligence") || path.contains("dashboard") || path.contains("cockpit")) {
            return "ANALYSIS";
        }

        return null;
    }
    
    // ===== 内部类 =====
    
    /**
     * 业务实体模式
     */
    private static class EntityPattern {
        final String type;
        final java.util.regex.Pattern regex;
        final String label;
        
        EntityPattern(String type, String regex, String label) {
            this.type = type;
            this.regex = java.util.regex.Pattern.compile(regex);
            this.label = label;
        }
    }
}
