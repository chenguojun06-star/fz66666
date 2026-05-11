package com.fashion.supplychain.intelligence.orchestration.specialist;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.intelligence.dto.AgentState;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.ModelRoutingConfig;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ProductionProcessTracking;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import com.fashion.supplychain.production.mapper.ProductionProcessTrackingMapper;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.mapper.StyleProcessMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class ProductionSpecialistAgent implements SpecialistAgent {

    private final IntelligenceInferenceOrchestrator inference;
    private final ModelRoutingConfig routingConfig;
    private final ProductionOrderMapper productionOrderMapper;
    private final ProductionProcessTrackingMapper processTrackingMapper;
    private final StyleProcessMapper styleProcessMapper;
    private final com.fashion.supplychain.intelligence.service.SpecialistPersonaService personaService;

    @Override
    public String getRoute() { return "production"; }

    @Override
    public AgentState analyze(AgentState state) {
        String dataContext = buildDataContext(state);
        String prompt = buildPrompt(state, dataContext);
        var profile = routingConfig.getProfile("full");
        String systemPrompt = personaService.buildFullPrompt("production");
        if (systemPrompt.isBlank()) {
            systemPrompt = "你是一名服装生产管理专家，擅长产能分析、工序瓶颈识别和排产优化。\n" + buildFallbackSystemPrompt();
        }
        var result = inference.chat("production_specialist", systemPrompt, prompt);
        if (result.isSuccess()) {
            String analysis = result.getContent();
            state.getSpecialistResults().put("production", analysis);
            state.setContextSummary(state.getContextSummary() + "\n【生产分析】" + truncate(analysis, 300));
        } else {
            state.getSpecialistResults().put("production", "生产分析暂不可用");
        }
        log.info("[ProductionSpecialist] 租户={} 完成分析", state.getTenantId());
        return state;
    }

    private String buildDataContext(AgentState state) {
        StringBuilder sb = new StringBuilder();
        try {
            List<ProductionOrder> orders = productionOrderMapper.selectList(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .eq(ProductionOrder::getTenantId, state.getTenantId())
                            .eq(ProductionOrder::getDeleteFlag, 0)
                            .in(ProductionOrder::getStatus, "production", "pending", "delayed")
                            .last("LIMIT 30"));
            if (!orders.isEmpty()) {
                long delayed = orders.stream().filter(o -> "delayed".equals(o.getStatus())).count();
                long inProd = orders.stream().filter(o -> "production".equals(o.getStatus())).count();
                sb.append(String.format("【生产订单概览】总数=%d, 生产中=%d, 逾期=%d\n",
                        orders.size(), inProd, delayed));
                for (ProductionOrder o : orders.subList(0, Math.min(10, orders.size()))) {
                    sb.append(String.format("- %s: 款号=%s, 工厂=%s, 进度=%s%%, 状态=%s, 紧急=%s\n",
                            o.getOrderNo(), o.getStyleNo(), o.getFactoryName(),
                            o.getProductionProgress() != null ? o.getProductionProgress() : 0,
                            o.getStatus(), o.getUrgencyLevel()));
                }
            }

            List<ProductionProcessTracking> trackings = processTrackingMapper.selectList(
                    new LambdaQueryWrapper<ProductionProcessTracking>()
                            .eq(ProductionProcessTracking::getTenantId, state.getTenantId())
                            .last("LIMIT 20"));
            if (!trackings.isEmpty()) {
                sb.append("【工序跟踪记录】\n");
                for (ProductionProcessTracking pt : trackings) {
                    sb.append(String.format("- 订单=%s, 工序=%s, 状态=%s\n",
                            pt.getProductionOrderNo(), pt.getProcessName(), pt.getScanStatus()));
                }
            }

            List<StyleProcess> processes = styleProcessMapper.selectList(
                    new LambdaQueryWrapper<StyleProcess>()
                            .eq(StyleProcess::getTenantId, state.getTenantId())
                            .last("LIMIT 20"));
            if (!processes.isEmpty()) {
                sb.append("【工序配置】\n");
                for (StyleProcess sp : processes) {
                    sb.append(String.format("- %s: 阶段=%s, 难度=%s, 工价=%s\n",
                            sp.getProcessName(), sp.getProgressStage(), sp.getDifficulty(),
                            sp.getPrice() != null ? sp.getPrice().toPlainString() : "N/A"));
                }
            }
        } catch (Exception e) {
            log.warn("[ProductionSpecialist] 数据查询失败: {}", e.getMessage());
            sb.append("数据查询异常，仅基于LLM推理\n");
        }
        return sb.toString();
    }

    private String buildFallbackSystemPrompt() {
        return "基于提供的真实生产订单、工序跟踪和工序配置数据进行分析。输出产能瓶颈+排产建议。";
    }

    private String buildSystemPrompt() {
        return buildFallbackSystemPrompt();
    }

    private String buildPrompt(AgentState state, String dataContext) {
        return String.format("场景：%s\n订单：%s\n问题：%s\n已有上下文：%s\n\n===真实业务数据===\n%s",
                state.getScene(), state.getOrderIds(), state.getQuestion(), state.getContextSummary(), dataContext);
    }

    private String truncate(String s, int max) {
        return s != null && s.length() > max ? s.substring(0, max) + "..." : s;
    }
}
