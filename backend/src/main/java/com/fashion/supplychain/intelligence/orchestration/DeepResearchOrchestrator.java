package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.gateway.AiInferenceRouter;
import com.fashion.supplychain.intelligence.service.MemoryBankService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
@RequiredArgsConstructor
public class DeepResearchOrchestrator {

    private final AiInferenceRouter inferenceRouter;
    private final MemoryBankService memoryBankService;
    private final IntelligenceInferenceOrchestrator inferenceOrchestrator;

    private final Map<String, ResearchSession> activeSessions = new ConcurrentHashMap<>();

    private static final int MAX_RESEARCH_ROUNDS = 3;
    private static final int MAX_SECTION_LENGTH = 2000;

    public ResearchResult conductResearch(Long tenantId, String topic, String context) {
        String sessionId = UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        ResearchSession session = new ResearchSession();
        session.setSessionId(sessionId);
        session.setTenantId(tenantId);
        session.setTopic(topic);
        session.setContext(context);
        session.setStartTime(LocalDateTime.now());
        activeSessions.put(sessionId, session);

        try {
            String plan = coordinate(session);
            session.setPlan(plan);

            String research = research(session);
            session.setResearchNotes(research);

            String report = report(session);
            session.setReport(report);

            memoryBankService.onDecisionMade(tenantId,
                    "深度研究: " + topic, "研究完成，发现" + session.getFindingsCount() + "个关键发现");

            log.info("[DeepResearch] 租户={} 主题={} 完成 发现数={}", tenantId, topic, session.getFindingsCount());
            return buildResult(session);
        } catch (Exception e) {
            log.error("[DeepResearch] 租户={} 研究失败: {}", tenantId, e.getMessage(), e);
            return ResearchResult.failed(sessionId, topic, e.getMessage());
        } finally {
            activeSessions.remove(sessionId);
        }
    }

    @Async("aiSelfCriticExecutor")
    public void conductResearchAsync(Long tenantId, String topic, String context) {
        conductResearch(tenantId, topic, context);
    }

    private String coordinate(ResearchSession session) {
        String memoryContext = memoryBankService.compileContextForPrompt(session.getTenantId());
        String prompt = String.format("""
                你是服装供应链研究协调员。根据以下研究主题，制定研究计划。
                
                ## 研究主题
                %s
                
                ## 上下文
                %s
                
                ## 历史记忆
                %s
                
                ## 要求
                1. 列出3-5个需要调研的子问题
                2. 每个子问题标注需要查询的数据源（订单/物料/财务/工厂/供应商）
                3. 标注优先级（P0/P1/P2）
                4. 预估每个子问题的调研深度（浅/中/深）
                
                格式：
                ## 研究计划
                1. [P0] 子问题1 (数据源: xxx, 深度: 深)
                2. [P1] 子问题2 (数据源: xxx, 深度: 中)
                ...
                """, session.getTopic(), session.getContext(), truncate(memoryContext, 1000));
        return inferenceRouter.chatSimple(prompt);
    }

    private String research(ResearchSession session) {
        StringBuilder notes = new StringBuilder();
        for (int round = 0; round < MAX_RESEARCH_ROUNDS; round++) {
            String researchPrompt = String.format("""
                    你是服装供应链研究员。基于以下研究计划和已有笔记，继续深入调研。
                    
                    ## 研究主题
                    %s
                    
                    ## 研究计划
                    %s
                    
                    ## 已有笔记
                    %s
                    
                    ## 第%d轮调研要求
                    1. 针对计划中尚未充分调研的子问题深入分析
                    2. 引用具体数据（订单数/金额/百分比/趋势）
                    3. 发现异常模式或风险信号时标注⚠️
                    4. 如果所有子问题已充分调研，输出 [RESEARCH_COMPLETE]
                    
                    格式：
                    ### 子问题X: xxx
                    - 发现1: ...
                    - 发现2: ...
                    - ⚠️ 风险信号: ...
                    """, session.getTopic(), session.getPlan(),
                    notes.length() > 0 ? notes.toString() : "（首轮调研，尚无笔记）",
                    round + 1);

            String roundResult = inferenceRouter.chatSimple(researchPrompt);
            notes.append(roundResult).append("\n\n");

            if (roundResult.contains("[RESEARCH_COMPLETE]")) break;
        }

        int findings = countFindings(notes.toString());
        session.setFindingsCount(findings);
        return notes.toString();
    }

    private String report(ResearchSession session) {
        String reportPrompt = String.format("""
                你是服装供应链研究报告员。基于以下研究笔记，撰写结构化研究报告。
                
                ## 研究主题
                %s
                
                ## 研究笔记
                %s
                
                ## 报告要求
                1. 开头：一句话核心结论 + 关键数字
                2. 正文：按子问题分节，每节含发现+数据+风险
                3. 建议：3条可执行的行动建议（谁做/做什么/什么时候/预期结果）
                4. 风险：标注风险等级（🔴紧急/🟠高/🟡中/🟢稳定）
                5. 禁止编造数据，所有数字必须有研究笔记支撑
                
                格式：
                # 研究报告：{主题}
                
                ## 核心结论
                ...
                
                ## 详细发现
                ### 1. {子问题}
                ...
                
                ## 行动建议
                1. ...
                2. ...
                3. ...
                
                ## 风险评估
                ...
                """, session.getTopic(), truncate(session.getResearchNotes(), 3000));
        return inferenceRouter.chatSimple(reportPrompt);
    }

    private int countFindings(String notes) {
        if (notes == null) return 0;
        int count = 0;
        for (String line : notes.split("\n")) {
            if (line.trim().startsWith("- ") || line.contains("⚠️")) count++;
        }
        return count;
    }

    private ResearchResult buildResult(ResearchSession session) {
        ResearchResult result = new ResearchResult();
        result.setSessionId(session.getSessionId());
        result.setTopic(session.getTopic());
        result.setPlan(session.getPlan());
        result.setResearchNotes(truncate(session.getResearchNotes(), 3000));
        result.setReport(session.getReport());
        result.setFindingsCount(session.getFindingsCount());
        result.setSuccess(true);
        result.setCompletedAt(LocalDateTime.now());
        return result;
    }

    private String truncate(String s, int max) {
        return s != null && s.length() > max ? s.substring(0, max) + "..." : s;
    }

    @Data
    public static class ResearchSession {
        private String sessionId;
        private Long tenantId;
        private String topic;
        private String context;
        private String plan;
        private String researchNotes;
        private String report;
        private int findingsCount;
        private LocalDateTime startTime;
    }

    @Data
    public static class ResearchResult {
        private String sessionId;
        private String topic;
        private String plan;
        private String researchNotes;
        private String report;
        private int findingsCount;
        private boolean success;
        private String errorMessage;
        private LocalDateTime completedAt;

        public static ResearchResult failed(String sessionId, String topic, String error) {
            ResearchResult r = new ResearchResult();
            r.setSessionId(sessionId);
            r.setTopic(topic);
            r.setSuccess(false);
            r.setErrorMessage(error);
            r.setCompletedAt(LocalDateTime.now());
            return r;
        }
    }
}
