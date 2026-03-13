package com.fashion.supplychain.intelligence.orchestration.specialist;

import com.fashion.supplychain.intelligence.dto.AgentState;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 合规/质检专家代理 — 分析质检通过率、缺陷追踪、合规风险。
 */
@Slf4j
@Service
public class ComplianceSpecialistAgent implements SpecialistAgent {

    @Autowired
    private IntelligenceInferenceOrchestrator inference;
    @Autowired
    private com.fashion.supplychain.intelligence.orchestration.ModelRoutingConfig routingConfig;

    @Override
    public String getRoute() { return "compliance"; }

    @Override
    public AgentState analyze(AgentState state) {
        String prompt = buildPrompt(state);
        var profile = routingConfig.getProfile("compliance");
        var result = inference.chat("compliance_specialist", profile.getSystemPromptPrefix() + "\n" + buildSystemPrompt(), prompt);
        if (result.isSuccess()) {
            String analysis = result.getContent();
            state.getSpecialistResults().put("compliance", analysis);
            state.setContextSummary(state.getContextSummary() + "\n【合规分析】" + truncate(analysis, 300));
        } else {
            state.getSpecialistResults().put("compliance", "合规分析暂不可用");
        }
        log.info("[ComplianceSpecialist] 租户={} 完成分析", state.getTenantId());
        return state;
    }

    private String buildSystemPrompt() {
        return "你是服装质检合规专家。分析质检通过率、缺陷类型分布、客验标准合规性。输出风险点+改进建议。";
    }

    private String buildPrompt(AgentState state) {
        return String.format("场景：%s\n订单：%s\n问题：%s\n已有上下文：%s",
                state.getScene(), state.getOrderIds(), state.getQuestion(), state.getContextSummary());
    }

    private String truncate(String s, int max) {
        return s != null && s.length() > max ? s.substring(0, max) + "..." : s;
    }
}
