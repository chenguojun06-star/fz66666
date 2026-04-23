package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.production.entity.MaterialInbound;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.service.MaterialInboundService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.MaterialStockService;
import com.fashion.supplychain.warehouse.orchestration.MaterialPickupOrchestrator;
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
    private MaterialStockService materialStockService;

    @Autowired
    private com.fashion.supplychain.finance.orchestration.MaterialReconciliationSyncOrchestrator materialReconciliationSyncOrchestrator;

    @Autowired
    private MaterialPickupOrchestrator materialPickupOrchestrator;

    @Autowired
    private OrderRemarkService orderRemarkService;

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
        log.info("开始采购到货入库流程: purchaseId={}, arrivedQuantity={}", purchaseId, arrivedQuantity);

        // 1. 查询采购单
        MaterialPurchase purchase = materialPurchaseService.getById(purchaseId);
        if (purchase == null) {
            throw new RuntimeException("采购单不存在: " + purchaseId);
        }

        // 2. 验证到货数量
        if (arrivedQuantity == null || arrivedQuantity <= 0) {
            throw new RuntimeException("到货数量必须大于0");
        }

        Integer currentArrived = purchase.getArrivedQuantity() != null ? purchase.getArrivedQuantity() : 0;
        Integer totalArrived = currentArrived + arrivedQuantity;

        if (purchase.getPurchaseQuantity() == null || totalArrived > purchase.getPurchaseQuantity().intValue()) {
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

        // 4. 更新库存（带仓位同步）
        materialStockService.increaseStock(purchase, arrivedQuantity, warehouseLocation);
        log.info("库存已更新: materialCode={}, quantity=+{}, location={}", purchase.getMaterialCode(), arrivedQuantity, warehouseLocation);

        // 5. 更新采购单
        purchase.setArrivedQuantity(totalArrived);
        purchase.setInboundRecordId(inbound.getId()); // 关联最新入库记录
        purchase.setActualArrivalDate(LocalDateTime.now());

        // 根据到货情况更新状态
        if (purchase.getPurchaseQuantity() == null || totalArrived >= purchase.getPurchaseQuantity().intValue()) {
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
        if (purchaseId != null && !purchaseId.trim().isEmpty()) {
            return materialInboundService.listByPurchaseId(purchaseId);
        }
        if (materialCode != null && !materialCode.trim().isEmpty()) {
            return materialInboundService.list(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<MaterialInbound>()
                    .eq(MaterialInbound::getMaterialCode, materialCode.trim())
                    .orderByDesc(MaterialInbound::getInboundTime));
        }
        return materialInboundService.list();
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
