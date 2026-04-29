package com.fashion.supplychain.intelligence.orchestration.specialist;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.intelligence.dto.AgentState;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.ModelRoutingConfig;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class CostSpecialistAgent implements SpecialistAgent {

    private final IntelligenceInferenceOrchestrator inference;
    private final ModelRoutingConfig routingConfig;
    private final ScanRecordMapper scanRecordMapper;

    @Override
    public String getRoute() { return "cost"; }

    @Override
    public AgentState analyze(AgentState state) {
        String dataContext = buildDataContext(state);
        String prompt = buildPrompt(state, dataContext);
        var result = inference.chat("cost_specialist",
                "你是一名服装成本核算专家，擅长工资核算、工序成本分析和对账管理。\n" + buildSystemPrompt(), prompt);
        if (result.isSuccess()) {
            String analysis = result.getContent();
            state.getSpecialistResults().put("cost", analysis);
            state.setContextSummary(state.getContextSummary() + "\n【成本分析】" + truncate(analysis, 300));
        } else {
            state.getSpecialistResults().put("cost", "成本分析暂不可用");
        }
        log.info("[CostSpecialist] 租户={} 完成分析", state.getTenantId());
        return state;
    }

    private String buildDataContext(AgentState state) {
        StringBuilder sb = new StringBuilder();
        try {
            List<ScanRecord> scans = scanRecordMapper.selectList(
                    new LambdaQueryWrapper<ScanRecord>()
                            .eq(ScanRecord::getTenantId, state.getTenantId())
                            .eq(ScanRecord::getScanResult, "success")
                            .ne(ScanRecord::getScanType, "orchestration")
                            .last("LIMIT 50"));
            if (!scans.isEmpty()) {
                Map<String, BigDecimal> costByProcess = scans.stream()
                        .filter(s -> s.getProcessName() != null && s.getScanCost() != null)
                        .collect(Collectors.groupingBy(ScanRecord::getProcessName,
                                Collectors.reducing(BigDecimal.ZERO, ScanRecord::getScanCost, BigDecimal::add)));

                Map<String, BigDecimal> costByOperator = scans.stream()
                        .filter(s -> s.getOperatorName() != null && s.getScanCost() != null)
                        .collect(Collectors.groupingBy(ScanRecord::getOperatorName,
                                Collectors.reducing(BigDecimal.ZERO, ScanRecord::getScanCost, BigDecimal::add)));

                BigDecimal totalCost = scans.stream()
                        .map(ScanRecord::getScanCost)
                        .filter(c -> c != null)
                        .reduce(BigDecimal.ZERO, BigDecimal::add);

                sb.append(String.format("【成本概览】总扫码成本=¥%s, 扫码记录=%d\n",
                        totalCost.toPlainString(), scans.size()));

                sb.append("【按工序成本】\n");
                costByProcess.entrySet().stream()
                        .sorted((a, b) -> b.getValue().compareTo(a.getValue()))
                        .limit(10)
                        .forEach(e -> sb.append(String.format("- %s: ¥%s\n", e.getKey(), e.getValue().toPlainString())));

                sb.append("【按操作员工资】\n");
                costByOperator.entrySet().stream()
                        .sorted((a, b) -> b.getValue().compareTo(a.getValue()))
                        .limit(10)
                        .forEach(e -> sb.append(String.format("- %s: ¥%s\n", e.getKey(), e.getValue().toPlainString())));

                long unsettled = scans.stream()
                        .filter(s -> !"settled".equals(s.getSettlementStatus()))
                        .count();
                sb.append(String.format("【结算状态】未结算=%d条\n", unsettled));
            }
        } catch (Exception e) {
            log.warn("[CostSpecialist] 数据查询失败: {}", e.getMessage());
            sb.append("数据查询异常，仅基于LLM推理\n");
        }
        return sb.toString();
    }

    private String buildSystemPrompt() {
        return "基于提供的真实扫码成本、工序工价和操作员工资数据进行分析。输出成本结构+优化建议。";
    }

    private String buildPrompt(AgentState state, String dataContext) {
        return String.format("场景：%s\n订单：%s\n问题：%s\n已有上下文：%s\n\n===真实业务数据===\n%s",
                state.getScene(), state.getOrderIds(), state.getQuestion(), state.getContextSummary(), dataContext);
    }

    private String truncate(String s, int max) {
        return s != null && s.length() > max ? s.substring(0, max) + "..." : s;
    }
}
