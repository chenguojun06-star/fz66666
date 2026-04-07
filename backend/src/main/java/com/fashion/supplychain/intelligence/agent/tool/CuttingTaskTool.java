package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import com.fashion.supplychain.production.entity.CuttingTask;
import com.fashion.supplychain.production.orchestration.CuttingTaskOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * 裁剪单创建工具 — 让管理者通过小云AI对话快速创建裁剪任务
 * 支持操作：create(创建裁剪单)
 * 前置条件：需提供款号+颜色尺码数量
 */
@Slf4j
@Component
public class CuttingTaskTool implements AgentTool {

    @Autowired
    private CuttingTaskOrchestrator cuttingTaskOrchestrator;

    @Autowired
    private AiAgentToolAccessService aiAgentToolAccessService;

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Override
    public String getName() {
        return "tool_cutting_task_create";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();

        Map<String, Object> styleNo = new LinkedHashMap<>();
        styleNo.put("type", "string");
        styleNo.put("description", "款号（必填），例如 FZ2024001");
        properties.put("styleNo", styleNo);

        Map<String, Object> orderNo = new LinkedHashMap<>();
        orderNo.put("type", "string");
        orderNo.put("description", "生产订单号（可选，不填则自动生成CUT前缀号）");
        properties.put("orderNo", orderNo);

        Map<String, Object> factoryType = new LinkedHashMap<>();
        factoryType.put("type", "string");
        factoryType.put("description", "工厂类型：INTERNAL(内部车间) 或 EXTERNAL(外发工厂)，不填自动推断");
        properties.put("factoryType", factoryType);

        Map<String, Object> factoryId = new LinkedHashMap<>();
        factoryId.put("type", "string");
        factoryId.put("description", "外发工厂ID（factoryType=EXTERNAL时必填）");
        properties.put("factoryId", factoryId);

        Map<String, Object> factoryName = new LinkedHashMap<>();
        factoryName.put("type", "string");
        factoryName.put("description", "外发工厂名称");
        properties.put("factoryName", factoryName);

        Map<String, Object> orgUnitId = new LinkedHashMap<>();
        orgUnitId.put("type", "string");
        orgUnitId.put("description", "内部生产组/车间ID（factoryType=INTERNAL时必填）");
        properties.put("orgUnitId", orgUnitId);

        Map<String, Object> orderDate = new LinkedHashMap<>();
        orderDate.put("type", "string");
        orderDate.put("description", "下单日期，格式 yyyy-MM-dd，不填默认今天");
        properties.put("orderDate", orderDate);

        Map<String, Object> deliveryDate = new LinkedHashMap<>();
        deliveryDate.put("type", "string");
        deliveryDate.put("description", "交货日期，格式 yyyy-MM-dd");
        properties.put("deliveryDate", deliveryDate);

        Map<String, Object> orderLines = new LinkedHashMap<>();
        orderLines.put("type", "array");
        orderLines.put("description", "颜色尺码数量明细（必填），每项包含 color(颜色)、size(尺码)、quantity(数量)");
        properties.put("orderLines", orderLines);

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("裁剪单创建工具。当用户说'帮我建一个裁剪单'、'新增裁剪任务 款号XXX'、'开一个裁剪单'时调用。" +
                "必须提供款号和至少一行颜色+尺码+数量。");

        AiTool.AiParameters parameters = new AiTool.AiParameters();
        parameters.setProperties(properties);
        parameters.setRequired(List.of("styleNo", "orderLines"));
        function.setParameters(parameters);
        tool.setFunction(function);
        return tool;
    }

    @Override
    public String execute(String argumentsJson) throws Exception {
        if (!aiAgentToolAccessService.hasManagerAccess()) {
            return MAPPER.writeValueAsString(Map.of("error", "当前角色无权执行该操作"));
        }
        Map<String, Object> args = MAPPER.readValue(argumentsJson, new TypeReference<>() {});

        String styleNo = (String) args.get("styleNo");
        if (styleNo == null || styleNo.isBlank()) {
            return MAPPER.writeValueAsString(Map.of("error", "请提供款号（styleNo）"));
        }

        Object orderLinesObj = args.get("orderLines");
        if (orderLinesObj == null) {
            return MAPPER.writeValueAsString(Map.of("error", "请提供至少一行颜色+尺码+数量（orderLines）"));
        }

        try {
            // 构建 body 参数直接传给 CuttingTaskOrchestrator.createCustom()
            Map<String, Object> body = new HashMap<>(args);
            CuttingTask task = cuttingTaskOrchestrator.createCustom(body);

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("success", true);
            result.put("message", "裁剪单创建成功");
            result.put("taskId", task.getId());
            result.put("orderNo", task.getProductionOrderNo());
            result.put("styleNo", task.getStyleNo());
            result.put("totalQuantity", task.getOrderQuantity());
            return MAPPER.writeValueAsString(result);

        } catch (IllegalArgumentException e) {
            return MAPPER.writeValueAsString(Map.of(
                    "error", "参数错误：" + e.getMessage()));
        } catch (IllegalStateException e) {
            return MAPPER.writeValueAsString(Map.of(
                    "success", false,
                    "message", e.getMessage()));
        }
    }
}
