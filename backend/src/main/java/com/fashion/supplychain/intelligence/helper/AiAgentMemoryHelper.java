package com.fashion.supplychain.intelligence.helper;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.entity.KnowledgeBase;
import com.fashion.supplychain.intelligence.mapper.KnowledgeBaseMapper;
import com.fashion.supplychain.intelligence.orchestration.AiMemoryOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceMemoryOrchestrator;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.time.Duration;
import java.time.LocalDateTime;

import jakarta.annotation.PreDestroy;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

@Slf4j
@Component
@Lazy
public class AiAgentMemoryHelper {

    /**
     * 【P2-1修复】原硬编码 MAX_MEMORY_TURNS=15 与 application.yml
     * 的 xiaoyun.conversation-memory.max-turns=20 不一致。
     * 导致 AiAgentMemoryHelper 截断比 ConversationMemoryService 早 5 轮，
     * 同一用户的对话记忆在两个 Service 中窗口大小不一致。
     * 现改为 @Value 注入，与 yml 默认值 20 对齐（运维可调）。
     */
    @org.springframework.beans.factory.annotation.Value("${xiaoyun.conversation-memory.max-turns:20}")
    private int maxMemoryTurns;

    private static final int MAX_USERS_CACHED = 500;
    private static final int COMPACT_THRESHOLD_TURNS = 20;
    private static final String REDIS_MEMORY_PREFIX = "fashion:chat:memory:";
    private static final long REDIS_MEMORY_TTL_HOURS = 72;
    private static final int MAX_PROCEDURAL_PATTERNS = 30;
    private static final ObjectMapper JSON_MAPPER = new ObjectMapper()
            .registerModule(new JavaTimeModule());

    // ===== P1升级: 三层记忆 — 程序记忆（Procedural Memory）=====
    // 记录成功的工具调用模式，下次遇到相似意图时作为few-shot加速推理
    private final java.util.concurrent.ConcurrentHashMap<String, ProceduralPattern> proceduralMemory = new java.util.concurrent.ConcurrentHashMap<>();

    /** 捕获的工具调用模式 */
    public static class ProceduralPattern {
        String intentKey;           // 意图分类key
        List<String> toolSequence;  // 工具调用序列
        int successCount;
        double avgQualityScore;
        long lastUsedAt;
    }

    @Autowired private IntelligenceInferenceOrchestrator inferenceOrchestrator;
    @Autowired private IntelligenceMemoryOrchestrator intelligenceMemoryOrchestrator;
    @Autowired private AiMemoryOrchestrator aiMemoryOrchestrator;
    @Autowired private KnowledgeBaseMapper knowledgeBaseMapper;
    @Autowired(required = false) private StringRedisTemplate stringRedisTemplate;

    private final Cache<String, List<AiMessage>> conversationMemory = Caffeine.newBuilder()
            .maximumSize(MAX_USERS_CACHED)
            .expireAfterAccess(2, TimeUnit.HOURS)
            .recordStats()
            .build();

    private final ExecutorService memoryExecutor = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "ai-memory-enhance");
        t.setDaemon(true);
        return t;
    });

    @PreDestroy
    public void shutdown() {
        memoryExecutor.shutdownNow();
    }

    /** 构建租户+用户维度的内存键，防止跨租户对话记忆泄漏 */
    private String memoryKey(String userId, Long tenantId) {
        return (tenantId != null ? tenantId : 0) + ":" + userId;
    }

    public List<AiMessage> getConversationHistory(String userId, Long tenantId) {
        if (userId == null || userId.isBlank()) return List.of();
        String key = memoryKey(userId, tenantId);
        // L1: Caffeine
        List<AiMessage> history = conversationMemory.getIfPresent(key);
        if (history != null && !history.isEmpty()) return new ArrayList<>(history);
        // L2: Redis
        history = loadFromRedis(key);
        if (history != null && !history.isEmpty()) {
            conversationMemory.put(key, Collections.synchronizedList(new ArrayList<>(history)));
            return history;
        }
        return List.of();
    }

    public void saveConversationTurn(String userId, Long tenantId, String userMsg, String assistantMsg) {
        String key = memoryKey(userId, tenantId);
        // L1: Caffeine
        List<AiMessage> history = conversationMemory.get(key, k -> Collections.synchronizedList(new ArrayList<>()));
        history.add(AiMessage.user(userMsg));
        history.add(AiMessage.assistant(assistantMsg));
        while (history.size() > maxMemoryTurns * 2) {
            history.remove(0);
        }
        // L2: Redis async
        persistToRedisAsync(key, new ArrayList<>(history));
    }

    private List<AiMessage> loadFromRedis(String cacheKey) {
        if (stringRedisTemplate == null) return List.of();
        try {
            String json = stringRedisTemplate.opsForValue().get(REDIS_MEMORY_PREFIX + cacheKey);
            if (json == null || json.isBlank()) return List.of();
            List<Map<String, Object>> raw = JSON_MAPPER.readValue(json, new TypeReference<>() {});
            List<AiMessage> msgs = new ArrayList<>();
            for (Map<String, Object> m : raw) {
                AiMessage msg = new AiMessage();
                msg.setRole((String) m.get("role"));
                msg.setContent(m.get("content") != null ? (String) m.get("content") : "");
                msgs.add(msg);
            }
            log.debug("[AiAgentMemory] Redis L2命中: key={}, turns={}", cacheKey, msgs.size() / 2);
            return msgs;
        } catch (Exception e) {
            log.debug("[AiAgentMemory] Redis读取失败（不影响主流程）: {}", e.getMessage());
            return List.of();
        }
    }

    private void persistToRedisAsync(String cacheKey, List<AiMessage> history) {
        if (stringRedisTemplate == null || history.isEmpty()) return;
        CompletableFuture.runAsync(() -> {
            try {
                List<Map<String, String>> payload = new ArrayList<>();
                for (AiMessage m : history) {
                    Map<String, String> item = new java.util.LinkedHashMap<>();
                    item.put("role", m.getRole());
                    item.put("content", m.getContent() != null ? m.getContent() : "");
                    payload.add(item);
                }
                String json = JSON_MAPPER.writeValueAsString(payload);
                stringRedisTemplate.opsForValue().set(REDIS_MEMORY_PREFIX + cacheKey, json, Duration.ofHours(REDIS_MEMORY_TTL_HOURS));
            } catch (Exception e) {
                log.debug("[AiAgentMemory] Redis写入失败（不影响主流程）: {}", e.getMessage());
            }
        }, memoryExecutor);
    }

    /**
     * P0升级: Token感知的三级历史压缩。
     * 普通调用（无tokenBudget参数）保留旧行为兼容。
     */
    public List<AiMessage> compactConversationHistory(List<AiMessage> history) {
        return compactConversationHistory(history, -1);
    }

    /**
     * Token感知压缩：预估总上下文是否接近预算，按三级策略压缩。
     *
     * @param history     历史消息
     * @param tokenBudget 可用token预算，-1表示不限制
     */
    public List<AiMessage> compactConversationHistory(List<AiMessage> history, int tokenBudget) {
        if (history == null || history.isEmpty()) return List.of();
        int turnCount = history.size() / 2;

        // 快速估算: 中文字符约 0.5 tokens/char
        int estimatedTokens = estimateTokens(history);
        boolean isTokenAware = tokenBudget > 0 && estimatedTokens > 0;
        int usagePct = isTokenAware ? (estimatedTokens * 100 / tokenBudget) : 0;

        // 三级保护阈值
        if (!isTokenAware && turnCount <= COMPACT_THRESHOLD_TURNS) return new ArrayList<>(history);
        if (isTokenAware && usagePct < 60 && turnCount < COMPACT_THRESHOLD_TURNS) return new ArrayList<>(history);

        // 确定保留策略
        int keepTurns;
        int summaryMaxLen;
        if (isTokenAware && usagePct > 90) {
            keepTurns = 1;   // 只保留最近2条消息
            summaryMaxLen = 80;
        } else if (isTokenAware && usagePct > 75) {
            keepTurns = 2;   // 保留最近4条
            summaryMaxLen = 120;
        } else {
            keepTurns = 2;   // 默认保留最近2轮
            summaryMaxLen = 150;
        }

        int keepMessages = keepTurns * 2;
        if (keepMessages >= history.size()) return new ArrayList<>(history);

        List<AiMessage> recentMessages = new ArrayList<>(history.subList(history.size() - keepMessages, history.size()));
        List<AiMessage> olderMessages = history.subList(0, history.size() - keepMessages);

        StringBuilder olderText = new StringBuilder();
        for (AiMessage msg : olderMessages) {
            String role = msg.getRole() == null ? "unknown" : msg.getRole();
            String content = msg.getContent() == null ? "" : msg.getContent();
            olderText.append("[").append(role).append("] ")
                    .append(AiAgentEvidenceHelper.truncate(content, 300)).append("\n");
        }

        try {
            List<AiMessage> compactPrompt = List.of(
                    AiMessage.system("你将多轮对话压缩为一段中文摘要（" + summaryMaxLen + "字以内），必须保留：订单号/款号/工厂名/金额/决策结论。"),
                    AiMessage.user(olderText.toString())
            );
            IntelligenceInferenceResult compactResult = inferenceOrchestrator.chat("history-compact", compactPrompt, List.of());
            if (compactResult.isSuccess() && compactResult.getContent() != null) {
                List<AiMessage> result = new ArrayList<>();
                result.add(AiMessage.system("[对话历史摘要] " + compactResult.getContent()));
                result.addAll(recentMessages);
                log.info("[AiAgent-Memory] 三级压缩(L{}): {}条→ 1摘要+{}条 (token使用率{}% {})",
                        usagePct > 90 ? 3 : usagePct > 75 ? 2 : 1,
                        olderMessages.size(), recentMessages.size(),
                        usagePct, isTokenAware ? "" : "[turn-only]");
                return result;
            }
        } catch (Exception e) {
            log.warn("[AiAgent-Memory] 压缩失败，保留最近{}条: {}", keepMessages, e.getMessage());
        }
        return new ArrayList<>(recentMessages);
    }

    /** 快速估算消息列表的 token 数（中文字符≈0.6 tokens，英文≈0.3 tokens/char） */
    public int estimateTokens(List<AiMessage> messages) {
        if (messages == null) return 0;
        int total = 0;
        for (AiMessage m : messages) {
            String c = m.getContent();
            if (c == null || c.isEmpty()) continue;
            for (int i = 0; i < c.length(); i++) {
                total += Character.UnicodeScript.of(c.charAt(i)).equals(Character.UnicodeScript.HAN) ? 3 : 1;
            }
        }
        return total / 2; // 粗略: 2字节≈1token
    }

    public void saveCurrentConversationToMemory(String userId, Long tenantId) {
        List<AiMessage> history = getConversationHistory(userId, tenantId);
        if (!history.isEmpty()) {
            aiMemoryOrchestrator.saveConversation(tenantId, userId, history);
        }
    }

    public void enhanceMemoryAsync(String userId, Long tenantId, String userMessage, String assistantResponse) {
        // 捕获调用方线程的租户上下文，在异步线程中恢复
        final Long capturedTenantId = tenantId;
        final String capturedUserId = userId;
        CompletableFuture.runAsync(() -> {
            try {
                // 在异步线程中恢复租户上下文，确保 saveCase 能正确读取 tenantId
                UserContext asyncCtx = new UserContext();
                asyncCtx.setTenantId(capturedTenantId);
                asyncCtx.setUserId(capturedUserId);
                UserContext.set(asyncCtx);
                try {
                    if (assistantResponse == null || assistantResponse.length() < 80) {
                        return;
                    }
                    List<AiMessage> extractPrompt = List.of(
                            AiMessage.system("你是知识提取助手。分析以下对话，如果其中包含有价值的业务洞察（如决策依据、" +
                                    "异常处理方案、数据分析结论），则输出一行标题和一段摘要，格式:\n" +
                                    "TITLE: 标题\nCONTENT: 摘要\n\n" +
                                    "如果对话是简单闲聊/查询且无新洞察，仅输出 SKIP"),
                            AiMessage.user("用户: " + AiAgentEvidenceHelper.truncate(userMessage, 300) + "\n助手: " + AiAgentEvidenceHelper.truncate(assistantResponse, 600))
                    );
                    IntelligenceInferenceResult extractResult = inferenceOrchestrator.chat("memory-extract", extractPrompt, List.of());
                    if (!extractResult.isSuccess() || extractResult.getContent() == null) {
                        return;
                    }
                    String extraction = extractResult.getContent().trim();
                    if (extraction.startsWith("SKIP") || !extraction.contains("TITLE:")) {
                        return;
                    }
                    String title = "";
                    String content = "";
                    for (String line : extraction.split("\n")) {
                        if (line.startsWith("TITLE:")) {
                            title = line.substring(6).trim();
                        } else if (line.startsWith("CONTENT:")) {
                            content = line.substring(8).trim();
                        }
                    }
                    if (title.isEmpty() || content.isEmpty()) {
                        return;
                    }
                    intelligenceMemoryOrchestrator.saveCase("agent_insight", "conversation", title, content);
                    log.info("[AiAgent] 记忆增强成功: title={}, userId={}", title, userId);
                    // 高质量洞察（内容>120字符）同步沉淀知识库，供 KnowledgeSearchTool RAG 检索复用
                    if (content.length() > 120) {
                        try {
                            KnowledgeBase kb = new KnowledgeBase();
                            kb.setTenantId(capturedTenantId);
                            kb.setCategory("faq");
                            kb.setTitle(title);
                            kb.setContent(content);
                            kb.setSource("agent_derived");
                            kb.setViewCount(0);
                            kb.setHelpfulCount(0);
                            kb.setDeleteFlag(0);
                            kb.setCreateTime(LocalDateTime.now());
                            kb.setUpdateTime(LocalDateTime.now());
                            knowledgeBaseMapper.insert(kb);
                            log.info("[AiAgent] 洞察已沉淀知识库: title={}", title);
                        } catch (Exception kbEx) {
                            log.debug("[AiAgent] 知识库写入跳过（不影响主流程）: {}", kbEx.getMessage());
                        }
                    }
                } finally {
                    UserContext.clear(); // 防止线程复用时上下文泄漏
                }
            } catch (Exception e) {
                log.debug("[AiAgent] 记忆增强异常（不影响主流程）: {}", e.getMessage());
            }
        }, memoryExecutor);
    }

    // ===== P1升级: 三层记忆 — 程序记忆（Procedural Memory）操作 =====

    /** 记录成功的工具调用模式，SelfCritic评分>80时调用 */
    public void recordProceduralPattern(String userMessage, List<String> toolNames, double qualityScore) {
        if (toolNames == null || toolNames.isEmpty() || userMessage == null) return;
        String intentKey = extractIntentKey(userMessage);
        ProceduralPattern existing = proceduralMemory.compute(intentKey, (k, prev) -> {
            if (prev == null) {
                ProceduralPattern p = new ProceduralPattern();
                p.intentKey = intentKey;
                p.toolSequence = new ArrayList<>(toolNames);
                p.successCount = 1;
                p.avgQualityScore = qualityScore;
                p.lastUsedAt = System.currentTimeMillis();
                return p;
            }
            prev.successCount++;
            prev.avgQualityScore = (prev.avgQualityScore * (prev.successCount - 1) + qualityScore) / prev.successCount;
            prev.lastUsedAt = System.currentTimeMillis();
            if (toolNames.size() < prev.toolSequence.size() && qualityScore > prev.avgQualityScore) {
                prev.toolSequence = new ArrayList<>(toolNames);
            }
            return prev;
        });
        if (proceduralMemory.size() > MAX_PROCEDURAL_PATTERNS) {
            String oldest = proceduralMemory.entrySet().stream()
                    .min(java.util.Comparator.comparingLong(e -> e.getValue().lastUsedAt))
                    .map(java.util.Map.Entry::getKey).orElse(null);
            if (oldest != null) proceduralMemory.remove(oldest);
        }
        log.debug("[AiAgent-PM] 记录程序记忆: intent={} tools={} score={} count={}",
                intentKey, toolNames, qualityScore, existing != null ? existing.successCount : 1);
    }

    /** 获取排名靠前的程序记忆，作为few-shot注入system prompt */
    public String buildProceduralMemoryBlock() {
        if (proceduralMemory.isEmpty()) return "";
        List<ProceduralPattern> top = proceduralMemory.values().stream()
                .filter(p -> p.successCount >= 2 && p.avgQualityScore > 75)
                .sorted((a, b) -> Double.compare(b.avgQualityScore * b.successCount, a.avgQualityScore * a.successCount))
                .limit(5)
                .toList();
        if (top.isEmpty()) return "";
        StringBuilder sb = new StringBuilder("\n【自动学习的操作模式（程序记忆）】\n");
        sb.append("以下是系统从历史成功任务中学习的工具调用模式，可作参考：\n");
        for (ProceduralPattern p : top) {
            sb.append("- 意图：").append(p.intentKey)
              .append(" → 工具序列：").append(String.join(" → ", p.toolSequence))
              .append(" (成功率").append((int) p.avgQualityScore).append("%, 使用").append(p.successCount).append("次)\n");
        }
        return sb.toString();
    }

    /** 从用户问题提取简化意图key */
    private String extractIntentKey(String message) {
        if (message == null || message.isBlank()) return "general";
        String lower = message.toLowerCase().replaceAll("[\\s，。！？]+", "");
        if (lower.contains("订单") && (lower.contains("进度") || lower.contains("状态"))) return "查订单进度";
        if (lower.contains("延期") || lower.contains("逾期")) return "查延期订单";
        if (lower.contains("扫码") || lower.contains("产量")) return "查扫码产量";
        if (lower.contains("工资") || lower.contains("结算")) return "查工资";
        if (lower.contains("库存")) return "查库存";
        if (lower.contains("工厂") && (lower.contains("沉默") || lower.contains("活跃"))) return "查工厂状态";
        if (lower.contains("风险") || lower.contains("异常")) return "查风险";
        if (lower.contains("报表") || lower.contains("统计") || lower.contains("汇总")) return "查报表";
        if (lower.contains("分析")) return "分析";
        return lower.length() > 12 ? lower.substring(0, 12) : lower;
    }
}
