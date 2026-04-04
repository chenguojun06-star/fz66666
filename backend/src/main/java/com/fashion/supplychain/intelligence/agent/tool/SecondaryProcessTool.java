package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.style.entity.SecondaryProcess;
import com.fashion.supplychain.style.service.SecondaryProcessService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 二次加工工序工具 — AI 可通过此工具查询、创建和更新款式的二次加工工序
 */
@Slf4j
@Component
public class SecondaryProcessTool extends AbstractAgentTool {

    @Autowired
    private SecondaryProcessService secondaryProcessService;

    @Override
    public String getName() {
        return "tool_secondary_process";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("action", stringProp(
                "操作类型：list=按款式查询二次工序 / create=新增二次工序 / update_status=更新工序状态"));
        properties.put("styleId", stringProp("款式ID（list/create 时使用）"));
        properties.put("processType", stringProp("工序类型，如 印花、绣花、洗水（create 时使用）"));
        properties.put("processName", stringProp("工序名称（create 时使用）"));
        properties.put("quantity", intProp("加工数量（create 时使用）"));
        properties.put("unitPrice", stringProp("单价，数字字符串如 5.50（create 时可选）"));
        properties.put("factoryName", stringProp("加工工厂名称（create 时可选）"));
        properties.put("remark", stringProp("备注（create 时可选）"));
        properties.put("processId", stringProp("工序记录ID（update_status 时使用）"));
        properties.put("status", stringProp("新状态：PENDING=待处理 / IN_PROGRESS=进行中 / COMPLETED=已完成（update_status 时使用）"));
        return buildToolDef(
                "查询或管理款式的二次加工工序，包括印花、绣花、洗水等",
                properties,
                List.of("action"));
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String action = requireString(args, "action");

        return switch (action) {
            case "list" -> {
                String styleId = optionalString(args, "styleId");
                Long tenantId = UserContext.tenantId();
                LambdaQueryWrapper<SecondaryProcess> wrapper = new LambdaQueryWrapper<SecondaryProcess>()
                        .eq(SecondaryProcess::getTenantId, tenantId);
                if (styleId != null) {
                    wrapper.eq(SecondaryProcess::getStyleId, Long.parseLong(styleId));
                }
                wrapper.orderByDesc(SecondaryProcess::getCreatedAt);
                List<SecondaryProcess> list = secondaryProcessService.list(wrapper);
                yield successJson("查询成功", Map.of("list", list, "total", list.size()));
            }
            case "create" -> {
                String styleId = requireString(args, "styleId");
                String processType = requireString(args, "processType");
                String processName = requireString(args, "processName");
                Integer quantity = optionalInt(args, "quantity");
                String unitPriceStr = optionalString(args, "unitPrice");
                String factoryName = optionalString(args, "factoryName");
                String remark = optionalString(args, "remark");

                SecondaryProcess process = new SecondaryProcess();
                process.setStyleId(Long.parseLong(styleId));
                process.setProcessType(processType);
                process.setProcessName(processName);
                process.setQuantity(quantity);
                if (unitPriceStr != null) process.setUnitPrice(new BigDecimal(unitPriceStr));
                process.setFactoryName(factoryName);
                process.setRemark(remark);
                process.setStatus("PENDING");

                secondaryProcessService.save(process);
                yield successJson("二次工序创建成功", Map.of("id", process.getId(), "processName", processName));
            }
            case "update_status" -> {
                String processId = requireString(args, "processId");
                String status = requireString(args, "status");
                validateStatus(status);

                SecondaryProcess process = secondaryProcessService.getById(processId);
                if (process == null) throw new IllegalStateException("工序记录不存在：" + processId);

                process.setStatus(status);
                secondaryProcessService.updateById(process);
                yield successJson("状态更新成功", Map.of("processId", processId, "newStatus", status));
            }
            default -> errorJson("不支持的 action：" + action + "，可用：list / create / update_status");
        };
    }

    private void validateStatus(String status) {
        List<String> valid = List.of("PENDING", "IN_PROGRESS", "COMPLETED");
        if (!valid.contains(status)) {
            throw new IllegalArgumentException("status 不合法：" + status + "，可选：" + String.join(" / ", valid));
        }
    }
}
