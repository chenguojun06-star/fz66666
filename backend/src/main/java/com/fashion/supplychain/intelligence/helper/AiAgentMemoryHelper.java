package com.fashion.supplychain.intelligence.helper;

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
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

import jakarta.annotation.PreDestroy;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

@Slf4j
@Component
public class AiAgentMemoryHelper {

    private static final int MAX_MEMORY_TURNS = 6;
    private static final int MAX_USERS_CACHED = 500;
    private static final int COMPACT_THRESHOLD_TURNS = 12;

    @Autowired private IntelligenceInferenceOrchestrator inferenceOrchestrator;
    @Autowired private IntelligenceMemoryOrchestrator intelligenceMemoryOrchestrator;
    @Autowired private AiMemoryOrchestrator aiMemoryOrchestrator;
    @Autowired private KnowledgeBaseMapper knowledgeBaseMapper;

    private final Cache<String, List<AiMessage>> conversationMemory = Caffeine.newBuilder()
            .maximumSize(MAX_USERS_CACHED)
            .expireAfterAccess(30, TimeUnit.MINUTES)
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
        List<AiMessage> history = conversationMemory.getIfPresent(memoryKey(userId, tenantId));
        if (history == null) return List.of();
        return new ArrayList<>(history);
    }

    public void saveConversationTurn(String userId, Long tenantId, String userMsg, String assistantMsg) {
        String key = memoryKey(userId, tenantId);
        List<AiMessage> history = conversationMemory.get(key, k -> Collections.synchronizedList(new ArrayList<>()));
        history.add(AiMessage.user(userMsg));
        history.add(AiMessage.assistant(assistantMsg));
        while (history.size() > MAX_MEMORY_TURNS * 2) {
            history.remove(0);
        }
    }

    public List<AiMessage> compactConversationHistory(List<AiMessage> history) {
        if (history == null || history.isEmpty()) {
            return List.of();
        }
        int turnCount = history.size() / 2;
        if (turnCount <= COMPACT_THRESHOLD_TURNS) {
            return new ArrayList<>(history);
        }
        int keepMessages = 4;
        List<AiMessage> recentMessages = history.subList(history.size() - keepMessages, history.size());
        List<AiMessage> olderMessages = history.subList(0, history.size() - keepMessages);

        StringBuilder olderText = new StringBuilder();
        for (AiMessage msg : olderMessages) {
            String role = msg.getRole() == null ? "unknown" : msg.getRole();
            String content = msg.getContent() == null ? "" : msg.getContent();
            olderText.append("[").append(role).append("] ").append(AiAgentEvidenceHelper.truncate(content, 500)).append("\n");
        }

        try {
            List<AiMessage> compactPrompt = List.of(
                    AiMessage.system("你是对话摘要助手。将以下多轮对话压缩为一段简要上下文摘要（中文，150字以内），保留关键实体（订单号、款号、工厂名、金额）和用户意图。"),
                    AiMessage.user(olderText.toString())
            );
            IntelligenceInferenceResult compactResult = inferenceOrchestrator.chat("history-compact", compactPrompt, List.of());
            if (compactResult.isSuccess() && compactResult.getContent() != null) {
                List<AiMessage> result = new ArrayList<>();
                result.add(AiMessage.system("[对话上下文摘要] " + compactResult.getContent()));
                result.addAll(recentMessages);
                log.info("[AiAgent] 会话历史压缩：{} 条 → 1条摘要 + {} 条近期", olderMessages.size(), recentMessages.size());
                return result;
            }
        } catch (Exception e) {
            log.warn("[AiAgent] 会话历史压缩失败，回退全量: {}", e.getMessage());
        }
        return new ArrayList<>(history);
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
}
