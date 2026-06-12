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
        properties.put("factoryId", stringProp("工厂ID（可选）"));
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
        String factoryId = optionalString(args, "factoryId");

        QueryWrapper<ProductWarehousing> query = new QueryWrapper<ProductWarehousing>()
                .eq("tenant_id", tenantId)
                .eq("delete_flag", 0)
                .eq(StringUtils.hasText(orderNo), "order_no", orderNo)
                .eq(StringUtils.hasText(factoryId), "factory_id", factoryId)
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

    private String defectStatistics(Map<String, Object> args) throws Exception {
        Long tenantId = UserContext.tenantId();
        String timeRange = optionalString(args, "timeRange");
        String factoryId = optionalString(args, "factoryId");
        int days = switch (timeRange != null ? timeRange : "30d") {
            case "7d" -> 7;
            case "90d" -> 90;
            default -> 30;
        };

        LocalDateTime since = LocalDateTime.now().minusDays(days);

        QueryWrapper<CuttingBundle> baseQuery = new QueryWrapper<CuttingBundle>()
                .eq("tenant_id", tenantId)
                .ge("create_time", since);
        if (StringUtils.hasText(factoryId)) {
            baseQuery.eq("factory_id", factoryId);
        }

        Long totalOutput = cuttingBundleMapper.selectCount(baseQuery);

        QueryWrapper<CuttingBundle> defectiveQuery = baseQuery.clone().eq("quality_status", "REJECTED");
        Long defectiveCount = cuttingBundleMapper.selectCount(defectiveQuery);

        QueryWrapper<CuttingBundle> scrappedQuery = baseQuery.clone().eq("status", "SCRAPPED");
        Long scrappedCount = cuttingBundleMapper.selectCount(scrappedQuery);

        QueryWrapper<CuttingBundle> repairingQuery = baseQuery.clone().eq("quality_status", "REPAIRING");
        Long repairingCount = cuttingBundleMapper.selectCount(repairingQuery);

        if (totalOutput == 0) {
            return successJson("系统中暂无" + days + "天内的次品统计数据", Map.of("period", days + "天"));
        }

        double defectiveRate = (double) defectiveCount / totalOutput * 100;
        double scrapRate = (double) scrappedCount / totalOutput * 100;

        QueryWrapper<CuttingBundle> byReasonQuery = baseQuery.clone()
                .select("COALESCE(quality_remark,'未分类') as reason", "COUNT(*) as count")
                .in("quality_status", "REJECTED", "REPAIRING", "REPAIR_COMPLETED")
                .groupBy("quality_remark").orderByDesc("count");
        List<Map<String, Object>> byReason = cuttingBundleMapper.selectMaps(byReasonQuery);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("period", days + "天");
        result.put("totalOutput", totalOutput);
        result.put("defectiveCount", defectiveCount);
        result.put("defectiveRate", String.format("%.2f%%", defectiveRate));
        result.put("scrappedCount", scrappedCount);
        result.put("scrapRate", String.format("%.2f%%", scrapRate));
        result.put("repairingCount", repairingCount);
        result.put("defectReasons", byReason);

        return successJson("次品统计结果", result);
    }
}
