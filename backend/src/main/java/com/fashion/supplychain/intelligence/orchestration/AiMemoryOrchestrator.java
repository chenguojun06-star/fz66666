package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.entity.AiConversationMemory;
import com.fashion.supplychain.intelligence.mapper.AiConversationMemoryMapper;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

/**
 * AI 对话记忆编排器 — 跨会话记忆持久化
 *
 * <p>职责：
 * <ol>
 *   <li>getMemoryContext — 拉取用户最近 3 条历史摘要，格式化为可注入 buildSystemPrompt 的文字块</li>
 *   <li>saveConversation — 异步将本轮对话调用 LLM 摘要后写入 t_ai_conversation_memory</li>
 * </ol>
 */
@Service
@Slf4j
public class AiMemoryOrchestrator {

    /** 每用户保留的最大记忆条数（超出则软删除最旧的） */
    private static final int MAX_MEMORIES_PER_USER = 10;

    /** 触发保存的最少消息数（user + assistant，低于此不保存以避免记录无意义对话） */
    private static final int MIN_MESSAGES_TO_SAVE = 4;

    /** 记忆默认过期天数 */
    private static final int EXPIRE_DAYS = 30;

    @Autowired
    private AiConversationMemoryMapper memoryMapper;

    @Autowired
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;

    // ── 读取 ──────────────────────────────────────────────────────────────────

    /**
     * 获取用户历史对话记忆，格式化为可追加到系统提示的文字块。
     * 若无记忆或加载失败，返回空字符串（不影响正常对话）。
     */
    public String getMemoryContext(Long tenantId, String userId) {
        if (tenantId == null || userId == null || userId.isBlank()) return "";
        try {
            List<AiConversationMemory> memories = memoryMapper.findRecentByUser(tenantId, userId, 3);
            if (memories.isEmpty()) return "";

            StringBuilder sb = new StringBuilder();
            sb.append("【历史对话记忆 — 你与该用户过往会话的摘要，可作为背景参考】\n");
            String[] labels = {"上次会话", "前2次会话", "更早会话"};
            for (int i = 0; i < memories.size(); i++) {
                String label = i < labels.length ? labels[i] : "更早";
                sb.append("- ").append(label).append("：")
                  .append(memories.get(i).getMemorySummary()).append("\n");
            }
            sb.append("\n");
            return sb.toString();
        } catch (Exception e) {
            log.debug("[AiMemory] 加载历史记忆失败，跳过: {}", e.getMessage());
            return "";
        }
    }

    // ── 写入 ──────────────────────────────────────────────────────────────────

    /**
     * 异步保存本轮对话摘要。
     * 由 AiAgentOrchestrator.saveCurrentConversationToMemory() 调用。
     * 消息数不足 MIN_MESSAGES_TO_SAVE 时静默跳过。
     */
    @Async
    public void saveConversation(Long tenantId, String userId, List<AiMessage> messages) {
        if (messages == null || messages.size() < MIN_MESSAGES_TO_SAVE) return;
        if (tenantId == null || userId == null || userId.isBlank()) return;
        try {
            String summary = generateSummary(messages);
            if (summary == null || summary.isBlank()) return;

            AiConversationMemory memory = new AiConversationMemory();
            memory.setTenantId(tenantId);
            memory.setUserId(userId);
            memory.setMemorySummary(summary);
            memory.setSourceMessageCount(messages.size());
            memory.setImportanceScore(50);
            memory.setCreateTime(LocalDateTime.now());
            memory.setExpireTime(LocalDateTime.now().plusDays(EXPIRE_DAYS));
            memory.setDeleteFlag(0);
            memoryMapper.insert(memory);

            pruneOldMemories(tenantId, userId);
            log.debug("[AiMemory] 已保存用户 {} 的对话摘要（{}条消息）", userId, messages.size());
        } catch (Exception e) {
            log.warn("[AiMemory] 保存对话记忆失败: {}", e.getMessage());
        }
    }

    // ── 内部辅助 ──────────────────────────────────────────────────────────────

    private String generateSummary(List<AiMessage> messages) {
        // 仅取 user + assistant 消息，排除 system/tool 消息
        String conversation = messages.stream()
                .filter(m -> "user".equals(m.getRole()) || "assistant".equals(m.getRole()))
                .map(m -> m.getRole().equals("user") ? "用户：" + m.getContent()
                                                      : "AI：" + truncate(m.getContent(), 200))
                .collect(Collectors.joining("\n"));

        if (conversation.isBlank()) return null;
        if (conversation.length() > 3000) conversation = conversation.substring(0, 3000);

        String systemPrompt = "你是对话摘要助手。请将以下服装供应链管理系统的对话提炼为2-4条核心要点（每条≤60字），"
                + "重点记录：用户关注的订单号、款式、工厂、业务问题、重要决策或结论。"
                + "只输出要点列表，每条以•开头，不加序号，不加解释。";
        try {
            IntelligenceInferenceResult result = inferenceOrchestrator.chat(
                    "memory_summarize", systemPrompt, conversation);
            return result != null ? result.getContent() : null;
        } catch (Exception e) {
            log.debug("[AiMemory] LLM摘要失败，启用简单提取兜底: {}", e.getMessage());
            return fallbackSummary(messages);
        }
    }

    /** 兜底：从用户消息中提取前 3 条，截短后拼接 */
    private String fallbackSummary(List<AiMessage> messages) {
        StringBuilder sb = new StringBuilder();
        int count = 0;
        for (AiMessage m : messages) {
            if ("user".equals(m.getRole()) && m.getContent() != null) {
                sb.append("• ").append(truncate(m.getContent(), 60)).append("\n");
                if (++count >= 3) break;
            }
        }
        return sb.toString().trim();
    }

    /** 保留最近 MAX_MEMORIES_PER_USER 条，超出则软删除最旧的 */
    private void pruneOldMemories(Long tenantId, String userId) {
        List<AiConversationMemory> all = memoryMapper.findRecentByUser(tenantId, userId, 100);
        if (all.size() > MAX_MEMORIES_PER_USER) {
            for (int i = MAX_MEMORIES_PER_USER; i < all.size(); i++) {
                AiConversationMemory old = all.get(i);
                memoryMapper.deleteById(old.getId());
            }
        }
    }

    private String truncate(String s, int maxLen) {
        if (s == null) return "";
        return s.length() <= maxLen ? s : s.substring(0, maxLen) + "…";
    }
}
