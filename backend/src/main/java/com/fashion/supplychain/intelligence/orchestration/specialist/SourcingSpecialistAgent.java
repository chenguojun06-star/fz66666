package com.fashion.supplychain.intelligence.orchestration.specialist;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.intelligence.dto.AgentState;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.ModelRoutingConfig;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.mapper.MaterialPurchaseMapper;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.mapper.FactoryMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class SourcingSpecialistAgent implements SpecialistAgent {

    private final IntelligenceInferenceOrchestrator inference;
    private final ModelRoutingConfig routingConfig;
    private final MaterialPurchaseMapper materialPurchaseMapper;
    private final FactoryMapper factoryMapper;

    @Override
    public String getRoute() { return "sourcing"; }

    @Override
    public AgentState analyze(AgentState state) {
        String dataContext = buildDataContext(state);
        String prompt = buildPrompt(state, dataContext);
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

    private String buildDataContext(AgentState state) {
        StringBuilder sb = new StringBuilder();
        try {
            List<MaterialPurchase> purchases = materialPurchaseMapper.selectList(
                    new LambdaQueryWrapper<MaterialPurchase>()
                            .eq(MaterialPurchase::getTenantId, state.getTenantId())
                            .eq(MaterialPurchase::getDeleteFlag, 0)
                            .last("LIMIT 30"));
            if (!purchases.isEmpty()) {
                sb.append("【近期采购记录】\n");
                for (MaterialPurchase mp : purchases) {
                    sb.append(String.format("- %s: %s, 供应商=%s, 数量=%s, 状态=%s, 单价=%s\n",
                            mp.getPurchaseNo(), mp.getMaterialName(),
                            mp.getSupplierName(),
                            mp.getPurchaseQuantity() != null ? mp.getPurchaseQuantity() : "N/A",
                            mp.getStatus(),
                            mp.getUnitPrice() != null ? mp.getUnitPrice().toPlainString() : "N/A"));
                }
            }

            List<Factory> suppliers = factoryMapper.selectList(
                    new LambdaQueryWrapper<Factory>()
                            .eq(Factory::getTenantId, state.getTenantId())
                            .eq(Factory::getDeleteFlag, 0)
                            .eq(Factory::getSupplierType, "MATERIAL")
                            .last("LIMIT 20"));
            if (!suppliers.isEmpty()) {
                sb.append("【面辅料供应商】\n");
                for (Factory s : suppliers) {
                    sb.append(String.format("- %s: 准时率=%s, 质量分=%s, 完成率=%s\n",
                            s.getFactoryName(),
                            s.getOnTimeDeliveryRate() != null ? s.getOnTimeDeliveryRate() + "%" : "N/A",
                            s.getQualityScore() != null ? s.getQualityScore() : "N/A",
                            s.getCompletionRate() != null ? s.getCompletionRate() + "%" : "N/A"));
                }
            }
        } catch (Exception e) {
            log.warn("[SourcingSpecialist] 数据查询失败: {}", e.getMessage());
            sb.append("数据查询异常，仅基于LLM推理\n");
        }
        return sb.toString();
    }

    private String buildSystemPrompt() {
        return "你是服装供应链采购专家。基于提供的真实采购数据和供应商表现数据进行分析。输出简洁结论+建议。";
    }

    private String buildPrompt(AgentState state, String dataContext) {
        return String.format("场景：%s\n订单：%s\n问题：%s\n已有上下文：%s\n\n===真实业务数据===\n%s",
                state.getScene(), state.getOrderIds(), state.getQuestion(), state.getContextSummary(), dataContext);
    }

    private String truncate(String s, int max) {
        return s != null && s.length() > max ? s.substring(0, max) + "..." : s;
    }
}
