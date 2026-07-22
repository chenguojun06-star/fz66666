package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.SelfCritiqueResult;
import com.fashion.supplychain.intelligence.orchestration.LongTermMemoryOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

/**
 * 反思记忆写入器（P0-2 反思记忆闭环）。
 *
 * <p>借鉴 Mem0 / Letta 的反思记忆闭环设计：
 * <ol>
 *   <li>SelfCriticService 7 维度评分后，结果只写入 t_intelligence_feedback_record</li>
 *   <li>低分回答（score &lt; 75）编码为 REFLECTIVE 长期记忆</li>
 *   <li>下次类似问题时通过 PromptContextProvider.buildReflectiveMemoryContext 召回</li>
 *   <li>注入 prompt 防止重蹈覆辙</li>
 * </ol>
 *
 * <p>安全设计：
 * <ul>
 *   <li>异步副作用，不阻塞主流程（@Async）</li>
 *   <li>异常 try-catch 吞掉，仅 log.warn</li>
 *   <li>无 @Transactional（异步副作用不应在事务中）</li>
 *   <li>异步线程手动设置 UserContext（tenantId/userId），保证多租户隔离</li>
 * </ul>
 */
@Component
@Lazy
@Slf4j
public class ReflectiveMemoryWriter {

    /** 自我改进阈值：综合评分低于此值时写入反思记忆 */
    private static final double SELF_IMPROVE_THRESHOLD = 75.0;

    @Autowired
    @Lazy
    private LongTermMemoryOrchestrator longTermMemoryOrchestrator;

    /**
     * 异步写入反思记忆（仅当 critique.score < 75.0 时写入）。
     *
     * <p>写入逻辑：调用 {@link LongTermMemoryOrchestrator#writeTenantMemory}，
     * layer="REFLECTIVE", subjectType="user", subjectId=userId。
     *
     * <p>反思文本格式：
     * <pre>[反思] 用户问题: <截断到200字> | AI回答: <截断到300字> | 低分维度: <列出<75的维度名+分数> | 改进建议: <suggestions截断到200字></pre>
     *
     * <p>confidence 计算：{@code Math.max(0.5, 1.0 - score/100.0)}
     * （分数越低置信度越高，因为更需要记住）
     *
     * @param tenantId         租户ID（多租户隔离）
     * @param userId           用户ID
     * @param sessionId        会话ID
     * @param userMessage      用户原始问题
     * @param assistantMessage AI回答
     * @param critique         自我批评结果
     * @return CompletableFuture<Void> 异步完成信号
     */
    @Async("aiSelfCriticExecutor")
    public CompletableFuture<Void> writeAsync(Long tenantId, Long userId, String sessionId,
                                               String userMessage, String assistantMessage,
                                               SelfCritiqueResult critique) {
        if (critique == null || critique.getScore() == null) {
            return CompletableFuture.completedFuture(null);
        }

        double score = critique.getScore();
        if (score >= SELF_IMPROVE_THRESHOLD) {
            log.debug("[ReflectiveMemory] 评分 {} >= 阈值 {}，跳过反思记忆写入", score, SELF_IMPROVE_THRESHOLD);
            return CompletableFuture.completedFuture(null);
        }

        try {
            // 异步线程手动设置 UserContext（writeTenantMemory 内部依赖 UserContext.tenantId()/userId()）
            UserContext previous = UserContext.get();
            try {
                UserContext ctx = new UserContext();
                ctx.setTenantId(tenantId);
                ctx.setUserId(userId != null ? String.valueOf(userId) : null);
                UserContext.set(ctx);

                String reflectiveText = buildReflectiveText(userMessage, assistantMessage, critique);
                BigDecimal confidence = BigDecimal.valueOf(Math.max(0.5, 1.0 - score / 100.0));

                longTermMemoryOrchestrator.writeTenantMemory(
                        "REFLECTIVE",
                        "user",
                        userId != null ? String.valueOf(userId) : null,
                        null,
                        reflectiveText,
                        null,
                        confidence,
                        sessionId);

                log.info("[ReflectiveMemory] 已写入反思记忆 tenant={} user={} session={} score={} confidence={}",
                        tenantId, userId, sessionId, String.format("%.1f", score), confidence);
            } finally {
                if (previous != null) {
                    UserContext.set(previous);
                } else {
                    UserContext.clear();
                }
            }
        } catch (Exception e) {
            log.warn("[ReflectiveMemory] 写入反思记忆失败（不影响主流程）tenant={} session={}: {}",
                    tenantId, sessionId, e.getMessage());
        }

        return CompletableFuture.completedFuture(null);
    }

    /**
     * 构建反思记忆文本。
     *
     * <p>格式：[反思] 用户问题: <截断到200字> | AI回答: <截断到300字> | 低分维度: <列出<75的维度名+分数> | 改进建议: <suggestions截断到200字>
     */
    private String buildReflectiveText(String userMessage, String assistantMessage, SelfCritiqueResult critique) {
        StringBuilder sb = new StringBuilder("[反思] ");

        sb.append("用户问题: ").append(truncate(userMessage, 200));
        sb.append(" | AI回答: ").append(truncate(assistantMessage, 300));

        // 列出 <75 的维度名+分数
        Map<String, Double> dimensions = critique.getDimensions();
        if (dimensions != null && !dimensions.isEmpty()) {
            StringBuilder lowDims = new StringBuilder();
            for (Map.Entry<String, Double> entry : dimensions.entrySet()) {
                if (entry.getValue() != null && entry.getValue() < SELF_IMPROVE_THRESHOLD) {
                    if (lowDims.length() > 0) lowDims.append(", ");
                    lowDims.append(entry.getKey()).append("=").append(String.format("%.0f", entry.getValue()));
                }
            }
            sb.append(" | 低分维度: ").append(lowDims.length() > 0 ? lowDims.toString() : "无");
        } else {
            // dimensions 为空时，仅标注综合分
            sb.append(" | 低分维度: 综合分=").append(String.format("%.1f", critique.getScore()));
        }

        String suggestions = critique.getSuggestions();
        sb.append(" | 改进建议: ").append(truncate(suggestions, 200));

        return sb.toString();
    }

    private String truncate(String text, int maxLen) {
        if (text == null) return "";
        return text.length() > maxLen ? text.substring(0, maxLen) + "…" : text;
    }
}
