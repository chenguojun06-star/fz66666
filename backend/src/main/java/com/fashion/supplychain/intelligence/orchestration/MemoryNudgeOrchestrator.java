package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.intelligence.entity.MemoryNudge;
import com.fashion.supplychain.intelligence.gateway.AiInferenceRouter;
import com.fashion.supplychain.intelligence.mapper.MemoryNudgeMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class MemoryNudgeOrchestrator {

    private final MemoryNudgeMapper nudgeMapper;
    private final AiInferenceRouter inferenceRouter;

    private static final double NUDGE_TRIGGER_SCORE = 0.55;
    private static final int MAX_PENDING_PER_USER = 5;
    private static final int NUDGE_EXPIRY_HOURS = 72;

    @Async
    public void analyzeAndNudge(Long tenantId, String userId, String sessionId,
                                 String conversationId, String userMessage,
                                 String assistantResponse, List<String> toolNames) {
        try {
            long pendingCount = nudgeMapper.selectCount(
                    new QueryWrapper<MemoryNudge>()
                            .eq("tenant_id", tenantId)
                            .eq("user_id", userId)
                            .eq("status", "PENDING"));
            if (pendingCount >= MAX_PENDING_PER_USER) return;

            String nudgePrompt = buildNudgePrompt(userMessage, assistantResponse, toolNames);
            String nudgeResult = inferenceRouter.chatSimple(nudgePrompt);

            MemoryNudge nudge = parseNudge(nudgeResult, tenantId, userId, sessionId, conversationId);
            if (nudge == null) return;

            BigDecimal score = nudge.getConfidence() != null ? nudge.getConfidence() : BigDecimal.valueOf(0.5);
            if (score.doubleValue() < NUDGE_TRIGGER_SCORE) return;

            nudgeMapper.insert(nudge);
            log.info("[MemoryNudge] 生成记忆提醒: {} (confidence={})", nudge.getTitle(), score);

        } catch (Exception e) {
            log.warn("[MemoryNudge] 分析失败: {}", e.getMessage());
        }
    }

    public List<MemoryNudge> getPendingNudges(Long tenantId, String userId) {
        return nudgeMapper.selectList(
                new QueryWrapper<MemoryNudge>()
                        .eq("tenant_id", tenantId)
                        .eq("user_id", userId)
                        .eq("status", "PENDING")
                        .orderByDesc("confidence")
                        .last("LIMIT 10"));
    }

    public void acceptNudge(String nudgeId) {
        MemoryNudge nudge = nudgeMapper.selectById(nudgeId);
        if (nudge == null || !"PENDING".equals(nudge.getStatus())) return;
        nudge.setStatus("ACCEPTED");
        nudge.setAcceptedAt(LocalDateTime.now());
        nudgeMapper.updateById(nudge);
        log.info("[MemoryNudge] 用户确认记忆: {}", nudge.getTitle());
    }

    public void dismissNudge(String nudgeId) {
        MemoryNudge nudge = nudgeMapper.selectById(nudgeId);
        if (nudge == null || !"PENDING".equals(nudge.getStatus())) return;
        nudge.setStatus("DISMISSED");
        nudge.setDismissedAt(LocalDateTime.now());
        nudgeMapper.updateById(nudge);
    }

    public void expireOldNudges() {
        QueryWrapper<MemoryNudge> qw = new QueryWrapper<>();
        qw.eq("status", "PENDING")
                .lt("created_at", LocalDateTime.now().minusHours(NUDGE_EXPIRY_HOURS));
        List<MemoryNudge> expired = nudgeMapper.selectList(qw);
        for (MemoryNudge n : expired) {
            n.setStatus("EXPIRED");
            nudgeMapper.updateById(n);
        }
        if (!expired.isEmpty()) {
            log.info("[MemoryNudge] 过期清理: {} 条", expired.size());
        }
    }

    private String buildNudgePrompt(String userMessage, String assistantResponse,
                                     List<String> toolNames) {
        return String.format("""
                你是小云的记忆审查器。分析以下对话，判断是否有值得主动保存的知识。
                
                ## 用户问题
                %s
                
                ## AI回复（截取）
                %s
                
                ## 使用的工具
                %s
                
                ## 记忆判断标准
                1. FACT: 对话中包含具体业务事实（订单号、金额、日期、工厂信息）
                2. INSIGHT: AI得出了有价值的分析结论或业务洞察
                3. PREFERENCE: 用户表达了明确的偏好或习惯
                4. PATTERN: 发现了用户反复出现的查询或操作模式
                
                ## 输出格式
                如果值得记忆，输出JSON，否则输出 NONE：
                {"nudge_type":"FACT/INSIGHT/PREFERENCE/PATTERN",
                 "title":"简短标题",
                 "content":"要记住的具体内容",
                 "context_summary":"为什么这个值得记住",
                 "confidence":0.0-1.0}
                """, truncate(userMessage, 500), truncate(assistantResponse, 800),
                toolNames != null ? String.join(", ", toolNames) : "无");
    }

    private MemoryNudge parseNudge(String response, Long tenantId, String userId,
                                    String sessionId, String conversationId) {
        if (response == null || response.contains("NONE")) return null;
        try {
            int start = response.indexOf('{');
            int end = response.lastIndexOf('}');
            if (start < 0 || end <= start) return null;
            String json = response.substring(start, end + 1);

            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            @SuppressWarnings("unchecked")
            Map<String, Object> map = mapper.readValue(json, Map.class);

            MemoryNudge n = new MemoryNudge();
            n.setId("nudge_" + UUID.randomUUID().toString().replace("-", "").substring(0, 20));
            n.setTenantId(tenantId);
            n.setUserId(userId);
            n.setNudgeType(getStr(map, "nudge_type", "FACT"));
            n.setTitle(getStr(map, "title", "未命名记忆"));
            n.setContent(getStr(map, "content", ""));
            n.setContextSummary(getStr(map, "context_summary", null));
            n.setStatus("PENDING");
            n.setConversationId(conversationId);
            n.setConfidence(parseBigDecimal(getStr(map, "confidence", "0.5")));
            n.setExpiresAt(LocalDateTime.now().plusHours(NUDGE_EXPIRY_HOURS));
            n.setCreateTime(LocalDateTime.now());
            n.setUpdateTime(LocalDateTime.now());
            return n;
        } catch (Exception e) {
            log.debug("[MemoryNudge] JSON解析失败: {}", e.getMessage());
            return null;
        }
    }

    private String getStr(Map<String, Object> map, String key, String defaultValue) {
        Object v = map.get(key);
        return v != null ? v.toString() : defaultValue;
    }

    private BigDecimal parseBigDecimal(String s) {
        try {
            return new BigDecimal(s);
        } catch (Exception e) {
            return BigDecimal.valueOf(0.5);
        }
    }

    private String truncate(String text, int maxLen) {
        if (text == null) return "";
        return text.length() > maxLen ? text.substring(0, maxLen) + "…" : text;
    }
}
