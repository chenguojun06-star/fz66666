package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.entity.ConversationReflection;
import com.fashion.supplychain.intelligence.gateway.AiInferenceRouter;
import com.fashion.supplychain.intelligence.mapper.ConversationReflectionMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class ConversationReflectionOrchestrator {

    private final ConversationReflectionMapper reflectionMapper;
    private final AiInferenceRouter inferenceRouter;
    private final SkillEvolutionOrchestrator skillEvolutionOrchestrator;

    @Async
    public void reflectAsync(Long tenantId, String conversationId, String sessionId,
                              String userMessage, String assistantResponse, String toolResults) {
        try {
            ConversationReflection reflection = new ConversationReflection();
            reflection.setId("rf_" + UUID.randomUUID().toString().replace("-", "").substring(0, 20));
            reflection.setTenantId(tenantId);
            reflection.setConversationId(conversationId);
            reflection.setSessionId(sessionId);
            reflection.setUserMessage(userMessage);
            reflection.setReflectionType("post_turn");
            reflection.setResolved(0);
            reflection.setCreateTime(LocalDateTime.now());

            String criticPrompt = buildCriticPrompt(userMessage, assistantResponse, toolResults);
            String criticResult = inferenceRouter.chatSimple(criticPrompt);
            reflection.setReflectionContent(criticResult);

            BigDecimal score = extractScore(criticResult);
            reflection.setQualityScore(score);

            String suggestion = extractSuggestion(criticResult);
            reflection.setPromptSuggestion(suggestion);

            reflectionMapper.insert(reflection);

            skillEvolutionOrchestrator.tryEvolveSkill(reflection);

            log.debug("[Reflection] 对话 {} 复盘完成，质量评分: {}", conversationId, score);
        } catch (Exception e) {
            log.warn("[Reflection] 复盘执行失败: {}", e.getMessage());
        }
    }

    private String buildCriticPrompt(String userMessage, String assistantResponse, String toolResults) {
        return String.format("""
                你是小云的质量审查器。审查以下对话，评估AI助手回复的质量。
                
                ## 用户问题
                %s
                
                ## AI回复
                %s
                
                ## 工具调用结果
                %s
                
                ## 评估维度（各维度0-1分）
                1. 准确性：回复是否基于工具查询的真实数据，无编造
                2. 完整性：是否回答了用户所有问题
                3. 效率：是否使用了最少的工具调用次数达成目标
                4. 安全性：是否遵循了租户隔离/权限校验/数据脱敏
                5. 可操作性：用户能否根据回复直接执行后续操作
                
                ## 输出格式
                质量总分（0-1）: X.XX
                各维度分: 准确性=A.XX 完整性=B.XX 效率=C.XX 安全性=D.XX 可操作性=E.XX
                改进建议: （具体的prompt或流程优化建议）
                是否可提取为技能: YES/NO
                """, userMessage, truncate(assistantResponse, 800), truncate(toolResults, 500));
    }

    private BigDecimal extractScore(String criticResult) {
        if (criticResult == null) return BigDecimal.ZERO;
        try {
            int idx = criticResult.indexOf("质量总分");
            if (idx >= 0) {
                int colon = criticResult.indexOf(':', idx);
                if (colon >= 0) {
                    String numPart = criticResult.substring(colon + 1, Math.min(colon + 8, criticResult.length()))
                            .replaceAll("[^0-9.]", "").trim();
                    if (!numPart.isEmpty()) return new BigDecimal(numPart);
                }
            }
        } catch (Exception ignored) {}
        return new BigDecimal("0.50");
    }

    private String extractSuggestion(String criticResult) {
        if (criticResult == null) return null;
        int idx = criticResult.indexOf("改进建议:");
        if (idx >= 0) {
            return criticResult.substring(idx + 6).trim();
        }
        return null;
    }

    private String truncate(String text, int maxLen) {
        if (text == null) return "";
        return text.length() > maxLen ? text.substring(0, maxLen) + "…" : text;
    }
}
