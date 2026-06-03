package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.intelligence.dto.IntelligenceMemoryResponse;
import com.fashion.supplychain.intelligence.entity.KnowledgeBase;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceMemoryOrchestrator;
import com.fashion.supplychain.intelligence.service.QdrantService.ScoredPoint;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Agentic RAG — 自适应检索决策引擎
 *
 * <p>核心升级：不再无条件检索所有数据源，而是根据问题类型动态决定：
 * <ol>
 *   <li>是否需要检索（闲聊类跳过，节省token）</li>
 *   <li>检索哪些数据源（KB/记忆/图谱/实体，按需组合）</li>
 *   <li>查询改写（短查询扩展、专业术语标准化）</li>
 *   <li>质量自检（结果不足时自动换策略重试一次）</li>
 * </ol>
 *
 * <p>设计原则：薄服务层，策略外置，不依赖LLM做分类决策。
 */
@Service
@Slf4j
public class AgenticRagService {

    @Autowired private KnowledgeBaseService knowledgeBaseService;
    @Autowired private IntelligenceMemoryOrchestrator memoryOrchestrator;
    @Autowired(required = false) private QdrantService qdrantService;
    @Autowired(required = false) private GraphRagService graphRagService;
    @Autowired(required = false) private EntityMemoryContextService entityMemoryContextService;

    private static final int DEFAULT_TOP_K = 5;
    private static final float MIN_SCORE = 0.35f;
    private static final int MAX_CONTEXT_CHARS = 2000;

    // ── 问题类型枚举 ──
    public enum QuestionType {
        /** 事实类：什么是X、X的定义、X和Y的区别 */
        FACTUAL,
        /** 操作类：如何X、怎么X、X流程 */
        OPERATIONAL,
        /** 分析类：分析X、X的原因、为什么X */
        ANALYTICAL,
        /** 实体查询：具体订单号/工厂名/款号 */
        ENTITY_LOOKUP,
        /** 闲聊/问候：你好、谢谢、在吗 */
        CASUAL
    }

    /** 检索结果 */
    public record RagResult(String context, QuestionType questionType, int sourceCount, String strategy) {
        public boolean isEmpty() { return context == null || context.isBlank(); }
    }

    /**
     * 自适应检索入口。
     * @param tenantId 租户ID
     * @param userMessage 用户原始消息
     * @return 检索到的上下文，可能为空（闲聊类或检索失败）
     */
    public RagResult retrieve(Long tenantId, String userMessage) {
        if (userMessage == null || userMessage.isBlank()) {
            return new RagResult("", QuestionType.CASUAL, 0, "skip");
        }

        QuestionType qType = classify(userMessage);
        log.debug("[AgenticRAG] 问题分类: {} → {}", qType, truncate(userMessage, 60));

        // 闲聊类直接跳过，节省token
        if (qType == QuestionType.CASUAL) {
            return new RagResult("", qType, 0, "skip_casual");
        }

        // 查询改写
        String rewrittenQuery = rewriteQuery(userMessage, qType);

        // 按策略检索
        RagResult result = retrieveByStrategy(tenantId, rewrittenQuery, qType);

        // 质量自检：结果不足时换策略重试一次
        if (result.isEmpty() || result.sourceCount == 0) {
            log.debug("[AgenticRAG] 首轮检索为空，尝试降级策略: {}", qType);
            result = fallbackRetrieve(tenantId, rewrittenQuery, qType);
        }

        return result;
    }

    // ── 问题分类（纯规则，不调LLM） ──

    private QuestionType classify(String msg) {
        if (msg.length() <= 5) {
            if (msg.matches(".*[你好在吗谢谢再见嗯哦啊].*")) return QuestionType.CASUAL;
        }

        // 实体查询：包含订单号/工厂名/款号模式
        if (msg.matches(".*[A-Z]{2,4}\\d{6,}.*")     // PO20240101
                || msg.matches(".*\\b[Oo][Rr][Dd][Ee][Rr][-_]?\\d+.*")  // ORDER-123
                || msg.matches(".*[款号型号编号]\\s*[:：]?\\s*[A-Za-z0-9\\-]+.*")
                || msg.matches(".*(查一下|查询|看一下|看看|帮我查).*")) {
            return QuestionType.ENTITY_LOOKUP;
        }

        // 操作类
        if (msg.matches(".*(如何|怎么|怎样|怎么操作|流程|步骤|教程|指南).*")) {
            return QuestionType.OPERATIONAL;
        }

        // 分析类
        if (msg.matches(".*(分析|为什么|原因|怎么回事|怎么办|对比|评估|风险).*")) {
            return QuestionType.ANALYTICAL;
        }

        // 事实类（默认）
        return QuestionType.FACTUAL;
    }

    // ── 查询改写 ──

    private String rewriteQuery(String original, QuestionType qType) {
        // 短查询扩展：添加领域关键词提升召回
        if (original.length() <= 8 && qType == QuestionType.FACTUAL) {
            return original + " 服装供应链 服装生产";
        }
        // 专业术语标准化
        return original
                .replace("菲号", "FOB 报价")
                .replace("关单", "订单关闭 关单")
                .replace("跟单", "生产跟单 订单跟踪")
                .replace("面辅料", "面料 辅料")
                .replace("裁床", "裁剪 裁床工序");
    }

    // ── 策略路由 ──

    private RagResult retrieveByStrategy(Long tenantId, String query, QuestionType qType) {
        return switch (qType) {
            case FACTUAL -> factualRetrieve(tenantId, query);
            case OPERATIONAL -> operationalRetrieve(tenantId, query);
            case ANALYTICAL -> analyticalRetrieve(tenantId, query);
            case ENTITY_LOOKUP -> entityRetrieve(tenantId, query);
            default -> factualRetrieve(tenantId, query);
        };
    }

    // ── 策略1：事实类 — KB优先 + 语义补充 ──

    private RagResult factualRetrieve(Long tenantId, String query) {
        StringBuilder ctx = new StringBuilder();
        int sourceCount = 0;

        // KB关键词检索
        List<KnowledgeBase> kbResults = searchKB(tenantId, query, null, DEFAULT_TOP_K);
        if (!kbResults.isEmpty()) {
            ctx.append("【知识库匹配】\n");
            for (KnowledgeBase kb : kbResults) {
                ctx.append(formatKB(kb));
            }
            sourceCount += kbResults.size();
        }

        // 语义向量补充
        if (qdrantService != null) {
            List<KnowledgeBase> semanticResults = searchSemanticKB(tenantId, query, 3);
            Set<String> seenIds = kbResults.stream().map(KnowledgeBase::getId).collect(Collectors.toSet());
            List<KnowledgeBase> newResults = semanticResults.stream()
                    .filter(kb -> !seenIds.contains(kb.getId()))
                    .limit(2)
                    .toList();
            if (!newResults.isEmpty()) {
                ctx.append("【语义关联】\n");
                for (KnowledgeBase kb : newResults) {
                    ctx.append(formatKB(kb));
                }
                sourceCount += newResults.size();
            }
        }

        return new RagResult(trim(ctx.toString()), QuestionType.FACTUAL, sourceCount, "factual");
    }

    // ── 策略2：操作类 — system_guide/sop精准匹配 ──

    private RagResult operationalRetrieve(Long tenantId, String query) {
        StringBuilder ctx = new StringBuilder();
        int sourceCount = 0;

        // 精准匹配系统操作指南
        List<KnowledgeBase> guides = searchKB(tenantId, query,
                List.of("system_guide", "sop"), DEFAULT_TOP_K);
        if (!guides.isEmpty()) {
            ctx.append("【操作指南】\n");
            for (KnowledgeBase kb : guides) {
                ctx.append(formatKB(kb));
            }
            sourceCount += guides.size();
        }

        // 补充FAQ
        if (guides.size() < 2) {
            List<KnowledgeBase> faqs = searchKB(tenantId, query, List.of("faq"), 2);
            if (!faqs.isEmpty()) {
                ctx.append("【常见问题】\n");
                for (KnowledgeBase kb : faqs) {
                    ctx.append(formatKB(kb));
                }
                sourceCount += faqs.size();
            }
        }

        return new RagResult(trim(ctx.toString()), QuestionType.OPERATIONAL, sourceCount, "operational");
    }

    // ── 策略3：分析类 — KB + 记忆 + 图谱 ──

    private RagResult analyticalRetrieve(Long tenantId, String query) {
        StringBuilder ctx = new StringBuilder();
        int sourceCount = 0;

        // KB检索
        List<KnowledgeBase> kbResults = searchKB(tenantId, query, null, 3);
        if (!kbResults.isEmpty()) {
            ctx.append("【相关知识】\n");
            for (KnowledgeBase kb : kbResults) {
                ctx.append(formatKB(kb));
            }
            sourceCount += kbResults.size();
        }

        // 历史记忆
        try {
            IntelligenceMemoryResponse memResult = memoryOrchestrator.recallSimilar(tenantId, query, 3);
            if (memResult.getRecalled() != null && !memResult.getRecalled().isEmpty()) {
                List<IntelligenceMemoryResponse.MemoryItem> relevant = memResult.getRecalled().stream()
                        .filter(item -> item.getSimilarityScore() >= MIN_SCORE)
                        .limit(2).toList();
                if (!relevant.isEmpty()) {
                    ctx.append("【历史经验】\n");
                    for (IntelligenceMemoryResponse.MemoryItem item : relevant) {
                        String c = item.getContent();
                        if (c != null && c.length() > 300) c = c.substring(0, 300) + "…";
                        ctx.append(String.format("  - [%s] %s（采纳%d次）\n",
                                item.getTitle() != null ? item.getTitle() : "经验",
                                c != null ? c : "",
                                item.getAdoptedCount()));
                    }
                    sourceCount += relevant.size();
                }
            }
        } catch (Exception e) {
            log.debug("[AgenticRAG] 记忆检索跳过: {}", e.getMessage());
        }

        // 知识图谱
        if (graphRagService != null) {
            try {
                String graphCtx = graphRagService.buildGraphContext(tenantId, query);
                if (graphCtx != null && !graphCtx.isBlank()) {
                    ctx.append(graphCtx);
                    sourceCount++;
                }
            } catch (Exception e) {
                log.debug("[AgenticRAG] 图谱检索跳过: {}", e.getMessage());
            }
        }

        return new RagResult(trim(ctx.toString()), QuestionType.ANALYTICAL, sourceCount, "analytical");
    }

    // ── 策略4：实体查询 — 实体记忆 + 图谱 ──

    private RagResult entityRetrieve(Long tenantId, String query) {
        StringBuilder ctx = new StringBuilder();
        int sourceCount = 0;

        if (entityMemoryContextService != null) {
            try {
                String entityCtx = entityMemoryContextService.buildEntityMemoryContext(tenantId, query);
                if (entityCtx != null && !entityCtx.isBlank()) {
                    ctx.append(entityCtx);
                    sourceCount++;
                }
            } catch (Exception e) {
                log.debug("[AgenticRAG] 实体记忆跳过: {}", e.getMessage());
            }
        }

        if (graphRagService != null) {
            try {
                String graphCtx = graphRagService.buildGraphContext(tenantId, query);
                if (graphCtx != null && !graphCtx.isBlank()) {
                    ctx.append(graphCtx);
                    sourceCount++;
                }
            } catch (Exception e) {
                log.debug("[AgenticRAG] 图谱检索跳过: {}", e.getMessage());
            }
        }

        return new RagResult(trim(ctx.toString()), QuestionType.ENTITY_LOOKUP,
                sourceCount, sourceCount > 0 ? "entity" : "entity_empty");
    }

    // ── 降级策略：检索失败时用最宽泛策略重试 ──

    private RagResult fallbackRetrieve(Long tenantId, String query, QuestionType qType) {
        // 降级到全文模糊检索
        String shortQuery = query.length() > 30 ? query.substring(0, 30) : query;
        List<KnowledgeBase> fallback = searchKB(tenantId, shortQuery, null, 3);
        if (!fallback.isEmpty()) {
            StringBuilder ctx = new StringBuilder("【模糊匹配】\n");
            for (KnowledgeBase kb : fallback) {
                ctx.append(formatKB(kb));
            }
            return new RagResult(trim(ctx.toString()), qType, fallback.size(), "fallback");
        }
        return new RagResult("", qType, 0, "fallback_empty");
    }

    // ── 工具方法 ──

    private List<KnowledgeBase> searchKB(Long tenantId, String query, List<String> categories, int limit) {
        try {
            QueryWrapper<KnowledgeBase> qw = new QueryWrapper<KnowledgeBase>()
                    .eq("delete_flag", 0)
                    .and(w -> w.isNull("tenant_id").or().eq("tenant_id", tenantId))
                    .and(w -> w.like("title", query)
                            .or().like("keywords", query)
                            .or().like("content", query));
            if (categories != null && !categories.isEmpty()) {
                qw.in("category", categories);
            }
            qw.orderByDesc("view_count").last("LIMIT " + limit);
            return knowledgeBaseService.list(qw);
        } catch (Exception e) {
            log.debug("[AgenticRAG] KB检索异常: {}", e.getMessage());
            return List.of();
        }
    }

    private List<KnowledgeBase> searchSemanticKB(Long tenantId, String query, int limit) {
        if (qdrantService == null) return List.of();
        try {
            List<ScoredPoint> hits = qdrantService.search(tenantId, query, limit * 2);
            List<String> kbIds = hits.stream()
                    .filter(h -> h.getPointId() != null && h.getPointId().startsWith("kb_"))
                    .map(h -> h.getPointId().substring(3))
                    .distinct().limit(limit)
                    .toList();
            if (kbIds.isEmpty()) return List.of();
            return knowledgeBaseService.list(new QueryWrapper<KnowledgeBase>()
                    .in("id", kbIds)
                    .eq("delete_flag", 0));
        } catch (Exception e) {
            log.debug("[AgenticRAG] 语义检索异常: {}", e.getMessage());
            return List.of();
        }
    }

    private String formatKB(KnowledgeBase kb) {
        String content = kb.getContent();
        if (content != null && content.length() > 500) {
            content = content.substring(0, 500) + "…";
        }
        return String.format("  - [%s] %s：%s\n",
                kb.getCategory() != null ? kb.getCategory() : "通用",
                kb.getTitle() != null ? kb.getTitle() : "",
                content != null ? content : "");
    }

    private String trim(String ctx) {
        if (ctx.length() > MAX_CONTEXT_CHARS) {
            return ctx.substring(0, MAX_CONTEXT_CHARS) + "\n…（检索结果已截断，如需详细内容请调用工具）\n";
        }
        return ctx;
    }

    private String truncate(String s, int maxLen) {
        return s.length() <= maxLen ? s : s.substring(0, maxLen) + "…";
    }
}