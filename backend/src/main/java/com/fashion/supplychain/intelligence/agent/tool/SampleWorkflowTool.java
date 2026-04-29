package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import com.fashion.supplychain.production.entity.PatternProduction;
import com.fashion.supplychain.production.orchestration.OrderManagementOrchestrator;
import com.fashion.supplychain.production.orchestration.PatternProductionOrchestrator;
import com.fashion.supplychain.production.service.PatternProductionService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.orchestration.StyleInfoOrchestrator;
import com.fashion.supplychain.style.service.StyleInfoService;
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
public class SampleWorkflowTool implements AgentTool {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Autowired private StyleInfoService styleInfoService;
    @Autowired private StyleInfoOrchestrator styleInfoOrchestrator;
    @Autowired private PatternProductionService patternProductionService;
    @Autowired private PatternProductionOrchestrator patternProductionOrchestrator;
    @Autowired private OrderManagementOrchestrator orderManagementOrchestrator;
    @Autowired private AiAgentToolAccessService toolAccessService;

    private static final Set<String> WRITE_ACTIONS = Set.of(
            "style_stage_action", "save_sample_review", "push_to_order_management", "pattern_workflow_action");

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("action", schema("string", "动作: list_sample_workflow | style_stage_action | save_sample_review | push_to_order_management | list_pattern_productions | pattern_workflow_action"));
        properties.put("styleId", schema("string", "样衣款式ID"));
        properties.put("styleNo", schema("string", "样衣款号"));
        properties.put("keyword", schema("string", "按款号/款名搜索"));
        properties.put("limit", schema("integer", "列表条数，默认 10"));
        properties.put("stage", schema("string", "样衣阶段：pattern / sample / bom / process / size-price / secondary / size / production"));
        properties.put("stageAction", schema("string", "阶段动作：start / progress / complete / reset / skip"));
        properties.put("progress", schema("integer", "样衣进度百分比，stage=sample 且动作=progress 时使用"));
        properties.put("reason", schema("string", "退回/维护原因"));
        properties.put("reviewStatus", schema("string", "样衣审核结论：PASS / REWORK / REJECT"));
        properties.put("reviewComment", schema("string", "样衣审核评语"));
        properties.put("targetTypes", schema("array", "推送到下单管理的目标类型列表，可选"));
        properties.put("patternId", schema("string", "样板生产ID"));
        properties.put("patternAction", schema("string", "样板动作：receive / complete / warehouse-in / review / maintenance"));
        properties.put("remark", schema("string", "样板动作备注"));
        properties.put("result", schema("string", "样板审核结果"));

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("处理样衣开发与样板生产。支持查看样衣开发状态、启动/完成样衣阶段、更新样衣进度、提交样衣审核、推送到下单管理、执行样板领取/完成/入库/审核。用户说“把这款样衣开工”“把样衣进度改到80%”“样衣审核通过”“把这款推到下单管理”“让样板入库”时必须调用。【重要】标注为可选的参数不要追问用户，直接用默认值或不传执行。只有必填参数缺失时才追问。");
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
        if (UserContext.tenantId() == null) {
            return "{\"success\":false,\"error\":\"租户上下文丢失，请重新登录\"}";
        }
        Map<String, Object> args = MAPPER.readValue(argumentsJson == null || argumentsJson.isBlank() ? "{}" : argumentsJson, new TypeReference<Map<String, Object>>() {});
        String action = text(args.get("action"));
        if (WRITE_ACTIONS.contains(action) && !toolAccessService.hasManagerAccess()) {
            return "{\"success\":false,\"error\":\"该操作需要管理员权限\"}";
        }
        return switch (action) {
            case "list_sample_workflow" -> listSampleWorkflow(args);
            case "style_stage_action" -> styleStageAction(args);
            case "save_sample_review" -> saveSampleReview(args);
            case "push_to_order_management" -> pushToOrderManagement(args);
            case "list_pattern_productions" -> listPatternProductions(args);
            case "pattern_workflow_action" -> patternWorkflowAction(args);
            default -> "{\"error\":\"不支持的 action\"}";
        };
    }

    @Override
    public String getName() {
        return "tool_sample_workflow";
    }

    private String listSampleWorkflow(Map<String, Object> args) throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String keyword = text(args.get("keyword"));
        String styleNo = text(args.get("styleNo"));
        int limit = intOf(args.get("limit"), 10);
        List<StyleInfo> items = styleInfoService.list(new LambdaQueryWrapper<StyleInfo>()
                .eq(StyleInfo::getTenantId, tenantId)
                .like(StringUtils.hasText(styleNo), StyleInfo::getStyleNo, styleNo)
                .and(StringUtils.hasText(keyword), q -> q.like(StyleInfo::getStyleNo, keyword).or().like(StyleInfo::getStyleName, keyword))
                .orderByDesc(StyleInfo::getUpdateTime)
                .last("LIMIT " + limit));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("summary", "样衣开发命中 " + items.size() + " 条");
        result.put("items", items.stream().map(this::toStyleDto).toList());
        return MAPPER.writeValueAsString(result);
    }

    private String styleStageAction(Map<String, Object> args) throws Exception {
        StyleInfo style = findStyle(args);
        String stage = required(args, "stage");
        String stageAction = required(args, "stageAction");
        Object actionResult = switch (stage + ":" + stageAction) {
            case "pattern:start" -> styleInfoOrchestrator.startPattern(style.getId());
            case "pattern:complete" -> styleInfoOrchestrator.completePattern(style.getId());
            case "sample:start" -> styleInfoOrchestrator.startSample(style.getId());
            case "sample:complete" -> styleInfoOrchestrator.completeSample(style.getId());
            case "sample:progress" -> styleInfoOrchestrator.updateSampleProgress(style.getId(), Map.of("progress", intOf(args.get("progress"), 0)));
            case "bom:start" -> styleInfoOrchestrator.startBom(style.getId());
            case "bom:complete" -> styleInfoOrchestrator.completeBom(style.getId());
            case "process:start" -> styleInfoOrchestrator.startProcess(style.getId());
            case "process:complete" -> styleInfoOrchestrator.completeProcess(style.getId());
            case "size-price:start" -> styleInfoOrchestrator.startSizePrice(style.getId());
            case "size-price:complete" -> styleInfoOrchestrator.completeSizePrice(style.getId());
            case "secondary:start" -> styleInfoOrchestrator.startSecondary(style.getId());
            case "secondary:complete" -> styleInfoOrchestrator.completeSecondary(style.getId());
            case "secondary:skip" -> styleInfoOrchestrator.skipSecondary(style.getId());
            case "production:start" -> styleInfoOrchestrator.startProductionStage(style.getId());
            case "production:complete" -> styleInfoOrchestrator.completeProductionStage(style.getId());
            default -> throw new IllegalArgumentException("不支持的样衣阶段动作");
        };
        StyleInfo latest = styleInfoService.getById(style.getId());
        if (latest != null) {
            TenantAssert.assertBelongsToCurrentTenant(latest.getTenantId(), "样衣款式");
        }
        return ok("已执行样衣阶段动作", Map.of("style", latest == null ? toStyleDto(style) : toStyleDto(latest), "result", actionResult));
    }

    private String saveSampleReview(Map<String, Object> args) throws Exception {
        StyleInfo style = findStyle(args);
        String reviewStatus = required(args, "reviewStatus");
        String reviewComment = text(args.get("reviewComment"));
        StyleInfo latest = styleInfoOrchestrator.saveSampleReview(style.getId(), reviewStatus, reviewComment);
        return ok("已保存样衣审核结论", Map.of("style", toStyleDto(latest)));
    }

    private String pushToOrderManagement(Map<String, Object> args) throws Exception {
        StyleInfo style = findStyle(args);
        List<String> targetTypes = parseTargetTypes(args.get("targetTypes"));
        Map<String, Object> result = orderManagementOrchestrator.createFromStyle(style.getId(), targetTypes);
        return ok("已推送到下单管理", Map.of("style", toStyleDto(style), "result", result));
    }

    private String listPatternProductions(Map<String, Object> args) throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String styleNo = text(args.get("styleNo"));
        int limit = intOf(args.get("limit"), 10);
        List<PatternProduction> items = patternProductionService.list(new LambdaQueryWrapper<PatternProduction>()
                .eq(PatternProduction::getTenantId, tenantId)
                .eq(PatternProduction::getDeleteFlag, 0)
                .like(StringUtils.hasText(styleNo), PatternProduction::getStyleNo, styleNo)
                .orderByDesc(PatternProduction::getUpdateTime)
                .last("LIMIT " + limit));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("summary", "样板生产命中 " + items.size() + " 条");
        result.put("items", items.stream().map(this::toPatternDto).toList());
        return MAPPER.writeValueAsString(result);
    }

    private String patternWorkflowAction(Map<String, Object> args) throws Exception {
        PatternProduction pattern = findPattern(args);
        String patternAction = required(args, "patternAction");
        Object result = switch (patternAction) {
            case "receive" -> patternProductionOrchestrator.receivePattern(pattern.getId(), Map.of());
            case "complete" -> patternProductionOrchestrator.submitScan(pattern.getId(), "COMPLETE", "PLATE_WORKER", null, null, null, null);
            case "warehouse-in" -> patternProductionOrchestrator.warehouseIn(pattern.getId(), text(args.get("remark")), null);
            case "review" -> patternProductionOrchestrator.reviewPattern(pattern.getId(), text(args.get("result")), text(args.get("remark")));
            case "maintenance" -> {
                patternProductionOrchestrator.maintenance(pattern.getId(), required(args, "reason"));
                yield "已转入维护";
            }
            default -> throw new IllegalArgumentException("不支持的样板动作");
        };
        PatternProduction latest = patternProductionService.getById(pattern.getId());
        if (latest != null) {
            TenantAssert.assertBelongsToCurrentTenant(latest.getTenantId(), "样板生产");
        }
        return ok("已执行样板工作流动作", Map.of("pattern", latest == null ? toPatternDto(pattern) : toPatternDto(latest), "result", result));
    }

    private StyleInfo findStyle(Map<String, Object> args) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String styleId = text(args.get("styleId"));
        if (StringUtils.hasText(styleId)) {
            StyleInfo style = styleInfoService.lambdaQuery()
                    .eq(StyleInfo::getId, Long.parseLong(styleId))
                    .eq(StyleInfo::getTenantId, tenantId)
                    .one();
            if (style != null) {
                return style;
            }
        }
        String styleNo = text(args.get("styleNo"));
        if (StringUtils.hasText(styleNo)) {
            StyleInfo style = styleInfoService.getOne(new LambdaQueryWrapper<StyleInfo>()
                    .eq(StyleInfo::getStyleNo, styleNo)
                    .eq(StyleInfo::getTenantId, tenantId)
                    .last("LIMIT 1"), false);
            if (style != null) {
                return style;
            }
        }
        throw new IllegalArgumentException("未找到样衣款式或无权访问");
    }

    private PatternProduction findPattern(Map<String, Object> args) {
        String patternId = required(args, "patternId");
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        PatternProduction pattern = patternProductionService.lambdaQuery()
                .eq(PatternProduction::getId, patternId)
                .eq(PatternProduction::getTenantId, tenantId)
                .one();
        if (pattern == null || (pattern.getDeleteFlag() != null && pattern.getDeleteFlag() != 0)) {
            throw new IllegalArgumentException("样板生产记录不存在或无权访问");
        }
        return pattern;
    }

    private Map<String, Object> toStyleDto(StyleInfo style) {
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("id", style.getId());
        dto.put("styleNo", style.getStyleNo());
        dto.put("styleName", style.getStyleName());
        dto.put("progressNode", style.getProgressNode());
        dto.put("patternStatus", style.getPatternStatus());
        dto.put("sampleStatus", style.getSampleStatus());
        dto.put("sampleProgress", style.getSampleProgress());
        dto.put("sampleReviewStatus", style.getSampleReviewStatus());
        return dto;
    }

    private Map<String, Object> toPatternDto(PatternProduction item) {
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("id", item.getId());
        dto.put("styleNo", item.getStyleNo());
        dto.put("styleId", item.getStyleId());
        dto.put("status", item.getStatus());
        dto.put("receiver", item.getReceiver());
        dto.put("deliveryTime", item.getDeliveryTime());
        return dto;
    }

    private List<String> parseTargetTypes(Object raw) {
        if (raw == null) return null;
        if (raw instanceof List<?>) {
            return ((List<?>) raw).stream().filter(java.util.Objects::nonNull).map(String::valueOf).map(String::trim).filter(StringUtils::hasText).toList();
        }
        String value = String.valueOf(raw).trim();
        return StringUtils.hasText(value) ? List.of(value) : null;
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
        if (!StringUtils.hasText(value)) {
            throw new IllegalArgumentException("缺少参数: " + key);
        }
        return value;
    }

    private String text(Object value) {
        return value == null ? null : String.valueOf(value).trim();
    }

    private int intOf(Object value, int def) {
        if (value == null) return def;
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (Exception e) {
            return def;
        }
    }
}
