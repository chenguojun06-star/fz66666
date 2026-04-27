package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.helper.StepWizardBuilder;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.orchestration.ProductWarehousingOrchestrator;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.stream.Collectors;

/**
 * 次品处理工具 — 让用户通过小云AI对话查看和处理次品（返修/报废），处理完成后即可质检。
 * 支持操作：
 *   list       — 查看当前待处理的次品列表
 *   start_repair — 标记菲号开始返修
 *   complete_repair — 标记返修完成，进入待质检
 *   scrap      — 标记菲号报废
 */
@Slf4j
@Component
public class DefectiveBoardTool implements AgentTool {

    @Autowired
    private ProductWarehousingOrchestrator productWarehousingOrchestrator;

    @Autowired
    private ProductionOrderService productionOrderService;

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Override
    public String getName() {
        return "tool_defective_board";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();

        Map<String, Object> action = new LinkedHashMap<>();
        action.put("type", "string");
        action.put("enum", List.of("list", "start_repair", "complete_repair", "scrap"));
        action.put("description", "操作类型：list=查看次品列表，start_repair=开始返修，complete_repair=返修完成（进入待质检），scrap=报废");
        properties.put("action", action);

        Map<String, Object> bundleId = new LinkedHashMap<>();
        bundleId.put("type", "string");
        bundleId.put("description", "菲号ID（start_repair/complete_repair/scrap时必填）");
        properties.put("bundleId", bundleId);

        Map<String, Object> operatorName = new LinkedHashMap<>();
        operatorName.put("type", "string");
        operatorName.put("description", "返修操作人姓名（start_repair时可选）");
        properties.put("operatorName", operatorName);

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("次品处理工具。当用户说'查看次品'、'有哪些次品要处理'、'开始返修'、'返修完成'、'报废这个菲号'时调用。" +
                "处理完成后AI会反馈结果，用户即可进行质检。支持双端（PC和小程序）使用。");

        AiTool.AiParameters parameters = new AiTool.AiParameters();
        parameters.setProperties(properties);
        parameters.setRequired(List.of("action"));
        function.setParameters(parameters);
        tool.setFunction(function);
        return tool;
    }

    @Override
    public String execute(String argumentsJson) throws Exception {
        TenantAssert.assertTenantContext();
        Map<String, Object> args = MAPPER.readValue(argumentsJson, new TypeReference<>() {});
        String action = (String) args.get("action");
        if (action == null || action.isBlank()) {
            Map<String, Object> wizard = StepWizardBuilder.build("defective_handle", "次品处理", "选择处理方式并指定菲号", "🔧", "确认处理", "处理次品",
                StepWizardBuilder.steps(
                    StepWizardBuilder.step("action", "选择操作", "选择对次品的处理方式",
                        StepWizardBuilder.selectField("action", "处理方式", true,
                            StepWizardBuilder.opt("开始返修","start_repair","将次品标记为返修中","🔧"),
                            StepWizardBuilder.opt("完成返修","complete_repair","返修完成重新入库","✅"),
                            StepWizardBuilder.opt("报废处理","scrap","次品报废出库","🗑️"))),
                    StepWizardBuilder.step("bundle", "指定菲号", "输入要处理的菲号ID",
                        StepWizardBuilder.textField("bundleId", "菲号ID", true, "输入菲号ID"))
                ));
            return MAPPER.writeValueAsString(StepWizardBuilder.wrapResult("请指定操作类型和菲号", true, List.of("action", "bundleId"), "请选择处理方式并指定菲号", wizard));
        }

        return switch (action) {
            case "list" -> executeList();
            case "start_repair" -> executeStartRepair(args);
            case "complete_repair" -> executeCompleteRepair(args);
            case "scrap" -> executeScrap(args);
            default -> MAPPER.writeValueAsString(Map.of("error", "未知操作：" + action));
        };
    }

    private String executeList() throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        List<Map<String, Object>> tasks = productWarehousingOrchestrator.listPendingRepairTasks(tenantId);

        // 工厂账号：只显示本工厂相关的次品
        String userFactoryId = UserContext.factoryId();
        if (userFactoryId != null && !tasks.isEmpty()) {
            Set<String> factoryOrderIds = new HashSet<>();
            for (Map<String, Object> task : tasks) {
                String orderId = (String) task.get("orderId");
                if (orderId != null) factoryOrderIds.add(orderId);
            }
            // 批量查订单，过滤出属于本工厂的
            if (!factoryOrderIds.isEmpty()) {
                Set<String> allowedOrderIds = productionOrderService.listByIds(factoryOrderIds).stream()
                        .filter(o -> userFactoryId.equals(o.getFactoryId()))
                        .map(o -> String.valueOf(o.getId()))
                        .collect(Collectors.toSet());
                tasks = tasks.stream()
                        .filter(t -> allowedOrderIds.contains(String.valueOf(t.get("orderId"))))
                        .collect(Collectors.toList());
            }
        }

        if (tasks.isEmpty()) {
            return MAPPER.writeValueAsString(Map.of(
                    "success", true,
                    "message", "当前没有待处理的次品，所有菲号状态正常 ✅",
                    "count", 0));
        }

        return MAPPER.writeValueAsString(Map.of(
                "success", true,
                "count", tasks.size(),
                "message", "共有 " + tasks.size() + " 个次品待处理",
                "items", tasks));
    }

    private String executeStartRepair(Map<String, Object> args) throws Exception {
        String bundleId = (String) args.get("bundleId");
        if (bundleId == null || bundleId.isBlank()) {
            return MAPPER.writeValueAsString(Map.of("error", "请提供菲号ID（bundleId）"));
        }
        String operatorName = (String) args.getOrDefault("operatorName", "");

        // 工厂账号隔离校验
        String factoryCheckError = checkFactoryIsolation(bundleId);
        if (factoryCheckError != null) return factoryCheckError;

        try {
            productWarehousingOrchestrator.startBundleRepair(bundleId.trim(), operatorName);
            return MAPPER.writeValueAsString(Map.of(
                    "success", true,
                    "message", "菲号已标记为「返修中」，返修完成后请告诉我"));
        } catch (IllegalArgumentException | IllegalStateException e) {
            return MAPPER.writeValueAsString(Map.of("success", false, "message", e.getMessage()));
        }
    }

    private String executeCompleteRepair(Map<String, Object> args) throws Exception {
        String bundleId = (String) args.get("bundleId");
        if (bundleId == null || bundleId.isBlank()) {
            return MAPPER.writeValueAsString(Map.of("error", "请提供菲号ID（bundleId）"));
        }

        String factoryCheckError = checkFactoryIsolation(bundleId);
        if (factoryCheckError != null) return factoryCheckError;

        try {
            productWarehousingOrchestrator.completeBundleRepair(bundleId.trim());
            return MAPPER.writeValueAsString(Map.of(
                    "success", true,
                    "message", "菲号返修已完成，状态已更新为「待质检」，现在可以进行质检了 ✅"));
        } catch (IllegalArgumentException | IllegalStateException e) {
            return MAPPER.writeValueAsString(Map.of("success", false, "message", e.getMessage()));
        }
    }

    private String executeScrap(Map<String, Object> args) throws Exception {
        String bundleId = (String) args.get("bundleId");
        if (bundleId == null || bundleId.isBlank()) {
            return MAPPER.writeValueAsString(Map.of("error", "请提供菲号ID（bundleId）"));
        }

        String factoryCheckError = checkFactoryIsolation(bundleId);
        if (factoryCheckError != null) return factoryCheckError;

        try {
            productWarehousingOrchestrator.scrapBundle(bundleId.trim());
            return MAPPER.writeValueAsString(Map.of(
                    "success", true,
                    "message", "菲号已标记为「报废」，不再进入质检流程"));
        } catch (IllegalArgumentException | IllegalStateException e) {
            return MAPPER.writeValueAsString(Map.of("success", false, "message", e.getMessage()));
        }
    }

    /**
     * 工厂账号隔离：检查菲号所属订单是否归属当前工厂
     */
    private String checkFactoryIsolation(String bundleId) throws Exception {
        String userFactoryId = UserContext.factoryId();
        if (userFactoryId == null) return null; // 非工厂账号，跳过检查

        // 通过 listPendingRepairTasks 获取的 orderId 查找订单归属
        List<Map<String, Object>> tasks = productWarehousingOrchestrator
                .listPendingRepairTasks(UserContext.tenantId());
        for (Map<String, Object> task : tasks) {
            if (bundleId.trim().equals(String.valueOf(task.get("bundleId")))) {
                String orderId = String.valueOf(task.get("orderId"));
                ProductionOrder order = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getId, orderId)
                        .eq(ProductionOrder::getTenantId, UserContext.tenantId())
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .one();
                if (order != null && !userFactoryId.equals(order.getFactoryId())) {
                    return MAPPER.writeValueAsString(Map.of("error", "该次品不属于您的工厂，无权操作"));
                }
                return null; // 校验通过
            }
        }
        return null; // bundleId 不在待处理列表中，后续操作会自行报错
    }
}
