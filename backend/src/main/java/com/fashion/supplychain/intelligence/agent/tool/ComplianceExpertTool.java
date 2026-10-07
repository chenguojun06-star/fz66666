package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.mapper.CuttingBundleMapper;
import com.fashion.supplychain.production.mapper.ProductWarehousingMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.context.annotation.Lazy;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
@Lazy
@AgentToolDef(name = "tool_compliance_expert", description = "合规专家工具", domain = ToolDomain.PRODUCTION, timeoutMs = 15000)
@McpToolAnnotation(
        name = "tool_compliance_expert",
        description = "合规专家工具",
        domain = ToolDomain.PRODUCTION,
        readOnly = true,
        timeoutSeconds = 15,
        requiresConfirmation = false,
        tags = {"合规", "质检合规", "次品统计", "质量合规", "合规检查"}
)
public class ComplianceExpertTool extends AbstractAgentTool {

    @Autowired
    private ProductWarehousingMapper productWarehousingMapper;

    @Autowired
    private CuttingBundleMapper cuttingBundleMapper;

    @Override
    public String getName() {
        return "tool_compliance_expert";
    }

    @Override
    public ToolDomain getDomain() {
        return ToolDomain.PRODUCTION;
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("action", stringProp("动作: quality_compliance_check | defect_statistics"));
        properties.put("orderNo", stringProp("订单号（quality_compliance_check时可选）"));
        properties.put("factoryName", stringProp("工厂名称（可选）"));
        properties.put("timeRange", stringProp("时间范围: 7d / 30d / 90d（defect_statistics时可选，默认30d）"));
        return buildToolDef(
                "合规专家工具：查询质检合规数据、次品统计。所有数据来自真实数据库查询，绝不编造。",
                properties, List.of("action"));
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String action = requireString(args, "action");
        return switch (action) {
            case "quality_compliance_check" -> qualityComplianceCheck(args);
            case "defect_statistics" -> defectStatistics(args);
            default -> errorJson("不支持的 action: " + action);
        };
    }

    private String qualityComplianceCheck(Map<String, Object> args) throws Exception {
        Long tenantId = UserContext.tenantId();
        String orderNo = optionalString(args, "orderNo");
        // D-760：t_product_warehousing 只有 factory_name，没有 factory_id。
        // 原代码按 factory_id 过滤 → 一旦传入工厂参数就报 Unknown column。
        String factoryName = optionalString(args, "factoryName");

        QueryWrapper<ProductWarehousing> query = new QueryWrapper<ProductWarehousing>()
                .eq("tenant_id", tenantId)
                .eq("delete_flag", 0)
                .eq(StringUtils.hasText(orderNo), "order_no", orderNo)
                .eq(StringUtils.hasText(factoryName), "factory_name", factoryName)
                .orderByDesc("create_time")
                .last("LIMIT 20");

        List<Map<String, Object>> records = productWarehousingMapper.selectMaps(
                query.select("order_no", "style_no", "style_name",
                        "warehousing_quantity", "qualified_quantity", "unqualified_quantity",
                        "quality_status", "defect_category", "defect_remark",
                        "inspection_status", "warehousing_operator_name", "create_time"));

        if (records.isEmpty()) {
            return successJson("系统中暂无匹配的质检合规数据", Map.of("items", List.of(), "total", 0));
        }

        long totalQty = records.stream()
                .mapToLong(r -> r.get("warehousing_quantity") instanceof Number n ? n.longValue() : 0)
                .sum();
        long qualifiedQty = records.stream()
                .mapToLong(r -> r.get("qualified_quantity") instanceof Number n ? n.longValue() : 0)
                .sum();
        long unqualifiedQty = records.stream()
                .mapToLong(r -> r.get("unqualified_quantity") instanceof Number n ? n.longValue() : 0)
                .sum();
        double passRate = totalQty > 0 ? (double) qualifiedQty / totalQty * 100 : 0;

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("totalRecords", records.size());
        result.put("totalQuantity", totalQty);
        result.put("qualifiedQuantity", qualifiedQty);
        result.put("unqualifiedQuantity", unqualifiedQty);
        result.put("passRate", String.format("%.2f%%", passRate));
        result.put("items", records);

        return successJson("质检合规查询结果", result);
    }

    /**
     * 次品统计（按裁剪菲的质检状态）。
     *
     * <p><b>D-760 修复</b>：原实现查 {@code quality_status} / {@code quality_remark}
     * —— {@code t_cutting_bundle} <b>两列都不存在</b>，且用的状态值
     * {@code REJECTED / REPAIRING / SCRAPPED} 在生产数据里也不存在 →
     * 一调用就 {@code ERROR 1054 Unknown column}。
     *
     * <p>现按权威状态取值统计（与 {@code ProductWarehousingHelper} 常量一致）：
     * {@code qualified} / {@code unqualified} / {@code repaired} / {@code repaired_waiting_qc}。
     * 该表<b>没有「报废」状态</b>，故不再输出 {@code scrapRate}（原先恒为 0，属无意义指标）。
     */
    private String defectStatistics(Map<String, Object> args) throws Exception {
        Long tenantId = UserContext.tenantId();
        String timeRange = optionalString(args, "timeRange");
        String factoryName = optionalString(args, "factoryName");
        int days = switch (timeRange != null ? timeRange : "30d") {
            case "7d" -> 7;
            case "90d" -> 90;
            default -> 30;
        };

        LocalDateTime since = LocalDateTime.now().minusDays(days);

        QueryWrapper<CuttingBundle> baseQuery = new QueryWrapper<CuttingBundle>()
                .eq("tenant_id", tenantId)
                .ge("create_time", since);
        if (StringUtils.hasText(factoryName)) {
            baseQuery.eq("factory_name", factoryName);
        }

        Long totalOutput = cuttingBundleMapper.selectCount(baseQuery);

        Long unqualifiedCount = cuttingBundleMapper.selectCount(
                baseQuery.clone().eq("status", ST_UNQUALIFIED));
        Long repairedCount = cuttingBundleMapper.selectCount(
                baseQuery.clone().eq("status", ST_REPAIRED));
        Long repairingCount = cuttingBundleMapper.selectCount(
                baseQuery.clone().eq("status", ST_REPAIRED_WAITING_QC));

        if (totalOutput == 0) {
            return successJson("该时段内没有裁剪菲数据，无法判断次品情况（这不代表质量正常）",
                    Map.of("period", days + "天", "totalOutput", 0));
        }

        double unqualifiedRate = (double) unqualifiedCount / totalOutput * 100;

        // 按质检状态分布（裁剪菲没有「次品原因」字段，该维度不可用）
        QueryWrapper<CuttingBundle> byStatusQuery = baseQuery.clone()
                .select("COALESCE(status,'(未设置)') as status", "COUNT(*) as count")
                .groupBy("status").orderByDesc("count");
        List<Map<String, Object>> byStatus = cuttingBundleMapper.selectMaps(byStatusQuery);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("period", days + "天");
        result.put("totalOutput", totalOutput);
        result.put("unqualifiedCount", unqualifiedCount);
        result.put("unqualifiedRate", String.format("%.2f%%", unqualifiedRate));
        result.put("repairedCount", repairedCount);
        result.put("repairingCount", repairingCount);
        result.put("statusDistribution", byStatus);
        result.put("note", "裁剪菲无「次品原因」字段，故按质检状态分布呈现；系统亦无「报废」状态。");

        return successJson("次品统计结果", result);
    }

    /** 裁剪菲质检状态 —— 与 ProductWarehousingHelper 常量一致（勿改字面量） */
    private static final String ST_UNQUALIFIED = "unqualified";
    private static final String ST_REPAIRED = "repaired";
    private static final String ST_REPAIRED_WAITING_QC = "repaired_waiting_qc";
}
