package com.fashion.supplychain.intelligence.orchestration.specialist;

import com.fashion.supplychain.intelligence.dto.AgentState;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 物流/仓储专家代理 — 分析库存水位、出入库节奏、物流达成率。
 */
@Slf4j
@Service
public class LogisticsSpecialistAgent implements SpecialistAgent {

    @Autowired
    private IntelligenceInferenceOrchestrator inference;
    @Autowired
    private com.fashion.supplychain.intelligence.orchestration.ModelRoutingConfig routingConfig;

    @Override
    public String getRoute() { return "logistics"; }

    @Override
    public AgentState analyze(AgentState state) {
        String prompt = buildPrompt(state);
        var profile = routingConfig.getProfile("logistics");
        var result = inference.chat("logistics_specialist", profile.getSystemPromptPrefix() + "\n" + buildSystemPrompt(), prompt);
        if (result.isSuccess()) {
            String analysis = result.getContent();
            state.getSpecialistResults().put("logistics", analysis);
            state.setContextSummary(state.getContextSummary() + "\n【物流分析】" + truncate(analysis, 300));
        } else {
            state.getSpecialistResults().put("logistics", "物流分析暂不可用");
        }
        log.info("[LogisticsSpecialist] 租户={} 完成分析", state.getTenantId());
        return state;
    }

    private String buildSystemPrompt() {
        return "你是服装物流仓储专家。分析成品库存水位、入库/出库节奏、物流延误风险。输出库存状态+物流建议。";
    }

    private String buildPrompt(AgentState state) {
        return String.format("场景：%s\n订单：%s\n问题：%s\n已有上下文：%s",
                state.getScene(), state.getOrderIds(), state.getQuestion(), state.getContextSummary());
    }

    private String truncate(String s, int max) {
        return s != null && s.length() > max ? s.substring(0, max) + "..." : s;
    }
}
