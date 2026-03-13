package com.fashion.supplychain.intelligence.orchestration.specialist;

import com.fashion.supplychain.intelligence.dto.AgentState;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 采购/供应链专家代理 — 分析BOM成本、供应商交付、面辅料缺口。
 */
@Slf4j
@Service
public class SourcingSpecialistAgent implements SpecialistAgent {

    @Autowired
    private IntelligenceInferenceOrchestrator inference;
    @Autowired
    private com.fashion.supplychain.intelligence.orchestration.ModelRoutingConfig routingConfig;

    @Override
    public String getRoute() { return "sourcing"; }

    @Override
    public AgentState analyze(AgentState state) {
        String prompt = buildPrompt(state);
        var profile = routingConfig.getProfile("sourcing");
        var result = inference.chat("sourcing_specialist", profile.getSystemPromptPrefix() + "\n" + buildSystemPrompt(), prompt);
        if (result.isSuccess()) {
            String analysis = result.getContent();
            state.getSpecialistResults().put("sourcing", analysis);
            state.setContextSummary(state.getContextSummary() + "\n【采购分析】" + truncate(analysis, 300));
        } else {
            state.getSpecialistResults().put("sourcing", "采购分析暂不可用");
        }
        log.info("[SourcingSpecialist] 租户={} 完成分析", state.getTenantId());
        return state;
    }

    private String buildSystemPrompt() {
        return "你是服装供应链采购专家。分析BOM成本、面辅料库存缺口、供应商交付表现。输出简洁结论+建议。";
    }

    private String buildPrompt(AgentState state) {
        return String.format("场景：%s\n订单：%s\n问题：%s\n已有上下文：%s",
                state.getScene(), state.getOrderIds(), state.getQuestion(), state.getContextSummary());
    }

    private String truncate(String s, int max) {
        return s != null && s.length() > max ? s.substring(0, max) + "..." : s;
    }
}
