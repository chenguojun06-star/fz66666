package com.fashion.supplychain.procurement.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.entity.MaterialReconciliation;
import com.fashion.supplychain.finance.orchestration.MaterialReconciliationOrchestrator;
import com.fashion.supplychain.production.orchestration.MaterialInboundOrchestrator;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.orchestration.MaterialPurchaseOrchestrator;
import org.springframework.transaction.annotation.Transactional;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.service.FactoryService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;

/**
 * 供应商采购编排器
 * - 供应商列表：只读，从 t_factory 中筛选 supplier_type='MATERIAL'
 * - 采购单管理：委托给 MaterialPurchaseOrchestrator
 */
@Slf4j
@Service
public class ProcurementOrchestrator {

    @Autowired
    private FactoryService factoryService;

    @Autowired
    private MaterialPurchaseOrchestrator materialPurchaseOrchestrator;

    @Autowired
    private MaterialInboundOrchestrator materialInboundOrchestrator;

    @Autowired
    private MaterialReconciliationOrchestrator materialReconciliationOrchestrator;

    /**
     * 供应商列表（只读，supplier_type='MATERIAL'）
     */
    public IPage<Factory> listSuppliers(Map<String, Object> params) {
        int page = parseIntOrDefault(params, "page", 1);
        int pageSize = parseIntOrDefault(params, "pageSize", 20);
        String keyword = (String) params.getOrDefault("keyword", "");

        LambdaQueryWrapper<Factory> wrapper = new LambdaQueryWrapper<Factory>()
                .eq(Factory::getDeleteFlag, 0)
                .eq(Factory::getSupplierType, "MATERIAL")
                .and(StringUtils.hasText(keyword), w -> w
                        .like(Factory::getFactoryName, keyword)
                        .or().like(Factory::getFactoryCode, keyword)
                )
                .orderByDesc(Factory::getCreateTime);

        return factoryService.page(new Page<>(page, pageSize), wrapper);
    }

    /**
     * 采购单列表 —— 委托给 MaterialPurchaseOrchestrator
     */
    public IPage<MaterialPurchase> listPurchaseOrders(Map<String, Object> params) {
        return materialPurchaseOrchestrator.list(params);
    }

    /**
     * 单条采购单详情
     */
    public MaterialPurchase getPurchaseOrderDetail(String id) {
        return materialPurchaseOrchestrator.getById(id);
    }

    /**
     * 供应商采购历史
     */
    public IPage<MaterialPurchase> listPurchaseOrdersBySupplier(String supplierId, Map<String, Object> params) {
        Map<String, Object> safeParams = params == null ? new HashMap<>() : new HashMap<>(params);
        safeParams.put("supplierId", supplierId);
        return materialPurchaseOrchestrator.list(safeParams);
    }

    /**
     * 采购单关联的物料对账记录
     */
    public IPage<MaterialReconciliation> listMaterialReconciliationsByPurchase(String purchaseId, Map<String, Object> params) {
        Map<String, Object> safeParams = params == null ? new HashMap<>() : new HashMap<>(params);
        safeParams.put("purchaseId", purchaseId);
        return materialReconciliationOrchestrator.list(safeParams);
    }

    /**
     * 物料对账详情（采购域只读查看）
     */
    public MaterialReconciliation getMaterialReconciliationDetail(String reconciliationId) {
        return materialReconciliationOrchestrator.getById(reconciliationId);
    }

    /**
     * 综合统计数据：供应商数量 + 采购单统计
     */
    public Map<String, Object> getStats(Map<String, Object> params) {
        // 供应商总数（MATERIAL 类型）
        long supplierCount = factoryService.count(
                new LambdaQueryWrapper<Factory>()
                        .eq(Factory::getDeleteFlag, 0)
                        .eq(Factory::getSupplierType, "MATERIAL")
        );

        // 采购单状态汇总
        Map<String, Object> purchaseStats = materialPurchaseOrchestrator.getStatusStats(params);

        Map<String, Object> result = new HashMap<>();
        result.put("supplierCount", supplierCount);
        result.put("purchaseStats", purchaseStats);

        // 从采购单 stats 中提取常用数字
        if (purchaseStats != null) {
            result.put("totalPurchaseOrders", purchaseStats.getOrDefault("total", 0));
            result.put("pendingOrders", purchaseStats.getOrDefault("PENDING", 0));
        }

        return result;
    }

    /**
     * 新建采购单（委托给 MaterialPurchaseOrchestrator.save）
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean createPurchaseOrder(MaterialPurchase purchase) {
        return materialPurchaseOrchestrator.save(purchase);
    }

    /**
     * 到货登记
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean updateArrivedQuantity(Map<String, Object> params) {
        return materialPurchaseOrchestrator.updateArrivedQuantity(params);
    }

    /**
     * 到货并入库
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> confirmArrivalAndInbound(Map<String, Object> params) {
        String purchaseId = params == null ? null : String.valueOf(params.getOrDefault("purchaseId", "")).trim();
        Integer arrivedQuantity = params == null || params.get("arrivedQuantity") == null
                ? null : Integer.parseInt(String.valueOf(params.get("arrivedQuantity")));
        String warehouseLocation = params == null ? null : String.valueOf(params.getOrDefault("warehouseLocation", "")).trim();
        String operatorId = params == null ? null : String.valueOf(params.getOrDefault("operatorId", "")).trim();
        String operatorName = params == null ? null : String.valueOf(params.getOrDefault("operatorName", "")).trim();
        String remark = params == null || params.get("remark") == null ? null : String.valueOf(params.get("remark"));

        if (!StringUtils.hasText(operatorId)) {
            operatorId = UserContext.userId();
        }
        if (!StringUtils.hasText(operatorName)) {
            operatorName = UserContext.username();
        }

        return materialInboundOrchestrator.confirmArrivalAndInbound(
                purchaseId,
                arrivedQuantity,
                StringUtils.hasText(warehouseLocation) ? warehouseLocation : "默认仓",
                operatorId,
                operatorName,
                remark
        );
    }

    /**
     * 快速编辑采购单（备注、预计出货日期）
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean quickEditPurchaseOrder(Map<String, Object> payload) {
        String id = payload == null ? null : String.valueOf(payload.getOrDefault("id", "")).trim();
        if (!StringUtils.hasText(id)) {
            throw new IllegalArgumentException("采购单ID不能为空");
        }
        MaterialPurchase purchase = new MaterialPurchase();
        purchase.setId(id);
        purchase.setRemark(payload.get("remark") == null ? null : String.valueOf(payload.get("remark")));

        Object expectedShipDate = payload.get("expectedShipDate");
        if (expectedShipDate != null && StringUtils.hasText(String.valueOf(expectedShipDate))) {
            purchase.setExpectedShipDate(java.time.LocalDate.parse(String.valueOf(expectedShipDate).trim()));
        }
        return materialPurchaseOrchestrator.update(purchase);
    }

    /**
     * 撤回领取/到货登记，恢复为待处理
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> cancelReceive(Map<String, Object> params) {
        return materialPurchaseOrchestrator.cancelReceive(params);
    }

    /**
     * 更新发票/单据图片URL列表（财务留底）
     */
    public void updateInvoiceUrls(String purchaseId, String invoiceUrls) {
        MaterialPurchase record = new MaterialPurchase();
        record.setId(purchaseId);
        record.setInvoiceUrls(invoiceUrls);
        materialPurchaseOrchestrator.update(record);
    }

    // ──────────────────────────────────────────────
    // 工具方法
    // ──────────────────────────────────────────────
    private int parseIntOrDefault(Map<String, Object> params, String key, int def) {
        Object val = params.get(key);
        if (val == null) return def;
        try {
            return Integer.parseInt(val.toString());
        } catch (NumberFormatException e) {
            return def;
        }
    }
}
