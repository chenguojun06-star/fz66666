package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.finance.service.MaterialReconciliationSyncService;
import com.fashion.supplychain.production.entity.MaterialInbound;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.service.MaterialInboundService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.MaterialStockService;
import com.fashion.supplychain.common.tenant.TenantAssert;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

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

        if (totalArrived > purchase.getPurchaseQuantity()) {
            throw new RuntimeException(String.format("到货数量超出采购数量: 已到货=%d, 本次到货=%d, 采购数量=%d",
                    currentArrived, arrivedQuantity, purchase.getPurchaseQuantity()));
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
        if (totalArrived.equals(purchase.getPurchaseQuantity())) {
            purchase.setStatus("completed"); // 全部到货
        } else {
            purchase.setStatus("partial_arrival"); // 部分到货
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
        // TODO: 添加更多查询条件
        return materialInboundService.list();
    }
}
