package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.KnowledgeBase;
import com.fashion.supplychain.intelligence.mapper.KnowledgeBaseMapper;
import com.fashion.supplychain.intelligence.orchestration.FeedbackReasonOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.ProcessRewardOrchestrator;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;

@Slf4j
@RestController
@RequestMapping("/api/intelligence/feedback-reason")
@PreAuthorize("isAuthenticated()")
public class FeedbackReasonController {

    @Autowired
    private FeedbackReasonOrchestrator feedbackReasonOrchestrator;

    @Autowired
    private ProcessRewardOrchestrator processRewardOrchestrator;

    /**
     * P1: 自动知识沉淀 — 用户点赞后，将该轮 Q&A 异步收录进租户知识库。
     * 两个好处：① RAG 检索时能找到这条经验；② 知识库随使用自动增长。
     */
    @Autowired(required = false)
    private KnowledgeBaseMapper knowledgeBaseMapper;

    @GetMapping("/list")
    public Result<?> list(@RequestParam(defaultValue = "20") int limit) {
        return Result.success(feedbackReasonOrchestrator.listCurrentTenantFeedbackReasons(limit));
    }

    /**
     * P0: 用户对 AI 小云对话消息的显式反馈（👍/👎）。
     * score: 1=有帮助(PRM +2)，-1=无帮助(PRM -2)。
     * 直接写入 ai_process_reward 表，用于工具选择自适应权重计算。
     */
    @PostMapping("/ai-message-feedback")
    public Result<?> submitAiMessageFeedback(@RequestBody AiMessageFeedbackRequest req) {
        if (req == null || req.getScore() == null) return Result.fail("参数缺失");
        int prmScore = req.getScore() > 0 ? 2 : -2;
        String outcome = req.getScore() > 0 ? "ACCEPTED" : "REJECTED";
        processRewardOrchestrator.record(
            req.getSessionId(),
            null,
            null,
            "ai_chat_response",
            req.getUserQuery() != null ? req.getUserQuery() : "",
            req.getAiContent() != null && req.getAiContent().length() > 200
                ? req.getAiContent().substring(0, 200) : req.getAiContent(),
            prmScore,
            req.getScore() > 0 ? "用户明确点赞" : "用户明确点踩",
            "USER_EXPLICIT",
            outcome,
            null,
            null,
            "chat_feedback"
        );

        // ── 知识自动沉淀 ── 点赞 + 内容足够长才有收录价值
        if (req.getScore() > 0) {
            harvestToKnowledgeBase(req, UserContext.tenantId());
        }

        return Result.success();
    }

    /**
     * 将点赞的 AI 回答收录进 t_knowledge_base（category=faq, source=AI_HARVESTED）。
     * 过滤规则：userQuery ≥ 8 字，aiContent ≥ 80 字，防止低质量内容入库。
     * 同租户 + 同标题不重复插入（简单去重）。
     */
    private void harvestToKnowledgeBase(AiMessageFeedbackRequest req, Long tenantId) {
        if (knowledgeBaseMapper == null) return;
        String query = req.getUserQuery();
        String content = req.getAiContent();
        if (query == null || content == null) return;
        query = query.trim();
        content = content.trim();
        if (query.length() < 8 || content.length() < 80) return;

        String title = query.length() > 60 ? query.substring(0, 60) : query;

        try {
            Long exists = knowledgeBaseMapper.selectCount(
                    new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<KnowledgeBase>()
                            .eq(KnowledgeBase::getTenantId, tenantId)
                            .eq(KnowledgeBase::getTitle, title)
                            .eq(KnowledgeBase::getDeleteFlag, 0));
            if (exists != null && exists > 0) return;

            KnowledgeBase kb = new KnowledgeBase();
            kb.setTenantId(tenantId);
            kb.setCategory("faq");
            kb.setTitle(title);
            String fullContent = "问：" + query + "\n\n答：" +
                    (content.length() > 2000 ? content.substring(0, 2000) + "\u2026" : content);
            kb.setContent(fullContent);
            kb.setKeywords(extractKeywords(query));
            kb.setSource("AI_HARVESTED");
            kb.setViewCount(0);
            kb.setHelpfulCount(1);
            kb.setDeleteFlag(0);
            kb.setCreateTime(LocalDateTime.now());
            kb.setUpdateTime(LocalDateTime.now());
            knowledgeBaseMapper.insert(kb);
            log.info("[KnowledgeHarvest] 自动沉淀租户{}知识条目: {}", tenantId, title);
        } catch (Exception e) {
            log.warn("[KnowledgeHarvest] 沉淀失败，跳过: {}", e.getMessage());
        }
    }

    /** 从问题中提取关键词（取最长的 5 个词，逗号分隔） */
    private String extractKeywords(String query) {
        if (query == null) return "";
        String[] words = query.split("[\\s，。？！,.?! ]+");
        StringBuilder kw = new StringBuilder();
        int count = 0;
        for (String w : words) {
            if (w.length() >= 2 && count < 5) {
                if (kw.length() > 0) kw.append(",");
                kw.append(w);
                count++;
            }
        }
        return kw.toString();
    }

    /** AI 消息反馈请求体 */
    @Data
    public static class AiMessageFeedbackRequest {
        private String sessionId;
        private String commandId;
        /** 1=有帮助，-1=无帮助 */
        private Integer score;
        private String userQuery;
        private String aiContent;
        private String feedbackText;
    }
}
