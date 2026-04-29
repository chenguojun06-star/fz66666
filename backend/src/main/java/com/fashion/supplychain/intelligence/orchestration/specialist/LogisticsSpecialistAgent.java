package com.fashion.supplychain.intelligence.orchestration.specialist;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.intelligence.dto.AgentState;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.ModelRoutingConfig;
import com.fashion.supplychain.production.entity.FactoryShipment;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.production.mapper.FactoryShipmentMapper;
import com.fashion.supplychain.production.mapper.ProductOutstockMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class LogisticsSpecialistAgent implements SpecialistAgent {

    private final IntelligenceInferenceOrchestrator inference;
    private final ModelRoutingConfig routingConfig;
    private final FactoryShipmentMapper factoryShipmentMapper;
    private final ProductOutstockMapper productOutstockMapper;

    @Override
    public String getRoute() { return "logistics"; }

    @Override
    public AgentState analyze(AgentState state) {
        String dataContext = buildDataContext(state);
        String prompt = buildPrompt(state, dataContext);
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

    private String buildDataContext(AgentState state) {
        StringBuilder sb = new StringBuilder();
        try {
            List<FactoryShipment> shipments = factoryShipmentMapper.selectList(
                    new LambdaQueryWrapper<FactoryShipment>()
                            .eq(FactoryShipment::getTenantId, state.getTenantId())
                            .eq(FactoryShipment::getDeleteFlag, 0)
                            .last("LIMIT 30"));
            if (!shipments.isEmpty()) {
                long received = shipments.stream().filter(s -> "received".equals(s.getReceiveStatus())).count();
                long pending = shipments.size() - received;
                sb.append(String.format("【发货统计】总发货=%d, 已收货=%d, 待收货=%d\n",
                        shipments.size(), received, pending));
                for (FactoryShipment fs : shipments.subList(0, Math.min(10, shipments.size()))) {
                    sb.append(String.format("- %s: 工厂=%s, 数量=%s, 状态=%s, 物流单=%s\n",
                            fs.getShipmentNo(), fs.getFactoryName(),
                            fs.getShipQuantity() != null ? fs.getShipQuantity() : "N/A",
                            fs.getReceiveStatus(),
                            fs.getTrackingNo() != null ? fs.getTrackingNo() : "N/A"));
                }
            }

            List<ProductOutstock> outstocks = productOutstockMapper.selectList(
                    new LambdaQueryWrapper<ProductOutstock>()
                            .eq(ProductOutstock::getTenantId, state.getTenantId())
                            .last("LIMIT 20"));
            if (!outstocks.isEmpty()) {
                sb.append("【成品出库记录】\n");
                for (ProductOutstock po : outstocks) {
                    sb.append(String.format("- 订单=%s, 出库数量=%s\n",
                            po.getOrderNo(),
                            po.getOutstockQuantity() != null ? po.getOutstockQuantity() : "N/A"));
                }
            }
        } catch (Exception e) {
            log.warn("[LogisticsSpecialist] 数据查询失败: {}", e.getMessage());
            sb.append("数据查询异常，仅基于LLM推理\n");
        }
        return sb.toString();
    }

    private String buildSystemPrompt() {
        return "你是服装物流仓储专家。基于提供的真实发货和出库数据进行分析。输出库存状态+物流建议。";
    }

    private String buildPrompt(AgentState state, String dataContext) {
        return String.format("场景：%s\n订单：%s\n问题：%s\n已有上下文：%s\n\n===真实业务数据===\n%s",
                state.getScene(), state.getOrderIds(), state.getQuestion(), state.getContextSummary(), dataContext);
    }

    private String truncate(String s, int max) {
        return s != null && s.length() > max ? s.substring(0, max) + "..." : s;
    }
}
