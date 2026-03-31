package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.intelligence.dto.AgentState;
import com.fashion.supplychain.intelligence.entity.AgentMeeting;
import com.fashion.supplychain.intelligence.mapper.AgentMeetingMapper;
import com.fashion.supplychain.intelligence.orchestration.specialist.SpecialistAgent;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Agent例会编排器 — 阶段1-4核心：多Agent结构化辩论 → 投票 → 共识 + 异议 + 行动项。
 *
 * <p>流程：① 设定议题 → ② 各Specialist独立发言 → ③ 交叉辩论（最多3轮）
 * → ④ AI主持总结共识/异议 → ⑤ 输出行动项</p>
 * <p>租户隔离：会议记录按 tenant_id 存取。</p>
 */
@Slf4j
@Service
public class AgentMeetingOrchestrator {

    private static final int MAX_DEBATE_ROUNDS = 3;

    @Autowired private AgentMeetingMapper meetingMapper;
    @Autowired private IntelligenceInferenceOrchestrator inferenceOrchestrator;
    @Autowired(required = false) private List<SpecialistAgent> specialists;

    /**
     * 召开Agent例会 — 针对特定议题，多Agent辩论后输出行动计划。
     */
    @Transactional(rollbackFor = Exception.class)
    public AgentMeeting holdMeeting(String meetingType, String topic, AgentState state) {
        Long tenantId = state.getTenantId();
        long startMs = System.currentTimeMillis();

        List<SpecialistAgent> participants = (specialists != null)
                ? specialists : List.of();
        List<String> participantNames = participants.stream()
                .map(SpecialistAgent::getRoute).collect(Collectors.toList());

        // 1. 各Agent独立发言
        Map<String, String> initialOpinions = collectOpinions(participants, state, topic);

        // 2. 交叉辩论（最多3轮）
        List<String> debateRounds = new ArrayList<>();
        Map<String, String> currentOpinions = initialOpinions;
        for (int round = 1; round <= MAX_DEBATE_ROUNDS; round++) {
            String roundResult = moderateDebateRound(round, topic, currentOpinions);
            debateRounds.add(roundResult);
            if (roundResult.contains("\"converged\":true")) break;
        }

        // 3. AI主持总结
        String summaryJson = synthesizeMeeting(topic, initialOpinions, debateRounds);
        String consensus = extractField(summaryJson, "consensus", "各Agent暂无共识");
        String dissent = extractField(summaryJson, "dissent", "");
        String actionItems = extractField(summaryJson, "action_items", "[]");
        int confidenceScore = parseIntField(summaryJson, "confidence", 60);

        // 4. 持久化
        AgentMeeting meeting = new AgentMeeting();
        meeting.setTenantId(tenantId);
        meeting.setMeetingType(meetingType);
        meeting.setTopic(topic);
        meeting.setParticipants(toJson(participantNames));
        meeting.setAgenda(String.format("[\"议题：%s\"]", escapeJson(topic)));
        meeting.setDebateRounds(toJson(debateRounds));
        meeting.setConsensus(consensus);
        meeting.setDissent(dissent);
        meeting.setActionItems(actionItems);
        meeting.setConfidenceScore(confidenceScore);
        meeting.setDurationMs(System.currentTimeMillis() - startMs);
        meeting.setStatus("completed");
        meeting.setDeleteFlag(0);
        meeting.setCreateTime(LocalDateTime.now());
        meetingMapper.insert(meeting);

        log.info("[Meeting] 例会完成 id={} tenant={} topic={} confidence={} 参与Agent={}",
                meeting.getId(), tenantId, topic, confidenceScore, participantNames.size());
        return meeting;
    }

    /**
     * 查询租户历史例会记录。
     */
    public List<AgentMeeting> listByTenant(Long tenantId, int limit) {
        return meetingMapper.selectList(
                new QueryWrapper<AgentMeeting>()
                        .eq("tenant_id", tenantId)
                        .eq("delete_flag", 0)
                        .orderByDesc("create_time")
                        .last("LIMIT " + Math.min(limit, 20)));
    }

    // ── private ──

    private Map<String, String> collectOpinions(List<SpecialistAgent> agents, AgentState state, String topic) {
        Map<String, String> opinions = new LinkedHashMap<>();
        for (SpecialistAgent agent : agents) {
            try {
                AgentState copy = new AgentState();
                copy.setTenantId(state.getTenantId());
                copy.setOrderIds(state.getOrderIds());
                copy.setScene(state.getScene());
                copy.setRoute(state.getRoute());
                copy.setContextSummary(state.getContextSummary());
                copy.setQuestion(topic);
                AgentState result = agent.analyze(copy);
                String opinion = result.getSpecialistResults() != null
                        ? result.getSpecialistResults().getOrDefault(agent.getRoute(), "无意见")
                        : "无意见";
                opinions.put(agent.getRoute(), opinion);
            } catch (Exception e) {
                log.warn("[Meeting] Agent {} 发言异常: {}", agent.getRoute(), e.getMessage());
                opinions.put(agent.getRoute(), "发言异常: " + e.getMessage());
            }
        }
        return opinions;
    }

    private String moderateDebateRound(int round, String topic, Map<String, String> opinions) {
        StringBuilder sb = new StringBuilder();
        sb.append(String.format("议题：%s\n第%d轮各Agent观点：\n", topic, round));
        opinions.forEach((name, opinion) -> sb.append(String.format("- %s: %s\n", name, opinion)));

        String prompt = sb + "\n作为主持人，请：\n1. 找出观点冲突\n2. 判断是否已趋于收敛\n"
                + "用JSON回答：{\"conflicts\":[\"冲突1\"],\"converged\":true/false,\"summary\":\"本轮小结\"}";

        var result = inferenceOrchestrator.chat("meeting-moderate",
                "你是服装供应链AI例会主持人，促进多Agent辩论达成共识。仅输出JSON。", prompt);
        return (result.isSuccess() && result.getContent() != null) ? result.getContent().trim() : "{\"converged\":true}";
    }

    private String synthesizeMeeting(String topic, Map<String, String> opinions, List<String> debateRounds) {
        StringBuilder sb = new StringBuilder();
        sb.append("议题：").append(topic).append("\n各Agent最终观点：\n");
        opinions.forEach((n, o) -> sb.append(String.format("- %s: %s\n", n, o)));
        sb.append("辩论过程：\n");
        for (int i = 0; i < debateRounds.size(); i++) {
            sb.append(String.format("第%d轮: %s\n", i + 1, debateRounds.get(i)));
        }

        String prompt = sb + "\n请综合输出会议结论JSON：\n"
                + "{\"consensus\":\"共识结论\",\"dissent\":\"异议摘要\","
                + "\"action_items\":[\"行动项1\",\"行动项2\"],\"confidence\":0-100}";

        var result = inferenceOrchestrator.chat("meeting-synthesis",
                "你是服装供应链AI例会秘书，擅长总结多方观点形成可执行结论。仅输出JSON。", prompt);
        return (result.isSuccess() && result.getContent() != null) ? result.getContent().trim() : "{}";
    }

    private String toJson(Object obj) {
        try { return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(obj); }
        catch (Exception e) { return "[]"; }
    }

    private String extractField(String json, String field, String def) {
        String key = "\"" + field + "\":\"";
        int idx = json.indexOf(key);
        if (idx < 0) {
            // 尝试非字符串值（数组等）
            key = "\"" + field + "\":";
            idx = json.indexOf(key);
            if (idx < 0) return def;
            int start = idx + key.length();
            char first = json.charAt(start);
            if (first == '[' || first == '{') {
                int depth = 0;
                for (int i = start; i < json.length(); i++) {
                    char c = json.charAt(i);
                    if (c == '[' || c == '{') depth++;
                    else if (c == ']' || c == '}') depth--;
                    if (depth == 0) return json.substring(start, i + 1);
                }
            }
            return def;
        }
        int start = idx + key.length();
        int end = json.indexOf('"', start);
        return end > start ? json.substring(start, end) : def;
    }

    private int parseIntField(String json, String field, int def) {
        String key = "\"" + field + "\":";
        int idx = json.indexOf(key);
        if (idx < 0) return def;
        int start = idx + key.length();
        StringBuilder sb = new StringBuilder();
        for (int i = start; i < json.length(); i++) {
            char c = json.charAt(i);
            if (Character.isDigit(c)) sb.append(c);
            else if (sb.length() > 0) break;
        }
        try { return Integer.parseInt(sb.toString()); } catch (Exception e) { return def; }
    }

    private String escapeJson(String s) {
        return s == null ? "" : s.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
