package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.production.entity.MaterialInbound;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.helper.MaterialInboundLogAppendHelper;
import com.fashion.supplychain.production.mapper.MaterialPurchaseMapper;
import com.fashion.supplychain.production.service.MaterialInboundService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.MaterialStockService;
import com.fashion.supplychain.warehouse.orchestration.MaterialPickupOrchestrator;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.constant.MaterialConstants;
import com.fashion.supplychain.common.tenant.TenantAssert;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import com.fashion.supplychain.system.entity.OrderRemark;
import com.fashion.supplychain.system.service.OrderRemarkService;

/**
 * 面辅料入库编排器
 *
 * 职责：协调采购到货、生成入库单、更新库存的完整流程
 *
 * 核心流程：
 * 1. 采购到货确认
 * 2. 生成入库记录
 * 3. 更新库存
 * 4. 关联采购单与入库单
 */
@Slf4j
@Service
public class MaterialInboundOrchestrator {

    @Autowired
    private MaterialInboundService materialInboundService;

    @Autowired
    private MaterialPurchaseService materialPurchaseService;
    @Autowired
    private MaterialPurchaseMapper materialPurchaseMapper;

    @Autowired
    private MaterialStockService materialStockService;

    @Autowired
    private com.fashion.supplychain.finance.orchestration.MaterialReconciliationSyncOrchestrator materialReconciliationSyncOrchestrator;

    @Autowired
    private MaterialPickupOrchestrator materialPickupOrchestrator;

    @Autowired
    private OrderRemarkService orderRemarkService;

    @Autowired
    private MaterialInboundLogAppendHelper logAppendHelper;

    /**
     * 采购到货入库完整流程
     *
     * @param purchaseId 采购单ID
     * @param arrivedQuantity 到货数量
     * @param warehouseLocation 仓库位置
     * @param operatorId 操作人ID
     * @param operatorName 操作人姓名
     * @param remark 备注
     * @return 入库结果
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> confirmArrivalAndInbound(
            String purchaseId,
            Integer arrivedQuantity,
            String warehouseLocation,
            String operatorId,
            String operatorName,
            String remark) {

        TenantAssert.assertTenantContext(); // 入库操作必须有租户上下文
        Long tenantId = UserContext.tenantId();
        log.info("开始采购到货入库流程: purchaseId={}, arrivedQuantity={}", purchaseId, arrivedQuantity);

        // 1. 查询采购单（P1 多租户隔离：用 lambdaQuery 带 tenantId 替代 getById）
        MaterialPurchase purchase = materialPurchaseService.lambdaQuery()
                .eq(MaterialPurchase::getId, purchaseId)
                .eq(MaterialPurchase::getTenantId, tenantId)
                .one();
        if (purchase == null) {
            throw new RuntimeException("采购单不存在: " + purchaseId);
        }

        // 2. 验证到货数量
        if (arrivedQuantity == null || arrivedQuantity <= 0) {
            throw new RuntimeException("到货数量必须大于0");
        }

        Integer currentArrived = purchase.getArrivedQuantity() != null ? purchase.getArrivedQuantity() : 0;
        Integer totalArrived = currentArrived + arrivedQuantity;

        if (purchase.getPurchaseQuantity() == null || purchase.getPurchaseQuantity().compareTo(java.math.BigDecimal.valueOf(totalArrived)) < 0) {
            throw new RuntimeException(String.format("到货数量超出采购数量: 已到货=%d, 本次到货=%d, 采购数量=%s",
                    currentArrived, arrivedQuantity,
                    purchase.getPurchaseQuantity() == null ? "null" : purchase.getPurchaseQuantity().toPlainString()));
        }

        // 3. 创建入库记录
        MaterialInbound inbound = new MaterialInbound();
        inbound.setPurchaseId(purchaseId);
        inbound.setMaterialCode(purchase.getMaterialCode());
        inbound.setMaterialName(purchase.getMaterialName());
        inbound.setMaterialType(purchase.getMaterialType());
        inbound.setColor(purchase.getColor());
        inbound.setSize(purchase.getSize());
        inbound.setInboundQuantity(arrivedQuantity);
        inbound.setWarehouseLocation(warehouseLocation != null ? warehouseLocation : "默认仓");
        inbound.setSupplierName(purchase.getSupplierName());
        inbound.setOperatorId(operatorId);
        inbound.setOperatorName(operatorName);
        inbound.setInboundTime(LocalDateTime.now());
        inbound.setRemark(remark);

        // 生成入库单号
        String inboundNo = materialInboundService.generateInboundNo();
        inbound.setInboundNo(inboundNo);

        materialInboundService.save(inbound);
        log.info("入库记录已创建: {}", inboundNo);

        logAppendHelper.appendInbound(inbound.getId(), arrivedQuantity);
        logAppendHelper.appendOperation(purchaseId, "物料入库", "入库单号：" + inboundNo + "，数量：" + arrivedQuantity);

        // 4. 更新库存（带仓位同步）
        materialStockService.increaseStock(purchase, arrivedQuantity, warehouseLocation);
        log.info("库存已更新: materialCode={}, quantity=+{}, location={}", purchase.getMaterialCode(), arrivedQuantity, warehouseLocation);

        // 5. 原子更新采购单到货数量
        int rows = materialPurchaseMapper.atomicAddArrivedQuantity(purchaseId, arrivedQuantity, tenantId);
        if (rows == 0) {
            throw new RuntimeException("更新采购单到货数量失败: purchaseId=" + purchaseId);
        }

        // P1 多租户隔离：重新查询采购单时用 lambdaQuery 带 tenantId
        purchase = materialPurchaseService.lambdaQuery()
                .eq(MaterialPurchase::getId, purchaseId)
                .eq(MaterialPurchase::getTenantId, tenantId)
                .one();
        totalArrived = purchase.getArrivedQuantity() != null ? purchase.getArrivedQuantity() : 0;
        purchase.setInboundRecordId(inbound.getId());

        if (purchase.getPurchaseQuantity() == null || purchase.getPurchaseQuantity().compareTo(java.math.BigDecimal.valueOf(totalArrived)) <= 0) {
            purchase.setStatus(MaterialConstants.STATUS_AWAITING_CONFIRM);
        } else {
            purchase.setStatus("partial_arrival");
        }

        materialPurchaseService.updateById(purchase);
        log.info("采购单已更新: 到货数量={}/{}, 状态={}", totalArrived, purchase.getPurchaseQuantity(), purchase.getStatus());

        // 6. 同步到物料对账（核心功能：数据回流！）
        try {
            String reconciliationId = materialReconciliationSyncOrchestrator.syncFromInbound(inbound, purchase);
            log.info("✅ 数据已回流到物料对账: reconciliationId={}", reconciliationId);
        } catch (Exception e) {
            log.error("❌ 同步到物料对账失败: inboundNo={}", inboundNo, e);
            // 不中断入库流程，仅记录错误
        }

        syncInboundTraceRecord(inbound, purchase, "PURCHASE_INBOUND");

        // 自动写入系统备注：采购入库节点
        try {
            if (StringUtils.hasText(purchase.getOrderNo())) {
                String statusText = MaterialConstants.STATUS_AWAITING_CONFIRM.equals(purchase.getStatus()) ? "待确认完成" : "部分到货";
                OrderRemark sysRemark = new OrderRemark();
                sysRemark.setTargetType("order");
                sysRemark.setTargetNo(purchase.getOrderNo());
                sysRemark.setAuthorId("system");
                sysRemark.setAuthorName("系统");
                sysRemark.setAuthorRole("采购");
                sysRemark.setContent("面料【" + purchase.getMaterialName() + "/" + purchase.getColor()
                        + "】到货入库 " + arrivedQuantity + " 件，状态：" + statusText);
                sysRemark.setTenantId(purchase.getTenantId());
                sysRemark.setCreateTime(LocalDateTime.now());
                sysRemark.setDeleteFlag(0);
                orderRemarkService.save(sysRemark);
            }
        } catch (Exception e) {
            log.warn("自动写入采购入库备注失败，不影响主流程", e);
        }

        // 7. 返回结果
        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("inboundNo", inboundNo);
        result.put("inboundId", inbound.getId());
        result.put("purchaseId", purchaseId);
        result.put("arrivedQuantity", arrivedQuantity);
        result.put("totalArrived", totalArrived);
        result.put("purchaseQuantity", purchase.getPurchaseQuantity());
        result.put("status", purchase.getStatus());
        result.put("message", "入库成功，数据已自动同步到物料对账");

        return result;
    }

    /**
     * D-360h：存量补录入库——已完成/回料确认但未入过库的采购单，把"已到货但未入仓"的数量补入仓库。
     * 与 confirmArrivalAndInbound 的区别：不再累加到货数量、不改状态（行已完成），只做
     * 入库记录 + 库存增加 + 对账回流 + 出入库流水，保证两本账一致。
     */
    public Map<String, Object> backfillInbound(
            String purchaseId,
            Integer quantity,
            String warehouseLocation,
            String operatorId,
            String operatorName,
            String remark) {

        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        MaterialPurchase purchase = materialPurchaseService.lambdaQuery()
                .eq(MaterialPurchase::getId, purchaseId)
                .eq(MaterialPurchase::getTenantId, tenantId)
                .one();
        if (purchase == null) {
            throw new RuntimeException("采购单不存在: " + purchaseId);
        }
        if (quantity == null || quantity <= 0) {
            throw new RuntimeException("补录数量必须大于0");
        }
        Integer currentArrived = purchase.getArrivedQuantity() != null ? purchase.getArrivedQuantity() : 0;
        if (quantity > currentArrived) {
            throw new RuntimeException(String.format("补录数量超出已到货数量: 已到货=%d, 本次补录=%d", currentArrived, quantity));
        }

        MaterialInbound inbound = new MaterialInbound();
        inbound.setPurchaseId(purchaseId);
        inbound.setMaterialCode(purchase.getMaterialCode());
        inbound.setMaterialName(purchase.getMaterialName());
        inbound.setMaterialType(purchase.getMaterialType());
        inbound.setColor(purchase.getColor());
        inbound.setSize(purchase.getSize());
        inbound.setInboundQuantity(quantity);
        inbound.setWarehouseLocation(warehouseLocation != null ? warehouseLocation : "默认仓");
        inbound.setSupplierName(purchase.getSupplierName());
        inbound.setOperatorId(operatorId);
        inbound.setOperatorName(operatorName);
        inbound.setInboundTime(LocalDateTime.now());
        inbound.setRemark(remark != null ? remark : "存量补录入库");
        String inboundNo = materialInboundService.generateInboundNo();
        inbound.setInboundNo(inboundNo);
        materialInboundService.save(inbound);

        logAppendHelper.appendInbound(inbound.getId(), quantity);
        logAppendHelper.appendOperation(purchaseId, "物料补录入库", "入库单号：" + inboundNo + "，数量：" + quantity);

        materialStockService.increaseStock(purchase, quantity, warehouseLocation);
        log.info("补录入库成功: inboundNo={}, materialCode={}, quantity=+{}", inboundNo, purchase.getMaterialCode(), quantity);

        try {
            String reconciliationId = materialReconciliationSyncOrchestrator.syncFromInbound(inbound, purchase);
            log.info("✅ 补录入库已回流物料对账: reconciliationId={}", reconciliationId);
        } catch (Exception e) {
            log.error("❌ 补录入库同步对账失败: inboundNo={}", inboundNo, e);
        }
        syncInboundTraceRecord(inbound, purchase, "PURCHASE_INBOUND_BACKFILL");

        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("inboundNo", inboundNo);
        result.put("inboundId", inbound.getId());
        result.put("purchaseId", purchaseId);
        result.put("quantity", quantity);
        result.put("message", "补录入库成功，库存已更新并同步对账");
        return result;
    }

    /**
     * 手动入库（无采购单）
     * 用于：退货入库、其他来源入库
     *
     * @param materialCode 物料编码
     * @param materialName 物料名称
     * @param materialType 物料类型
     * @param color 颜色
     * @param size 规格
     * @param quantity 入库数量
     * @param warehouseLocation 仓库位置
     * @param supplierName 供应商名称
     * @param operatorId 操作人ID
     * @param operatorName 操作人姓名
     * @param remark 备注
     * @return 入库结果
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> manualInbound(
            String materialCode,
            String materialName,
            String materialType,
            String color,
            String size,
            Integer quantity,
            String warehouseLocation,
            String supplierName,
            String operatorId,
            String operatorName,
            String remark) {

        TenantAssert.assertTenantContext();
        log.info("开始手动入库流程: materialCode={}, quantity={}", materialCode, quantity);

        // 1. 验证参数
        if (materialCode == null || materialCode.trim().isEmpty()) {
            throw new RuntimeException("物料编码不能为空");
        }
        if (quantity == null || quantity <= 0) {
            throw new RuntimeException("入库数量必须大于0");
        }

        // 2. 创建入库记录
        MaterialInbound inbound = new MaterialInbound();
        inbound.setPurchaseId(null); // 无采购单
        inbound.setMaterialCode(materialCode);
        inbound.setMaterialName(materialName);
        inbound.setMaterialType(materialType);
        inbound.setColor(color);
        inbound.setSize(size);
        inbound.setInboundQuantity(quantity);
        inbound.setWarehouseLocation(warehouseLocation != null ? warehouseLocation : "默认仓");
        inbound.setSupplierName(supplierName);
        inbound.setOperatorId(operatorId);
        inbound.setOperatorName(operatorName);
        inbound.setInboundTime(LocalDateTime.now());
        inbound.setRemark(remark);

        String inboundNo = materialInboundService.generateInboundNo();
        inbound.setInboundNo(inboundNo);

        materialInboundService.save(inbound);
        log.info("手动入库记录已创建: {}", inboundNo);

        // 3. 更新库存（需要构造临时的 MaterialPurchase 对象，带仓位+供应商）
        MaterialPurchase tempPurchase = new MaterialPurchase();
        tempPurchase.setMaterialCode(materialCode);
        tempPurchase.setMaterialName(materialName);
        tempPurchase.setMaterialType(materialType);
        tempPurchase.setColor(color);
        tempPurchase.setSize(size);
        tempPurchase.setSpecifications(size);
        tempPurchase.setSupplierName(supplierName);

        materialStockService.increaseStock(tempPurchase, quantity, warehouseLocation);
        log.info("库存已更新: materialCode={}, quantity=+{}, location={}", materialCode, quantity, warehouseLocation);

        syncInboundTraceRecord(inbound, null, "MANUAL_INBOUND");

        // 4. 返回结果
        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("inboundNo", inboundNo);
        result.put("inboundId", inbound.getId());
        result.put("materialCode", materialCode);
        result.put("quantity", quantity);
        result.put("message", "手动入库成功");

        return result;
    }

    /**
     * 查询入库记录列表（支持多条件查询）
     *
     * @param purchaseId 采购单ID（可选）
     * @param materialCode 物料编码（可选）
     * @return 入库记录列表
     */
    public List<MaterialInbound> queryInboundRecords(String purchaseId, String materialCode) {
        Long tenantId = TenantAssert.requireTenantId();
        if (purchaseId != null && !purchaseId.trim().isEmpty()) {
            // P1 多租户隔离：listByPurchaseId 后追加 tenantId 过滤
            List<MaterialInbound> raw = materialInboundService.listByPurchaseId(purchaseId);
            if (raw == null || raw.isEmpty()) {
                return java.util.Collections.emptyList();
            }
            return raw.stream()
                    .filter(item -> item != null && tenantId.equals(item.getTenantId()))
                    .collect(java.util.stream.Collectors.toList());
        }
        if (materialCode != null && !materialCode.trim().isEmpty()) {
            return materialInboundService.list(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<MaterialInbound>()
                    .eq(MaterialInbound::getMaterialCode, materialCode.trim())
                    .eq(MaterialInbound::getTenantId, tenantId)
                    .orderByDesc(MaterialInbound::getInboundTime));
        }
        return materialInboundService.list(
            new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<MaterialInbound>()
                .eq(MaterialInbound::getTenantId, tenantId)
                .orderByDesc(MaterialInbound::getInboundTime)
                .last("LIMIT 5000"));
    }

    /**
     * D-321b: 采购确认完成时的入库登记 — 打通新采购流（购物车/智能采购）的出入库闭环。
     *
     * <p>与 {@link #confirmArrivalAndInbound} 的区别：
     * <ul>
     *   <li>不改采购单状态/到货量（confirmComplete 已把状态置 completed、到货量已兜底）</li>
     *   <li>按"采购量 - 已入库量"自动封顶，避免旧流部分到货已入库场景重复累加库存</li>
     * </ul>
     *
     * @param purchase          采购单（需含 id/tenantId/物料字段）
     * @param requestedQuantity 申请入库数量（null/非法时按剩余可入库量全额）
     * @param warehouseLocation 仓位（空用"默认仓"）
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> inboundOnComplete(MaterialPurchase purchase,
                                                 Integer requestedQuantity,
                                                 String warehouseLocation,
                                                 String operatorId,
                                                 String operatorName,
                                                 String remark) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        if (purchase == null || purchase.getId() == null) {
            throw new RuntimeException("采购单不存在");
        }
        int purchaseQty = purchase.getPurchaseQuantity() == null ? 0 : purchase.getPurchaseQuantity().intValue();
        int alreadyInbound = sumInboundQuantity(purchase.getId(), tenantId);
        int remaining = purchaseQty - alreadyInbound;
        Map<String, Object> result = new HashMap<>();
        if (remaining <= 0) {
            result.put("skipped", true);
            result.put("reason", "该采购单已全额入库，无需重复登记");
            return result;
        }
        int quantity = (requestedQuantity == null || requestedQuantity <= 0) ? remaining : Math.min(requestedQuantity, remaining);

        MaterialInbound inbound = new MaterialInbound();
        inbound.setPurchaseId(purchase.getId());
        inbound.setMaterialCode(purchase.getMaterialCode());
        inbound.setMaterialName(purchase.getMaterialName());
        inbound.setMaterialType(purchase.getMaterialType());
        inbound.setColor(purchase.getColor());
        inbound.setSize(purchase.getSize());
        inbound.setInboundQuantity(quantity);
        inbound.setWarehouseLocation(warehouseLocation != null && !warehouseLocation.trim().isEmpty() ? warehouseLocation : "默认仓");
        inbound.setSupplierName(purchase.getSupplierName());
        inbound.setOperatorId(operatorId);
        inbound.setOperatorName(operatorName);
        inbound.setInboundTime(LocalDateTime.now());
        inbound.setRemark(remark);
        String inboundNo = materialInboundService.generateInboundNo();
        inbound.setInboundNo(inboundNo);
        materialInboundService.save(inbound);

        logAppendHelper.appendInbound(inbound.getId(), quantity);
        logAppendHelper.appendOperation(purchase.getId(), "物料入库",
                "入库单号：" + inboundNo + "，数量：" + quantity + "（确认完成时登记）");

        materialStockService.increaseStock(purchase, quantity, inbound.getWarehouseLocation());

        try {
            materialReconciliationSyncOrchestrator.syncFromInbound(inbound, purchase);
        } catch (Exception e) {
            log.warn("[确认完成入库] 同步物料对账失败（不阻断）: inboundNo={}, error={}", inboundNo, e.getMessage());
        }
        syncInboundTraceRecord(inbound, purchase, "PURCHASE_INBOUND");

        result.put("skipped", false);
        result.put("inboundNo", inboundNo);
        result.put("inboundId", inbound.getId());
        result.put("quantity", quantity);
        result.put("alreadyInbound", alreadyInbound);
        result.put("message", "入库成功，已记入物料仓储出入库流水");
        log.info("[确认完成入库] purchaseId={}, inboundNo={}, quantity={}", purchase.getId(), inboundNo, quantity);
        return result;
    }

    /** 已入库总量（旧流到货登记/完成时登记都写 MaterialInbound，按它去重；排除软删） */
    private int sumInboundQuantity(String purchaseId, Long tenantId) {
        List<MaterialInbound> records = materialInboundService.listByPurchaseId(purchaseId);
        if (records == null || records.isEmpty()) return 0;
        return records.stream()
                .filter(r -> r != null
                        && (r.getDeleteFlag() == null || r.getDeleteFlag() == 0)
                        && tenantId != null && tenantId.equals(r.getTenantId()))
                .mapToInt(r -> r.getInboundQuantity() != null ? r.getInboundQuantity() : 0)
                .sum();
    }

    private void syncInboundTraceRecord(MaterialInbound inbound, MaterialPurchase purchase, String sourceType) {
        if (inbound == null || !StringUtils.hasText(inbound.getInboundNo())) {
            return;
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("pickupType", "INTERNAL");
        body.put("movementType", "INBOUND");
        body.put("sourceType", sourceType);
        body.put("usageType", resolveUsageType(purchase));
        body.put("sourceRecordId", inbound.getId());
        body.put("sourceDocumentNo", inbound.getInboundNo());
        body.put("orderNo", purchase != null ? purchase.getOrderNo() : null);
        body.put("styleNo", purchase != null ? purchase.getStyleNo() : null);
        body.put("materialId", purchase != null ? purchase.getMaterialId() : null);
        body.put("materialCode", inbound.getMaterialCode());
        body.put("materialName", inbound.getMaterialName());
        body.put("materialType", inbound.getMaterialType());
        body.put("color", inbound.getColor());
        body.put("specification", purchase != null ? purchase.getSpecifications() : inbound.getSize());
        body.put("fabricWidth", null);
        body.put("fabricWeight", null);
        body.put("fabricComposition", purchase != null ? purchase.getFabricComposition() : null);
        body.put("quantity", inbound.getInboundQuantity());
        body.put("unit", purchase != null ? purchase.getUnit() : null);
        body.put("unitPrice", purchase != null ? purchase.getUnitPrice() : null);
        body.put("receiverId", inbound.getOperatorId());
        body.put("receiverName", inbound.getOperatorName());
        body.put("issuerId", inbound.getOperatorId());
        body.put("issuerName", inbound.getOperatorName());
        body.put("warehouseLocation", inbound.getWarehouseLocation());
        body.put("auditStatus", "APPROVED");
        body.put("financeStatus", "SETTLED");
        body.put("remark", StringUtils.hasText(inbound.getRemark()) ? inbound.getRemark() : "系统自动同步入库记录");
        materialPickupOrchestrator.create(body);
    }

    private String resolveUsageType(MaterialPurchase purchase) {
        if (purchase == null || !StringUtils.hasText(purchase.getSourceType())) {
            return "STOCK";
        }
        String sourceType = purchase.getSourceType().trim().toLowerCase();
        if ("sample".equals(sourceType)) {
            return "SAMPLE";
        }
        if ("stock".equals(sourceType)) {
            return "STOCK";
        }
        return "BULK";
    }
}
