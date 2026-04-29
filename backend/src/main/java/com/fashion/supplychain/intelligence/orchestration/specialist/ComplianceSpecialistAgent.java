package com.fashion.supplychain.intelligence.orchestration.specialist;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.intelligence.dto.AgentState;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.ModelRoutingConfig;
import com.fashion.supplychain.production.entity.MaterialQualityIssue;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.MaterialQualityIssueMapper;
import com.fashion.supplychain.production.mapper.ProductWarehousingMapper;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class ComplianceSpecialistAgent implements SpecialistAgent {

    private final IntelligenceInferenceOrchestrator inference;
    private final ModelRoutingConfig routingConfig;
    private final ScanRecordMapper scanRecordMapper;
    private final ProductWarehousingMapper productWarehousingMapper;
    private final MaterialQualityIssueMapper materialQualityIssueMapper;

    @Override
    public String getRoute() { return "compliance"; }

    @Override
    public AgentState analyze(AgentState state) {
        String dataContext = buildDataContext(state);
        String prompt = buildPrompt(state, dataContext);
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

    private String buildDataContext(AgentState state) {
        StringBuilder sb = new StringBuilder();
        try {
            List<ScanRecord> qualityScans = scanRecordMapper.selectList(
                    new LambdaQueryWrapper<ScanRecord>()
                            .eq(ScanRecord::getTenantId, state.getTenantId())
                            .eq(ScanRecord::getScanType, "quality")
                            .eq(ScanRecord::getScanResult, "success")
                            .ne(ScanRecord::getScanType, "orchestration")
                            .last("LIMIT 30"));
            if (!qualityScans.isEmpty()) {
                long totalScans = qualityScans.size();
                long successScans = qualityScans.stream().filter(s -> "success".equals(s.getScanResult())).count();
                sb.append(String.format("【质检扫码统计】总扫码=%d, 成功=%d, 通过率=%.1f%%\n",
                        totalScans, successScans, totalScans > 0 ? (successScans * 100.0 / totalScans) : 0));
                for (ScanRecord sr : qualityScans.subList(0, Math.min(10, qualityScans.size()))) {
                    sb.append(String.format("- 订单=%s, 工序=%s, 操作员=%s, 数量=%s\n",
                            sr.getOrderNo(), sr.getProcessName(), sr.getOperatorName(),
                            sr.getQuantity() != null ? sr.getQuantity() : "N/A"));
                }
            }

            List<ProductWarehousing> warehousings = productWarehousingMapper.selectList(
                    new LambdaQueryWrapper<ProductWarehousing>()
                            .eq(ProductWarehousing::getTenantId, state.getTenantId())
                            .last("LIMIT 20"));
            if (!warehousings.isEmpty()) {
                sb.append("【入库质检记录】\n");
                for (ProductWarehousing pw : warehousings) {
                    sb.append(String.format("- 订单=%s, 质检状态=%s\n",
                            pw.getOrderNo(), pw.getQualityStatus()));
                }
            }

            List<MaterialQualityIssue> issues = materialQualityIssueMapper.selectList(
                    new LambdaQueryWrapper<MaterialQualityIssue>()
                            .eq(MaterialQualityIssue::getTenantId, state.getTenantId())
                            .last("LIMIT 20"));
            if (!issues.isEmpty()) {
                sb.append("【物料质量问题】\n");
                for (MaterialQualityIssue mqi : issues) {
                    sb.append(String.format("- 物料=%s, 类型=%s, 严重度=%s, 备注=%s\n",
                            mqi.getMaterialName(), mqi.getIssueType(), mqi.getSeverity(),
                            mqi.getRemark() != null ? mqi.getRemark() : ""));
                }
            }
        } catch (Exception e) {
            log.warn("[ComplianceSpecialist] 数据查询失败: {}", e.getMessage());
            sb.append("数据查询异常，仅基于LLM推理\n");
        }
        return sb.toString();
    }

    private String buildSystemPrompt() {
        return "你是服装质检合规专家。基于提供的真实质检数据、入库记录和物料质量问题进行分析。输出风险点+改进建议。";
    }

    private String buildPrompt(AgentState state, String dataContext) {
        return String.format("场景：%s\n订单：%s\n问题：%s\n已有上下文：%s\n\n===真实业务数据===\n%s",
                state.getScene(), state.getOrderIds(), state.getQuestion(), state.getContextSummary(), dataContext);
    }

    private String truncate(String s, int max) {
        return s != null && s.length() > max ? s.substring(0, max) + "..." : s;
    }
}
