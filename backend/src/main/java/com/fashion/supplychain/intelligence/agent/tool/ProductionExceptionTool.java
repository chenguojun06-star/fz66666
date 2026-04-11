package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.production.dto.ExceptionReportRequest;
import com.fashion.supplychain.production.entity.ProductionExceptionReport;
import com.fashion.supplychain.production.orchestration.ExceptionReportOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 生产异常上报工具 — AI 可通过此工具上报生产过程中的异常情况
 */
@Slf4j
@Component
public class ProductionExceptionTool extends AbstractAgentTool {

    @Autowired
    private ExceptionReportOrchestrator exceptionReportOrchestrator;

    @Override
    public String getName() {
        return "tool_production_exception";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("action", stringProp("操作类型：report=上报生产异常"));
        properties.put("orderNo", stringProp("生产订单号，如 PO20260101001"));
        properties.put("processName", stringProp("发生异常的工序名称，如 车缝、裁剪"));
        properties.put("exceptionType", stringProp(
                "异常类型：MATERIAL_SHORTAGE=物料短缺 / MACHINE_FAULT=设备故障 / NEED_HELP=需要协助"));
        properties.put("description", stringProp("异常详细描述（可选）"));
        return buildToolDef(
                "上报生产过程中的异常情况，包括物料短缺、设备故障、需要协助等",
                properties,
                List.of("action", "orderNo", "processName", "exceptionType"));
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String action = requireString(args, "action");

        return switch (action) {
            case "report" -> {
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

                yield successJson("异常上报成功", Map.of(
                        "reportId", report.getId(),
                        "orderNo", orderNo,
                        "processName", processName,
                        "exceptionType", exceptionType,
                        "message", "已通知相关负责人，请等待处理"));
            }
            default -> errorJson("不支持的 action：" + action + "，可用：report");
        };
    }

    private void validateExceptionType(String exceptionType) {
        List<String> valid = List.of("MATERIAL_SHORTAGE", "MACHINE_FAULT", "NEED_HELP");
        if (!valid.contains(exceptionType)) {
            throw new IllegalArgumentException(
                    "exceptionType 不合法：" + exceptionType + "，可选：" + String.join(" / ", valid));
        }
    }
}
