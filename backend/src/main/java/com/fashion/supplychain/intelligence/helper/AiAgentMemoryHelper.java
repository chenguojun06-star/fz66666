package com.fashion.supplychain.intelligence.helper;

import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.orchestration.AiMemoryOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceMemoryOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import javax.annotation.PreDestroy;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Slf4j
@Component
public class AiAgentMemoryHelper {

    private static final int MAX_MEMORY_TURNS = 6;
    private static final int MAX_USERS_CACHED = 200;
    private static final int COMPACT_THRESHOLD_TURNS = 8;

    @Autowired private IntelligenceInferenceOrchestrator inferenceOrchestrator;
    @Autowired private IntelligenceMemoryOrchestrator intelligenceMemoryOrchestrator;
    @Autowired private AiMemoryOrchestrator aiMemoryOrchestrator;

    private final Map<String, List<AiMessage>> conversationMemory = Collections.synchronizedMap(
            new LinkedHashMap<String, List<AiMessage>>(64, 0.75f, true) {
                @Override
                protected boolean removeEldestEntry(Map.Entry<String, List<AiMessage>> eldest) {
                    return size() > MAX_USERS_CACHED;
                }
            });

    private final ExecutorService memoryExecutor = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "ai-memory-enhance");
        t.setDaemon(true);
        return t;
    });

    @PreDestroy
    public void shutdown() {
        memoryExecutor.shutdownNow();
    }

    public List<AiMessage> getConversationHistory(String userId) {
        if (userId == null || userId.isBlank()) return List.of();
        List<AiMessage> history = conversationMemory.get(userId);
        if (history == null) return List.of();
        synchronized (history) {
            return new ArrayList<>(history);
        }
    }

    public void saveConversationTurn(String userId, String userMsg, String assistantMsg) {
        List<AiMessage> history = conversationMemory.computeIfAbsent(userId, k -> new ArrayList<>());
        synchronized (history) {
            history.add(AiMessage.user(userMsg));
            history.add(AiMessage.assistant(assistantMsg));
            while (history.size() > MAX_MEMORY_TURNS * 2) {
                history.remove(0);
            }
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
        List<AiMessage> history = getConversationHistory(userId);
        if (!history.isEmpty()) {
            aiMemoryOrchestrator.saveConversation(tenantId, userId, history);
        }
    }

    public void enhanceMemoryAsync(String userId, String userMessage, String assistantResponse) {
        CompletableFuture.runAsync(() -> {
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
            } catch (Exception e) {
                log.debug("[AiAgent] 记忆增强异常（不影响主流程）: {}", e.getMessage());
            }
        }, memoryExecutor);
    }
}
