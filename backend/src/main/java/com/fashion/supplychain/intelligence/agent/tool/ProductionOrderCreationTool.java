package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.orchestration.ProductionOrderOrchestrator;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.entity.OrganizationUnit;
import com.fashion.supplychain.system.orchestration.SerialOrchestrator;
import com.fashion.supplychain.system.service.FactoryService;
import com.fashion.supplychain.system.service.OrganizationUnitService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * AI 完整建单工具。
 *
 * 目标：让用户在自然语言里直接给出“款式 / 工厂 / 颜色尺码数量 / 开工日期 / 交期”，
 * AI 就能按正式生产订单链路创建完整订单，而不是只落一个待补全草稿单。
 */
@Slf4j
@Component
public class ProductionOrderCreationTool implements AgentTool {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final String MATERIAL_PRICE_SOURCE = "物料采购系统";
    private static final String MATERIAL_PRICE_VERSION = "purchase.v1";

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private ProductionOrderOrchestrator productionOrderOrchestrator;

    @Autowired
    private FactoryService factoryService;

    @Autowired
    private OrganizationUnitService organizationUnitService;

    @Autowired
    private TemplateLibraryService templateLibraryService;

    @Autowired
    private SerialOrchestrator serialOrchestrator;

    @Override
    public String getName() {
        return "tool_create_production_order";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = buildPropertyDefinitions();

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("按正式生产订单链路创建完整订单。优先用于'帮我下单/创建订单/把某款下给某工厂'。如果款式、工厂、颜色尺码数量明细、计划开始时间、计划完成时间任一缺失，必须返回缺失项并要求继续补充，禁止创建残缺草稿单。");
        AiTool.AiParameters aiParams = new AiTool.AiParameters();
        aiParams.setProperties(properties);
        aiParams.setRequired(List.of());
        function.setParameters(aiParams);
        tool.setFunction(function);
        return tool;
    }

    private Map<String, Object> buildPropertyDefinitions() {
        Map<String, Object> properties = new HashMap<>();
        addProp(properties, "styleNo", "string", "款号（Style No），优先提供，例如：D2024001");
        addProp(properties, "styleName", "string", "款名，可替代款号用于匹配；若同名多条会要求用户确认");
        addProp(properties, "factoryName", "string", "工厂名称或内部生产组名称，例如：鑫达制衣厂 / 二车间");
        addProp(properties, "factoryId", "string", "外发工厂ID；如果已知可直接传");
        addProp(properties, "factoryType", "string", "工厂类型，可选值 INTERNAL / EXTERNAL");
        addProp(properties, "orgUnitId", "string", "内部生产组织节点ID；内部工厂场景优先传这个");
        addProp(properties, "orgUnitName", "string", "内部生产组织节点名称，例如：一车间 / 二组");
        addProp(properties, "plannedStartDate", "string", "计划开始时间，格式 yyyy-MM-dd 或 yyyy-MM-ddTHH:mm:ss");
        addProp(properties, "plannedEndDate", "string", "计划完成时间/交期，格式 yyyy-MM-dd 或 yyyy-MM-ddTHH:mm:ss");
        addProp(properties, "urgencyLevel", "string", "急单等级：urgent / normal");
        addProp(properties, "plateType", "string", "单型：FIRST / REORDER，或首单/翻单");
        addProp(properties, "orderBizType", "string", "下单类型：FOB / ODM / OEM / CMT");
        addProp(properties, "orderQuantity", "integer", "订单总数量；若已给出 orderLines 可不单独传");
        addProp(properties, "color", "string", "单色单码场景可直接提供颜色");
        addProp(properties, "size", "string", "单色单码场景可直接提供尺码");
        addProp(properties, "quantity", "integer", "单色单码场景可直接提供数量");
        properties.put("orderLines", buildOrderLinesProperty());
        addProp(properties, "merchandiser", "string", "跟单员姓名，可选");
        addProp(properties, "company", "string", "公司/客户名，可选");
        addProp(properties, "productCategory", "string", "品类，可选");
        addProp(properties, "patternMaker", "string", "纸样师姓名，可选");
        addProp(properties, "remark", "string", "订单备注（可选），例如：春季款，优先排期");
        return properties;
    }

    private void addProp(Map<String, Object> properties, String key, String type, String desc) {
        Map<String, Object> prop = new HashMap<>();
        prop.put("type", type);
        prop.put("description", desc);
        properties.put(key, prop);
    }

    private Map<String, Object> buildOrderLinesProperty() {
        Map<String, Object> orderLinesProp = new HashMap<>();
        orderLinesProp.put("type", "array");
        orderLinesProp.put("description", "订单明细数组，每条包含颜色、尺码、数量");
        Map<String, Object> itemSchema = new HashMap<>();
        itemSchema.put("type", "object");
        Map<String, Object> itemProps = new HashMap<>();
        itemProps.put("color", Map.of("type", "string", "description", "颜色，例如 红色"));
        itemProps.put("size", Map.of("type", "string", "description", "尺码，例如 M / XL"));
        itemProps.put("quantity", Map.of("type", "integer", "description", "数量，必须大于0"));
        itemSchema.put("properties", itemProps);
        itemSchema.put("required", List.of("color", "size", "quantity"));
        orderLinesProp.put("items", itemSchema);
        return orderLinesProp;
    }

    @Override
    public String execute(String argumentsJson) {
        try {
            JsonNode args = OBJECT_MAPPER.readTree(argumentsJson);
            String styleNo = text(args, "styleNo");
            String styleName = text(args, "styleName");
            String factoryName = text(args, "factoryName");
            String factoryId = text(args, "factoryId");
            String factoryType = normalizeFactoryType(text(args, "factoryType"));
            String orgUnitId = text(args, "orgUnitId");
            String orgUnitName = text(args, "orgUnitName");
            String plannedStartDateText = firstNonBlank(text(args, "plannedStartDate"), text(args, "startDate"));
            String plannedEndDateText = firstNonBlank(text(args, "plannedEndDate"), text(args, "deliveryDate"), text(args, "endDate"));

            List<Map<String, Object>> orderLines = resolveOrderLines(args);
            List<String> missingFields = new ArrayList<>();

            if (!StringUtils.hasText(styleNo) && !StringUtils.hasText(styleName)) {
                missingFields.add("款号或款名");
            }
            if (!StringUtils.hasText(factoryId)
                    && !StringUtils.hasText(factoryName)
                    && !StringUtils.hasText(orgUnitId)
                    && !StringUtils.hasText(orgUnitName)) {
                missingFields.add("加工厂/生产组");
            }
            if (orderLines.isEmpty()) {
                missingFields.add("颜色尺码数量明细");
            }
            if (!StringUtils.hasText(plannedStartDateText)) {
                missingFields.add("计划开始时间");
            }
            if (!StringUtils.hasText(plannedEndDateText)) {
                missingFields.add("计划完成时间");
            }
            if (!missingFields.isEmpty()) {
                return buildMissingFieldResponse(missingFields);
            }

            TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
            String userId = UserContext.userId();
            String username = UserContext.username();

            StyleInfo style = resolveStyle(tenantId, styleNo, styleName);
            if (style == null) {
                return buildError("未找到匹配款式，请补充准确款号或更明确的款名");
            }

            LocalDateTime plannedStartDate = parseDateTime(plannedStartDateText, "计划开始时间");
            LocalDateTime plannedEndDate = parseDateTime(plannedEndDateText, "计划完成时间");
            if (plannedStartDate == null || plannedEndDate == null) {
                return buildError("日期格式错误，请使用 yyyy-MM-dd 或 yyyy-MM-ddTHH:mm:ss");
            }
            if (!plannedEndDate.isAfter(plannedStartDate)) {
                return buildError("计划完成时间必须晚于计划开始时间");
            }

            FactoryResolution factoryResolution = resolveFactory(tenantId, factoryType, factoryId, factoryName, orgUnitId, orgUnitName);
            if (!factoryResolution.success) {
                return buildError(factoryResolution.message);
            }

            int orderQuantity = orderLines.stream()
                    .map(row -> toPositiveInt(row.get("quantity")))
                    .filter(Objects::nonNull)
                    .mapToInt(Integer::intValue)
                    .sum();
            if (orderQuantity <= 0) {
                return buildError("订单数量必须大于0");
            }

            ProductionOrder order = buildProductionOrder(tenantId, userId, username, style,
                    factoryResolution, orderLines, args, plannedStartDate, plannedEndDate);

            boolean saved = productionOrderOrchestrator.saveOrUpdateOrder(order);
            if (!saved || !StringUtils.hasText(order.getId())) {
                return buildError("创建订单失败，请稍后重试");
            }

            log.info("[ProductionOrderCreationTool] AI完整建单成功 styleNo={} qty={} orderId={} orderNo={} factory={}",
                    order.getStyleNo(), orderQuantity, order.getId(), order.getOrderNo(), order.getFactoryName());

            return buildSuccessResult(order, orderQuantity, orderLines, plannedStartDate, plannedEndDate);

        } catch (Exception e) {
            log.error("[ProductionOrderCreationTool] 建单异常", e);
            return "{\"error\": \"建单失败: " + e.getMessage() + "\"}";
        }
    }

    private String buildMissingFieldResponse(List<String> missingFields) throws Exception {
        Map<String, Object> result = new HashMap<>();
        result.put("error", "建单信息不完整，请继续补充：" + String.join("、", missingFields));
        result.put("needMoreInfo", true);
        result.put("missingFields", missingFields);
        result.put("question", "请继续补充「款号/款名、加工厂、颜色-尺码-数量明细、计划开始时间、计划完成时间」。示例：D2024001 红色M码100件、红色L码200件，外发给鑫达制衣厂，2026-03-20开工，2026-03-28交货。");
        result.put("stepWizard", buildOrderCreationWizard());
        return OBJECT_MAPPER.writeValueAsString(result);
    }

    private Map<String, Object> buildOrderCreationWizard() {
        Map<String, Object> wizard = new LinkedHashMap<>();
        wizard.put("wizardType", "create_production_order");
        wizard.put("title", "创建生产订单");
        wizard.put("desc", "按步骤填写信息，快速完成下单");
        wizard.put("icon", "📋");
        wizard.put("submitLabel", "确认下单");
        wizard.put("submitCommand", "下单");
        wizard.put("steps", buildWizardSteps());
        return wizard;
    }

    private List<Map<String, Object>> buildWizardSteps() {
        List<Map<String, Object>> steps = new ArrayList<>();
        steps.add(buildFactoryStep());
        steps.add(buildColorSizeStep());
        steps.add(buildScheduleStep());
        return steps;
    }

    private Map<String, Object> buildFactoryStep() {
        Map<String, Object> step = new LinkedHashMap<>();
        step.put("stepKey", "factory");
        step.put("title", "选择工厂");
        step.put("desc", "选择内部生产组或外发加工厂");
        List<Map<String, Object>> fields = new ArrayList<>();
        Map<String, Object> factoryTypeField = new LinkedHashMap<>();
        factoryTypeField.put("key", "factoryType");
        factoryTypeField.put("label", "工厂类型");
        factoryTypeField.put("inputType", "select");
        factoryTypeField.put("required", true);
        List<Map<String, String>> opts = new ArrayList<>();
        opts.add(Map.of("label", "内部工厂", "value", "INTERNAL", "desc", "自有生产组", "icon", "🏭"));
        opts.add(Map.of("label", "外发工厂", "value", "EXTERNAL", "desc", "外部加工厂", "icon", "🏭"));
        factoryTypeField.put("options", opts);
        fields.add(factoryTypeField);
        Map<String, Object> factoryNameField = new LinkedHashMap<>();
        factoryNameField.put("key", "factoryName");
        factoryNameField.put("label", "工厂名称");
        factoryNameField.put("inputType", "text");
        factoryNameField.put("placeholder", "输入工厂名称搜索");
        factoryNameField.put("required", true);
        fields.add(factoryNameField);
        step.put("fields", fields);
        return step;
    }

    private Map<String, Object> buildColorSizeStep() {
        Map<String, Object> step = new LinkedHashMap<>();
        step.put("stepKey", "color_size");
        step.put("title", "颜色尺码");
        step.put("desc", "选择颜色和尺码，填写数量");
        List<Map<String, Object>> fields = new ArrayList<>();
        Map<String, Object> colorField = new LinkedHashMap<>();
        colorField.put("key", "colors");
        colorField.put("label", "颜色（可多选）");
        colorField.put("inputType", "multi_select");
        colorField.put("required", true);
        List<Map<String, String>> colorOpts = new ArrayList<>();
        for (String c : List.of("黑色", "白色", "红色", "蓝色", "灰色", "绿色", "黄色", "粉色")) {
            colorOpts.add(Map.of("label", c, "value", c));
        }
        colorField.put("options", colorOpts);
        fields.add(colorField);
        Map<String, Object> sizeField = new LinkedHashMap<>();
        sizeField.put("key", "sizes");
        sizeField.put("label", "尺码（可多选）");
        sizeField.put("inputType", "multi_select");
        sizeField.put("required", true);
        List<Map<String, String>> sizeOpts = new ArrayList<>();
        for (String s : List.of("XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL")) {
            sizeOpts.add(Map.of("label", s, "value", s));
        }
        sizeField.put("options", sizeOpts);
        fields.add(sizeField);
        Map<String, Object> qtyField = new LinkedHashMap<>();
        qtyField.put("key", "quantity");
        qtyField.put("label", "每色每码数量");
        qtyField.put("inputType", "number");
        qtyField.put("placeholder", "如每色每码100件");
        qtyField.put("required", true);
        qtyField.put("min", 1);
        fields.add(qtyField);
        step.put("fields", fields);
        return step;
    }

    private Map<String, Object> buildScheduleStep() {
        Map<String, Object> step = new LinkedHashMap<>();
        step.put("stepKey", "schedule");
        step.put("title", "计划日期");
        step.put("desc", "设置生产开始和完成时间");
        List<Map<String, Object>> fields = new ArrayList<>();
        Map<String, Object> startDateField = new LinkedHashMap<>();
        startDateField.put("key", "plannedStartDate");
        startDateField.put("label", "计划开始时间");
        startDateField.put("inputType", "date");
        startDateField.put("required", true);
        fields.add(startDateField);
        Map<String, Object> endDateField = new LinkedHashMap<>();
        endDateField.put("key", "plannedEndDate");
        endDateField.put("label", "计划完成时间");
        endDateField.put("inputType", "date");
        endDateField.put("required", true);
        fields.add(endDateField);
        step.put("fields", fields);
        return step;
    }

    private String buildError(String message) {
        try {
            return OBJECT_MAPPER.writeValueAsString(Map.of("error", message));
        } catch (Exception e) {
            return "{\"error\": \"" + message + "\"}";
        }
    }

    private StyleInfo resolveStyle(Long tenantId, String styleNo, String styleName) {
        if (StringUtils.hasText(styleNo)) {
            StyleInfo exact = styleInfoService.getOne(new QueryWrapper<StyleInfo>()
                    .eq("style_no", styleNo.trim())
                    .eq("tenant_id", tenantId)
                    .eq("delete_flag", 0)
                    .last("LIMIT 1"), false);
            if (exact != null) {
                return exact;
            }
        }
        String keyword = firstNonBlank(styleName, styleNo);
        if (!StringUtils.hasText(keyword)) {
            return null;
        }
        List<StyleInfo> candidates = styleInfoService.list(new QueryWrapper<StyleInfo>()
                .eq("tenant_id", tenantId)
                .eq("delete_flag", 0)
                .and(w -> w.like("style_name", keyword.trim()).or().like("style_no", keyword.trim())));
        if (candidates == null || candidates.isEmpty()) {
            return null;
        }
        candidates = new ArrayList<>(candidates);
        candidates.sort(Comparator.comparing((StyleInfo item) -> !keyword.trim().equalsIgnoreCase(String.valueOf(item.getStyleNo())))
                .thenComparing(item -> !keyword.trim().equalsIgnoreCase(String.valueOf(item.getStyleName()))));
        if (candidates.size() > 1) {
            StyleInfo best = candidates.get(0);
            String bestKey = firstNonBlank(best.getStyleNo(), best.getStyleName());
            if (!keyword.trim().equalsIgnoreCase(bestKey)) {
                return null;
            }
        }
        return candidates.get(0);
    }

    private FactoryResolution resolveFactory(Long tenantId, String factoryType, String factoryId, String factoryName,
                                             String orgUnitId, String orgUnitName) {
        if ("INTERNAL".equals(factoryType) || StringUtils.hasText(orgUnitId) || StringUtils.hasText(orgUnitName)) {
            return resolveInternalFactory(tenantId, orgUnitId, firstNonBlank(orgUnitName, factoryName));
        }
        if ("EXTERNAL".equals(factoryType) || StringUtils.hasText(factoryId) || StringUtils.hasText(factoryName)) {
            FactoryResolution external = resolveExternalFactory(tenantId, factoryId, factoryName);
            if (external.success || "EXTERNAL".equals(factoryType) || StringUtils.hasText(factoryId)) {
                return external;
            }
            FactoryResolution internalFallback = resolveInternalFactory(tenantId, orgUnitId, factoryName);
            if (internalFallback.success) {
                return internalFallback;
            }
            return external;
        }
        return FactoryResolution.fail("请指定加工厂或内部生产组");
    }

    private FactoryResolution resolveExternalFactory(Long tenantId, String factoryId, String factoryName) {
        if (StringUtils.hasText(factoryId)) {
            Factory factory = factoryService.lambdaQuery().eq(Factory::getId, factoryId.trim()).eq(Factory::getTenantId, tenantId).one();
            if (factory != null && Objects.equals(factory.getTenantId(), tenantId) && !isDeleted(factory.getDeleteFlag())) {
                return FactoryResolution.external(factory.getId(), factory.getFactoryName());
            }
            return FactoryResolution.fail("未找到指定的外发工厂，请确认工厂ID是否正确");
        }
        if (!StringUtils.hasText(factoryName)) {
            return FactoryResolution.fail("请提供外发工厂名称");
        }
        List<Factory> factories = factoryService.list(new QueryWrapper<Factory>()
                .eq("tenant_id", tenantId)
                .eq("delete_flag", 0)
                .and(w -> w.eq("factory_name", factoryName.trim()).or().like("factory_name", factoryName.trim())));
        if (factories == null || factories.isEmpty()) {
            return FactoryResolution.fail("未找到匹配工厂，请补充更准确的工厂名称");
        }
        factories = new ArrayList<>(factories);
        factories.sort(Comparator.comparing((Factory item) -> !factoryName.trim().equalsIgnoreCase(String.valueOf(item.getFactoryName()))));
        Factory selected = factories.get(0);
        if (factories.size() > 1 && !factoryName.trim().equalsIgnoreCase(String.valueOf(selected.getFactoryName()))) {
            String names = factories.stream().limit(5).map(Factory::getFactoryName).collect(Collectors.joining("、"));
            return FactoryResolution.fail("匹配到多个工厂，请更明确指定：" + names);
        }
        return FactoryResolution.external(selected.getId(), selected.getFactoryName());
    }

    private FactoryResolution resolveInternalFactory(Long tenantId, String orgUnitId, String orgUnitName) {
        if (StringUtils.hasText(orgUnitId)) {
            OrganizationUnit unit = organizationUnitService.lambdaQuery().eq(OrganizationUnit::getId, orgUnitId.trim()).eq(OrganizationUnit::getTenantId, tenantId).one();
            if (unit != null && Objects.equals(unit.getTenantId(), tenantId) && !isDeleted(unit.getDeleteFlag())) {
                return FactoryResolution.internal(unit.getId(), unit.getNodeName());
            }
            return FactoryResolution.fail("未找到指定的内部生产组，请确认组织节点ID是否正确");
        }
        if (!StringUtils.hasText(orgUnitName)) {
            return FactoryResolution.fail("请提供内部生产组名称");
        }
        List<OrganizationUnit> units = organizationUnitService.list(new QueryWrapper<OrganizationUnit>()
                .eq("tenant_id", tenantId)
                .eq("delete_flag", 0)
                .and(w -> w.eq("node_name", orgUnitName.trim()).or().like("node_name", orgUnitName.trim())));
        if (units == null || units.isEmpty()) {
            return FactoryResolution.fail("未找到匹配的内部生产组，请补充更准确的组织名称");
        }
        units = new ArrayList<>(units);
        units.sort(Comparator.comparing((OrganizationUnit item) -> !orgUnitName.trim().equalsIgnoreCase(String.valueOf(item.getNodeName()))));
        OrganizationUnit selected = units.get(0);
        if (units.size() > 1 && !orgUnitName.trim().equalsIgnoreCase(String.valueOf(selected.getNodeName()))) {
            String names = units.stream().limit(5).map(OrganizationUnit::getNodeName).collect(Collectors.joining("、"));
            return FactoryResolution.fail("匹配到多个内部生产组，请更明确指定：" + names);
        }
        return FactoryResolution.internal(selected.getId(), selected.getNodeName());
    }

    private List<Map<String, Object>> resolveOrderLines(JsonNode args) {
        List<Map<String, Object>> lines = new ArrayList<>();
        JsonNode arr = args.get("orderLines");
        if (arr != null && arr.isArray()) {
            for (JsonNode item : arr) {
                String color = text(item, "color");
                String size = text(item, "size");
                Integer quantity = toPositiveInt(item.get("quantity"));
                if (StringUtils.hasText(color) && StringUtils.hasText(size) && quantity != null && quantity > 0) {
                    lines.add(Map.of("color", color.trim(), "size", size.trim(), "quantity", quantity));
                }
            }
        }
        if (!lines.isEmpty()) {
            return lines;
        }
        String color = text(args, "color");
        String size = text(args, "size");
        Integer quantity = toPositiveInt(firstNode(args, "quantity", "orderQuantity"));
        if (StringUtils.hasText(color) && StringUtils.hasText(size) && quantity != null && quantity > 0) {
            lines.add(Map.of("color", color.trim(), "size", size.trim(), "quantity", quantity));
        }
        return lines;
    }

    private String buildOrderDetails(List<Map<String, Object>> orderLines) throws Exception {
        List<Map<String, Object>> lines = new ArrayList<>();
        String now = LocalDateTime.now().toString();
        for (Map<String, Object> line : orderLines) {
            Map<String, Object> row = new HashMap<>();
            row.put("color", line.get("color"));
            row.put("size", line.get("size"));
            row.put("quantity", line.get("quantity"));
            row.put("materialPriceSource", MATERIAL_PRICE_SOURCE);
            row.put("materialPriceAcquiredAt", now);
            row.put("materialPriceVersion", MATERIAL_PRICE_VERSION);
            lines.add(row);
        }
        return OBJECT_MAPPER.writeValueAsString(lines);
    }

    private String buildProgressWorkflowJson(String styleNo) throws Exception {
        List<Map<String, Object>> templateNodes = templateLibraryService.resolveProgressNodeUnitPrices(styleNo);
        List<Map<String, Object>> nodes = new ArrayList<>();
        if (templateNodes != null) {
            for (int idx = 0; idx < templateNodes.size(); idx++) {
                Map<String, Object> row = templateNodes.get(idx);
                if (row == null || row.isEmpty()) {
                    continue;
                }
                String name = firstNonBlank(asText(row.get("name")), asText(row.get("processName")));
                if (!StringUtils.hasText(name)) {
                    continue;
                }
                String id = firstNonBlank(asText(row.get("id")), asText(row.get("processCode")), name);
                Number price = asNumber(row.get("unitPrice"));
                nodes.add(Map.of(
                        "id", id,
                        "name", name,
                        "unitPrice", price == null ? 0 : Math.max(0, price.doubleValue())
                ));
            }
        }
        if (nodes.isEmpty()) {
            nodes.add(Map.of("id", "purchase", "name", "采购", "unitPrice", 0));
            nodes.add(Map.of("id", "cutting", "name", "裁剪", "unitPrice", 0));
            nodes.add(Map.of("id", "sewing", "name", "车缝", "unitPrice", 0));
            nodes.add(Map.of("id", "pressing", "name", "大烫", "unitPrice", 0));
            nodes.add(Map.of("id", "quality", "name", "质检", "unitPrice", 0));
            nodes.add(Map.of("id", "secondary-process", "name", "二次工艺", "unitPrice", 0));
            nodes.add(Map.of("id", "packaging", "name", "包装", "unitPrice", 0));
            nodes.add(Map.of("id", "warehousing", "name", "入库", "unitPrice", 0));
        }
        return OBJECT_MAPPER.writeValueAsString(Map.of("nodes", nodes));
    }

    private ProductionOrder buildProductionOrder(Long tenantId, String userId, String username, StyleInfo style,
                                                  FactoryResolution factoryResolution, List<Map<String, Object>> orderLines,
                                                  JsonNode args, LocalDateTime plannedStartDate, LocalDateTime plannedEndDate) throws Exception {
        int orderQuantity = orderLines.stream()
                .map(row -> toPositiveInt(row.get("quantity")))
                .filter(Objects::nonNull)
                .mapToInt(Integer::intValue)
                .sum();
        ProductionOrder order = new ProductionOrder();
        order.setOrderNo(serialOrchestrator.generate("ORDER_NO"));
        order.setStyleId(String.valueOf(style.getId()));
        order.setStyleNo(style.getStyleNo());
        order.setStyleName(style.getStyleName());
        order.setSkc(style.getSkc());
        order.setOrderQuantity(orderQuantity);
        order.setColor(joinDistinct(orderLines, "color"));
        order.setSize(joinDistinct(orderLines, "size"));
        order.setOrderDetails(buildOrderDetails(orderLines));
        order.setFactoryId(factoryResolution.factoryId);
        order.setFactoryName(factoryResolution.factoryName);
        order.setFactoryType(factoryResolution.factoryType);
        order.setOrgUnitId(factoryResolution.orgUnitId);
        order.setUrgencyLevel(normalizeUrgency(text(args, "urgencyLevel")));
        order.setPlateType(normalizePlateType(text(args, "plateType")));
        order.setOrderBizType(normalizeOrderBizType(text(args, "orderBizType")));
        order.setMerchandiser(emptyToNull(text(args, "merchandiser")));
        order.setCompany(emptyToNull(text(args, "company")));
        order.setProductCategory(emptyToNull(text(args, "productCategory")));
        order.setPatternMaker(emptyToNull(text(args, "patternMaker")));
        order.setRemarks(emptyToNull(text(args, "remark")));
        order.setPlannedStartDate(plannedStartDate);
        order.setPlannedEndDate(plannedEndDate);
        order.setProgressWorkflowJson(buildProgressWorkflowJson(style.getStyleNo()));
        order.setStatus("pending");
        order.setProductionProgress(0);
        order.setMaterialArrivalRate(0);
        order.setDeleteFlag(0);
        order.setTenantId(tenantId);
        order.setCreatedById(userId);
        order.setCreatedByName(username);
        return order;
    }

    private String buildSuccessResult(ProductionOrder order, int orderQuantity, List<Map<String, Object>> orderLines,
                                       LocalDateTime plannedStartDate, LocalDateTime plannedEndDate) throws Exception {
        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("orderId", order.getId());
        result.put("orderNo", order.getOrderNo());
        result.put("styleNo", order.getStyleNo());
        result.put("styleName", order.getStyleName());
        result.put("orderQuantity", orderQuantity);
        result.put("factoryName", order.getFactoryName());
        result.put("factoryType", order.getFactoryType());
        result.put("plannedStartDate", plannedStartDate.toString());
        result.put("plannedEndDate", plannedEndDate.toString());
        result.put("orderLineCount", orderLines.size());
        result.put("status", order.getStatus());
        result.put("statusLabel", "待生产");
        result.put("message", "订单已按完整链路创建成功，已包含工厂、颜色尺码数量明细、计划日期和工序工作流，可直接进入后续生产。");
        return OBJECT_MAPPER.writeValueAsString(result);
    }

    private String joinDistinct(List<Map<String, Object>> orderLines, String field) {
        return orderLines.stream()
                .map(row -> asText(row.get(field)))
                .filter(StringUtils::hasText)
                .map(String::trim)
                .distinct()
                .collect(Collectors.joining(","));
    }

    private String normalizeFactoryType(String raw) {
        String text = raw == null ? "" : raw.trim().toUpperCase();
        if ("INTERNAL".equals(text) || "内部".equals(raw)) {
            return "INTERNAL";
        }
        if ("EXTERNAL".equals(text) || "外部".equals(raw) || "外发".equals(raw)) {
            return "EXTERNAL";
        }
        return "";
    }

    private String normalizeUrgency(String raw) {
        String text = raw == null ? "" : raw.trim().toLowerCase();
        return "urgent".equals(text) || "急单".equals(raw) ? "urgent" : "normal";
    }

    private String normalizePlateType(String raw) {
        if (!StringUtils.hasText(raw)) {
            return null;
        }
        String text = raw.trim().toUpperCase();
        if ("首单".equals(raw.trim())) {
            return "FIRST";
        }
        if ("翻单".equals(raw.trim())) {
            return "REORDER";
        }
        return text;
    }

    private String normalizeOrderBizType(String raw) {
        if (!StringUtils.hasText(raw)) {
            return null;
        }
        String text = raw.trim().toUpperCase();
        return List.of("FOB", "ODM", "OEM", "CMT").contains(text) ? text : null;
    }

    private LocalDateTime parseDateTime(String text, String label) {
        if (!StringUtils.hasText(text)) {
            return null;
        }
        String value = text.trim();
        try {
            if (value.length() == 10) {
                return java.time.LocalDate.parse(value).atTime("计划完成时间".equals(label) ? 18 : 9, 0, 0);
            }
            return LocalDateTime.parse(value);
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    private String text(JsonNode node, String field) {
        return node != null && node.hasNonNull(field) ? node.get(field).asText("").trim() : "";
    }

    private JsonNode firstNode(JsonNode node, String... fields) {
        if (node == null || fields == null) {
            return null;
        }
        for (String field : fields) {
            if (node.has(field) && !node.get(field).isNull()) {
                return node.get(field);
            }
        }
        return null;
    }

    private Integer toPositiveInt(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        if (node.isInt() || node.isLong()) {
            return node.asInt();
        }
        try {
            return Integer.parseInt(node.asText("0").trim());
        } catch (Exception e) {
            log.debug("[OrderCreation] toInt解析失败: node={}", node);
            return null;
        }
    }

    private Integer toPositiveInt(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return Integer.parseInt(String.valueOf(value).trim());
        } catch (Exception e) {
            return null;
        }
    }

    private String asText(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private Number asNumber(Object value) {
        if (value instanceof Number) {
            return (Number) value;
        }
        if (value == null) {
            return null;
        }
        try {
            return Double.parseDouble(String.valueOf(value).trim());
        } catch (Exception e) {
            return null;
        }
    }

    private String firstNonBlank(String... values) {
        if (values == null) {
            return "";
        }
        for (String value : values) {
            if (StringUtils.hasText(value)) {
                return value.trim();
            }
        }
        return "";
    }

    private String emptyToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private boolean isDeleted(Integer deleteFlag) {
        return deleteFlag != null && deleteFlag == 1;
    }

    private static final class FactoryResolution {
        private final boolean success;
        private final String message;
        private final String factoryId;
        private final String factoryName;
        private final String factoryType;
        private final String orgUnitId;

        private FactoryResolution(boolean success, String message, String factoryId, String factoryName,
                                  String factoryType, String orgUnitId) {
            this.success = success;
            this.message = message;
            this.factoryId = factoryId;
            this.factoryName = factoryName;
            this.factoryType = factoryType;
            this.orgUnitId = orgUnitId;
        }

        private static FactoryResolution fail(String message) {
            return new FactoryResolution(false, message, null, null, null, null);
        }

        private static FactoryResolution external(String factoryId, String factoryName) {
            return new FactoryResolution(true, null, factoryId, factoryName, "EXTERNAL", null);
        }

        private static FactoryResolution internal(String orgUnitId, String factoryName) {
            return new FactoryResolution(true, null, null, factoryName, "INTERNAL", orgUnitId);
        }
    }
}
