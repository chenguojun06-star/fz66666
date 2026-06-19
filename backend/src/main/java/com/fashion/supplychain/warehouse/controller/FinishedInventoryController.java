package com.fashion.supplychain.warehouse.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.warehouse.dto.FinishedInventoryDTO;
import com.fashion.supplychain.production.orchestration.OrderShareOrchestrator;
import com.fashion.supplychain.warehouse.orchestration.FinishedInventoryOrchestrator;
import com.fashion.supplychain.warehouse.orchestration.FinishedWarehouseOperationOrchestrator;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;

import java.util.List;
import java.util.Map;

/**
 * 成品库存管理Controller
 */
@RestController
@RequestMapping("/api/warehouse/finished-inventory")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class FinishedInventoryController {

    private final FinishedInventoryOrchestrator finishedInventoryOrchestrator;
    private final FinishedWarehouseOperationOrchestrator finishedWarehouseOperationOrchestrator;
    private final OrderShareOrchestrator orderShareOrchestrator;

    /**
     * 分页查询成品库存
     *
     * @param params 查询参数
     * @return 分页结果
     */
    @PostMapping("/list")
    public Result<IPage<FinishedInventoryDTO>> list(@RequestBody Map<String, Object> params) {
        IPage<FinishedInventoryDTO> page = finishedInventoryOrchestrator.getFinishedInventoryPage(params);
        return Result.success(page);
    }

    /**
     * 兼容GET方式的查询（适配标准列表组件）
     */
    @GetMapping("/list")
    public Result<IPage<FinishedInventoryDTO>> listGet(@RequestParam Map<String, Object> params) {
        IPage<FinishedInventoryDTO> page = finishedInventoryOrchestrator.getFinishedInventoryPage(params);
        return Result.success(page);
    }

    /**
     * 成品出库：扣减SKU库存
     *
     * @param params 包含 items（[{sku, quantity}]）
     */
    @PostMapping("/outbound")
    public Result<Void> outbound(@RequestBody Map<String, Object> params) {
        finishedInventoryOrchestrator.outbound(params);
        return Result.success(null);
    }

    /**
     * QR码扫码批量出库：传入 items 列表（每项含 qrCode 和 quantity），自动剥离序号映射到 skuCode 后出库。
     * 支持分批出库、可填写自定义数量。
     *
     * @param body 包含 items（[{qrCode: "款号-颜色-尺码-序号", quantity: 2}]）
     */
    @PostMapping("/qrcode-outbound")
    public Result<Void> qrcodeOutbound(@RequestBody Map<String, Object> body) {
        finishedInventoryOrchestrator.qrcodeOutbound(body);
        return Result.success(null);
    }

    /**
     * 分页查询出库记录
     */
    @PostMapping("/outstock-records")
    public Result<IPage<ProductOutstock>> outstockRecords(@RequestBody Map<String, Object> params) {
        IPage<ProductOutstock> page = finishedInventoryOrchestrator.listOutstockRecords(params);
        return Result.success(page);
    }

    /**
     * 确认收款
     */
    @PostMapping("/confirm-payment")
    public Result<Void> confirmPayment(@RequestBody Map<String, Object> params) {
        Object idObj = params.get("id");
        String id = idObj != null ? String.valueOf(idObj).trim() : null;
        BigDecimal paidAmount = null;
        Object amountObj = params.get("paidAmount");
        if (amountObj != null) {
            if (amountObj instanceof Number) {
                paidAmount = BigDecimal.valueOf(((Number) amountObj).doubleValue());
            } else {
                try {
                    paidAmount = new BigDecimal(amountObj.toString().trim());
                } catch (NumberFormatException e) {
                    return Result.fail("金额格式不正确");
                }
            }
        }
        finishedInventoryOrchestrator.confirmPayment(id, paidAmount);
        return Result.success(null);
    }

    /**
     * 生成出库记录分享令牌（按客户名称汇总）
     */
    @PostMapping("/outstock/share-token")
    public Result<Map<String, String>> generateOutstockShareToken(@RequestBody Map<String, String> params) {
        String customerName = params.get("customerName");
        String token = orderShareOrchestrator.generateOutstockShareToken(customerName);
        return Result.success(Map.of("token", token, "shareUrl", "/share/outstock/" + token));
    }

    /**
     * 审批出库记录
     */
    @PostMapping("/outstock/approve")
    public Result<Map<String, Object>> approveOutstock(@RequestBody Map<String, String> params) {
        String id = params.get("id");
        if (id == null || id.isBlank()) {
            return Result.fail("缺少出库记录ID");
        }
        String remark = params.get("remark");
        return Result.success(finishedInventoryOrchestrator.approveOutstock(id, remark));
    }

    /**
     * 批量审批出库记录
     */
    @SuppressWarnings("unchecked")
    @PostMapping("/outstock/batch-approve")
    public Result<List<Map<String, Object>>> batchApproveOutstock(@RequestBody Map<String, Object> params) {
        List<String> ids = (List<String>) params.get("ids");
        if (ids == null || ids.isEmpty()) {
            return Result.fail("缺少出库记录ID列表");
        }
        String remark = (String) params.get("remark");
        return Result.success(finishedInventoryOrchestrator.batchApproveOutstocks(ids, remark));
    }

    @PostMapping("/free-inbound")
    public Result<ProductWarehousing> freeInbound(@RequestBody Map<String, Object> params) {
        ProductWarehousing result = finishedWarehouseOperationOrchestrator.freeInbound(params);
        return Result.success(result);
    }

    @PostMapping("/free-outbound")
    public Result<ProductOutstock> freeOutbound(@RequestBody Map<String, Object> params) {
        ProductOutstock result = finishedWarehouseOperationOrchestrator.freeOutbound(params);
        return Result.success(result);
    }

    @PostMapping("/scan-inbound")
    public Result<ProductWarehousing> scanInbound(@RequestBody Map<String, Object> params) {
        Object scanCodeObj = params.get("scanCode");
        String scanCode = scanCodeObj != null ? String.valueOf(scanCodeObj).trim() : null;
        Integer quantity = params.get("quantity") instanceof Number ? ((Number) params.get("quantity")).intValue() : 1;
        Object warehouseLocationObj = params.get("warehouseLocation");
        String warehouseLocation = warehouseLocationObj != null ? String.valueOf(warehouseLocationObj).trim() : null;
        Object warehouseAreaIdObj = params.get("warehouseAreaId");
        String warehouseAreaId = warehouseAreaIdObj != null ? String.valueOf(warehouseAreaIdObj).trim() : null;
        Object sourceTypeObj = params.get("sourceType");
        String sourceType = sourceTypeObj != null ? String.valueOf(sourceTypeObj).trim() : null;
        Object remarkObj = params.get("remark");
        String remark = remarkObj != null ? String.valueOf(remarkObj).trim() : null;
        Object styleNoObj = params.get("styleNo");
        String styleNo = styleNoObj != null ? String.valueOf(styleNoObj).trim() : null;
        Object colorObj = params.get("color");
        String color = colorObj != null ? String.valueOf(colorObj).trim() : null;
        Object sizeObj = params.get("size");
        String size = sizeObj != null ? String.valueOf(sizeObj).trim() : null;
        ProductWarehousing result = finishedWarehouseOperationOrchestrator.scanInbound(
                scanCode, quantity, warehouseLocation, warehouseAreaId, sourceType, remark,
                styleNo, color, size);
        return Result.success(result);
    }

    @PostMapping("/scan-outbound")
    public Result<ProductOutstock> scanOutbound(@RequestBody Map<String, Object> params) {
        Object scanCodeObj = params.get("scanCode");
        String scanCode = scanCodeObj != null ? String.valueOf(scanCodeObj).trim() : null;
        Integer quantity = params.get("quantity") instanceof Number ? ((Number) params.get("quantity")).intValue() : 1;
        Object outstockTypeObj = params.get("outstockType");
        String outstockType = outstockTypeObj != null ? String.valueOf(outstockTypeObj).trim() : null;
        Object warehouseAreaIdObj = params.get("warehouseAreaId");
        String warehouseAreaId = warehouseAreaIdObj != null ? String.valueOf(warehouseAreaIdObj).trim() : null;
        Object remarkObj = params.get("remark");
        String remark = remarkObj != null ? String.valueOf(remarkObj).trim() : null;
        ProductOutstock result = finishedWarehouseOperationOrchestrator.scanOutbound(scanCode, quantity, outstockType, warehouseAreaId, remark);
        return Result.success(result);
    }

    @GetMapping("/scan-query")
    public Result<Map<String, Object>> scanQuery(@RequestParam String scanCode) {
        Map<String, Object> result = finishedWarehouseOperationOrchestrator.scanQuery(scanCode);
        return Result.success(result);
    }

    @PostMapping("/batch-inbound")
    public Result<List<ProductWarehousing>> batchInbound(@RequestBody Map<String, Object> body) {
        List<ProductWarehousing> results = finishedWarehouseOperationOrchestrator.batchInbound(body);
        return Result.success(results);
    }

    @PostMapping("/reverse")
    public Result<ProductWarehousing> reverse(@RequestBody Map<String, String> params) {
        String warehousingId = params.get("warehousingId");
        String reason = params.get("reason");
        ProductWarehousing reversal = finishedWarehouseOperationOrchestrator.reverse(warehousingId, reason);
        return Result.success(reversal);
    }

    @PostMapping("/edit")
    public Result<ProductWarehousing> edit(@RequestBody Map<String, Object> params) {
        Object warehousingIdObj = params.get("warehousingId");
        String warehousingId = warehousingIdObj != null ? String.valueOf(warehousingIdObj).trim() : null;
        @SuppressWarnings("unchecked")
        Map<String, Object> changes = (Map<String, Object>) params.get("changes");
        ProductWarehousing updated = finishedWarehouseOperationOrchestrator.edit(warehousingId, changes);
        return Result.success(updated);
    }

    @GetMapping("/edit-history")
    public Result<List<Map<String, Object>>> getEditHistory(@RequestParam String warehousingId) {
        List<Map<String, Object>> history = finishedWarehouseOperationOrchestrator.getEditHistory(warehousingId);
        return Result.success(history);
    }

    @GetMapping("/amount-trace")
    public Result<Map<String, Object>> getAmountTrace(@RequestParam String traceId) {
        Map<String, Object> trace = finishedWarehouseOperationOrchestrator.getAmountTrace(traceId);
        return Result.success(trace);
    }
}
