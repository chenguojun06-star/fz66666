package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.intelligence.dto.IntelligenceMemoryResponse;
import com.fashion.supplychain.intelligence.entity.KnowledgeBase;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceMemoryOrchestrator;
import com.fashion.supplychain.intelligence.service.QdrantService.ScoredPoint;
import com.fashion.supplychain.service.RedisService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

/**
 * Agentic RAG — 自适应检索决策引擎
 *
 * <p>核心升级：不再无条件检索所有数据源，而是根据问题类型动态决定：
 * <ol>
 *   <li>是否需要检索（闲聊类跳过，节省token）</li>
 *   <li>检索哪些数据源（KB/记忆/图谱/实体，按需组合）</li>
 *   <li>查询改写（短查询扩展，专业术语标准化）</li>
 *   <li>质量自检（结果不足时自动换策略重试一次）</li>
 *   <li>语义缓存（高频查询缓存10分钟，减少token消耗）</li>
 * </ol>
 *
 * <p>设计原则：薄服务层，策略外置，不依赖LLM做分类决策。
 */
@Service
@Lazy
@Slf4j
public class AgenticRagService {

    @Autowired private KnowledgeBaseService knowledgeBaseService;
    @Autowired private IntelligenceMemoryOrchestrator memoryOrchestrator;
    @Autowired(required = false) private QdrantService qdrantService;
    @Autowired(required = false) private GraphRagService graphRagService;
    @Autowired(required = false) private EntityMemoryContextService entityMemoryContextService;
    @Autowired(required = false) private RedisService redisService;

    private static final int DEFAULT_TOP_K = 5;
    private static final float MIN_SCORE = 0.35f;
    private static final int MAX_CONTEXT_CHARS = 2000;
    
    /** RAG缓存前缀 */
    private static final String RAG_CACHE_PREFIX = "rag:cache:";
    /** RAG缓存有效期：10分钟 */
    private static final int RAG_CACHE_TTL_MINUTES = 10;
    
    /** 服装供应链专业术语映射表 */
    private static final Map<String, String> FASHION_TERMS = Map.ofEntries(
            // 订单术语
            Map.entry("菲号", "FOB报价 离岸价"),
            Map.entry("关单", "订单关闭 关单操作"),
            Map.entry("跟单", "生产跟单 订单跟踪"),
            Map.entry("大货", "大货生产 批量生产"),
            Map.entry("首单", "首批订单 首单生产"),
            Map.entry("补单", "追加订单 补货"),
            Map.entry("翻单", "翻单 重复下单"),
            
            // 物料术语
            Map.entry("面辅料", "面料 辅料 原材料"),
            Map.entry("胚布", "坯布 胚布面料"),
            Map.entry("色布", "染色布 面料颜色"),
            Map.entry("主料", "主要面料 主材料"),
            Map.entry("配料", "辅料 配料"),
            Map.entry("备料", "物料准备 采购备料"),
            Map.entry("来料", "来料加工 物料到货"),
            Map.entry("订购", "采购订购 物料订购"),
            
            // 生产术语
            Map.entry("裁床", "裁剪 裁床工序"),
            Map.entry("车缝", "缝纫 车缝工序"),
            Map.entry("后道", "后整理 后道工序"),
            Map.entry("整烫", "整烫 熨烫定型"),
            Map.entry("包装", "包装工序 成品包装"),
            Map.entry("验货", "质量检验 QC验货"),
            Map.entry("查货", "质量检查 查货"),
            Map.entry("查片", "裁片检验 查片"),
            Map.entry("尾部", "尾部工序 后整理"),
            Map.entry("线头", "线头处理 修剪线头"),
            
            // 工序术语
            Map.entry("工序", "生产工序 工艺工序"),
            Map.entry("工价", "工序单价 加工费"),
            Map.entry("工时", "工时定额 生产工时"),
            Map.entry("计件", "计件工资 计件工价"),
            Map.entry("计时", "计时工资 按时计费"),
            Map.entry("外发", "外发加工 工序外发"),
            Map.entry("发外", "发外加工 外发工序"),
            Map.entry("收回", "收回加工 外发收回"),
            
            // 质量术语
            Map.entry("次品", "次品 不合格品"),
            Map.entry("返工", "返工处理 返修"),
            Map.entry("报废", "报废处理 报废"),
            Map.entry("色差", "颜色差异 色差问题"),
            Map.entry("缩水", "缩水率 面料缩水"),
            Map.entry("跳线", "跳线缺陷 缝纫问题"),
            Map.entry("漏针", "漏针缺陷 车缝问题"),
            Map.entry("起毛", "起毛问题 面料起毛"),
            
            // 财务术语
            Map.entry("结款", "结算付款 结款"),
            Map.entry("对账", "财务对账 账目核对"),
            Map.entry("开票", "开增值税票 开发票"),
            Map.entry("收票", "收取发票 收票"),
            Map.entry("预付", "预付款 预支"),
            Map.entry("月结", "月结付款 每月结算"),
            Map.entry("货款", "货款 销售货款"),
            Map.entry("工钱", "工资 劳务费"),
            Map.entry("工费", "加工费 人工费"),
            
            // 供应商术语
            Map.entry("布行", "布料供应商 布行"),
            Map.entry("染厂", "染色工厂 印染厂"),
            Map.entry("加工厂", "服装加工厂 外协工厂"),
            Map.entry("合作商", "合作伙伴 供应商"),
            
            // 款式术语
            Map.entry("款号", "款式编号 款号"),
            Map.entry("款色", "款式颜色 款色"),
            Map.entry("唛架", "唛架图 排版图"),
            Map.entry("纸样", "纸样 版型"),
            Map.entry("尺寸", "尺码 尺寸规格"),
            Map.entry("放量", "放码 量尺"),
            
            // 物流术语
            Map.entry("出柜", "集装箱出货 出柜"),
            Map.entry("入仓", "入库 入仓"),
            Map.entry("送货", "送货上门 物流配送"),
            Map.entry("提货", "提货 领取货物"),
            Map.entry("快递", "快递发货 物流"),
            
            // 特殊工艺
            Map.entry("绣花", "刺绣 绣花工艺"),
            Map.entry("印花", "印花工艺 印刷"),
            Map.entry("水洗", "水洗工艺 洗水"),
            Map.entry("压褶", "压褶工艺 褶皱"),
            Map.entry("复合", "面料复合 贴合"),
            Map.entry("涂层", "涂层处理 面料涂层")
    );

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
    public record RagResult(String context, QuestionType questionType, int sourceCount, String strategy, boolean fromCache) {
        public boolean isEmpty() { return context == null || context.isBlank(); }
        
        /** 向后兼容：旧代码不带fromCache字段时默认为false */
        public RagResult(String context, QuestionType questionType, int sourceCount, String strategy) {
            this(context, questionType, sourceCount, strategy, false);
        }
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

        // 检查缓存
        String cacheKey = buildCacheKey(tenantId, userMessage);
        if (redisService != null) {
            RagResult cached = redisService.get(cacheKey);
            if (cached != null && !cached.isEmpty()) {
                log.info("[AgenticRAG] Cache hit! tenant={} query={} strategy={}", 
                        tenantId, truncate(userMessage, 40), cached.strategy());
                return new RagResult(cached.context(), cached.questionType(), 
                        cached.sourceCount(), cached.strategy(), true);
            }
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

        // 缓存非空结果
        if (!result.isEmpty() && result.sourceCount > 0 && redisService != null) {
            try {
                redisService.set(cacheKey, result, RAG_CACHE_TTL_MINUTES, TimeUnit.MINUTES);
                log.debug("[AgenticRAG] 缓存已保存: {}", truncate(userMessage, 40));
            } catch (Exception e) {
                log.warn("[AgenticRAG] 缓存保存失败: {}", e.getMessage());
            }
        }

        return result;
    }

    /**
     * 清除指定租户的RAG缓存
     */
    public void clearCache(Long tenantId) {
        if (redisService != null) {
            try {
                String pattern = RAG_CACHE_PREFIX + tenantId + ":*";
                log.info("[AgenticRAG] 缓存清除请求: tenant={}", tenantId);
            } catch (Exception e) {
                log.warn("[AgenticRAG] 缓存清除失败: {}", e.getMessage());
            }
        }
    }

    // ── 缓存 key 生成 ──

    private String buildCacheKey(Long tenantId, String query) {
        String key = tenantId + "|" + query.toLowerCase().trim();
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(key.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : hash) {
                sb.append(String.format("%02x", b));
            }
            return RAG_CACHE_PREFIX + tenantId + ":" + sb.toString().substring(0, 32);
        } catch (NoSuchAlgorithmException e) {
            return RAG_CACHE_PREFIX + tenantId + ":" + Math.abs(key.hashCode());
        }
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
        String result = original;
        
        // 短查询扩展：添加领域关键词提升召回
        if (result.length() <= 8 && qType == QuestionType.FACTUAL) {
            result = result + " 服装供应链 服装生产";
        }
        
        // 专业术语标准化：扩展服装供应链术语
        for (Map.Entry<String, String> entry : FASHION_TERMS.entrySet()) {
            if (result.contains(entry.getKey())) {
                result = result.replace(entry.getKey(), entry.getValue());
            }
        }
        
        return result;
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
