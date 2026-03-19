package com.fashion.supplychain.procurement.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.procurement.orchestration.ProcurementOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 供应商采购接口
 * 路由：/api/procurement
 * 供应商为系统级只读资源；采购单委托给已有的 MaterialPurchaseOrchestrator
 */
@Slf4j
@RestController
@RequestMapping("/api/procurement")
@PreAuthorize("isAuthenticated()")
public class ProcurementController {

    @Autowired
    private ProcurementOrchestrator procurementOrchestrator;

    /** 供应商列表（只读，supplier_type=MATERIAL） */
    @PostMapping("/suppliers/list")
    public Result<?> listSuppliers(@RequestBody Map<String, Object> params) {
        return Result.success(procurementOrchestrator.listSuppliers(params));
    }

    /** 采购单列表 */
    @PostMapping("/purchase-orders/list")
    public Result<?> listPurchaseOrders(@RequestBody Map<String, Object> params) {
        return Result.success(procurementOrchestrator.listPurchaseOrders(params));
    }

    /** 采购单详情 */
    @GetMapping("/purchase-orders/{id}")
    public Result<?> getPurchaseOrderDetail(@PathVariable String id) {
        return Result.success(procurementOrchestrator.getPurchaseOrderDetail(id));
    }

    /** 采购单关联的物料对账记录 */
    @PostMapping("/purchase-orders/{purchaseId}/material-reconciliations/list")
    public Result<?> listMaterialReconciliations(@PathVariable String purchaseId,
                                                 @RequestBody(required = false) Map<String, Object> params) {
        return Result.success(procurementOrchestrator.listMaterialReconciliationsByPurchase(purchaseId, params));
    }

    /** 物料对账详情 */
    @GetMapping("/material-reconciliations/{id}")
    public Result<?> getMaterialReconciliationDetail(@PathVariable String id) {
        return Result.success(procurementOrchestrator.getMaterialReconciliationDetail(id));
    }

    /** 供应商采购历史 */
    @PostMapping("/suppliers/{supplierId}/purchase-orders/list")
    public Result<?> listSupplierPurchaseOrders(@PathVariable String supplierId,
                                                @RequestBody(required = false) Map<String, Object> params) {
        return Result.success(procurementOrchestrator.listPurchaseOrdersBySupplier(supplierId, params));
    }

    /** 综合统计（供应商数量 + 采购单状态汇总） */
    @PostMapping("/stats")
    public Result<?> getStats(@RequestBody(required = false) Map<String, Object> params) {
        if (params == null) params = Map.of();
        return Result.success(procurementOrchestrator.getStats(params));
    }

    /** 新建采购单 */
    @PostMapping("/purchase-orders")
    public Result<?> createPurchaseOrder(@RequestBody MaterialPurchase purchase) {
        return Result.success(procurementOrchestrator.createPurchaseOrder(purchase));
    }

    /** 到货登记 */
    @PostMapping("/purchase-orders/update-arrived-quantity")
    public Result<?> updateArrivedQuantity(@RequestBody Map<String, Object> params) {
        return Result.success(procurementOrchestrator.updateArrivedQuantity(params));
    }

    /** 到货并入库 */
    @PostMapping("/purchase-orders/confirm-arrival")
    public Result<?> confirmArrivalAndInbound(@RequestBody Map<String, Object> params) {
        return Result.success(procurementOrchestrator.confirmArrivalAndInbound(params));
    }

    /** 快速编辑 */
    @PutMapping("/purchase-orders/quick-edit")
    public Result<?> quickEditPurchaseOrder(@RequestBody Map<String, Object> payload) {
        return Result.success(procurementOrchestrator.quickEditPurchaseOrder(payload));
    }

    /** 撤回领取 */
    @PostMapping("/purchase-orders/cancel-receive")
    public Result<?> cancelReceive(@RequestBody Map<String, Object> params) {
        return Result.success(procurementOrchestrator.cancelReceive(params));
    }

    /** 更新发票/单据图片URL列表（财务留底） */
    @PostMapping("/purchase-orders/update-invoice-urls")
    public Result<?> updateInvoiceUrls(@RequestBody Map<String, Object> body) {
        String purchaseId = (String) body.get("purchaseId");
        String invoiceUrls = (String) body.get("invoiceUrls");
        if (purchaseId == null || purchaseId.isBlank()) {
            return Result.fail("订单ID不能为空");
        }
        procurementOrchestrator.updateInvoiceUrls(purchaseId, invoiceUrls);
        return Result.success(null);
    }
}
