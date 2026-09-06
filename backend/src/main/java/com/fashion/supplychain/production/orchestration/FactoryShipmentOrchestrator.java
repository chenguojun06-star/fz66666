package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.orchestration.BillAggregationOrchestrator;
import com.fashion.supplychain.production.entity.FactoryShipment;
import com.fashion.supplychain.production.entity.FactoryShipmentDetail;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.FactoryShipmentService;
import com.fashion.supplychain.production.service.FactoryShipmentDetailService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 外发工厂发货/收货 Orchestrator。
 *
 * <p>闭环流程（职责边界）：
 * <ol>
 *   <li>外发工厂发货 (ship) → 创建发货单，状态 pending</li>
 *   <li>本厂收货确认 (receive) → 确认物流到货数量，状态 received</li>
 *   <li>质检入库 → 由 /production/warehousing 页面负责（不在本模块）</li>
 *   <li>次品返修 → 由质检入库流程处理（不在本模块）</li>
 * </ol>
 * </p>
 *
 * <p>关键规则：
 * <ul>
 *   <li>发货/收货不做库存变更 — 库存变更由成品入库(ProductWarehousing)负责</li>
 *   <li>收货由租户（本厂）操作，非外发工厂账号</li>
 *   <li>发货量不能超过裁剪总量</li>
 * </ul>
 * </p>
 */
@Service
@Slf4j
public class FactoryShipmentOrchestrator {

    @Autowired
    private FactoryShipmentService factoryShipmentService;
    @Autowired
    private CuttingBundleService cuttingBundleService;
    @Autowired
    private ProductionOrderService productionOrderService;
    @Autowired
    private FactoryShipmentDetailService factoryShipmentDetailService;

    @Autowired(required = false)
    private BillAggregationOrchestrator billAggregationOrchestrator;

    // ===== 发货/收货通知（D-309 小云待办数据源） =====

    /**
     * D-310 订单级发货限制切换：仅租户管理方（租户主/dataScope=all）可操作；工厂账号拒绝。
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean setShipLock(String orderId, boolean locked) {
        if (!StringUtils.hasText(orderId)) {
            throw new IllegalArgumentException("缺少订单 ID");
        }
        if (StringUtils.hasText(UserContext.factoryId())) {
            throw new org.springframework.security.access.AccessDeniedException("外发工厂账号不可操作发货限制");
        }
        com.fashion.supplychain.common.UserContext ctx = UserContext.get();
        boolean isTenantAdmin = UserContext.isTenantOwner()
                || "all".equalsIgnoreCase(UserContext.getDataScope());
        if (!isTenantAdmin) {
            throw new org.springframework.security.access.AccessDeniedException("仅租户管理方可操作发货限制");
        }
        ProductionOrder order = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getId, orderId.trim())
                .eq(ProductionOrder::getTenantId, UserContext.tenantId())
                .one();
        if (order == null) {
            throw new IllegalArgumentException("订单不存在");
        }
        boolean ok = productionOrderService.lambdaUpdate()
                .eq(ProductionOrder::getId, order.getId())
                .set(ProductionOrder::getFactoryShipLocked, locked ? 1 : 0)
                .update();
        log.info("[ShipmentLock] 订单 {} 发货限制切换为 {}: 操作人={}", order.getOrderNo(), locked, ctx == null ? "" : ctx.getUsername());
        return ok;
    }


    /**
     * 通知口径：
     * - 工厂账号：本厂近 7 天被确认收货（received/partial）的发货单 → 回执通知；
     * - 租户侧：receiveStatus=pending（工厂已发货待收货确认）；管理员/租户主看全部，
     *   跟单员只看 merchandiser 等于自己姓名的订单（无跟单人的订单仅管理员/租户主可见）。
     */
    public Map<String, Object> shipmentNotifications() {
        Map<String, Object> result = new LinkedHashMap<>();
        Long tenantId = UserContext.tenantId();
        String ctxFactoryId = UserContext.factoryId();

        if (StringUtils.hasText(ctxFactoryId)) {
            // 工厂账号：近 7 天收货确认回执
            LocalDateTime since = LocalDateTime.now().minusDays(7);
            List<FactoryShipment> receipts = factoryShipmentService.lambdaQuery()
                    .eq(FactoryShipment::getTenantId, tenantId)
                    .eq(FactoryShipment::getFactoryId, ctxFactoryId)
                    .in(FactoryShipment::getReceiveStatus, "received", "partial")
                    .ge(FactoryShipment::getReceiveTime, since)
                    .orderByDesc(FactoryShipment::getReceiveTime)
                    .last("LIMIT 20")
                    .list();
            result.put("type", "factory");
            result.put("receipts", receipts);
            return result;
        }

        // 租户侧：待收货确认
        List<FactoryShipment> pending = factoryShipmentService.lambdaQuery()
                .eq(FactoryShipment::getTenantId, tenantId)
                .eq(FactoryShipment::getReceiveStatus, "pending")
                .orderByDesc(FactoryShipment::getShipTime)
                .last("LIMIT 50")
                .list();

        // 跟单口径：管理员/租户主全见；跟单员仅看自己跟单的订单
        boolean isTenantAdmin = Boolean.TRUE.equals(UserContext.get() != null ? UserContext.get().isTenantOwner() : false)
                || "all".equalsIgnoreCase(UserContext.getDataScope());
        String myName = UserContext.get() != null ? UserContext.get().getUsername() : null;
        if (!isTenantAdmin && pending != null && !pending.isEmpty()) {
            Set<String> orderIds = new LinkedHashSet<>();
            for (FactoryShipment fs : pending) {
                if (StringUtils.hasText(fs.getOrderId())) orderIds.add(fs.getOrderId());
            }
            Set<String> myOrderIds = new HashSet<>();
            if (!orderIds.isEmpty()) {
                List<ProductionOrder> orders = productionOrderService.listByIds(orderIds);
                for (ProductionOrder o : orders) {
                    if (o != null && StringUtils.hasText(o.getMerchandiser())
                            && o.getMerchandiser().trim().equals(myName == null ? "" : myName.trim())) {
                        myOrderIds.add(o.getId());
                    }
                }
            }
            pending = pending.stream()
                    .filter(fs -> myOrderIds.contains(fs.getOrderId()))
                    .collect(Collectors.toList());
        }
        result.put("type", "tenant");
        result.put("pendingReceipts", pending);
        result.put("pendingReceiptCount", pending == null ? 0 : pending.size());
        return result;
    }

    // ===== 发货 =====

    /**
     * 外发工厂发货 — 创建发货单（仅物流记录，不影响库存）。
     */
    @Transactional(rollbackFor = Exception.class)
    public Result<FactoryShipment> ship(Map<String, Object> params) {
        TenantAssert.assertTenantContext();
        String orderId = (String) params.get("orderId");
        if (!StringUtils.hasText(orderId)) {
            return Result.fail("缺少 orderId");
        }
        // P1 多租户隔离：用 lambdaQuery 带 tenantId 替代 getById（前置校验）
        Long tenantId = UserContext.tenantId();
        ProductionOrder order = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getId, orderId)
                .eq(ProductionOrder::getTenantId, tenantId)
                .one();
        if (order == null) {
            return Result.fail("订单不存在");
        }
        if (!"EXTERNAL".equalsIgnoreCase(order.getFactoryType())) {
            return Result.fail("仅外发订单可创建发货单，当前订单工厂类型为 " + order.getFactoryType());
        }
        String ctxFactoryId = UserContext.factoryId();
        if (StringUtils.hasText(ctxFactoryId) && !ctxFactoryId.equals(order.getFactoryId())) {
            return Result.fail("无权操作其他工厂的订单");
        }
        // D-310：订单级发货限制——订单异常时管理方在订单上单独锁定，工厂/本厂都无法发货
        if (order.getFactoryShipLocked() != null && order.getFactoryShipLocked() == 1) {
            return Result.fail("该订单已限制外发工厂发货（订单异常锁定），请联系本厂管理解除");
        }
        // D-310：终态订单不能再发货（已完成/已关单/已取消/已报废/已归档）
        if (com.fashion.supplychain.common.constant.OrderStatusConstants.isTerminal(order.getStatus())) {
            return Result.fail("订单已" + com.fashion.supplychain.common.constant.OrderStatusConstants.toChinese(order.getStatus())
                    + "，不能再发货");
        }

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> details = (List<Map<String, Object>>) params.get("details");
        if (details == null || details.isEmpty()) {
            return Result.fail("请填写发货明细（颜色/尺码/数量）");
        }
        int shipQuantity = details.stream()
                .mapToInt(d -> d.get("quantity") instanceof Number ? ((Number) d.get("quantity")).intValue() : 0)
                .sum();
        if (shipQuantity <= 0) {
            return Result.fail("发货数量明细总量必须大于 0");
        }

        // 裁剪总量上限校验
        Map<String, Object> summary = cuttingBundleService.summarize(order.getOrderNo(), orderId);
        int cuttingTotal = summary != null ? (int) summary.getOrDefault("totalQuantity", 0) : 0;
        int alreadyShipped = factoryShipmentService.sumShippedByOrderId(orderId);
        if (alreadyShipped + shipQuantity > cuttingTotal) {
            return Result.fail("发货数量超限，裁剪总量 " + cuttingTotal
                    + "，已发 " + alreadyShipped + "，本次 " + shipQuantity);
        }

        FactoryShipment fs = new FactoryShipment();
        fs.setShipmentNo(factoryShipmentService.buildShipmentNo());
        fs.setOrderId(orderId);
        fs.setOrderNo(order.getOrderNo());
        fs.setStyleNo(order.getStyleNo());
        fs.setStyleName(order.getStyleName());
        fs.setFactoryId(order.getFactoryId());
        fs.setFactoryName(order.getFactoryName());
        fs.setShipQuantity(shipQuantity);
        fs.setShipTime(LocalDateTime.now());
        fs.setShippedBy(UserContext.userId());
        fs.setShippedByName(UserContext.username());
        fs.setTrackingNo((String) params.get("trackingNo"));
        fs.setExpressCompany((String) params.get("expressCompany"));
        fs.setShipMethod((String) params.get("shipMethod"));
        fs.setRemark((String) params.get("remark"));
        fs.setReceiveStatus("pending");
        fs.setReceivedQuantity(0);

        factoryShipmentService.save(fs);
        factoryShipmentDetailService.saveDetails(fs.getId(), details, UserContext.tenantId());

        log.info("[FactoryShipment] 发货 shipmentNo={} orderId={} qty={} lines={} factory={}",
                fs.getShipmentNo(), orderId, shipQuantity, details.size(), order.getFactoryName());
        return Result.success(fs);
    }

    // ===== 收货确认（仅物流到货确认，不做质检） =====

    /**
     * 收货确认 — 仅确认到货数量，不做质检。
     * 质检由 /production/warehousing 页面负责。
     */
    @Transactional(rollbackFor = Exception.class)
    public Result<FactoryShipment> receive(String shipmentId, Integer receivedQuantity,
                                            List<Map<String, Object>> receivedDetails) {
        if (!StringUtils.hasText(shipmentId)) {
            return Result.fail("缺少发货单 ID");
        }
        // P1 多租户隔离：用 lambdaQuery 带 tenantId 替代 getById（前置校验）
        Long tenantId = UserContext.tenantId();
        FactoryShipment fs = factoryShipmentService.lambdaQuery()
                .eq(FactoryShipment::getId, shipmentId)
                .eq(FactoryShipment::getTenantId, tenantId)
                .one();
        if (fs == null) {
            return Result.fail("发货单不存在");
        }
        // D-310：终态/锁定订单不能再收货确认
        if (StringUtils.hasText(fs.getOrderId())) {
            ProductionOrder receiveOrder = productionOrderService.lambdaQuery()
                    .eq(ProductionOrder::getId, fs.getOrderId())
                    .eq(ProductionOrder::getTenantId, tenantId)
                    .one();
            if (receiveOrder != null) {
                if (receiveOrder.getFactoryShipLocked() != null && receiveOrder.getFactoryShipLocked() == 1) {
                    return Result.fail("该订单已限制外发发货（订单异常锁定），收货确认暂缓，请联系本厂管理解除");
                }
                if (com.fashion.supplychain.common.constant.OrderStatusConstants.isTerminal(receiveOrder.getStatus())) {
                    return Result.fail("订单已" + com.fashion.supplychain.common.constant.OrderStatusConstants.toChinese(receiveOrder.getStatus())
                            + "，不能再收货确认");
                }
            }
        }
        // D-242：支持分批（部分）收货。
        // 旧逻辑无论收到多少都一把置为 received，导致「发 100 只到 60」时剩余 40 件
        // 无法继续收货、也没有任何记录，形成悬空数据。
        // 现改为：pending/partial 均可继续收货，累计达到发货数量才置为 received。
        String currentStatus = fs.getReceiveStatus();
        if ("received".equals(currentStatus)) {
            return Result.fail("该发货单已全部收货完成，无需重复收货");
        }
        if (!"pending".equals(currentStatus) && !"partial".equals(currentStatus)) {
            return Result.fail("该发货单状态为 " + currentStatus + "，无法收货");
        }

        String ctxFactoryId = UserContext.factoryId();
        if (StringUtils.hasText(ctxFactoryId)) {
            return Result.fail("外发工厂账号不可操作收货，请使用本厂账号登录");
        }

        int shipQty = fs.getShipQuantity() == null ? 0 : fs.getShipQuantity();
        int alreadyReceived = fs.getReceivedQuantity() == null ? 0 : fs.getReceivedQuantity();
        int remaining = Math.max(0, shipQty - alreadyReceived);
        if (remaining <= 0) {
            return Result.fail("该发货单已收满(" + shipQty + "件)，无需重复收货");
        }

        // 不传数量 = 收完剩余全部；传了则按本次到货数量累加
        int actualQty = (receivedQuantity != null && receivedQuantity > 0) ? receivedQuantity : remaining;

        if (actualQty > remaining) {
            return Result.fail("本次到货数量(" + actualQty + ")超过待收数量(" + remaining
                    + ")，该发货单共发 " + shipQty + " 件，已收 " + alreadyReceived + " 件");
        }

        int totalReceived = alreadyReceived + actualQty;
        fs.setReceiveStatus(totalReceived >= shipQty ? "received" : "partial");
        fs.setReceivedQuantity(totalReceived);
        fs.setReceiveTime(LocalDateTime.now());
        fs.setReceivedBy(UserContext.userId());
        fs.setReceivedByName(UserContext.username());
        factoryShipmentService.updateById(fs);

        if (receivedDetails != null && !receivedDetails.isEmpty()) {
            factoryShipmentDetailService.updateReceivedDetails(shipmentId, receivedDetails);
        }

        revertBundleFactoryIdOnReceive(fs.getOrderId());

        log.info("[FactoryShipment] 收货确认 shipmentId={} orderId={} shipQty={} 本次={} 累计={} status={} detailLines={}",
                shipmentId, fs.getOrderId(), fs.getShipQuantity(), actualQty, totalReceived,
                fs.getReceiveStatus(), receivedDetails != null ? receivedDetails.size() : 0);
        return Result.success(fs);
    }

    // ===== 删除发货单 =====

    @Transactional(rollbackFor = Exception.class)
    public Result<Void> deleteShipment(String shipmentId) {
        if (!StringUtils.hasText(shipmentId)) {
            return Result.fail("缺少发货单 ID");
        }
        // P1 多租户隔离：用 lambdaQuery 带 tenantId 替代 getById（前置校验）
        Long tenantId = UserContext.tenantId();
        FactoryShipment fs = factoryShipmentService.lambdaQuery()
                .eq(FactoryShipment::getId, shipmentId)
                .eq(FactoryShipment::getTenantId, tenantId)
                .one();
        if (fs == null) {
            return Result.fail("发货单不存在");
        }
        // D-242：partial（已部分收货）同样不可删除，否则已收数量会凭空消失
        if ("received".equals(fs.getReceiveStatus())) {
            return Result.fail("已收货的发货单不可删除，如需退货请联系管理员");
        }
        if ("partial".equals(fs.getReceiveStatus())) {
            return Result.fail("该发货单已收货 "
                    + (fs.getReceivedQuantity() == null ? 0 : fs.getReceivedQuantity())
                    + " 件，不可删除，请继续收货完成后再处理");
        }
        String ctxFactoryId = UserContext.factoryId();
        if (StringUtils.hasText(ctxFactoryId) && !ctxFactoryId.equals(fs.getFactoryId())) {
            return Result.fail("无权操作其他工厂的发货单");
        }

        // P0-3 修复：删除前校验对账状态（数据链路闭环）
        // 如果该订单已产生成品对账账单（SHIPPMENT_RECONCILIATION），禁止删除
        // 避免发货量与对账金额不一致的悬挂数据
        Result<Void> reconCheck = assertShipmentReversible(fs);
        if (reconCheck != null && reconCheck.getCode() != null && reconCheck.getCode() != 200) {
            return reconCheck;
        }

        FactoryShipment patch = new FactoryShipment();
        patch.setId(shipmentId);
        patch.setDeleteFlag(1);
        patch.setUpdateTime(LocalDateTime.now());
        factoryShipmentService.updateById(patch);

        log.info("[FactoryShipment] 软删除发货单 shipmentId={}", shipmentId);
        return Result.success(null);
    }

    /**
     * P0-3 修复：校验发货单是否可删除（未产生对账账单）
     * <p>
     * 通过 BillAggregationOrchestrator.billExistsByOrderId 检查订单是否已推过
     * SHIPMENT_RECONCILIATION 账单：
     * - 存在账单：禁止删除，提示用户先撤销对账或联系财务
     * - 不存在账单：允许删除
     *
     * @return null 表示可删除；非 null Result 表示禁止删除的原因
     */
    private Result<Void> assertShipmentReversible(FactoryShipment fs) {
        if (billAggregationOrchestrator == null) {
            return null; // orchestrator 未注入，跳过校验
        }
        String orderId = fs.getOrderId();
        if (!StringUtils.hasText(orderId)) {
            return null;
        }
        try {
            if (billAggregationOrchestrator.billExistsByOrderId("SHIPMENT_RECONCILIATION", orderId)) {
                return Result.fail("该发货单关联的订单已产生成品对账账单，"
                        + "请先在财务中心撤销对账或联系财务人员处理后再删除");
            }
        } catch (Exception e) {
            // P2 审计修复：fail-safe 原则 — 账单服务异常时禁止删除（避免误删已对账的发货单）
            log.error("[FactoryShipment] 对账状态校验异常（fail-safe 阻止删除）: shipmentId={}, orderId={}, err={}",
                    fs.getId(), orderId, e.getMessage(), e);
            return Result.fail("账单服务暂时不可用，无法校验对账状态，请稍后重试或联系财务人员");
        }
        return null;
    }

    // ===== 查询 =====

    public Map<String, Object> getShippableInfo(String orderId) {
        // P0 修复（铁律4 多租户隔离）：强制租户上下文校验
        Long tenantId = TenantAssert.requireTenantId();
        ProductionOrder order = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getId, orderId)
                .eq(ProductionOrder::getTenantId, tenantId)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .one();
        // P0 修复：工厂账号只能查看自己工厂订单的可发货信息
        if (order != null) {
            String ctxFactoryId = UserContext.factoryId();
            if (StringUtils.hasText(ctxFactoryId) && !ctxFactoryId.equals(order.getFactoryId())) {
                throw new org.springframework.security.access.AccessDeniedException("无权查看其他工厂订单的发货信息");
            }
        }
        int cuttingTotal = 0;
        if (order != null) {
            Map<String, Object> summary = cuttingBundleService.summarize(order.getOrderNo(), orderId);
            cuttingTotal = summary != null ? (int) summary.getOrDefault("totalQuantity", 0) : 0;
        }
        int shipped = factoryShipmentService.sumShippedByOrderId(orderId);

        Map<String, Object> info = new HashMap<>();
        info.put("cuttingTotal", cuttingTotal);
        info.put("shippedTotal", shipped);
        info.put("remaining", Math.max(0, cuttingTotal - shipped));
        return info;
    }

    public List<Map<String, Object>> getOrderShipmentDetailSum(String orderId) {
        // P0 修复（铁律4 多租户隔离）：必须按 tenantId 过滤，禁止跨租户读取
        Long tenantId = TenantAssert.requireTenantId();
        List<FactoryShipment> shipments = factoryShipmentService.lambdaQuery()
                .eq(FactoryShipment::getOrderId, orderId)
                .eq(FactoryShipment::getTenantId, tenantId)
                .eq(FactoryShipment::getDeleteFlag, 0)
                .list();
        Set<String> shipmentIds = shipments.stream()
                .map(FactoryShipment::getId)
                .collect(Collectors.toSet());
        Map<String, List<FactoryShipmentDetail>> detailMap = shipmentIds.isEmpty()
                ? Collections.emptyMap()
                : factoryShipmentDetailService.lambdaQuery()
                        .in(FactoryShipmentDetail::getShipmentId, shipmentIds)
                        .list().stream()
                        .collect(Collectors.groupingBy(FactoryShipmentDetail::getShipmentId));
        Map<String, Map<String, Integer>> colorSizeMap = new LinkedHashMap<>();
        for (FactoryShipment fs : shipments) {
            List<FactoryShipmentDetail> details = detailMap.getOrDefault(fs.getId(), Collections.emptyList());
            for (FactoryShipmentDetail d : details) {
                String color = d.getColor() != null ? d.getColor() : "";
                String size  = d.getSizeName() != null ? d.getSizeName() : "";
                colorSizeMap.computeIfAbsent(color, k -> new LinkedHashMap<>())
                            .merge(size, d.getQuantity() != null ? d.getQuantity() : 0, Integer::sum);
            }
        }
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map.Entry<String, Map<String, Integer>> e : colorSizeMap.entrySet()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("color", e.getKey());
            List<Map<String, Object>> sizes = new ArrayList<>();
            int rowTotal = 0;
            for (Map.Entry<String, Integer> se : e.getValue().entrySet()) {
                Map<String, Object> sizeRow = new LinkedHashMap<>();
                sizeRow.put("sizeName", se.getKey());
                sizeRow.put("quantity", se.getValue());
                sizes.add(sizeRow);
                rowTotal += se.getValue();
            }
            row.put("sizes", sizes);
            row.put("total", rowTotal);
            result.add(row);
        }
        return result;
    }

    private void revertBundleFactoryIdOnReceive(String orderId) {
        try {
            int reverted = cuttingBundleService.revertFactoryIdByOrderId(orderId);
            if (reverted > 0) {
                log.info("[FactoryShipment] 收货回转菲号归属 orderId={} revertedCount={}", orderId, reverted);
            }
        } catch (Exception e) {
            log.error("[FactoryShipment] 收货回转菲号归属失败 orderId={}", orderId, e);
        }
    }
}
