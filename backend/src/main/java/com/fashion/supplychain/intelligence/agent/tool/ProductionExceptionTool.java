package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.production.dto.ExceptionReportRequest;
import com.fashion.supplychain.production.entity.ProductionExceptionReport;
import com.fashion.supplychain.production.orchestration.ExceptionReportOrchestrator;
import com.fashion.supplychain.production.service.ProductionExceptionReportService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Component
@AgentToolDef(name = "tool_production_exception", description = "生产异常上报与分析", domain = ToolDomain.PRODUCTION, timeoutMs = 15000, readOnly = false)
public class ProductionExceptionTool extends AbstractAgentTool {

    @Autowired private ExceptionReportOrchestrator exceptionReportOrchestrator;
    @Autowired private ProductionExceptionReportService exceptionReportService;

    @Override
    public String getName() {
        return "tool_production_exception";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("action", stringProp("操作：report=上报异常/stats=异常统计/trend=异常趋势/list=异常列表"));
        properties.put("orderNo", stringProp("生产订单号"));
        properties.put("processName", stringProp("工序名称"));
        properties.put("exceptionType", stringProp("异常类型：MATERIAL_SHORTAGE/MACHINE_FAULT/NEED_HELP/QUALITY_ISSUE/DELAY_RISK"));
        properties.put("description", stringProp("异常详细描述"));
        properties.put("days", intProp("统计天数(默认7天)"));
        properties.put("limit", intProp("列表条数(默认20)"));
        return buildToolDef(
                "生产异常上报与智能分析：上报异常、查看异常频率趋势、关联分析、自动推荐处理方案",
                properties, List.of("action"));
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String action = optionalString(args, "action");
        if (action == null || action.isBlank()) action = "stats";

        return switch (action) {
            case "report" -> reportException(args);
            case "stats" -> statsExceptions(args);
            case "trend" -> trendAnalysis(args);
            case "list" -> listExceptions(args);
            default -> errorJson("不支持的 action：" + action + "，可用：report/stats/trend/list");
        };
    }

    private String reportException(Map<String, Object> args) throws Exception {
        String orderNo = requireString(args, "orderNo");
        String processName = requireString(args, "processName");
        String exceptionType = requireString(args, "exceptionType");
        String description = optionalString(args, "description");

        validateExceptionType(exceptionType);

        ExceptionReportRequest request = new ExceptionReportRequest();
        request.setOrderNo(orderNo);
        request.setProcessName(processName);
        request.setExceptionType(exceptionType);
        request.setDescription(description);
        request.setTenantId(UserContext.tenantId());

        ProductionExceptionReport report = exceptionReportOrchestrator.reportException(request);

        String recommendation = generateRecommendation(exceptionType, processName);

        return successJson("异常上报成功", Map.of(
                "reportId", report.getId(),
                "orderNo", orderNo,
                "processName", processName,
                "exceptionType", exceptionType,
                "recommendation", recommendation,
                "message", "已通知相关负责人，请等待处理"));
    }

    private String statsExceptions(Map<String, Object> args) throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        int days = optionalInt(args, "days") != null ? optionalInt(args, "days") : 7;

        List<ProductionExceptionReport> recent = exceptionReportService.lambdaQuery()
                .eq(ProductionExceptionReport::getTenantId, tenantId)
                .ge(ProductionExceptionReport::getCreateTime, java.time.LocalDateTime.now().minusDays(days))
                .last("LIMIT 5000")
                .list();

        Map<String, Long> byType = recent.stream()
                .collect(Collectors.groupingBy(r -> r.getExceptionType() != null ? r.getExceptionType() : "UNKNOWN", Collectors.counting()));

        Map<String, Long> byProcess = recent.stream()
                .collect(Collectors.groupingBy(r -> r.getProcessName() != null ? r.getProcessName() : "未知工序", Collectors.counting()));

        long unresolved = recent.stream().filter(r -> !"RESOLVED".equals(r.getStatus())).count();
        long resolved = recent.stream().filter(r -> "RESOLVED".equals(r.getStatus())).count();

        List<String> insights = new ArrayList<>();
        if (unresolved > 5) {
            insights.add("🔴 近" + days + "天有" + unresolved + "条未解决异常，需关注");
        }
        byType.entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .ifPresent(e -> insights.add("📊 最频繁异常类型：" + e.getKey() + "（" + e.getValue() + "次）"));
        byProcess.entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .ifPresent(e -> insights.add("🔧 最受影响工序：" + e.getKey() + "（" + e.getValue() + "次）"));

        if (recent.size() > recent.size() * 2 / 3 && days >= 7) {
            insights.add("📈 异常频率呈上升趋势，建议排查根因");
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("period", days + "天");
        result.put("total", recent.size());
        result.put("unresolved", unresolved);
        result.put("resolved", resolved);
        result.put("byType", byType);
        result.put("byProcess", byProcess);
        result.put("insights", insights);
        return MAPPER.writeValueAsString(result);
    }

    private String trendAnalysis(Map<String, Object> args) throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        int days = optionalInt(args, "days") != null ? optionalInt(args, "days") : 14;

        List<ProductionExceptionReport> all = exceptionReportService.lambdaQuery()
                .eq(ProductionExceptionReport::getTenantId, tenantId)
                .ge(ProductionExceptionReport::getCreateTime, java.time.LocalDateTime.now().minusDays(days))
                .last("LIMIT 5000")
                .list();

        Map<String, Long> dailyCount = new LinkedHashMap<>();
        for (int i = days - 1; i >= 0; i--) {
            String date = java.time.LocalDate.now().minusDays(i).toString();
            dailyCount.put(date, 0L);
        }
        all.forEach(r -> {
            if (r.getCreateTime() != null) {
                String date = r.getCreateTime().toLocalDate().toString();
                dailyCount.merge(date, 1L, Long::sum);
            }
        });

        long firstHalf = dailyCount.values().stream().limit(days / 2).mapToLong(Long::longValue).sum();
        long secondHalf = dailyCount.values().stream().skip(days / 2).mapToLong(Long::longValue).sum();

        String trend;
        if (secondHalf > firstHalf * 1.3) trend = "📈 上升";
        else if (secondHalf < firstHalf * 0.7) trend = "📉 下降";
        else trend = "➡️ 平稳";

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("period", days + "天");
        result.put("trend", trend);
        result.put("firstHalfCount", firstHalf);
        result.put("secondHalfCount", secondHalf);
        result.put("dailyCount", dailyCount);
        result.put("summary", String.format("近%d天异常趋势：%s（前半段%d条，后半段%d条）", days, trend, firstHalf, secondHalf));
        return MAPPER.writeValueAsString(result);
    }

    private String listExceptions(Map<String, Object> args) throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        int limit = optionalInt(args, "limit") != null ? Math.min(optionalInt(args, "limit"), 50) : 20;

        List<ProductionExceptionReport> list = exceptionReportService.lambdaQuery()
                .eq(ProductionExceptionReport::getTenantId, tenantId)
                .orderByDesc(ProductionExceptionReport::getCreateTime)
                .last("LIMIT " + limit)
                .list();

        List<Map<String, Object>> items = list.stream().map(r -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", r.getId());
            m.put("orderNo", r.getOrderNo());
            m.put("processName", r.getProcessName());
            m.put("exceptionType", r.getExceptionType());
            m.put("status", r.getStatus());
            m.put("createTime", r.getCreateTime() != null ? r.getCreateTime().toString() : "");
            return m;
        }).toList();

        return successJson("查询到" + list.size() + "条异常记录", Map.of("items", items, "total", list.size()));
    }

    private String generateRecommendation(String exceptionType, String processName) {
        return switch (exceptionType) {
            case "MATERIAL_SHORTAGE" -> "建议：1)检查该工序BOM物料库存 2)联系采购确认补货时间 3)评估是否需要调整排产计划";
            case "MACHINE_FAULT" -> "建议：1)联系设备维护人员 2)评估故障影响时间 3)考虑将订单临时转至其他产线";
            case "NEED_HELP" -> "建议：1)评估当前人员配置 2)考虑从其他工序临时调配 3)如为技能问题，安排培训";
            case "QUALITY_ISSUE" -> "建议：1)暂停该工序生产 2)启动质检流程 3)追溯不良品根因(物料/操作/设备)";
            case "DELAY_RISK" -> "建议：1)评估延期天数和影响范围 2)通知跟单员和客户 3)考虑加班或分批交付";
            default -> "建议联系生产主管评估处理方案";
        };
    }

    private void validateExceptionType(String exceptionType) {
        List<String> valid = List.of("MATERIAL_SHORTAGE", "MACHINE_FAULT", "NEED_HELP", "QUALITY_ISSUE", "DELAY_RISK");
        if (!valid.contains(exceptionType)) {
            throw new IllegalArgumentException("exceptionType 不合法：" + exceptionType + "，可选：" + String.join(" / ", valid));
        }
    }
}
