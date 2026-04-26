package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import com.fashion.supplychain.production.orchestration.MaterialPurchaseDocOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.*;

@Slf4j
@Component
public class MaterialDocReceiveTool extends AbstractAgentTool {

    @Autowired
    private MaterialPurchaseDocOrchestrator materialPurchaseDocOrchestrator;
    @Autowired
    private AiAgentToolAccessService toolAccessService;

    @Override
    public String getName() {
        return "tool_material_doc_receive";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("action", stringProp("动作: replay_saved_doc | preview_arrival(预览到货) | auto_arrival | auto_arrival_inbound | summary(单据摘要)"));
        properties.put("docId", stringProp("采购单据记录ID，可选"));
        properties.put("orderNo", stringProp("订单号；不传 docId 时必填，将使用该订单最新单据"));
        properties.put("warehouseLocation", stringProp("自动入库时的仓位，不传默认仓"));
        return buildToolDef(
                "处理已上传的采购单据识别结果。支持回放识别结果、预览到货影响、自动登记到货或自动到货入库。" +
                        "建议先preview_arrival预览匹配结果，确认后再执行auto_arrival或auto_arrival_inbound。" +
                        "用户说「按最新采购单据自动收货」「根据这张单据直接到货入库」时必须调用。",
                properties, List.of("action"));
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            return errorJson("租户上下文丢失，请重新登录");
        }

        Map<String, Object> args = parseArgs(argumentsJson);
        String action = optionalString(args, "action");
        if (action == null || action.isBlank()) {
            return errorJson("action 不能为空");
        }
        String docId = optionalString(args, "docId");
        String orderNo = optionalString(args, "orderNo");
        String warehouseLocation = optionalString(args, "warehouseLocation");

        if (!Set.of("replay_saved_doc", "preview_arrival", "summary").contains(action)
                && !toolAccessService.hasManagerAccess()) {
            return errorJson("该操作需要管理员权限");
        }

        return switch (action) {
            case "replay_saved_doc" -> replayDoc(docId, orderNo);
            case "preview_arrival" -> previewArrival(docId, orderNo);
            case "auto_arrival" -> autoArrival(docId, orderNo, warehouseLocation, false);
            case "auto_arrival_inbound" -> autoArrival(docId, orderNo, warehouseLocation, true);
            case "summary" -> summary(docId, orderNo);
            default -> errorJson("不支持的 action: " + action);
        };
    }

    private String replayDoc(String docId, String orderNo) throws Exception {
        Object result = materialPurchaseDocOrchestrator.replaySavedDoc(docId, orderNo);
        return MAPPER.writeValueAsString(result);
    }

    @SuppressWarnings("unchecked")
    private String previewArrival(String docId, String orderNo) throws Exception {
        Map<String, Object> replayResult = materialPurchaseDocOrchestrator.replaySavedDoc(docId, orderNo);

        Map<String, Object> preview = new LinkedHashMap<>();
        preview.put("success", true);
        preview.put("mode", "preview");
        preview.put("message", "以下是到货预览，确认后请用 action=auto_arrival 或 action=auto_arrival_inbound 执行");

        if (replayResult.containsKey("items")) {
            List<Map<String, Object>> items = (List<Map<String, Object>>) replayResult.get("items");
            int matchCount = 0;
            int unmatchedCount = 0;
            List<String> matchDetails = new ArrayList<>();
            List<String> warnings = new ArrayList<>();

            for (Map<String, Object> item : items) {
                Boolean matched = (Boolean) item.getOrDefault("matched", false);
                if (Boolean.TRUE.equals(matched)) {
                    matchCount++;
                    String materialName = String.valueOf(item.getOrDefault("materialName", "未知物料"));
                    Object recognizedQty = item.getOrDefault("recognizedQuantity", item.getOrDefault("quantity", "?"));
                    Object plannedQty = item.getOrDefault("plannedQuantity", item.getOrDefault("purchaseQuantity", "?"));
                    matchDetails.add("✅ " + materialName + "：识别数量=" + recognizedQty + "，采购数量=" + plannedQty);

                    if (recognizedQty instanceof Number rn && plannedQty instanceof Number pn) {
                        if (rn.doubleValue() > pn.doubleValue()) {
                            warnings.add("⚠️ " + materialName + " 识别数量(" + rn + ")超过采购数量(" + pn + ")，可能多发货");
                        }
                    }
                } else {
                    unmatchedCount++;
                    String desc = String.valueOf(item.getOrDefault("description", item.getOrDefault("materialName", "未匹配行")));
                    matchDetails.add("❌ " + desc + "：未匹配到采购记录");
                }
            }

            preview.put("matchCount", matchCount);
            preview.put("unmatchedCount", unmatchedCount);
            preview.put("matchDetails", matchDetails);
            preview.put("warnings", warnings);
            preview.put("nextAction", "确认到货请发送：action=auto_arrival" +
                    (docId != null ? ", docId=" + docId : ", orderNo=" + orderNo));
        } else {
            preview.putAll(replayResult);
        }

        return MAPPER.writeValueAsString(preview);
    }

    private String autoArrival(String docId, String orderNo, String warehouseLocation, boolean inbound) throws Exception {
        String location = (warehouseLocation == null || warehouseLocation.isBlank()) ? "默认仓" : warehouseLocation;
        Object result = materialPurchaseDocOrchestrator.autoExecuteSavedDoc(docId, orderNo, location, inbound);
        return MAPPER.writeValueAsString(result);
    }

    @SuppressWarnings("unchecked")
    private String summary(String docId, String orderNo) throws Exception {
        Map<String, Object> replayResult = materialPurchaseDocOrchestrator.replaySavedDoc(docId, orderNo);

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("success", true);
        summary.put("mode", "summary");

        summary.put("docId", replayResult.getOrDefault("docId", docId));
        summary.put("orderNo", replayResult.getOrDefault("orderNo", orderNo));

        int totalRecognized = 0;
        int matchCount = 0;
        int unmatchedCount = 0;

        if (replayResult.containsKey("items")) {
            List<Map<String, Object>> items = (List<Map<String, Object>>) replayResult.get("items");
            totalRecognized = items.size();
            for (Map<String, Object> item : items) {
                if (Boolean.TRUE.equals(item.getOrDefault("matched", false))) {
                    matchCount++;
                } else {
                    unmatchedCount++;
                }
            }
        }

        summary.put("totalRecognized", totalRecognized);
        summary.put("matchedCount", matchCount);
        summary.put("unmatchedCount", unmatchedCount);

        double matchRate = totalRecognized > 0 ? (double) matchCount / totalRecognized * 100 : 0;
        summary.put("matchRate", String.format("%.1f%%", matchRate));

        List<String> insights = new ArrayList<>();
        if (matchRate >= 90) {
            insights.add("✅ 匹配率很高，可以放心执行自动到货");
        } else if (matchRate >= 60) {
            insights.add("🟡 匹配率中等，建议检查未匹配项后再执行");
        } else if (totalRecognized > 0) {
            insights.add("🔴 匹配率较低，建议手动确认后再执行到货操作");
        }
        if (unmatchedCount > 0) {
            insights.add("📋 有" + unmatchedCount + "行未匹配，可能是供应商多发货或物料编码不一致");
        }
        summary.put("insights", insights);

        return MAPPER.writeValueAsString(summary);
    }
}
