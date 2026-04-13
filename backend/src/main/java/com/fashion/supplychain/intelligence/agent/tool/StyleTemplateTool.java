package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleSizePrice;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleSizePriceService;
import com.fashion.supplychain.template.entity.TemplateLibrary;
import com.fashion.supplychain.template.orchestration.TemplateLibraryOrchestrator;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Slf4j
@Component
public class StyleTemplateTool implements AgentTool {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Autowired private TemplateLibraryOrchestrator templateLibraryOrchestrator;
    @Autowired private StyleInfoService styleInfoService;
    @Autowired private StyleSizePriceService styleSizePriceService;
    @Autowired private AiAgentToolAccessService toolAccessService;

    private static final Set<String> WRITE_ACTIONS = Set.of(
            "create_template_from_style", "apply_template_to_style", "sync_process_prices", "save_size_prices");

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("action", schema("string", "动作: create_template_from_style | apply_template_to_style | sync_process_prices | list_size_prices | save_size_prices | get_process_price_template"));
        properties.put("sourceStyleNo", schema("string", "源款号，用于从款式生成模板"));
        properties.put("templateTypes", schema("array", "模板类型数组，例如 bom、size、process、process_price、progress"));
        properties.put("templateId", schema("string", "模板ID"));
        properties.put("targetStyleId", schema("string", "目标款式ID"));
        properties.put("targetStyleNo", schema("string", "目标款号"));
        properties.put("mode", schema("string", "模板应用模式"));
        properties.put("styleId", schema("string", "款式ID"));
        properties.put("styleNo", schema("string", "款号"));
        properties.put("orderIds", schema("array", "同步价格时指定订单ID数组"));
        properties.put("items", schema("array", "多码单价数组，每项包含 processCode、processName、progressStage、size、price"));

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("处理模板库和多码单价。支持从款式生成模板、应用模板到款式、同步工序单价到订单、查询与保存样衣多码单价。当用户说“从这款生成模板”“把模板应用到这款样衣”“同步这款工序单价”“查看/保存多码单价”时必须调用。");
        AiTool.AiParameters parameters = new AiTool.AiParameters();
        parameters.setProperties(properties);
        parameters.setRequired(List.of("action"));
        function.setParameters(parameters);
        tool.setFunction(function);
        return tool;
    }

    @Override
    public String execute(String argumentsJson) throws Exception {
        if (UserContext.tenantId() == null) {
            return "{\"success\":false,\"error\":\"租户上下文丢失，请重新登录\"}";
        }
        Map<String, Object> args = MAPPER.readValue(argumentsJson == null || argumentsJson.isBlank() ? "{}" : argumentsJson, new TypeReference<Map<String, Object>>() {});
        String action = text(args.get("action"));
        if (WRITE_ACTIONS.contains(action) && !toolAccessService.hasManagerAccess()) {
            return "{\"success\":false,\"error\":\"该操作需要管理员权限\"}";
        }
        return switch (action) {
            case "create_template_from_style" -> createTemplateFromStyle(args);
            case "apply_template_to_style" -> applyTemplateToStyle(args);
            case "sync_process_prices" -> syncProcessPrices(args);
            case "list_size_prices" -> listSizePrices(args);
            case "save_size_prices" -> saveSizePrices(args);
            case "get_process_price_template" -> getProcessPriceTemplate(args);
            default -> "{\"error\":\"不支持的 action\"}";
        };
    }

    @Override
    public String getName() {
        return "tool_style_template";
    }

    private String createTemplateFromStyle(Map<String, Object> args) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("sourceStyleNo", requiredStyleNo(args, "sourceStyleNo"));
        body.put("templateTypes", stringList(args.get("templateTypes")));
        List<TemplateLibrary> templates = templateLibraryOrchestrator.createFromStyle(body);
        return ok("已根据款式生成模板", Map.of("templates", templates.stream().map(this::toTemplateDto).toList()));
    }

    private String applyTemplateToStyle(Map<String, Object> args) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("templateId", required(args, "templateId"));
        body.put("targetStyleId", text(args.get("targetStyleId")));
        body.put("targetStyleNo", text(args.get("targetStyleNo")));
        body.put("mode", text(args.get("mode")));
        boolean success = templateLibraryOrchestrator.applyToStyle(body);
        return ok("已将模板应用到目标款式", Map.of("success", success, "templateId", body.get("templateId")));
    }

    private String syncProcessPrices(Map<String, Object> args) throws Exception {
        String styleNo = requiredStyleNo(args, "styleNo");
        Map<String, Object> result = templateLibraryOrchestrator.syncProcessUnitPricesByStyleNo(styleNo, stringList(args.get("orderIds")));
        return ok("已同步工序单价到生产订单", Map.of("styleNo", styleNo, "result", result));
    }

    private String listSizePrices(Map<String, Object> args) throws Exception {
        Long styleId = resolveStyleId(args);
        QueryWrapper<StyleSizePrice> query = new QueryWrapper<>();
        query.eq("style_id", styleId);
        if (UserContext.tenantId() != null) query.eq("tenant_id", UserContext.tenantId());
        query.orderByAsc("process_code", "size");
        List<StyleSizePrice> list = styleSizePriceService.list(query);
        return ok("已返回该款的多码单价", Map.of("styleId", styleId, "items", list.stream().map(this::toSizePriceDto).toList()));
    }

    private String saveSizePrices(Map<String, Object> args) throws Exception {
        Long styleId = resolveStyleId(args);
        List<Map<String, Object>> items = mapList(args.get("items"));
        if (items.isEmpty()) throw new IllegalArgumentException("items不能为空");

        QueryWrapper<StyleSizePrice> removeQuery = new QueryWrapper<>();
        removeQuery.eq("style_id", styleId);
        if (UserContext.tenantId() != null) removeQuery.eq("tenant_id", UserContext.tenantId());
        styleSizePriceService.remove(removeQuery);

        List<StyleSizePrice> rows = new ArrayList<>();
        LocalDateTime now = LocalDateTime.now();
        for (Map<String, Object> item : items) {
            StyleSizePrice row = new StyleSizePrice();
            row.setStyleId(styleId);
            row.setProcessCode(required(item, "processCode"));
            row.setProcessName(text(item.get("processName")));
            row.setProgressStage(text(item.get("progressStage")));
            row.setSize(required(item, "size"));
            row.setPrice(new BigDecimal(required(item, "price")));
            row.setTenantId(UserContext.tenantId());
            row.setCreateTime(now);
            row.setUpdateTime(now);
            rows.add(row);
        }
        styleSizePriceService.saveBatch(rows);
        return ok("已保存多码单价", Map.of("styleId", styleId, "items", rows.stream().map(this::toSizePriceDto).toList()));
    }

    private String getProcessPriceTemplate(Map<String, Object> args) throws Exception {
        Object result = templateLibraryOrchestrator.getProcessPriceTemplate(text(args.get("styleNo")));
        return ok("已返回工序单价模板", Map.of("result", result));
    }

    private Long resolveStyleId(Map<String, Object> args) {
        String styleId = text(args.get("styleId"));
        if (StringUtils.hasText(styleId)) return Long.parseLong(styleId);
        String styleNo = requiredStyleNo(args, "styleNo");
        StyleInfo style = styleInfoService.lambdaQuery()
                .eq(StyleInfo::getStyleNo, styleNo)
                .eq(UserContext.tenantId() != null, StyleInfo::getTenantId, UserContext.tenantId())
                .last("LIMIT 1")
                .one();
        if (style == null || style.getId() == null) throw new IllegalArgumentException("未找到款式: " + styleNo);
        return style.getId();
    }

    private String requiredStyleNo(Map<String, Object> args, String key) {
        return required(args, key);
    }

    private Map<String, Object> toTemplateDto(TemplateLibrary item) {
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("id", item.getId());
        dto.put("templateType", item.getTemplateType());
        dto.put("templateName", item.getTemplateName());
        dto.put("templateKey", item.getTemplateKey());
        dto.put("sourceStyleNo", item.getSourceStyleNo());
        dto.put("locked", item.getLocked());
        return dto;
    }

    private Map<String, Object> toSizePriceDto(StyleSizePrice item) {
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("id", item.getId());
        dto.put("styleId", item.getStyleId());
        dto.put("processCode", item.getProcessCode());
        dto.put("processName", item.getProcessName());
        dto.put("progressStage", item.getProgressStage());
        dto.put("size", item.getSize());
        dto.put("price", item.getPrice());
        return dto;
    }

    private List<String> stringList(Object value) {
        if (value instanceof List<?> list) {
            return list.stream().filter(java.util.Objects::nonNull).map(String::valueOf).map(String::trim).filter(StringUtils::hasText).toList();
        }
        if (value == null) return List.of();
        String text = String.valueOf(value).trim();
        return StringUtils.hasText(text) ? List.of(text) : List.of();
    }

    private List<Map<String, Object>> mapList(Object value) {
        if (!(value instanceof List<?> list)) return List.of();
        List<Map<String, Object>> result = new ArrayList<>();
        for (Object item : list) {
            if (item instanceof Map<?, ?> raw) {
                Map<String, Object> map = new LinkedHashMap<>();
                raw.forEach((k, v) -> map.put(String.valueOf(k), v));
                result.add(map);
            }
        }
        return result;
    }

    private String ok(String summary, Map<String, Object> payload) throws Exception {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("summary", summary);
        result.putAll(payload);
        return MAPPER.writeValueAsString(result);
    }

    private Map<String, Object> schema(String type, String description) {
        Map<String, Object> field = new LinkedHashMap<>();
        field.put("type", type);
        field.put("description", description);
        return field;
    }

    private String required(Map<String, Object> args, String key) {
        String value = text(args.get(key));
        if (!StringUtils.hasText(value)) throw new IllegalArgumentException("缺少参数: " + key);
        return value;
    }

    private String text(Object value) {
        return value == null ? null : String.valueOf(value).trim();
    }
}
