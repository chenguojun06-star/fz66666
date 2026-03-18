package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.intelligence.entity.AdvisorFeedback;
import com.fashion.supplychain.intelligence.entity.KnowledgeBase;
import com.fashion.supplychain.intelligence.mapper.AdvisorFeedbackMapper;
import com.fashion.supplychain.intelligence.mapper.KnowledgeBaseMapper;
import java.time.LocalDateTime;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 超级顾问 — 知识自动提炼编排器
 *
 * <p>职责：
 * <ol>
 *   <li>用户对 AI 回答打高分（≥4）时，自动用 LLM 提炼为知识库条目</li>
 *   <li>提炼产出写入 t_knowledge_base，标记来源为 "ai_harvest"</li>
 *   <li>在 t_advisor_feedback 中标记已提炼，防止重复提炼</li>
 * </ol>
 */
@Service
@Slf4j
public class AdvisorKnowledgeHarvestOrchestrator {

    private static final int HARVEST_SCORE_THRESHOLD = 4;

    @Autowired
    private AdvisorFeedbackMapper feedbackMapper;

    @Autowired
    private KnowledgeBaseMapper knowledgeBaseMapper;

    @Autowired
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;

    /**
     * 记录用户反馈，若评分 ≥ 阈值则异步触发知识提炼
     */
    @Transactional(rollbackFor = Exception.class)
    public void recordFeedback(Long tenantId, String userId, String sessionId,
                               String traceId, String query, String advice,
                               int score, String feedbackText) {
        AdvisorFeedback fb = new AdvisorFeedback();
        fb.setTenantId(tenantId);
        fb.setUserId(userId);
        fb.setSessionId(sessionId);
        fb.setTraceId(traceId);
        fb.setQueryText(truncate(query, 500));
        fb.setAdviceText(truncate(advice, 2000));
        fb.setScore((double) score);
        fb.setFeedbackText(truncate(feedbackText, 500));
        fb.setHarvested(0);
        fb.setCreateTime(LocalDateTime.now());
        feedbackMapper.insert(fb);

        if (score >= HARVEST_SCORE_THRESHOLD && inferenceOrchestrator.isAnyModelEnabled()) {
            harvestAsync(fb.getId(), query, advice, tenantId);
        }
    }

    @Async
    public void harvestAsync(Long feedbackId, String query, String advice, Long tenantId) {
        try {
            String systemPrompt = "你是知识提炼助手。将以下问答对提炼为一条结构化知识条目。\n"
                    + "输出 JSON 格式：{\"title\":\"...\",\"content\":\"...\",\"keywords\":\"关键词1,关键词2\",\"category\":\"faq\"}\n"
                    + "- title: 简明标题（≤30字）\n"
                    + "- content: 完整知识说明（≤300字）\n"
                    + "- keywords: 逗号分隔关键词\n"
                    + "- category: faq|terminology|sop 之一";
            String userMsg = "问题：" + query + "\n回答：" + advice;
            var result = inferenceOrchestrator.chat("knowledge_harvest", systemPrompt, userMsg);

            if (result.isSuccess()) {
                insertKnowledge(result.getContent(), tenantId, feedbackId);
            }
        } catch (Exception e) {
            log.warn("[KnowledgeHarvest] 提炼失败 feedbackId={}: {}", feedbackId, e.getMessage());
        }
    }

    private void insertKnowledge(String llmOutput, Long tenantId, Long feedbackId) {
        try {
            // 简单 JSON 解析（避免引入额外依赖，兜底用原始输出）
            String title = extractJsonField(llmOutput, "title");
            String content = extractJsonField(llmOutput, "content");
            String keywords = extractJsonField(llmOutput, "keywords");
            String category = extractJsonField(llmOutput, "category");
            if (title == null || content == null) {
                log.warn("[KnowledgeHarvest] LLM 输出格式异常，跳过");
                return;
            }

            KnowledgeBase kb = new KnowledgeBase();
            kb.setTenantId(tenantId);
            kb.setCategory(category != null ? category : "faq");
            kb.setTitle(truncate(title, 100));
            kb.setContent(truncate(content, 2000));
            kb.setKeywords(keywords != null ? truncate(keywords, 200) : "");
            kb.setSource("ai_harvest");
            kb.setViewCount(0);
            kb.setHelpfulCount(0);
            kb.setDeleteFlag(0);
            kb.setCreateTime(LocalDateTime.now());
            knowledgeBaseMapper.insert(kb);

            // 标记已提炼
            AdvisorFeedback update = new AdvisorFeedback();
            update.setId(feedbackId);
            update.setHarvested(1);
            update.setHarvestedKbId(kb.getId());
            feedbackMapper.updateById(update);
            log.info("[KnowledgeHarvest] 成功提炼知识条目: {}", title);
        } catch (Exception e) {
            log.warn("[KnowledgeHarvest] 写入知识库失败: {}", e.getMessage());
        }
    }

    private String extractJsonField(String json, String field) {
        String key = "\"" + field + "\"";
        int idx = json.indexOf(key);
        if (idx < 0) return null;
        int colonIdx = json.indexOf(':', idx + key.length());
        if (colonIdx < 0) return null;
        int startQuote = json.indexOf('"', colonIdx + 1);
        if (startQuote < 0) return null;
        int endQuote = json.indexOf('"', startQuote + 1);
        if (endQuote < 0) return null;
        return json.substring(startQuote + 1, endQuote);
    }

    private String truncate(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max);
    }
}
