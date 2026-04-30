package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.intelligence.service.QdrantService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

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
 */
@Slf4j
@Service
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

    /**
     * 搜索相关工具（三步融合检索）
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

        // === Step 1: 提取查询关键词 ===
        List<String> queryKeywords = extractKeywords(userQuery);

        // === Step 2: 多路检索 + 融合打分 ===
        Map<String, Double> toolScores = new LinkedHashMap<>();

        for (McpToolScanner.McpToolMeta tool : allTools) {
            double score = 0.0;

            // 2a. 关键词命中
            double keywordScore = keywordMatchScore(tool, queryKeywords);
            score += keywordScore * KEYWORD_BOOST;

            // 2b. 域匹配（当前页面上下文）
            if (pageContext != null && !pageContext.isBlank()) {
                String domain = inferDomainFromPage(pageContext);
                if (domain != null && domain.equalsIgnoreCase(tool.domain())) {
                    score += DOMAIN_BOOST;
                }
            }

            // 2c. 描述相关性（简单文本匹配）
            double descScore = descriptionMatchScore(tool.description(), userQuery);
            score += descScore;

            toolScores.put(tool.name(), score);
        }

        // === Step 3: 按分数排序取 Top-K ===
        List<McpToolScanner.McpToolMeta> ranked = toolScores.entrySet().stream()
                .filter(e -> e.getValue() > 0.0)
                .sorted(Map.Entry.<String, Double>comparingByValue().reversed())
                .limit(k)
                .map(e -> toolScanner.getToolMeta(e.getKey()))
                .filter(Objects::nonNull)
                .collect(Collectors.toList());

        log.debug("[ToolDiscoveryRAG] query=\"{}...\" → {} tools (from {} total)",
                userQuery.length() > 50 ? userQuery.substring(0, 50) : userQuery,
                ranked.size(), allTools.size());

        // === Step 4: 如果检索结果太少，补充域匹配工具 ===
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

        // === Step 5: 仍然太少，补充 GENERAL 域工具 ===
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
     * 从中文查询提取关键词
     */
    private List<String> extractKeywords(String query) {
        List<String> keywords = new ArrayList<>();
        // 常见的服装供应链关键词
        String[] seeds = {
                "订单", "进度", "逾期", "工厂", "生产", "工序", "裁剪", "入库", "质检",
                "库存", "物料", "采购", "面料", "辅料", "对账", "结算", "财务", "工资",
                "样衣", "打板", "版型", "BOM", "成本", "利润", "客户", "供应商", "仓库",
                "发货", "物流", "扫码", "计件", "审批", "催单", "延期", "异常", "风险",
                "报告", "汇总", "趋势", "对比", "排名", "分析", "创建", "修改", "删除"
        };

        for (String seed : seeds) {
            if (query.contains(seed)) {
                keywords.add(seed);
            }
        }

        return keywords;
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
}
