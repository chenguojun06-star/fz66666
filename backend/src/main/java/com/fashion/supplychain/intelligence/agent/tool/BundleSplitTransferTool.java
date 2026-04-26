package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import com.fashion.supplychain.production.dto.CuttingBundleSplitRollbackRequest;
import com.fashion.supplychain.production.dto.CuttingBundleSplitTransferRequest;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.orchestration.CuttingBundleSplitTransferOrchestrator;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.ScanRecordService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Component
public class BundleSplitTransferTool extends AbstractAgentTool {

    @Autowired
    private CuttingBundleSplitTransferOrchestrator cuttingBundleSplitTransferOrchestrator;
    @Autowired
    private AiAgentToolAccessService aiAgentToolAccessService;
    @Autowired
    private CuttingBundleService cuttingBundleService;
    @Autowired
    private ScanRecordService scanRecordService;

    @Override
    public String getName() {
        return "tool_bundle_split_transfer";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("action", stringProp("动作: split_transfer | preview_split(预览拆菲) | rollback_split | query_family | check_feasibility(可行性检查)"));
        properties.put("bundleId", stringProp("菲号ID"));
        properties.put("qrCode", stringProp("菲号二维码内容"));
        properties.put("orderNo", stringProp("订单号"));
        properties.put("bundleNo", intProp("原始菲号数字编号"));
        properties.put("currentProcessName", stringProp("当前工序名称，例如车缝"));
        properties.put("completedQuantity", intProp("原工人已完成数量"));
        properties.put("transferQuantity", intProp("要转给下一位工人的数量"));
        properties.put("toWorkerId", stringProp("目标工人ID"));
        properties.put("toWorkerName", stringProp("目标工人姓名"));
        properties.put("reason", stringProp("转派原因"));
        return buildToolDef(
                "拆菲转派工具。支持拆菲转派、预览拆菲影响、可行性检查、查询拆分家族关系，以及撤回拆菲。" +
                        "建议先preview_split预览影响或check_feasibility检查可行性，再执行split_transfer。",
                properties, List.of("action"));
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        if (!aiAgentToolAccessService.hasManagerAccess()) {
            return errorJson("当前角色无权执行该操作");
        }
        Map<String, Object> args = parseArgs(argumentsJson);
        String action = optionalString(args, "action");
        if (action == null || action.isBlank()) {
            return errorJson("action 不能为空");
        }

        return switch (action.toLowerCase()) {
            case "check_feasibility" -> checkFeasibility(args);
            case "preview_split" -> previewSplit(args);
            case "query_family" -> queryFamily(args);
            case "rollback_split" -> rollbackSplit(args);
            default -> splitTransfer(args);
        };
    }

    private String checkFeasibility(Map<String, Object> args) throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        String bundleId = optionalString(args, "bundleId");
        String qrCode = optionalString(args, "qrCode");
        String orderNo = optionalString(args, "orderNo");
        Integer transferQty = optionalInt(args, "transferQuantity");

        CuttingBundle bundle = findBundle(bundleId, qrCode, orderNo, args);
        if (bundle == null) {
            return errorJson("未找到对应的菲号记录，请提供bundleId或qrCode");
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("mode", "feasibility_check");

        Map<String, Object> bundleInfo = new LinkedHashMap<>();
        bundleInfo.put("bundleId", bundle.getId());
        bundleInfo.put("bundleNo", bundle.getBundleNo());
        bundleInfo.put("orderNo", bundle.getProductionOrderNo());
        bundleInfo.put("styleNo", bundle.getStyleNo());
        bundleInfo.put("color", bundle.getColor());
        bundleInfo.put("size", bundle.getSize());
        bundleInfo.put("totalQuantity", bundle.getQuantity());
        bundleInfo.put("status", bundle.getStatus());
        bundleInfo.put("splitStatus", bundle.getSplitStatus());
        result.put("bundleInfo", bundleInfo);

        List<String> checks = new ArrayList<>();
        boolean feasible = true;

        if ("SPLIT".equals(bundle.getSplitStatus())) {
            checks.add("❌ 该菲号已被拆分，不能再次拆分");
            feasible = false;
        } else {
            checks.add("✅ 菲号未拆分，可以执行拆菲操作");
        }

        if (bundle.getQuantity() == null || bundle.getQuantity() <= 1) {
            checks.add("❌ 菲号数量为" + bundle.getQuantity() + "，无法拆分（需至少2件）");
            feasible = false;
        } else if (transferQty != null) {
            if (transferQty <= 0) {
                checks.add("❌ 转派数量必须大于0");
                feasible = false;
            } else if (transferQty >= bundle.getQuantity()) {
                checks.add("❌ 转派数量(" + transferQty + ")不能大于等于菲号总数(" + bundle.getQuantity() + ")");
                feasible = false;
            } else {
                checks.add("✅ 转派数量(" + transferQty + ")合理，拆分后原菲号剩余" + (bundle.getQuantity() - transferQty) + "件");
            }
        } else {
            checks.add("⚠️ 未指定转派数量，建议不超过总量的50%以保持工序均衡");
        }

        List<ScanRecord> recentScans = scanRecordService.lambdaQuery()
                .eq(ScanRecord::getCuttingBundleId, bundle.getId())
                .eq(ScanRecord::getTenantId, tenantId)
                .ne(ScanRecord::getScanType, "orchestration")
                .eq(ScanRecord::getScanResult, "success")
                .orderByDesc(ScanRecord::getScanTime)
                .last("LIMIT 10")
                .list();

        if (!recentScans.isEmpty()) {
            Map<String, String> workers = recentScans.stream()
                    .filter(r -> r.getOperatorName() != null)
                    .collect(Collectors.toMap(
                            ScanRecord::getOperatorId,
                            ScanRecord::getOperatorName,
                            (a, b) -> a,
                            LinkedHashMap::new));
            checks.add("📋 该菲号已有" + recentScans.size() + "条扫码记录，涉及工人：" + String.join("、", workers.values()));
        }

        String toWorkerId = optionalString(args, "toWorkerId");
        String toWorkerName = optionalString(args, "toWorkerName");
        if (toWorkerId == null && toWorkerName == null) {
            checks.add("⚠️ 未指定目标工人，执行拆菲转派时需要提供toWorkerId和toWorkerName");
        }

        result.put("checks", checks);
        result.put("feasible", feasible);
        if (feasible) {
            result.put("nextAction", "可行性通过，可执行：action=preview_split 或 action=split_transfer");
        }

        return MAPPER.writeValueAsString(result);
    }

    private String previewSplit(Map<String, Object> args) throws Exception {
        TenantAssert.assertTenantContext();

        String bundleId = optionalString(args, "bundleId");
        String qrCode = optionalString(args, "qrCode");
        String orderNo = optionalString(args, "orderNo");
        Integer completedQty = optionalInt(args, "completedQuantity");
        Integer transferQty = optionalInt(args, "transferQuantity");
        String toWorkerName = optionalString(args, "toWorkerName");

        CuttingBundle bundle = findBundle(bundleId, qrCode, orderNo, args);
        if (bundle == null) {
            return errorJson("未找到对应的菲号记录");
        }

        Map<String, Object> preview = new LinkedHashMap<>();
        preview.put("success", true);
        preview.put("mode", "preview");
        preview.put("message", "以下是拆菲转派影响预览，确认后请用 action=split_transfer 执行");

        Map<String, Object> splitPlan = new LinkedHashMap<>();
        splitPlan.put("originalBundleId", bundle.getId());
        splitPlan.put("bundleNo", bundle.getBundleNo());
        splitPlan.put("totalQuantity", bundle.getQuantity());
        splitPlan.put("completedQuantity", completedQty != null ? completedQty : 0);
        int remainQty = bundle.getQuantity() - (completedQty != null ? completedQty : 0);
        splitPlan.put("remainingQuantity", remainQty);

        if (transferQty != null && transferQty > 0) {
            splitPlan.put("transferQuantity", transferQty);
            splitPlan.put("originalRemainQuantity", remainQty - transferQty);
            splitPlan.put("toWorker", toWorkerName != null ? toWorkerName : "待指定");
        }
        preview.put("splitPlan", splitPlan);

        List<String> impacts = new ArrayList<>();
        impacts.add("📋 原菲号 " + bundle.getBundleNo() + " 将保留 " + (remainQty - (transferQty != null ? transferQty : 0)) + " 件");
        if (transferQty != null) {
            impacts.add("📋 新菲号将分配 " + transferQty + " 件给" + (toWorkerName != null ? toWorkerName : "目标工人"));
        }
        impacts.add("📊 拆分后两个菲号独立扫码，各自计算工序进度");

        preview.put("impacts", impacts);
        preview.put("nextAction", "确认拆菲请发送：action=split_transfer, bundleId=" + bundle.getId() + ", transferQuantity=" + (transferQty != null ? transferQty : "数量"));

        return MAPPER.writeValueAsString(preview);
    }

    private String queryFamily(Map<String, Object> args) throws Exception {
        String bundleId = optionalString(args, "bundleId");
        return MAPPER.writeValueAsString(cuttingBundleSplitTransferOrchestrator.queryFamily(bundleId));
    }

    private String rollbackSplit(Map<String, Object> args) throws Exception {
        CuttingBundleSplitRollbackRequest request = new CuttingBundleSplitRollbackRequest();
        request.setBundleId(optionalString(args, "bundleId"));
        request.setQrCode(optionalString(args, "qrCode"));
        request.setOrderNo(optionalString(args, "orderNo"));
        request.setBundleNo(optionalInt(args, "bundleNo"));
        request.setReason(optionalString(args, "reason"));
        return MAPPER.writeValueAsString(cuttingBundleSplitTransferOrchestrator.rollbackSplit(request));
    }

    private String splitTransfer(Map<String, Object> args) throws Exception {
        CuttingBundleSplitTransferRequest request = new CuttingBundleSplitTransferRequest();
        request.setBundleId(optionalString(args, "bundleId"));
        request.setQrCode(optionalString(args, "qrCode"));
        request.setOrderNo(optionalString(args, "orderNo"));
        request.setBundleNo(optionalInt(args, "bundleNo"));
        request.setCurrentProcessName(optionalString(args, "currentProcessName"));
        request.setCompletedQuantity(optionalInt(args, "completedQuantity"));
        request.setTransferQuantity(optionalInt(args, "transferQuantity"));
        request.setToWorkerId(optionalString(args, "toWorkerId"));
        request.setToWorkerName(optionalString(args, "toWorkerName"));
        request.setReason(optionalString(args, "reason"));
        return MAPPER.writeValueAsString(cuttingBundleSplitTransferOrchestrator.splitAndTransfer(request));
    }

    private CuttingBundle findBundle(String bundleId, String qrCode, String orderNo, Map<String, Object> args) {
        if (bundleId != null && !bundleId.isBlank()) {
            return cuttingBundleService.getById(bundleId);
        }
        if (qrCode != null && !qrCode.isBlank()) {
            return cuttingBundleService.getByQrCode(qrCode);
        }
        Integer bundleNo = optionalInt(args, "bundleNo");
        if (orderNo != null && !orderNo.isBlank() && bundleNo != null) {
            return cuttingBundleService.getByBundleNo(orderNo, bundleNo);
        }
        return null;
    }
}
