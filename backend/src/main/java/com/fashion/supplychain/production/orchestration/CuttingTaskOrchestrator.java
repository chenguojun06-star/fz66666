package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.CuttingTask;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.CuttingTaskService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.service.UserService;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.security.access.AccessDeniedException;

@Service
@Slf4j
public class CuttingTaskOrchestrator {

    @Autowired
    private CuttingTaskService cuttingTaskService;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private CuttingBundleService cuttingBundleService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private UserService userService;

    @Autowired
    private ProductionProcessTrackingOrchestrator processTrackingOrchestrator;

    public IPage<CuttingTask> queryPage(Map<String, Object> params) {
        return cuttingTaskService.queryPage(params);
    }

    /**
     * 获取裁剪任务状态统计（各状态数量）
     */
    public Map<String, Object> getStatusStats(Map<String, Object> params) {
        // 获取有效订单ID列表（排除已删除的订单）
        List<ProductionOrder> allOrders = productionOrderService.list(
                new LambdaQueryWrapper<ProductionOrder>()
                        .select(ProductionOrder::getId)
                        .and(w -> w.isNull(ProductionOrder::getDeleteFlag).or().eq(ProductionOrder::getDeleteFlag, 0))
        );
        List<String> validOrderIds = allOrders.stream()
                .map(ProductionOrder::getId)
                .filter(StringUtils::hasText)
                .collect(Collectors.toList());

        // 基础过滤条件
        String orderNo = params != null ? getTrimmedText(params, "orderNo") : null;
        String styleNo = params != null ? getTrimmedText(params, "styleNo") : null;

        LambdaQueryWrapper<CuttingTask> baseWrapper = new LambdaQueryWrapper<CuttingTask>()
                .like(StringUtils.hasText(orderNo), CuttingTask::getProductionOrderNo, orderNo)
                .like(StringUtils.hasText(styleNo), CuttingTask::getStyleNo, styleNo);

        // 只查有效订单的任务
        if (!validOrderIds.isEmpty()) {
            baseWrapper.and(w -> w.in(CuttingTask::getProductionOrderId, validOrderIds)
                    .or().isNull(CuttingTask::getProductionOrderId));
        } else {
            baseWrapper.isNull(CuttingTask::getProductionOrderId);
        }

        List<CuttingTask> allTasks = cuttingTaskService.list(baseWrapper);

        long totalCount = allTasks.size();
        long pendingCount = allTasks.stream().filter(t -> "pending".equals(t.getStatus())).count();
        long receivedCount = allTasks.stream().filter(t -> "received".equals(t.getStatus())).count();
        long bundledCount = allTasks.stream().filter(t -> "bundled".equals(t.getStatus())).count();
        long totalQuantity = allTasks.stream()
                .mapToLong(t -> t.getOrderQuantity() != null ? t.getOrderQuantity() : 0)
                .sum();

        Map<String, Object> stats = new java.util.LinkedHashMap<>();
        stats.put("totalCount", totalCount);
        stats.put("totalQuantity", totalQuantity);
        stats.put("pendingCount", pendingCount);
        stats.put("receivedCount", receivedCount);
        stats.put("bundledCount", bundledCount);
        return stats;
    }

    private String getTrimmedText(Map<String, Object> body, String key) {
        if (body == null || key == null) {
            return null;
        }
        Object v = body.get(key);
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return StringUtils.hasText(s) ? s : null;
    }

    @Transactional(rollbackFor = Exception.class)
    public CuttingTask createCustom(Map<String, Object> body) {
        String styleNo = getTrimmedText(body, "styleNo");
        String receiverId = getTrimmedText(body, "receiverId");
        String receiverName = getTrimmedText(body, "receiverName");
        String orderNo = getTrimmedText(body, "orderNo");

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> bundles = body == null ? null : (List<Map<String, Object>>) body.get("bundles");

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> processUnitPrices = body == null ? null : (List<Map<String, Object>>) body.get("processUnitPrices");

        if (!StringUtils.hasText(styleNo) || bundles == null || bundles.isEmpty()) {
            throw new IllegalArgumentException("参数错误");
        }

        StyleInfo style = styleInfoService.lambdaQuery()
                .eq(StyleInfo::getStyleNo, styleNo)
                .eq(StyleInfo::getStatus, "ENABLED")
                .last("limit 1")
                .one();
        if (style == null) {
            throw new NoSuchElementException("款号不存在");
        }

        // 生成 CUT 前缀订单号（若用户未提供）
        String finalOrderNo = StringUtils.hasText(orderNo)
                ? orderNo
                : "CUT" + DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS").format(LocalDateTime.now());

        CuttingTask existed = cuttingTaskService.getOne(
                new LambdaQueryWrapper<CuttingTask>()
                        .eq(CuttingTask::getProductionOrderNo, finalOrderNo)
                        .last("limit 1"));
        if (existed != null) {
            finalOrderNo = finalOrderNo + "-" + String.valueOf(System.nanoTime()).substring(8);
        }

        LocalDateTime now = LocalDateTime.now();

        // ── 1. 构建 progressWorkflowJson（从前端传来的 processUnitPrices）──────
        String progressWorkflowJson = null;
        if (processUnitPrices != null && !processUnitPrices.isEmpty()) {
            List<Map<String, Object>> nodes = new ArrayList<>();
            for (Map<String, Object> p : processUnitPrices) {
                String processName = p.get("processName") == null ? null : String.valueOf(p.get("processName")).trim();
                if (!StringUtils.hasText(processName)) continue;
                Map<String, Object> node = new java.util.LinkedHashMap<>();
                node.put("name", processName);
                if (StringUtils.hasText(p.get("processCode") == null ? null : String.valueOf(p.get("processCode")).trim())) {
                    node.put("processCode", String.valueOf(p.get("processCode")).trim());
                }
                node.put("unitPrice", p.get("unitPrice") != null ? p.get("unitPrice") : 0);
                nodes.add(node);
            }
            if (!nodes.isEmpty()) {
                Map<String, Object> workflow = new java.util.LinkedHashMap<>();
                workflow.put("nodes", nodes);
                try {
                    progressWorkflowJson = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(workflow);
                } catch (Exception ex) {
                    log.warn("构建 progressWorkflowJson 失败", ex);
                }
            }
        }

        // ── 2. 创建关联的 ProductionOrder（CUT 前缀，支持扫码计件）────────────
        ProductionOrder order = new ProductionOrder();
        order.setOrderNo(finalOrderNo);
        order.setStyleId(style.getId() == null ? null : String.valueOf(style.getId()));
        order.setStyleNo(styleNo);
        order.setStyleName(style.getStyleName());
        order.setColor(style.getColor());
        order.setSize(style.getSize());
        order.setStatus("production");
        order.setDeleteFlag(0);
        order.setProgressWorkflowJson(progressWorkflowJson);
        order.setCreateTime(now);
        order.setUpdateTime(now);
        // factory_name NOT NULL — 自定义裁剪单无绑定工厂，置为空串避免 SQL STRICT 报错
        order.setFactoryName("");
        // 设置租户 ID 及创建人
        com.fashion.supplychain.common.UserContext ctx = com.fashion.supplychain.common.UserContext.get();
        if (ctx != null && ctx.getTenantId() != null) {
            order.setTenantId(ctx.getTenantId());
        }
        if (ctx != null) {
            order.setCreatedById(ctx.getUserId() == null ? null : String.valueOf(ctx.getUserId()));
            order.setCreatedByName(ctx.getUsername());
        }

        boolean orderOk = productionOrderService.save(order);
        if (!orderOk) {
            throw new IllegalStateException("创建生产订单失败");
        }
        log.info("自定义裁剪单已关联生产订单: orderNo={}, orderId={}, progressWorkflowJson={}",
                finalOrderNo, order.getId(), progressWorkflowJson != null ? "已设置" : "未设置（无工序单价）");

        // ── 3. 构建 CuttingBundle 并关联 productionOrderId ──────────────────
        List<CuttingBundle> toSave = new ArrayList<>();
        int bundleNo = 1;
        int totalQty = 0;

        for (Map<String, Object> item : bundles) {
            if (item == null) {
                continue;
            }
            String color = item.get("color") == null ? null : String.valueOf(item.get("color")).trim();
            String size = item.get("size") == null ? null : String.valueOf(item.get("size")).trim();
            Object quantityObj = item.get("quantity");
            Integer quantity = null;
            if (quantityObj != null) {
                try {
                    quantity = Integer.parseInt(String.valueOf(quantityObj).trim());
                } catch (Exception e) {
                    log.warn("Invalid cutting bundle quantity when creating task: value={}", quantityObj, e);
                }
            }
            if (!StringUtils.hasText(color) || !StringUtils.hasText(size) || quantity == null || quantity <= 0) {
                continue;
            }

            CuttingBundle b = new CuttingBundle();
            b.setProductionOrderId(order.getId());   // ✅ 关联生产订单
            b.setProductionOrderNo(finalOrderNo);
            b.setStyleId(style.getId() == null ? null : String.valueOf(style.getId()));
            b.setStyleNo(styleNo);
            b.setColor(color);
            b.setSize(size);
            b.setQuantity(quantity);
            b.setBundleNo(bundleNo);
            b.setQrCode(buildQrCode(finalOrderNo, styleNo, color, size, quantity, bundleNo));
            b.setStatus("created");
            b.setCreateTime(now);
            b.setUpdateTime(now);
            toSave.add(b);

            totalQty += quantity;
            bundleNo++;
        }

        if (toSave.isEmpty()) {
            throw new IllegalArgumentException("请至少录入一行有效的颜色/尺码/数量");
        }

        // ── 4. 保存 CuttingTask，关联 productionOrderId ──────────────────────
        CuttingTask task = new CuttingTask();
        task.setProductionOrderId(order.getId());    // ✅ 关联生产订单
        task.setProductionOrderNo(finalOrderNo);
        task.setOrderQrCode(null);
        task.setStyleId(style.getId() == null ? null : String.valueOf(style.getId()));
        task.setStyleNo(styleNo);
        task.setStyleName(style.getStyleName());
        task.setColor(style.getColor());
        task.setSize(style.getSize());
        task.setOrderQuantity(totalQty);
        task.setStatus("bundled");
        task.setReceiverId(receiverId);
        task.setReceiverName(receiverName);
        task.setReceivedTime(now);
        task.setBundledTime(now);
        task.setCreateTime(now);
        task.setUpdateTime(now);

        boolean ok = cuttingTaskService.save(task);
        if (!ok) {
            throw new IllegalStateException("创建失败");
        }

        boolean bundlesOk = cuttingBundleService.saveBatch(toSave);
        if (!bundlesOk) {
            throw new IllegalStateException("创建失败");
        }

        // ── 5. 初始化工序跟踪（有 progressWorkflowJson 才会生成记录）──────────
        if (StringUtils.hasText(progressWorkflowJson)) {
            try {
                int trackingCount = processTrackingOrchestrator.initializeProcessTracking(order.getId());
                log.info("自定义裁剪单初始化工序跟踪成功: orderId={}, 菲号数={}, tracking记录数={}",
                        order.getId(), toSave.size(), trackingCount);
            } catch (Exception e) {
                log.error("初始化工序跟踪失败：orderId={}", order.getId(), e);
            }
        } else {
            log.info("自定义裁剪单未配置工序单价，跳过工序跟踪初始化 orderId={}", order.getId());
        }

        task.setCuttingQuantity(totalQty);
        task.setCuttingBundleCount(toSave.size());
        return task;
    }

    public CuttingTask receive(Map<String, Object> body) {
        String taskId = getTrimmedText(body, "taskId");
        String receiverId = getTrimmedText(body, "receiverId");
        String receiverName = getTrimmedText(body, "receiverName");

        if (!StringUtils.hasText(taskId)) {
            throw new IllegalArgumentException("参数错误");
        }

        CuttingTask task = cuttingTaskService.getById(taskId);
        if (task == null) {
            throw new NoSuchElementException("裁剪任务不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(task.getTenantId(), "裁剪任务");

        String orderId = task.getProductionOrderId();
        if (StringUtils.hasText(orderId)) {
            ProductionOrder order = productionOrderService.getById(orderId.trim());
            int rate = order == null || order.getMaterialArrivalRate() == null ? 0 : order.getMaterialArrivalRate();

            // 检查物料是否完成：要么到货率100%，要么已手动确认完成
            boolean materialReady = false;
            if (rate >= 100) {
                materialReady = true;
            } else if (order != null && order.getProcurementManuallyCompleted() != null
                    && order.getProcurementManuallyCompleted() == 1) {
                materialReady = true;
            }

            if (!materialReady) {
                throw new IllegalStateException("物料未到齐，无法领取裁剪任务");
            }
        }

        // 检查是否已被他人领取
        String status = task.getStatus() == null ? "" : task.getStatus().trim();
        String existingReceiverId = task.getReceiverId() == null ? null : task.getReceiverId().trim();
        String existingReceiverName = task.getReceiverName() == null ? null : task.getReceiverName().trim();

        if (!"pending".equals(status) && StringUtils.hasText(status)) {
            // 已被领取，检查是否是同一个人
            boolean isSame = false;
            if (StringUtils.hasText(receiverId) && StringUtils.hasText(existingReceiverId)) {
                isSame = receiverId.trim().equals(existingReceiverId);
            } else if (StringUtils.hasText(receiverName) && StringUtils.hasText(existingReceiverName)) {
                isSame = receiverName.trim().equals(existingReceiverName);
            }
            if (!isSame) {
                String otherName = StringUtils.hasText(existingReceiverName) ? existingReceiverName : "他人";
                throw new IllegalStateException("该任务已被「" + otherName + "」领取，无法重复领取");
            }
        }

        boolean ok = cuttingTaskService.receiveTask(taskId, receiverId, receiverName);
        if (!ok) {
            // 再次检查最新状态
            CuttingTask latest = cuttingTaskService.getById(taskId);
            if (latest != null) {
                String latestReceiverName = latest.getReceiverName() == null ? null : latest.getReceiverName().trim();
                String latestReceiverId = latest.getReceiverId() == null ? null : latest.getReceiverId().trim();
                boolean isSameNow = false;
                if (StringUtils.hasText(receiverId) && StringUtils.hasText(latestReceiverId)) {
                    isSameNow = receiverId.trim().equals(latestReceiverId);
                } else if (StringUtils.hasText(receiverName) && StringUtils.hasText(latestReceiverName)) {
                    isSameNow = receiverName.trim().equals(latestReceiverName);
                }
                if (!isSameNow && StringUtils.hasText(latestReceiverName)) {
                    throw new IllegalStateException("该任务已被「" + latestReceiverName + "」领取，无法重复领取");
                }
            }
            throw new IllegalStateException("领取失败");
        }

        CuttingTask updated = cuttingTaskService.getById(taskId);
        if (updated == null) {
            throw new IllegalStateException("领取失败");
        }
        return updated;
    }

    @Transactional(rollbackFor = Exception.class)
    public CuttingTask rollback(Map<String, Object> body) {
        String taskId = getTrimmedText(body, "taskId");
        String operatorIdStr = getTrimmedText(body, "operatorId");
        String reason = getTrimmedText(body, "reason");

        if (!StringUtils.hasText(taskId)) {
            throw new IllegalArgumentException("参数错误");
        }

        if (!StringUtils.hasText(operatorIdStr)) {
            throw new IllegalArgumentException("缺少操作人");
        }

        if (!StringUtils.hasText(reason)) {
            throw new IllegalArgumentException("退回原因不能为空");
        }

        Long operatorId;
        try {
            operatorId = Long.parseLong(operatorIdStr.trim());
        } catch (Exception e) {
            throw new IllegalArgumentException("操作人参数错误");
        }

        User operator = userService.getById(operatorId);
        if (operator == null || !isAdmin(operator)) {
            throw new AccessDeniedException("无权限退回");
        }

        CuttingTask task = cuttingTaskService.getById(taskId);
        if (task == null) {
            throw new NoSuchElementException("裁剪任务不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(task.getTenantId(), "裁剪任务");

        boolean ok = cuttingTaskService.rollbackTask(taskId);
        if (!ok) {
            throw new IllegalStateException("退回失败");
        }

        cuttingTaskService.insertRollbackLog(task, operatorIdStr.trim(), operator.getName(), reason);

        CuttingTask updated = cuttingTaskService.getById(taskId);
        if (updated == null) {
            throw new IllegalStateException("退回失败");
        }
        return updated;
    }

    private boolean isAdmin(User user) {
        if (user == null) {
            return false;
        }
        Long roleId = user.getRoleId();
        if (roleId != null && roleId == 1L) {
            return true;
        }
        String roleName = user.getRoleName();
        if (roleName == null) {
            return false;
        }
        String r = roleName.trim();
        if (r.isEmpty()) {
            return false;
        }
        String lower = r.toLowerCase();
        return lower.contains("admin") || lower.contains("manager") || r.contains("管理员") || r.contains("主管");
    }

    private String buildQrCode(String orderNo, String styleNo, String color, String size, int quantity, int bundleNo) {
        StringBuilder sb = new StringBuilder();
        if (StringUtils.hasText(orderNo)) {
            sb.append(orderNo);
        }
        sb.append("-");
        if (StringUtils.hasText(styleNo)) {
            sb.append(styleNo);
        }
        sb.append("-");
        if (StringUtils.hasText(color)) {
            sb.append(color);
        }
        sb.append("-");
        if (StringUtils.hasText(size)) {
            sb.append(size);
        }
        sb.append("-").append(Math.max(quantity, 0));
        sb.append("-").append(bundleNo);
        return sb.toString();
    }

    /**
     * 获取当前用户的裁剪任务（已领取，待生成菲号）
     * 注意：排除已关闭/已完成/已取消/已归档的订单
     */
    public List<CuttingTask> getMyTasks() {
        com.fashion.supplychain.common.UserContext ctx = com.fashion.supplychain.common.UserContext.get();
        String userId = ctx == null ? null : ctx.getUserId();
        if (!StringUtils.hasText(userId)) {
            return new ArrayList<>();
        }

        // 查询当前用户已领取的裁剪任务（status = received）
        List<CuttingTask> tasks = cuttingTaskService.lambdaQuery()
                .eq(CuttingTask::getReceiverId, userId)
                .eq(CuttingTask::getStatus, "received")
                .orderByDesc(CuttingTask::getReceivedTime)
                .list();

        // 过滤掉已关闭/已完成订单对应的任务
        if (tasks.isEmpty()) {
            return tasks;
        }

        Set<String> orderIds = tasks.stream()
                .map(CuttingTask::getProductionOrderId)
                .filter(StringUtils::hasText)
                .collect(Collectors.toSet());

        if (orderIds.isEmpty()) {
            return tasks;
        }

        // 查询有效订单（排除已关闭/已完成/已取消/已归档）
        Set<String> validOrderIds = productionOrderService.lambdaQuery()
                .in(ProductionOrder::getId, orderIds)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .notIn(ProductionOrder::getStatus, "closed", "completed", "cancelled", "archived")
                .list()
                .stream()
                .map(ProductionOrder::getId)
                .collect(Collectors.toSet());

        // 只返回有效订单的任务
        return tasks.stream()
                .filter(task -> validOrderIds.contains(task.getProductionOrderId()))
                .collect(Collectors.toList());
    }
}
