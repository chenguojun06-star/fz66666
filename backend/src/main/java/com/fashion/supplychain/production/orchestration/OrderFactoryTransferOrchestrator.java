package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.BusinessException;
import com.fashion.supplychain.common.constant.OrderStatusConstants;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.CuttingTask;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.entity.SysNotice;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.CuttingTaskService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.production.service.SysNoticeService;
import com.fashion.supplychain.system.dto.FactoryOrganizationSnapshot;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.helper.OrganizationUnitBindingHelper;
import com.fashion.supplychain.system.service.FactoryService;
import com.fashion.supplychain.system.service.UserService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 整单 / 部分转厂编排器（v2）
 *
 * <p>在 v1 基础上新增：
 * <ul>
 *   <li>colorSizeLines 参数：部分转厂时可提供颜色×码数明细，写入备注和结构化日志</li>
 *   <li>transfer_log_json 历史记录：每次转厂追加 JSON entry，status="active"，
 *       支持 undo() 撤回</li>
 *   <li>undo() 方法：找最近一条 active entry，还原原工厂，标记 status="undone"</li>
 * </ul>
 *
 * <p>调用入口：
 * <ul>
 *   <li>OrderFactoryTransferTool — AI 小云 "整单/部分转厂" 指令</li>
 *   <li>OrderFactoryTransferUndoTool — AI 小云 "撤回转单" 指令</li>
 * </ul>
 *
 * <p>通知机制：查询 t_user.factoryId = 目标工厂ID 的所有激活用户，逐一写入 t_sys_notice。
 */
@Slf4j
@Service
public class OrderFactoryTransferOrchestrator {

    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("MM-dd HH:mm");
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private SysNoticeService sysNoticeService;

    @Autowired
    private FactoryService factoryService;

    @Autowired
    private UserService userService;

    @Autowired
    private CuttingTaskService cuttingTaskService;

    @Autowired
    private CuttingBundleService cuttingBundleService;

    @Autowired
    private OrganizationUnitBindingHelper organizationUnitBindingHelper;

    // ─────────────────────────────────────────────────────────────────────────
    // 转厂入口
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 执行转厂操作（整单 / 部分）
     *
     * @param orderNo           订单号
     * @param targetFactoryName 目标工厂名（系统中已录入的工厂名，须完整匹配）
     * @param transferQuantity  转出件数；为 null 或 ≥ 订单总量 → 整单转
     * @param colorSizeLines    颜色码数明细，例如 [{"color":"红色","size":"XL","quantity":30}]；
     *                          整单转或无明细时传 null
     * @param reason            转厂原因（可选）
     * @return 操作结果 Map
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> transfer(String orderNo,
                                        String targetFactoryName,
                                        Integer transferQuantity,
                                        List<Map<String, Object>> colorSizeLines,
                                        String reason) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String operator = UserContext.username();

        // 1. 查原订单
        ProductionOrder order = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getOrderNo, orderNo)
                .eq(ProductionOrder::getTenantId, tenantId)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .one();
        if (order == null) {
            throw new IllegalArgumentException("订单不存在: " + orderNo);
        }

        validateTransferEligibility(order);

        String oldFactoryId   = order.getFactoryId();
        String oldFactoryName = order.getFactoryName();

        // 2. 查目标工厂
        Factory targetFactory = factoryService.lambdaQuery()
                .eq(Factory::getTenantId, tenantId)
                .eq(Factory::getDeleteFlag, 0)
                .eq(Factory::getFactoryName, targetFactoryName)
                .one();
        if (targetFactory == null) {
            throw new IllegalArgumentException("目标工厂不存在，请确认工厂名称: " + targetFactoryName);
        }

        // 3. 判断整单还是部分转
        boolean isFullTransfer = (transferQuantity == null
                || (order.getOrderQuantity() != null && transferQuantity >= order.getOrderQuantity()));
        String timeStr = LocalDateTime.now().format(FMT);

        // 4. 彩色尺码汇总字符串（用于备注可读性）
        String colorSizeDetail = buildColorSizeDetail(colorSizeLines);

        if (isFullTransfer) {
            // 整单转：更新 factoryId + factoryName + factoryType（关键！影响扫码权限校验）
            order.setFactoryId(targetFactory.getId());
            order.setFactoryName(targetFactory.getFactoryName());
            // 同步更新 factoryType，确保扫码权限校验正确
            String targetFactoryType = targetFactory.getFactoryType();
            if (StringUtils.hasText(targetFactoryType)) {
                order.setFactoryType(targetFactoryType.toUpperCase());
            } else {
                order.setFactoryType("EXTERNAL"); // 默认外发
            }
            // 同步更新组织架构（与PC端转单保持一致）
            FactoryOrganizationSnapshot snapshot = organizationUnitBindingHelper.getFactorySnapshot(targetFactory);
            order.setOrgUnitId(snapshot.getOrgUnitId());
            order.setParentOrgUnitId(snapshot.getParentOrgUnitId());
            order.setParentOrgUnitName(snapshot.getParentOrgUnitName());
            order.setOrgPath(snapshot.getOrgPath());
            order.setFactoryContactPerson(targetFactory.getContactPerson());
            order.setFactoryContactPhone(targetFactory.getContactPhone());
            appendRemark(order, String.format("[%s] 整单转厂 %s → %s，操作人:%s，原因:%s",
                    timeStr, safeStr(oldFactoryName), targetFactoryName, operator, safeStr(reason)));
        } else {
            if (transferQuantity <= 0) {
                throw new IllegalArgumentException("部分转厂数量须大于 0");
            }
            int remaining = (order.getOrderQuantity() == null ? 0 : order.getOrderQuantity()) - transferQuantity;
            String remarkDetail = colorSizeDetail.isEmpty()
                    ? ""
                    : " 明细：" + colorSizeDetail;
            appendRemark(order, String.format("[%s] 部分转厂 %d件 → %s（剩余%d件仍在%s）%s，操作人:%s，原因:%s",
                    timeStr, transferQuantity, targetFactoryName, remaining,
                    safeStr(oldFactoryName), remarkDetail, operator, safeStr(reason)));
        }

        // 5. 追加结构化转厂日志（用于撤回）
        appendTransferLog(order, oldFactoryId, oldFactoryName,
                targetFactory.getId(), targetFactoryName,
                isFullTransfer, transferQuantity, colorSizeLines, reason, operator);

        productionOrderService.updateById(order);

        if (isFullTransfer) {
            transferScanRecords(order.getId(), targetFactory.getId(), tenantId);
            syncCuttingDataFactoryId(order.getId(), targetFactory.getId(),
                    targetFactory.getFactoryName(), targetFactory.getFactoryType());
        }

        // 6. 通知原工厂（如果有）
        notifyFactory(oldFactoryId, tenantId, orderNo, oldFactoryName, targetFactoryName,
                isFullTransfer, transferQuantity, order.getOrderQuantity(), "原");

        // 7. 通知新工厂
        notifyFactory(targetFactory.getId(), tenantId, orderNo, oldFactoryName, targetFactoryName,
                isFullTransfer, transferQuantity, order.getOrderQuantity(), "新");

        log.info("[转厂] orderNo={} {} → {} isFullTransfer={} qty={} detail='{}' by={}",
                orderNo, oldFactoryName, targetFactoryName, isFullTransfer,
                transferQuantity, colorSizeDetail, operator);

        // 8. 构造返回结果
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("orderNo", orderNo);
        result.put("isFullTransfer", isFullTransfer);
        result.put("oldFactory", safeStr(oldFactoryName));
        result.put("newFactory", targetFactoryName);
        if (!isFullTransfer) {
            result.put("transferQuantity", transferQuantity);
            if (!colorSizeDetail.isEmpty()) {
                result.put("colorSizeDetail", colorSizeDetail);
            }
            result.put("note", "部分转厂已记录备注，订单绑定工厂暂未变更，请跟单员线下确认拆单处理");
        }
        return result;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 撤回转单入口
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 撤回最近一次转厂操作
     *
     * <p>从 transfer_log_json 中找最近一条 status="active" 的记录，
     * 将订单 factoryId/Name 还原到该记录的 oldFactoryId/Name，
     * 标记该日志条目 status="undone"，并通知相关工厂。
     *
     * @param orderNo  目标订单号
     * @param reason   撤回原因（可选）
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> undo(String orderNo, String reason) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String operator = UserContext.username();

        ProductionOrder order = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getOrderNo, orderNo)
                .eq(ProductionOrder::getTenantId, tenantId)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .one();
        if (order == null) {
            throw new IllegalArgumentException("订单不存在: " + orderNo);
        }

        // 解析转厂日志
        List<Map<String, Object>> logs = parseTransferLogs(order.getTransferLogJson());
        // 找最近一条 active 记录（倒序查找）
        Map<String, Object> targetEntry = null;
        int targetIdx = -1;
        for (int i = logs.size() - 1; i >= 0; i--) {
            if ("active".equals(logs.get(i).get("status"))) {
                targetEntry = logs.get(i);
                targetIdx = i;
                break;
            }
        }

        if (targetEntry == null) {
            throw new IllegalArgumentException("该订单没有可撤回的转厂记录（所有记录已撤回或无转厂历史）");
        }

        String oldFactoryId   = safeStr(targetEntry.get("oldFactoryId"));
        String oldFactoryName = safeStr(targetEntry.get("oldFactoryName"));
        String newFactoryId   = safeStr(targetEntry.get("newFactoryId"));
        String newFactoryName = safeStr(targetEntry.get("newFactoryName"));
        boolean wasFullTransfer = Boolean.TRUE.equals(targetEntry.get("isFullTransfer"));

        // 还原工厂（整单转时才变更了 factoryId）
        if (wasFullTransfer) {
            order.setFactoryId("(未知)".equals(oldFactoryId) ? null : oldFactoryId);
            order.setFactoryName("(未知)".equals(oldFactoryName) ? "" : oldFactoryName);
            // 还原 factoryType：查原工厂的 factoryType
            if (!"(未知)".equals(oldFactoryId) && StringUtils.hasText(oldFactoryId)) {
                Factory oldFactory = factoryService.getById(oldFactoryId);
                if (oldFactory != null && StringUtils.hasText(oldFactory.getFactoryType())) {
                    order.setFactoryType(oldFactory.getFactoryType().toUpperCase());
                } else {
                    order.setFactoryType("INTERNAL"); // 默认内部
                }
                // 还原组织架构
                FactoryOrganizationSnapshot snapshot = organizationUnitBindingHelper.getFactorySnapshot(oldFactory);
                order.setOrgUnitId(snapshot.getOrgUnitId());
                order.setParentOrgUnitId(snapshot.getParentOrgUnitId());
                order.setParentOrgUnitName(snapshot.getParentOrgUnitName());
                order.setOrgPath(snapshot.getOrgPath());
                order.setFactoryContactPerson(oldFactory.getContactPerson());
                order.setFactoryContactPhone(oldFactory.getContactPhone());
            } else {
                order.setFactoryType("INTERNAL");
            }
        }

        // 标记日志条目为 undone
        targetEntry.put("status", "undone");
        targetEntry.put("undoneAt", LocalDateTime.now().toString());
        targetEntry.put("undoneBy", operator);
        targetEntry.put("undoneReason", safeStr(reason));
        logs.set(targetIdx, targetEntry);

        // 追加撤回备注
        String timeStr = LocalDateTime.now().format(FMT);
        appendRemark(order, String.format("[%s] 撤回转厂：%s → %s（已还原），操作人:%s，原因:%s",
                timeStr, newFactoryName, oldFactoryName, operator, safeStr(reason)));

        // 写回 JSON
        try {
            order.setTransferLogJson(MAPPER.writeValueAsString(logs));
        } catch (Exception e) {
            throw new RuntimeException("序列化转厂日志失败", e);
        }

        productionOrderService.updateById(order);

        if (wasFullTransfer && !"(未知)".equals(oldFactoryId)) {
            transferScanRecords(order.getId(), oldFactoryId, tenantId);
            Factory oldFactory = factoryService.getById(oldFactoryId);
            String oldFactoryType = (oldFactory != null && StringUtils.hasText(oldFactory.getFactoryType()))
                    ? oldFactory.getFactoryType() : "INTERNAL";
            syncCuttingDataFactoryId(order.getId(), oldFactoryId,
                    "(未知)".equals(oldFactoryName) ? "" : oldFactoryName, oldFactoryType);
        }

        // 通知原工厂（撤回后它恢复接单）
        SysNotice n1 = buildNotice(tenantId, orderNo,
                String.format("转厂撤回通知：订单 %s 已从【%s】撤回至【%s】，请恢复生产安排", orderNo, newFactoryName, oldFactoryName));
        if (!"(未知)".equals(oldFactoryId)) {
            sendNoticeToFactory(oldFactoryId, tenantId, n1);
        }

        // 通知新工厂（撤回后它失去订单）
        SysNotice n2 = buildNotice(tenantId, orderNo,
                String.format("转厂撤回通知：订单 %s 的转厂已被撤回，贵厂不再承接该订单", orderNo));
        sendNoticeToFactory(newFactoryId, tenantId, n2);

        log.info("[撤回转厂] orderNo={} undone entry seq={} by={}", orderNo, targetEntry.get("seq"), operator);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("orderNo", orderNo);
        result.put("undoneFrom", newFactoryName);
        result.put("restoredTo", oldFactoryName);
        if (wasFullTransfer) {
            result.put("note", "整单转厂记录已撤回，订单绑定工厂已还原为：" + oldFactoryName);
        } else {
            result.put("note", "部分转厂记录已撤回，备注已更新，订单绑定工厂无需变更");
        }
        return result;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 通知工厂
    // ─────────────────────────────────────────────────────────────────────────

    private void notifyFactory(String factoryId, Long tenantId,
                                String orderNo, String oldFactoryName, String newFactoryName,
                                boolean isFullTransfer, Integer transferQty, Integer totalQty,
                                String role) {
        if (factoryId == null || factoryId.isBlank()) {
            log.warn("[转厂通知] factoryId 为空，跳过 {} 工厂通知", role);
            return;
        }
        String title = isFullTransfer
                ? String.format("订单转厂通知（您为%s工厂）", role)
                : String.format("订单部分转厂通知（您为%s工厂）", role);
        String content = isFullTransfer
                ? String.format("订单 %s 已整单从【%s】转至【%s】，请知悉并更新生产安排。", orderNo, oldFactoryName, newFactoryName)
                : String.format("订单 %s 的 %d/%d 件已转至【%s】，剩余仍在【%s】，请知悉并协调生产安排。",
                        orderNo, transferQty, totalQty != null ? totalQty : 0, newFactoryName, oldFactoryName);

        SysNotice template = buildNotice(tenantId, orderNo, content);
        template.setTitle(title);
        sendNoticeToFactory(factoryId, tenantId, template);
    }

    private void sendNoticeToFactory(String factoryId, Long tenantId, SysNotice template) {
        if (factoryId == null || factoryId.isBlank() || "(未知)".equals(factoryId)) return;
        List<User> users = userService.lambdaQuery()
                .eq(User::getTenantId, tenantId)
                .eq(User::getFactoryId, factoryId)
                .eq(User::getStatus, "active")
                .list();
        if (users.isEmpty()) {
            log.info("[转厂通知] factoryId={} 无关联激活用户，跳过通知", factoryId);
            return;
        }
        for (User user : users) {
            SysNotice notice = new SysNotice();
            notice.setTenantId(template.getTenantId());
            notice.setOrderNo(template.getOrderNo());
            notice.setToName(user.getUsername());
            notice.setFromName("AI小云");
            notice.setTitle(template.getTitle());
            notice.setContent(template.getContent());
            notice.setNoticeType("factory_transfer");
            notice.setIsRead(0);
            notice.setCreatedAt(LocalDateTime.now());
            sysNoticeService.save(notice);
        }
        log.info("[转厂通知] factoryId={} 已通知 {} 人", factoryId, users.size());
    }

    private SysNotice buildNotice(Long tenantId, String orderNo, String content) {
        SysNotice n = new SysNotice();
        n.setTenantId(tenantId);
        n.setOrderNo(orderNo);
        n.setFromName("AI小云");
        n.setTitle("转厂变更通知");
        n.setContent(content);
        n.setNoticeType("factory_transfer");
        n.setIsRead(0);
        n.setCreatedAt(LocalDateTime.now());
        return n;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 结构化日志（transfer_log_json）
    // ─────────────────────────────────────────────────────────────────────────

    private void appendTransferLog(ProductionOrder order,
                                   String oldFactoryId, String oldFactoryName,
                                   String newFactoryId, String newFactoryName,
                                   boolean isFullTransfer, Integer transferQuantity,
                                   List<Map<String, Object>> colorSizeLines,
                                   String reason, String operator) {
        List<Map<String, Object>> logs = parseTransferLogs(order.getTransferLogJson());

        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("seq", logs.size() + 1);
        entry.put("timestamp", LocalDateTime.now().toString());
        entry.put("operator", operator);
        entry.put("oldFactoryId", safeStr(oldFactoryId));
        entry.put("oldFactoryName", safeStr(oldFactoryName));
        entry.put("newFactoryId", safeStr(newFactoryId));
        entry.put("newFactoryName", safeStr(newFactoryName));
        entry.put("isFullTransfer", isFullTransfer);
        entry.put("transferQuantity", isFullTransfer ? null : transferQuantity);
        entry.put("colorSizeLines", (colorSizeLines == null || colorSizeLines.isEmpty()) ? null : colorSizeLines);
        entry.put("reason", safeStr(reason));
        entry.put("status", "active");   // undo() 将其改为 "undone"

        logs.add(entry);
        try {
            order.setTransferLogJson(MAPPER.writeValueAsString(logs));
        } catch (Exception e) {
            // 序列化失败不应阻断转厂，仅记录警告
            log.warn("[转厂] 转厂日志序列化失败，不影响转厂操作", e);
        }
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> parseTransferLogs(String json) {
        if (json == null || json.isBlank()) return new ArrayList<>();
        try {
            return MAPPER.readValue(json, List.class);
        } catch (Exception e) {
            log.warn("[转厂] 解析 transfer_log_json 失败，重置为空列表。json={}", json);
            return new ArrayList<>();
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 辅助
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 将颜色码数明细列表转为可读字符串，例如 "红色/XL×30 蓝色/M×20"
     */
    private String buildColorSizeDetail(List<Map<String, Object>> lines) {
        if (lines == null || lines.isEmpty()) return "";
        StringBuilder sb = new StringBuilder();
        for (Map<String, Object> line : lines) {
            String color = resolveStr(line, "color", "colour", "颜色");
            String size  = resolveStr(line, "size", "sizeName", "尺码");
            Object qty   = line.get("quantity");
            if (!sb.isEmpty()) sb.append(" ");
            sb.append(safeStr(color)).append("/").append(safeStr(size))
              .append("×").append(qty == null ? "?" : qty);
        }
        return sb.toString();
    }

    private String resolveStr(Map<String, Object> map, String... keys) {
        for (String key : keys) {
            Object v = map.get(key);
            if (v != null && !v.toString().isBlank()) return v.toString();
        }
        return null;
    }

    private void appendRemark(ProductionOrder order, String msg) {
        String old = order.getRemarks() == null ? "" : order.getRemarks();
        order.setRemarks(old.isBlank() ? msg : old + "\n" + msg);
    }

    private void transferScanRecords(String orderId, String newFactoryId, Long tenantId) {
        List<ScanRecord> records = scanRecordService.lambdaQuery()
                .eq(ScanRecord::getOrderId, orderId)
                .eq(ScanRecord::getTenantId, tenantId)
                .ne(ScanRecord::getScanType, "orchestration")
                .list();
        if (records.isEmpty()) return;
        for (ScanRecord sr : records) {
            sr.setFactoryId(newFactoryId);
        }
        scanRecordService.updateBatchById(records);
        log.info("[转厂] 已更新 {} 条扫码记录的factoryId → {}", records.size(), newFactoryId);
    }

    private void syncCuttingDataFactoryId(String orderId, String factoryId,
                                           String factoryName, String factoryType) {
        if (!StringUtils.hasText(orderId) || !StringUtils.hasText(factoryId)) return;
        String normalizedFactoryType = factoryType != null ? factoryType.toUpperCase() : "EXTERNAL";

        try {
            List<CuttingTask> tasks = cuttingTaskService.list(
                    new LambdaQueryWrapper<CuttingTask>()
                            .eq(CuttingTask::getProductionOrderId, orderId));
            if (tasks != null && !tasks.isEmpty()) {
                for (CuttingTask task : tasks) {
                    task.setFactoryId(factoryId);
                    task.setFactoryType(normalizedFactoryType);
                }
                cuttingTaskService.updateBatchById(tasks);
                log.info("[转厂] 已更新 {} 条裁剪任务的factoryId/factoryType → {}", tasks.size(), factoryId);
            }
        } catch (Exception e) {
            log.error("[转厂] 裁剪任务工厂同步失败: orderId={}, error={}", orderId, e.getMessage());
            throw new BusinessException("裁剪任务工厂同步失败，转厂已回滚: " + e.getMessage());
        }

        try {
            List<CuttingBundle> bundles = cuttingBundleService.list(
                    new LambdaQueryWrapper<CuttingBundle>()
                            .eq(CuttingBundle::getProductionOrderId, orderId));
            if (bundles != null && !bundles.isEmpty()) {
                for (CuttingBundle bundle : bundles) {
                    bundle.setFactoryId(factoryId);
                }
                cuttingBundleService.updateBatchById(bundles);
                log.info("[转厂] 已更新 {} 条菲号的factoryId → {}", bundles.size(), factoryId);
            }
        } catch (Exception e) {
            log.error("[转厂] 菲号工厂同步失败: orderId={}, error={}", orderId, e.getMessage());
            throw new BusinessException("菲号工厂同步失败，转厂已回滚: " + e.getMessage());
        }
    }

    private void validateTransferEligibility(ProductionOrder order) {
        String status = order.getStatus();
        if (status != null && OrderStatusConstants.isTerminal(status)) {
            throw new BusinessException("订单已" + statusLabel(status) + "，不能转厂");
        }

        List<ScanRecord> allScans = scanRecordService.listByCondition(
                order.getId(), null, null, "success", null);

        if (allScans.stream().anyMatch(item ->
                StringUtils.hasText(item.getPayrollSettlementId())
                        || "settled".equalsIgnoreCase(item.getSettlementStatus()))) {
            throw new BusinessException("该订单已有工资结算记录，不能转厂");
        }

        if (allScans.stream().anyMatch(item -> "warehouse".equals(item.getScanType()))) {
            throw new BusinessException("该订单已有入库记录，不能转厂");
        }

        if (!allScans.isEmpty()) {
            throw new BusinessException("该订单已有 " + allScans.size() + " 条扫码登记记录，不能整单转厂。请通过PC端选择未扫码的菲号进行部分转单");
        }
    }

    private String statusLabel(String status) {
        if (status == null) return "未知";
        switch (status.toLowerCase()) {
            case "producing": return "生产中";
            case "pending": return "待生产";
            case "completed": return "已完成";
            case "cancelled": return "已取消";
            case "scrapped": return "已报废";
            case "archived": return "已归档";
            case "closed": return "已关单";
            default: return status;
        }
    }

    private String safeStr(Object s) {
        return (s == null || s.toString().isBlank()) ? "(未知)" : s.toString().trim();
    }
}
