package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.dto.ProceduralMemoryCreateDTO;
import com.fashion.supplychain.intelligence.dto.ProceduralMemoryUpdateDTO;
import com.fashion.supplychain.intelligence.entity.ProceduralMemory;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import com.fashion.supplychain.intelligence.service.ProceduralMemoryService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.*;

/**
 * SOP 记忆编辑工具（P0-3 L4 自编辑工具集升级，2026-07-22）
 *
 * <p>借鉴 Letta 自编辑记忆 + Mem0 程序性知识：AI 从"只读检索"升级为"自编辑进化"。</p>
 * <p>支持 6 个 action：create/update/delete/enable/disable/search。</p>
 * <p>写操作（create/update/delete/enable/disable）采用 preview+confirm 双阶段。</p>
 * <p>tenantId 从 UserContext.tenantId() 获取，不信任 AI 传入。</p>
 *
 * @author xiaoyun
 * @since 2026-07-22
 */
@Slf4j
@Component
@Lazy
@AgentToolDef(
        name = "procedural_memory_tool",
        description = "SOP记忆编辑工具：AI自编辑SOP流程记忆，支持创建/更新/删除/启用/禁用/搜索SOP",
        domain = ToolDomain.SYSTEM,
        timeoutMs = 15000,
        readOnly = false
)
@McpToolAnnotation(
        name = "procedural_memory_tool",
        description = "AI 自编辑 SOP 流程记忆：创建/更新/删除/启用/禁用/搜索 SOP",
        domain = ToolDomain.SYSTEM,
        readOnly = false,
        timeoutSeconds = 15,
        requiresConfirmation = true,
        tags = {"SOP", "程序性记忆", "流程编辑", "记忆自编辑", "L4记忆"}
)
public class ProceduralMemoryTool extends AbstractAgentTool {

    @Autowired
    private ProceduralMemoryService proceduralMemoryService;

    @Autowired
    private AiAgentToolAccessService aiAgentToolAccessService;

    @Override
    public String getName() {
        return "procedural_memory_tool";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("action", stringProp("操作类型：create(创建)/update(更新)/delete(删除)/enable(启用)/disable(禁用)/search(搜索)"));
        properties.put("confirm", prop("boolean", "是否确认执行（写操作需先preview再confirm=true执行）"));
        properties.put("sopId", intProp("SOP ID（update/delete/enable/disable必填）"));
        properties.put("sopName", stringProp("SOP名称（create必填，update可选）"));
        properties.put("sopType", stringProp("SOP类型：SCAN_WORKFLOW/WAGE_SETTLEMENT/DELIVERY_FORECAST/SUPPLIER_EVAL/QUALITY_CHECK/CRYSTALLIZED"));
        properties.put("stepsJson", stringProp("步骤数组JSON：[{step,action,tool,expected}]"));
        properties.put("preconditions", stringProp("前置条件JSON"));
        properties.put("postcheck", stringProp("后置校验JSON"));
        properties.put("triggerKeywords", stringProp("触发关键词，逗号分隔"));
        properties.put("confidence", intProp("置信度0-100（如80表示0.80）"));
        properties.put("source", stringProp("来源：manual/crystallized"));
        properties.put("enabled", intProp("是否启用：0/1（update可选）"));
        properties.put("keyword", stringProp("搜索关键词（search动作使用）"));
        properties.put("limit", intProp("列表最多返回条数，默认50，上限200（search动作使用）"));
        return buildToolDef(
                "SOP记忆编辑工具。AI自编辑SOP流程记忆，支持创建/更新/删除/启用/禁用/搜索SOP。"
                        + "写操作（create/update/delete/enable/disable）需先preview（confirm=false或省略）再confirm=true执行。"
                        + "tenantId自动从登录上下文获取，不信任外部传入。",
                properties, List.of("action"));
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        if (!aiAgentToolAccessService.hasManagerAccess()) {
            return errorJson("当前角色无权编辑SOP记忆，需要管理员权限");
        }

        Map<String, Object> args = parseArgs(argumentsJson);
        String action = requireString(args, "action");

        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            return errorJson("租户上下文丢失，请重新登录");
        }

        boolean confirm = Boolean.TRUE.equals(args.get("confirm"));

        switch (action) {
            case "create":
                return handleCreate(args, tenantId, confirm);
            case "update":
                return handleUpdate(args, tenantId, confirm);
            case "delete":
                return handleDelete(args, tenantId, confirm);
            case "enable":
                return handleToggle(args, tenantId, confirm, true);
            case "disable":
                return handleToggle(args, tenantId, confirm, false);
            case "search":
                return handleSearch(args, tenantId);
            default:
                return errorJson("不支持的操作类型：" + action + "，支持：create/update/delete/enable/disable/search");
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // action 处理器
    // ══════════════════════════════════════════════════════════════════════════

    private String handleCreate(Map<String, Object> args, Long tenantId, boolean confirm) throws Exception {
        ProceduralMemoryCreateDTO dto = buildCreateDto(args);

        if (!confirm) {
            return previewResult("create", "将创建SOP「" + dto.getSopName() + "」",
                    buildSopSummary(dto.getSopName(), dto.getSopType(), dto.getTriggerKeywords(), dto.getConfidence()),
                    "确认创建请发送：action=create, confirm=true");
        }

        ProceduralMemory created = proceduralMemoryService.createSop(tenantId, dto);
        return successJson("SOP创建成功", Map.of("sopId", created.getId(), "sopName", created.getSopName()));
    }

    private String handleUpdate(Map<String, Object> args, Long tenantId, boolean confirm) throws Exception {
        Long sopId = optionalLong(args, "sopId");
        if (sopId == null) {
            return errorJson("update操作需要sopId参数");
        }

        ProceduralMemoryUpdateDTO dto = buildUpdateDto(args);

        if (!confirm) {
            return previewResult("update", "将更新SOP id=" + sopId,
                    buildUpdateSummary(dto),
                    "确认更新请发送：action=update, sopId=" + sopId + ", confirm=true");
        }

        ProceduralMemory updated = proceduralMemoryService.updateSop(tenantId, sopId, dto);
        return successJson("SOP更新成功", Map.of("sopId", updated.getId(), "sopName", updated.getSopName()));
    }

    private String handleDelete(Map<String, Object> args, Long tenantId, boolean confirm) throws Exception {
        Long sopId = optionalLong(args, "sopId");
        if (sopId == null) {
            return errorJson("delete操作需要sopId参数");
        }

        if (!confirm) {
            return previewResult("delete", "将软删除SOP id=" + sopId,
                    Map.of("sopId", sopId, "operation", "soft delete (delete_flag=1)"),
                    "确认删除请发送：action=delete, sopId=" + sopId + ", confirm=true");
        }

        proceduralMemoryService.deleteSop(tenantId, sopId);
        return successJson("SOP删除成功", Map.of("sopId", sopId));
    }

    private String handleToggle(Map<String, Object> args, Long tenantId, boolean confirm, boolean enable) throws Exception {
        Long sopId = optionalLong(args, "sopId");
        if (sopId == null) {
            return errorJson((enable ? "enable" : "disable") + "操作需要sopId参数");
        }

        String action = enable ? "enable" : "disable";
        int enabledVal = enable ? 1 : 0;

        if (!confirm) {
            return previewResult(action, "将" + (enable ? "启用" : "禁用") + "SOP id=" + sopId,
                    Map.of("sopId", sopId, "targetEnabled", enabledVal),
                    "确认请发送：action=" + action + ", sopId=" + sopId + ", confirm=true");
        }

        if (enable) {
            proceduralMemoryService.enableSop(tenantId, sopId);
        } else {
            proceduralMemoryService.disableSop(tenantId, sopId);
        }
        return successJson("SOP" + (enable ? "启用" : "禁用") + "成功", Map.of("sopId", sopId, "enabled", enabledVal));
    }

    private String handleSearch(Map<String, Object> args, Long tenantId) throws Exception {
        String keyword = optionalString(args, "keyword");
        String sopType = optionalString(args, "sopType");
        Integer enabled = optionalInt(args, "enabled");
        Integer limitArg = optionalInt(args, "limit");
        int limit = limitArg != null ? limitArg : 50;

        List<Map<String, Object>> results = new ArrayList<>();

        // 如果有关键词，用 searchSops 语义检索
        if (keyword != null && !keyword.isBlank()) {
            List<ProceduralMemory> sops = proceduralMemoryService.searchSops(keyword);
            for (ProceduralMemory sop : sops) {
                results.add(sopToMap(sop));
            }
            return successJson("搜索到" + results.size() + "个匹配SOP（关键词：" + keyword + "）",
                    Map.of("sops", results, "count", results.size()));
        }

        // 否则用 listSops 列表查询
        Boolean enabledBool = enabled != null ? (enabled == 1) : null;
        List<ProceduralMemory> sops = proceduralMemoryService.listSops(tenantId, sopType, enabledBool, limit);
        for (ProceduralMemory sop : sops) {
            results.add(sopToMap(sop));
        }
        return successJson("查询到" + results.size() + "个SOP",
                Map.of("sops", results, "count", results.size()));
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 辅助方法
    // ══════════════════════════════════════════════════════════════════════════

    private ProceduralMemoryCreateDTO buildCreateDto(Map<String, Object> args) {
        ProceduralMemoryCreateDTO dto = new ProceduralMemoryCreateDTO();
        dto.setSopName(requireString(args, "sopName"));
        dto.setSopType(optionalString(args, "sopType"));
        dto.setStepsJson(optionalString(args, "stepsJson"));
        dto.setPreconditions(optionalString(args, "preconditions"));
        dto.setPostcheck(optionalString(args, "postcheck"));
        dto.setTriggerKeywords(optionalString(args, "triggerKeywords"));
        dto.setConfidence(parseConfidence(optionalInt(args, "confidence")));
        dto.setSource(optionalString(args, "source"));
        Integer enabled = optionalInt(args, "enabled");
        dto.setEnabled(enabled);
        return dto;
    }

    private ProceduralMemoryUpdateDTO buildUpdateDto(Map<String, Object> args) {
        ProceduralMemoryUpdateDTO dto = new ProceduralMemoryUpdateDTO();
        dto.setSopName(optionalString(args, "sopName"));
        dto.setSopType(optionalString(args, "sopType"));
        dto.setStepsJson(optionalString(args, "stepsJson"));
        dto.setPreconditions(optionalString(args, "preconditions"));
        dto.setPostcheck(optionalString(args, "postcheck"));
        dto.setTriggerKeywords(optionalString(args, "triggerKeywords"));
        dto.setConfidence(parseConfidence(optionalInt(args, "confidence")));
        dto.setSource(optionalString(args, "source"));
        Integer enabled = optionalInt(args, "enabled");
        dto.setEnabled(enabled);
        return dto;
    }

    /**
     * 将 0-100 的整数置信度转为 0-1.00 的 BigDecimal
     * 若为 null 返回 null（由 Service 设置默认值）
     */
    private BigDecimal parseConfidence(Integer confidenceInt) {
        if (confidenceInt == null) return null;
        if (confidenceInt > 1) {
            return BigDecimal.valueOf(confidenceInt).divide(BigDecimal.valueOf(100));
        }
        return BigDecimal.valueOf(confidenceInt);
    }

    private Map<String, Object> sopToMap(ProceduralMemory sop) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("sopId", sop.getId());
        map.put("sopName", sop.getSopName());
        map.put("sopType", sop.getSopType());
        map.put("triggerKeywords", sop.getTriggerKeywords());
        map.put("confidence", sop.getConfidence());
        map.put("enabled", sop.getEnabled());
        map.put("usageCount", sop.getUsageCount());
        map.put("successCount", sop.getSuccessCount());
        map.put("source", sop.getSource());
        map.put("version", sop.getVersion());
        return map;
    }

    private Map<String, Object> buildSopSummary(String name, String type, String keywords, BigDecimal confidence) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("sopName", name);
        map.put("sopType", type);
        map.put("triggerKeywords", keywords);
        map.put("confidence", confidence);
        return map;
    }

    private Map<String, Object> buildUpdateSummary(ProceduralMemoryUpdateDTO dto) {
        Map<String, Object> map = new LinkedHashMap<>();
        if (dto.getSopName() != null) map.put("sopName", dto.getSopName());
        if (dto.getSopType() != null) map.put("sopType", dto.getSopType());
        if (dto.getTriggerKeywords() != null) map.put("triggerKeywords", dto.getTriggerKeywords());
        if (dto.getConfidence() != null) map.put("confidence", dto.getConfidence());
        if (dto.getEnabled() != null) map.put("enabled", dto.getEnabled());
        if (dto.getStepsJson() != null) map.put("stepsJson", "[已更新]");
        return map;
    }

    private String previewResult(String action, String message, Map<String, Object> data, String nextAction) throws Exception {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("mode", "preview");
        result.put("action", action);
        result.put("message", message);
        result.putAll(data);
        result.put("nextAction", nextAction);
        return MAPPER.writeValueAsString(result);
    }
}
