package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.orchestration.StyleInfoOrchestrator;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleProcessService;
import java.math.BigDecimal;
import java.util.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * 款式信息 AI 工具（查询 + 写操作）
 *
 * <p>actions:
 * <ul>
 *   <li>query — 根据款号查询款式详情+工序列表</li>
 *   <li>create — 新建款式档案（款号+款式名必填）</li>
 *   <li>update — 更新款式字段（id必填）</li>
 *   <li>advance_stage — 推进开发阶段（pattern_start/pattern_done/sample_start/sample_done/production_start/production_done）</li>
 * </ul>
 */
@Slf4j
@Component
public class StyleInfoTool extends AbstractAgentTool {

    @Autowired private StyleInfoService styleInfoService;
    @Autowired private StyleProcessService styleProcessService;
    @Autowired private StyleInfoOrchestrator styleInfoOrchestrator;
    @Autowired private AiAgentToolAccessService toolAccessService;

    @Override
    public String getName() {
        return "tool_query_style_info";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("action", stringProp("操作：query（查询详情）/ create（新建款式）/ update（更新字段）/ advance_stage（推进阶段）"));
        props.put("styleNo", stringProp("款号，query/create时使用"));
        props.put("styleName", stringProp("款式名称，create时使用"));
        props.put("category", stringProp("品类，如上衣/裤子/裙子"));
        props.put("price", stringProp("款式单价（元）"));
        props.put("id", stringProp("款式ID，update/advance_stage时必填"));
        props.put("stage", stringProp("阶段操作：pattern_start/pattern_done/sample_start/sample_done/production_start/production_done"));
        return buildToolDef(
                "款式档案全功能AI工具：支持查询款式详情+工序列表，以及新建、更新款式和推进开发阶段。",
                props, List.of("action"));
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String action = requireString(args, "action");
        return switch (action) {
            case "query" -> queryStyle(args);
            case "create" -> createStyle(args);
            case "update" -> updateStyle(args);
            case "advance_stage" -> advanceStage(args);
            default -> errorJson("不支持的action: " + action + "，可选: query/create/update/advance_stage");
        };
    }

    // ——— 查询 ———
    private String queryStyle(Map<String, Object> args) {
        try {
            String styleNo = requireString(args, "styleNo");
            TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
            QueryWrapper<StyleInfo> qw = new QueryWrapper<>();
            qw.eq("style_no", styleNo);
            qw.eq("tenant_id", tenantId);
            qw.eq("delete_flag", 0);
            StyleInfo info = styleInfoService.getOne(qw);
            if (info == null) return errorJson("未找到款号 " + styleNo + " 的款式");

            QueryWrapper<StyleProcess> pq = new QueryWrapper<>();
            pq.eq("style_id", info.getId()).eq("delete_flag", 0);
            List<StyleProcess> processes = styleProcessService.list(pq);

            Map<String, Object> data = new LinkedHashMap<>();
            data.put("id", info.getId());
            data.put("styleNo", info.getStyleNo());
            data.put("styleName", info.getStyleName());
            data.put("category", info.getCategory());
            data.put("price", info.getPrice());
            data.put("patternStatus", info.getPatternStatus());
            data.put("sampleStatus", info.getSampleStatus());
            data.put("sampleProgress", info.getSampleProgress());
            data.put("progressNode", info.getProgressNode());

            List<Map<String, Object>> procList = new ArrayList<>();
            for (StyleProcess p : processes) {
                Map<String, Object> pm = new LinkedHashMap<>();
                pm.put("processName", p.getProcessName());
                pm.put("difficulty", p.getDifficulty());
                pm.put("standardTime", p.getStandardTime());
                pm.put("price", p.getPrice());
                procList.add(pm);
            }
            data.put("processes", procList);
            return successJson("款式 " + styleNo + " 查询成功", data);
        } catch (Exception e) {
            log.error("[StyleInfoTool.query] 异常: {}", e.getMessage(), e);
            return errorJson("款式查询失败: " + e.getMessage());
        }
    }

    // ——— 新建款式 ———
    private String createStyle(Map<String, Object> args) {
        try {
            if (!toolAccessService.hasManagerAccess()) {
                return errorJson("新建款式需要管理员权限");
            }
            String styleNo = requireString(args, "styleNo");
            String styleName = requireString(args, "styleName");

            StyleInfo info = new StyleInfo();
            info.setStyleNo(styleNo);
            info.setStyleName(styleName);
            String cat = optionalString(args, "category");
            if (cat != null) info.setCategory(cat);
            String priceStr = optionalString(args, "price");
            if (priceStr != null) {
                try { info.setPrice(new BigDecimal(priceStr)); } catch (NumberFormatException e) { log.debug("数字解析失败: {}", e.getMessage()); }
            }

            boolean ok = styleInfoOrchestrator.save(info);
            if (ok) {
                return successJson("款式 " + styleNo + " 创建成功", Map.of("id", info.getId() != null ? info.getId() : ""));
            } else {
                return errorJson("款式创建失败，款号可能已存在");
            }
        } catch (Exception e) {
            log.error("[StyleInfoTool.create] 异常: {}", e.getMessage(), e);
            return errorJson("款式创建失败: " + e.getMessage());
        }
    }

    // ——— 更新款式字段 ———
    private String updateStyle(Map<String, Object> args) {
        try {
            if (!toolAccessService.hasManagerAccess()) {
                return errorJson("更新款式需要管理员权限");
            }
            String idStr = requireString(args, "id");
            Long id = Long.parseLong(idStr);
            StyleInfo info = styleInfoOrchestrator.detail(id);
            if (info == null) return errorJson("款式ID " + id + " 不存在");

            String styleName = optionalString(args, "styleName");
            String cat = optionalString(args, "category");
            String priceStr = optionalString(args, "price");
            if (styleName != null) info.setStyleName(styleName);
            if (cat != null) info.setCategory(cat);
            if (priceStr != null) {
                try { info.setPrice(new BigDecimal(priceStr)); } catch (NumberFormatException e) { log.debug("数字解析失败: {}", e.getMessage()); }
            }

            boolean ok = styleInfoOrchestrator.update(info);
            return ok ? successJson("款式更新成功") : errorJson("款式更新失败");
        } catch (NumberFormatException e) {
            return errorJson("id格式错误，请提供数字ID");
        } catch (Exception e) {
            log.error("[StyleInfoTool.update] 异常: {}", e.getMessage(), e);
            return errorJson("款式更新失败: " + e.getMessage());
        }
    }

    // ——— 推进开发阶段 ———
    private String advanceStage(Map<String, Object> args) {
        try {
            if (!toolAccessService.hasManagerAccess()) {
                return errorJson("推进开发阶段需要管理员权限");
            }
            String idStr = requireString(args, "id");
            String stage = requireString(args, "stage");
            Long id = Long.parseLong(idStr);

            boolean ok = switch (stage) {
                case "pattern_start" -> styleInfoOrchestrator.startPattern(id);
                case "pattern_done" -> styleInfoOrchestrator.completePattern(id);
                case "sample_start" -> styleInfoOrchestrator.startSample(id);
                case "sample_done" -> styleInfoOrchestrator.completeSample(id);
                case "production_start" -> styleInfoOrchestrator.startProductionStage(id);
                case "production_done" -> styleInfoOrchestrator.completeProductionStage(id);
                default -> {
                    yield false;
                }
            };
            if ("pattern_start|pattern_done|sample_start|sample_done|production_start|production_done".contains(stage)) {
                return ok ? successJson("阶段 [" + stage + "] 推进成功") : errorJson("阶段 [" + stage + "] 推进失败，状态不允许此操作");
            } else {
                return errorJson("不支持的stage: " + stage + "，可选: pattern_start/pattern_done/sample_start/sample_done/production_start/production_done");
            }
        } catch (NumberFormatException e) {
            return errorJson("id格式错误，请提供数字ID");
        } catch (Exception e) {
            log.error("[StyleInfoTool.advance_stage] 异常: {}", e.getMessage(), e);
            return errorJson("阶段推进失败: " + e.getMessage());
        }
    }
}
