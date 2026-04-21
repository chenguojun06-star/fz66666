package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.helper.StepWizardBuilder;
import com.fashion.supplychain.intelligence.entity.IntelligenceAuditLog;
import com.fashion.supplychain.intelligence.mapper.IntelligenceAuditLogMapper;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.orchestration.ProductWarehousingOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.*;

/**
 * AI小云工具：成品质检入库
 * <p>
 * 支持两个 action：
 *   - query_pending: 查询当前租户待入库的菲号汇总
 *   - submit:        执行质检入库（写操作，委托 ProductWarehousingOrchestrator.save()）
 * <p>
 * 安全门禁：外发工厂账号拦截；角色不能为空；写操作记录审计日志
 * 典型触发词："帮我做入库""这单入库""质检完成入库""你去做入库""入库一下"
 */
@Slf4j
@Component
public class QualityInboundTool implements AgentTool {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String ACTION_QUERY = "query_pending";
    private static final String ACTION_SUBMIT = "submit";

    @Autowired
    private ProductWarehousingOrchestrator warehousingOrchestrator;

    @Autowired
    private IntelligenceAuditLogMapper auditLogMapper;

    @Override
    public String getName() {
        return "tool_quality_inbound";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();

        Map<String, Object> action = new LinkedHashMap<>();
        action.put("type", "string");
        action.put("description", "操作类型：query_pending=查询待入库菲号列表；submit=执行质检入库");
        action.put("enum", List.of(ACTION_QUERY, ACTION_SUBMIT));
        properties.put("action", action);

        Map<String, Object> orderNo = new LinkedHashMap<>();
        orderNo.put("type", "string");
        orderNo.put("description", "订单号，submit时必填，例如 PO20260315001");
        properties.put("orderNo", orderNo);

        Map<String, Object> qualifiedQty = new LinkedHashMap<>();
        qualifiedQty.put("type", "integer");
        qualifiedQty.put("description", "合格数量（件），submit时必填");
        properties.put("qualifiedQuantity", qualifiedQty);

        Map<String, Object> unqualifiedQty = new LinkedHashMap<>();
        unqualifiedQty.put("type", "integer");
        unqualifiedQty.put("description", "不合格/次品数量（件），可选，默认0");
        properties.put("unqualifiedQuantity", unqualifiedQty);

        Map<String, Object> qrCode = new LinkedHashMap<>();
        qrCode.put("type", "string");
        qrCode.put("description", "菲号二维码（可选，有助于精确定位菲号）");
        properties.put("cuttingBundleQrCode", qrCode);

        Map<String, Object> bundleNo = new LinkedHashMap<>();
        bundleNo.put("type", "string");
        bundleNo.put("description", "菲号序号（可选，cuttingBundleQrCode 不填时使用）");
        properties.put("cuttingBundleNo", bundleNo);

        Map<String, Object> warehouse = new LinkedHashMap<>();
        warehouse.put("type", "string");
        warehouse.put("description", "入库仓位/货架（可选）");
        properties.put("warehouse", warehouse);

        Map<String, Object> defectCategory = new LinkedHashMap<>();
        defectCategory.put("type", "string");
        defectCategory.put("description", "次品类别，如：针眼、色差、跳线（有不合格件时填写）");
        properties.put("defectCategory", defectCategory);

        Map<String, Object> defectRemark = new LinkedHashMap<>();
        defectRemark.put("type", "string");
        defectRemark.put("description", "次品备注说明（可选）");
        properties.put("defectRemark", defectRemark);

        Map<String, Object> orderId = new LinkedHashMap<>();
        orderId.put("type", "string");
        orderId.put("description", "query_pending 时可按订单ID筛选（可选）");
        properties.put("orderId", orderId);

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription(
                "成品质检入库。用户说'帮我做入库'、'这单入库'、'质检完成入库'、'你去做入库'时调用。" +
                "先用 query_pending 确认待入库菲号，再用 submit 执行入库。" +
                "submit 需要 orderNo 和 qualifiedQuantity，入库成功后系统自动更新订单进度和财务记录。");
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
            return error("租户上下文丢失，请重新登录");
        }
        // 安全门禁1：外发工厂账号不允许触发写操作
        if (UserContext.factoryId() != null) {
            return error("外发工厂账号无权执行质检入库，请联系内部质检人员");
        }

        // 安全门禁2：必须有角色
        String role = UserContext.role();
        if (role == null || role.isBlank()) {
            return error("账号角色信息缺失，无权执行质检入库");
        }

        Map<String, Object> args = parse(argumentsJson);
        String action = str(args, "action");
        if (action == null || action.isBlank()) {
            return error("缺少参数：action（query_pending 或 submit）");
        }

        return switch (action) {
            case ACTION_QUERY -> handleQuery(args);
            case ACTION_SUBMIT -> handleSubmit(args, role);
            default -> error("不支持的 action：" + action + "，可选值：query_pending / submit");
        };
    }

    // ── 查询待入库菲号 ────────────────────────────────────────────────────────

    private String handleQuery(Map<String, Object> args) throws Exception {
        try {
            // 查询待质检入库的菲号列表（status=pending_qc 或 pending_warehouse）
            List<Map<String, Object>> pendingBundles =
                    warehousingOrchestrator.listPendingBundles("pending_warehouse");

            String orderIdFilter = str(args, "orderId");
            if (orderIdFilter != null && !orderIdFilter.isBlank()) {
                pendingBundles = pendingBundles.stream()
                        .filter(b -> orderIdFilter.equals(String.valueOf(b.getOrDefault("orderId", ""))))
                        .toList();
            }

            if (pendingBundles == null || pendingBundles.isEmpty()) {
                Map<String, Object> result = new LinkedHashMap<>();
                result.put("pendingCount", 0);
                result.put("message", "当前没有待入库的菲号" + (orderIdFilter != null ? "（已按订单ID筛选）" : ""));
                return MAPPER.writeValueAsString(result);
            }

            // 只返回前10条，避免输出过长
            List<Map<String, Object>> display = pendingBundles.size() > 10
                    ? pendingBundles.subList(0, 10) : pendingBundles;

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("pendingCount", pendingBundles.size());
            result.put("items", display);
            result.put("message", "共有 " + pendingBundles.size() + " 个菲号待入库" +
                    (pendingBundles.size() > 10 ? "，仅显示前10条" : "") +
                    "，请确认合格数量后使用 submit 执行入库");
            return MAPPER.writeValueAsString(result);

        } catch (Exception e) {
            log.error("[QualityInboundTool] 查询待入库失败: {}", e.getMessage());
            return error("查询待入库列表失败：" + e.getMessage());
        }
    }

    // ── 执行质检入库 ──────────────────────────────────────────────────────────

    private String handleSubmit(Map<String, Object> args, String role) throws Exception {
        String orderNo = str(args, "orderNo");
        Integer qualifiedQuantity = integer(args, "qualifiedQuantity");

        if (orderNo == null || orderNo.isBlank() || qualifiedQuantity == null || qualifiedQuantity <= 0) {
            Map<String, Object> wizard = StepWizardBuilder.build("quality_inbound", "质检入库", "填写质检结果完成入库", "✅", "确认入库", "质检入库",
                StepWizardBuilder.steps(
                    StepWizardBuilder.step("order", "选择订单", "输入要入库的订单号",
                        StepWizardBuilder.textField("orderNo", "订单号", true, "输入订单号")),
                    StepWizardBuilder.step("quantity", "填写数量", "输入合格和不合格数量",
                        StepWizardBuilder.numberField("qualifiedQuantity", "合格数量", true, "输入合格数量", 1),
                        StepWizardBuilder.numberField("unqualifiedQuantity", "不合格数量", false, "默认0", 0))
                ));
            return MAPPER.writeValueAsString(StepWizardBuilder.wrapResult("请提供订单号和合格数量", true, List.of("orderNo", "qualifiedQuantity"), "请补充质检入库信息", wizard));
        }

        Integer unqualifiedQuantity = integer(args, "unqualifiedQuantity");
        if (unqualifiedQuantity == null) unqualifiedQuantity = 0;

        // 构建入库实体
        ProductWarehousing pw = new ProductWarehousing();
        pw.setOrderNo(orderNo);
        pw.setQualifiedQuantity(qualifiedQuantity);
        pw.setUnqualifiedQuantity(unqualifiedQuantity);
        pw.setWarehousingQuantity(qualifiedQuantity); // 实际入库数量=合格数量
        pw.setWarehousingType("normal");
        pw.setQualityStatus(unqualifiedQuantity > 0 ? "partial" : "passed");

        String qrCode = str(args, "cuttingBundleQrCode");
        if (qrCode != null && !qrCode.isBlank()) pw.setCuttingBundleQrCode(qrCode);

        Integer bundleNo = integer(args, "cuttingBundleNo");
        if (bundleNo != null) pw.setCuttingBundleNo(bundleNo);

        String warehouse = str(args, "warehouse");
        if (warehouse != null && !warehouse.isBlank()) pw.setWarehouse(warehouse);

        String defectCategory = str(args, "defectCategory");
        if (defectCategory != null && !defectCategory.isBlank()) pw.setDefectCategory(defectCategory);

        String defectRemark = str(args, "defectRemark");
        if (defectRemark != null && !defectRemark.isBlank()) pw.setDefectRemark(defectRemark);

        Long tenantId = UserContext.tenantId();
        String operatorName = UserContext.username();
        String detail = buildDetail(orderNo, qualifiedQuantity, unqualifiedQuantity, qrCode,
                bundleNo != null ? bundleNo.toString() : null);

        log.info("[QualityInboundTool] 执行质检入库: orderNo={}, qualified={}, unqualified={}",
                orderNo, qualifiedQuantity, unqualifiedQuantity);

        try {
            boolean ok = warehousingOrchestrator.save(pw);
            if (!ok) {
                writeAuditLog(tenantId, operatorName, role, detail, "FAILED", "save() 返回 false");
                return error("入库操作未成功，请检查订单状态或联系管理员");
            }
        } catch (IllegalArgumentException e) {
            writeAuditLog(tenantId, operatorName, role, detail, "FAILED", e.getMessage());
            log.warn("[QualityInboundTool] 入库参数异常: {}", e.getMessage());
            return error(e.getMessage());
        } catch (Exception e) {
            writeAuditLog(tenantId, operatorName, role, detail, "FAILED", e.getMessage());
            log.error("[QualityInboundTool] 入库异常: {}", e.getMessage(), e);
            return error("入库操作失败：" + e.getMessage());
        }

        writeAuditLog(tenantId, operatorName, role, detail, "SUCCESS", null);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("orderNo", orderNo);
        result.put("qualifiedQuantity", qualifiedQuantity);
        result.put("unqualifiedQuantity", unqualifiedQuantity);
        result.put("message", "质检入库成功！订单 " + orderNo + " 入库 " + qualifiedQuantity + " 件合格品" +
                (unqualifiedQuantity > 0 ? "，" + unqualifiedQuantity + " 件次品已标记" : "") +
                "。系统已自动更新订单进度和财务记录。");
        return MAPPER.writeValueAsString(result);
    }

    // ── 工具方法 ──────────────────────────────────────────────────────────────

    private void writeAuditLog(Long tenantId, String operatorName, String role,
                               String detail, String status, String errorMsg) {
        try {
            IntelligenceAuditLog auditLog = IntelligenceAuditLog.builder()
                    .tenantId(tenantId)
                    .executorId(UserContext.userId())
                    .action("quality_inbound")
                    .reason("[AI小云质检入库] 操作人: " + operatorName + " 角色: " + role + " 参数: " + detail)
                    .status(status)
                    .errorMessage(errorMsg)
                    .createdAt(LocalDateTime.now())
                    .build();
            auditLogMapper.insert(auditLog);
        } catch (Exception ex) {
            log.warn("[QualityInboundTool] 审计日志写入失败: {}", ex.getMessage());
        }
    }

    private String buildDetail(String orderNo, int qualified, int unqualified,
                               String qrCode, String bundleNo) {
        StringBuilder sb = new StringBuilder("orderNo=").append(orderNo)
                .append(" qualified=").append(qualified)
                .append(" unqualified=").append(unqualified);
        if (qrCode != null && !qrCode.isBlank()) sb.append(" qrCode=").append(qrCode);
        if (bundleNo != null && !bundleNo.isBlank()) sb.append(" bundleNo=").append(bundleNo);
        return sb.toString();
    }

    private Map<String, Object> parse(String json) throws Exception {
        return MAPPER.readValue(json, new TypeReference<>() {});
    }

    private String str(Map<String, Object> m, String key) {
        Object v = m.get(key);
        return v == null ? null : v.toString().trim();
    }

    private Integer integer(Map<String, Object> m, String key) {
        Object v = m.get(key);
        if (v == null) return null;
        try { return Integer.parseInt(v.toString()); } catch (NumberFormatException e) { return null; }
    }

    private String error(String msg) throws Exception {
        return MAPPER.writeValueAsString(Map.of("error", msg));
    }
}
