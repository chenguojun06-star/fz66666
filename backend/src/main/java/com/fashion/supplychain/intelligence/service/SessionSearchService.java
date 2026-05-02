package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.intelligence.entity.SessionSearchIndex;
import com.fashion.supplychain.intelligence.gateway.AiInferenceRouter;
import com.fashion.supplychain.intelligence.mapper.SessionSearchIndexMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class SessionSearchService {

    private final SessionSearchIndexMapper indexMapper;
    private final AiInferenceRouter inferenceRouter;

    public void indexConversation(Long tenantId, String userId, String sessionId,
                                   String conversationId, String userMessage, String assistantResponse) {
        try {
            SessionSearchIndex idx = new SessionSearchIndex();
            idx.setId("ssi_" + UUID.randomUUID().toString().replace("-", "").substring(0, 20));
            idx.setTenantId(tenantId);
            idx.setUserId(userId);
            idx.setSessionId(sessionId);
            idx.setConversationId(conversationId);
            idx.setUserMessage(truncate(userMessage, 2000));
            idx.setAssistantSummary(generateSummary(assistantResponse));
            idx.setKeyEntities(extractEntities(userMessage, assistantResponse));
            idx.setIntentCategory(classifyIntent(userMessage));
            idx.setResolved(1);
            idx.setCreateTime(LocalDateTime.now());
            indexMapper.insert(idx);
        } catch (Exception e) {
            log.warn("[SessionSearch] 索引会话失败: {}", e.getMessage());
        }
    }

    public List<Map<String, Object>> search(Long tenantId, String userId, String query, int maxResults) {
        List<SessionSearchIndex> results;

        try {
            String ftQuery = query.replaceAll("[^\\w\\u4e00-\\u9fff]", " ").trim();
            if (ftQuery.length() < 2) {
                QueryWrapper<SessionSearchIndex> qw = new QueryWrapper<>();
                qw.eq("tenant_id", tenantId)
                        .eq("user_id", userId)
                        .orderByDesc("created_at")
                        .last("LIMIT " + maxResults);
                results = indexMapper.selectList(qw);
            } else {
                QueryWrapper<SessionSearchIndex> qw = new QueryWrapper<>();
                qw.eq("tenant_id", tenantId)
                        .eq("user_id", userId)
                        .and(w -> w.like("user_message", query)
                                .or().like("assistant_summary", query)
                                .or().like("key_entities", query))
                        .orderByDesc("created_at")
                        .last("LIMIT " + maxResults);
                results = indexMapper.selectList(qw);
            }
        } catch (Exception e) {
            log.warn("[SessionSearch] 搜索失败: {}", e.getMessage());
            QueryWrapper<SessionSearchIndex> qw = new QueryWrapper<>();
            qw.eq("tenant_id", tenantId)
                    .eq("user_id", userId)
                    .like("user_message", query)
                    .orderByDesc("created_at")
                    .last("LIMIT " + maxResults);
            results = indexMapper.selectList(qw);
        }

        return results.stream().map(r -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("sessionId", r.getSessionId());
            m.put("conversationId", r.getConversationId());
            m.put("question", r.getUserMessage());
            m.put("summary", r.getAssistantSummary());
            m.put("entities", r.getKeyEntities());
            m.put("category", r.getIntentCategory());
            m.put("time", r.getCreateTime());
            return m;
        }).collect(Collectors.toList());
    }

    private String generateSummary(String response) {
        if (response == null || response.length() < 100) return truncate(response, 500);
        try {
            String prompt = "将以下AI回复总结为一句话（不超过100字，用中文）：\n" + truncate(response, 1500);
            String summary = inferenceRouter.chatSimple(prompt);
            return truncate(summary, 500);
        } catch (Exception e) {
            return truncate(response, 200);
        }
    }

    private String extractEntities(String userMessage, String assistantResponse) {
        Set<String> entities = new LinkedHashSet<>();
        String combined = (userMessage != null ? userMessage : "") + " " + (assistantResponse != null ? assistantResponse : "");

        java.util.regex.Matcher orderMatcher = java.util.regex.Pattern.compile("[A-Z]{2,6}\\d{6,12}").matcher(combined);
        while (orderMatcher.find()) entities.add(orderMatcher.group());

        java.util.regex.Matcher styleMatcher = java.util.regex.Pattern.compile("[A-Z]{2,4}\\d{4,8}").matcher(combined);
        while (styleMatcher.find()) entities.add(styleMatcher.group());

        return String.join(",", entities);
    }

    private String classifyIntent(String message) {
        if (message == null) return "general";
        if (message.contains("订单") || message.contains("下单")) return "order_query";
        if (message.contains("进度") || message.contains("工序")) return "progress_check";
        if (message.contains("工资") || message.contains("结算") || message.contains("付款")) return "finance";
        if (message.contains("物料") || message.contains("面料") || message.contains("采购")) return "material";
        if (message.contains("样衣") || message.contains("样板")) return "sample";
        return "general";
    }

    private String truncate(String text, int maxLen) {
        if (text == null) return "";
        return text.length() > maxLen ? text.substring(0, maxLen) + "…" : text;
    }
}
