package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.finance.entity.PayrollSettlement;
import com.fashion.supplychain.finance.entity.PayrollSettlementItem;
import com.fashion.supplychain.finance.service.PayrollSettlementItemService;
import com.fashion.supplychain.finance.service.PayrollSettlementService;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 财务计件工资结算查询工具
 */
@Slf4j
@Component
public class FinancialPayrollTool implements AgentTool {

    @Autowired
    private PayrollSettlementService payrollSettlementService;

    @Autowired
    private PayrollSettlementItemService payrollSettlementItemService;

    @Autowired
    private AiAgentToolAccessService aiAgentToolAccessService;

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Override
    public String getName() {
        return "tool_query_financial_payroll";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new HashMap<>();

        Map<String, Object> orderNoProp = new HashMap<>();
        orderNoProp.put("type", "string");
        orderNoProp.put("description", "生产订单号，例如 PO2024001");
        properties.put("orderNo", orderNoProp);

        Map<String, Object> operatorNameProp = new HashMap<>();
        operatorNameProp.put("type", "string");
        operatorNameProp.put("description", "员工姓名，如果要查某人的工资明细");
        properties.put("operatorName", operatorNameProp);

        Map<String, Object> statusProp = new HashMap<>();
        statusProp.put("type", "string");
        statusProp.put("description", "结算状态，如 DRAFT(草稿), PENDING_AUDIT(待审核), AUDITED(已审核等)");
        properties.put("status", statusProp);

        Map<String, Object> queryItemsProp = new HashMap<>();
        queryItemsProp.put("type", "boolean");
        queryItemsProp.put("description", "是否查询计件明细列表(默认为false仅查总单)");
        properties.put("queryItems", queryItemsProp);

        Map<String, Object> parameters = new HashMap<>();
        parameters.put("type", "object");
        parameters.put("properties", properties);

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("按条件查询财务模块的计件工资结算单(PayrollSettlement)及员工明细。");
        AiTool.AiParameters aiParams = new AiTool.AiParameters();
        aiParams.setProperties(properties);
        function.setParameters(aiParams);
        tool.setFunction(function);

        return tool;
    }

    @Override
    public String execute(String argumentsJson) {
        log.info("Tool: {} called with args: {}", getName(), argumentsJson);
        if (UserContext.factoryId() != null) {
            return "{\"success\":false,\"error\":\"外发工厂账号无权访问工资数据\"}";
        }
        try {
            Map<String, Object> args = new HashMap<>();
            if (argumentsJson != null && !argumentsJson.isBlank()) {
                args = OBJECT_MAPPER.readValue(argumentsJson, new TypeReference<Map<String, Object>>() {});
            }

            String orderNo = (String) args.get("orderNo");
            String operatorName = (String) args.get("operatorName");
            String status = (String) args.get("status");
            Boolean queryItems = (Boolean) args.get("queryItems");

            DateTimeFormatter dtf = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
            List<Map<String, Object>> resultList = new ArrayList<>();

            TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
            String currentUserId = UserContext.userId();

            // ── 工人自助模式：只允许查本人数据，安全隔离 ──
            if (!aiAgentToolAccessService.hasManagerAccess() && currentUserId != null) {
                QueryWrapper<PayrollSettlementItem> selfQuery = new QueryWrapper<>();
                selfQuery.eq("operator_id", currentUserId);
                selfQuery.eq("tenant_id", tenantId);
                if (orderNo != null && !orderNo.isBlank()) {
                    selfQuery.eq("order_no", orderNo);
                }
                selfQuery.orderByDesc("create_time");
                selfQuery.last("LIMIT 15");

                List<PayrollSettlementItem> selfItems = payrollSettlementItemService.list(selfQuery);
                if (selfItems.isEmpty()) {
                    return "{\"message\": \"暂无您的计件工资明细，请联系管理员确认是否已录入结算单\"}";
                }

                java.math.BigDecimal totalEarned = selfItems.stream()
                        .map(i -> i.getTotalAmount() != null ? i.getTotalAmount() : java.math.BigDecimal.ZERO)
                        .reduce(java.math.BigDecimal.ZERO, java.math.BigDecimal::add);

                List<Map<String, Object>> selfDtos = new ArrayList<>();
                for (PayrollSettlementItem item : selfItems) {
                    Map<String, Object> dto = new HashMap<>();
                    dto.put("orderNo", item.getOrderNo());
                    dto.put("styleNo", item.getStyleNo());
                    dto.put("processName", item.getProcessName());
                    dto.put("quantity", item.getQuantity());
                    dto.put("unitPrice", item.getUnitPrice());
                    dto.put("totalAmount", item.getTotalAmount());
                    if (item.getCreateTime() != null) {
                        dto.put("date", item.getCreateTime().format(dtf));
                    }
                    selfDtos.add(dto);
                }

                Map<String, Object> selfResult = new HashMap<>();
                selfResult.put("employeeName", selfItems.get(0).getOperatorName());
                selfResult.put("totalEarned", totalEarned);
                selfResult.put("recordCount", selfItems.size());
                selfResult.put("recentItems", selfDtos);
                return OBJECT_MAPPER.writeValueAsString(selfResult);
            }

            // ── 管理员 / 跟单员完整查询路径 ──
            if (operatorName != null && !operatorName.isBlank()) {
                QueryWrapper<PayrollSettlementItem> itemQuery = new QueryWrapper<>();
                itemQuery.like("operator_name", operatorName);
                if (orderNo != null && !orderNo.isBlank()) {
                    itemQuery.eq("order_no", orderNo);
                }
                itemQuery.eq("tenant_id", tenantId);
                itemQuery.orderByDesc("create_time");
                itemQuery.last("LIMIT 15");

                List<PayrollSettlementItem> items = payrollSettlementItemService.list(itemQuery);
                if (items.isEmpty()) {
                    return "{\"message\": \"未查询到该员工的计件明细\"}";
                }

                Map<String, Object> resultWrap = new HashMap<>();
                List<Map<String, Object>> itemDtos = new ArrayList<>();
                for (PayrollSettlementItem item : items) {
                    Map<String, Object> itemDto = new HashMap<>();
                    itemDto.put("settlementId", item.getSettlementId());
                    itemDto.put("orderNo", item.getOrderNo());
                    itemDto.put("processName", item.getProcessName());
                    itemDto.put("quantity", item.getQuantity());
                    itemDto.put("unitPrice", item.getUnitPrice());
                    itemDto.put("totalAmount", item.getTotalAmount());
                    itemDtos.add(itemDto);
                }
                resultWrap.put("employeeName", operatorName);
                resultWrap.put("recentItems", itemDtos);
                return OBJECT_MAPPER.writeValueAsString(resultWrap);

            } else {
                // 按结算单维度查询
                QueryWrapper<PayrollSettlement> query = new QueryWrapper<>();
                if (orderNo != null && !orderNo.isBlank()) {
                    query.eq("order_no", orderNo);
                }
                if (status != null && !status.isBlank()) {
                    query.eq("status", status);
                }
                query.eq("tenant_id", tenantId);
                query.orderByDesc("create_time");
                query.last("LIMIT 5");

                List<PayrollSettlement> settlements = payrollSettlementService.list(query);
                if (settlements.isEmpty()) {
                    return "{\"message\": \"未查询到符合条件的工资结算单\"}";
                }

                for (PayrollSettlement s : settlements) {
                    Map<String, Object> dto = new HashMap<>();
                    dto.put("settlementNo", s.getSettlementNo());
                    dto.put("orderNo", s.getOrderNo());
                    dto.put("status", s.getStatus());
                    dto.put("totalQuantity", s.getTotalQuantity());
                    dto.put("totalAmount", s.getTotalAmount());
                    if (s.getCreateTime() != null) {
                        dto.put("createTime", s.getCreateTime().format(dtf));
                    }

                    if (Boolean.TRUE.equals(queryItems)) {
                        QueryWrapper<PayrollSettlementItem> iQuery = new QueryWrapper<>();
                        iQuery.eq("settlement_id", s.getId()).eq("tenant_id", tenantId);
                        List<PayrollSettlementItem> items = payrollSettlementItemService.list(iQuery);
                        List<Map<String, Object>> itemDtos = new ArrayList<>();
                        for (PayrollSettlementItem item : items) {
                            Map<String, Object> itemDto = new HashMap<>();
                            itemDto.put("operatorName", item.getOperatorName());
                            itemDto.put("processName", item.getProcessName());
                            itemDto.put("totalAmount", item.getTotalAmount());
                            itemDtos.add(itemDto);
                        }
                        dto.put("items", itemDtos);
                    }
                    resultList.add(dto);
                }
                return OBJECT_MAPPER.writeValueAsString(resultList);
            }
        } catch (JsonProcessingException e) {
            log.error("Tool execution failed: parse json error", e);
            return "{\"error\": \"参数解析异常\"}";
        } catch (Exception e) {
            log.error("Tool execution failed", e);
            return "{\"error\": \"查询失败: " + e.getMessage() + "\"}";
        }
    }
}
