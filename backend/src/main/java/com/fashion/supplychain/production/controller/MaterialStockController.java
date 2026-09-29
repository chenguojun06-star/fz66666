package com.fashion.supplychain.production.controller;

import java.math.BigDecimal;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.dto.MaterialBatchDetailDto;
import com.fashion.supplychain.production.dto.MaterialStockAlertDto;
import com.fashion.supplychain.production.dto.MaterialTransactionDto;
import com.fashion.supplychain.production.entity.MaterialInbound;
import com.fashion.supplychain.production.entity.MaterialOutboundLog;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.orchestration.MaterialStockOrchestrator;
import com.fashion.supplychain.warehouse.orchestration.MaterialWarehouseOperationOrchestrator;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 面辅料库存端点。
 *
 * <p>2026-09-29（D-644）：原类直接注入了 {@code MaterialStockService}、
 * {@code MaterialDatabaseService}（违反 ArchUnit 规则6）以及
 * {@code MaterialInboundMapper}、{@code MaterialOutboundLogMapper}（违反规则1）。
 * 库存分页（含图片富化、最近出入库富化、今日/本月统计）、批次明细、出入库流水、
 * 安全库存更新均已下沉到 {@link MaterialStockOrchestrator}，
 * 本类只保留「注解 → 参数解析 → 委托 → 组装响应」。
 */
@RestController
@RequestMapping("/api/production/material/stock")
@PreAuthorize("isAuthenticated()")
public class MaterialStockController {

    @Autowired
    private MaterialStockOrchestrator materialStockOrchestrator;

    @Autowired
    private MaterialWarehouseOperationOrchestrator materialWarehouseOperationOrchestrator;

    @GetMapping("/list")
    public Result<Map<String, Object>> getPage(@RequestParam Map<String, Object> params) {
        return Result.success(materialStockOrchestrator.getStockPage(params));
    }

    @GetMapping("/summary")
    public Result<List<MaterialStock>> getSummary(@RequestParam("materialIds") List<String> materialIds) {
        return Result.success(materialStockOrchestrator.getStocksByMaterialIds(materialIds));
    }

    @GetMapping("/alerts")
    public Result<List<MaterialStockAlertDto>> getAlerts(@RequestParam Map<String, Object> params) {
        // 工厂账号不可查看面辅料库存预警（属于租户级仓库数据）
        if (com.fashion.supplychain.common.DataPermissionHelper.isFactoryAccount()) {
            return Result.success(java.util.Collections.emptyList());
        }
        return Result.success(materialStockOrchestrator.listAlerts(params));
    }

    /**
     * 查询物料批次明细（用于出库时按批次FIFO）
     *
     * @param materialCode 物料编码（必填）
     * @param color 颜色（可选）
     * @param size 尺码（可选）
     * @return 批次明细列表，按入库时间升序排列
     */
    @GetMapping("/batches")
    public Result<List<MaterialBatchDetailDto>> getBatchDetails(
            @RequestParam String materialCode,
            @RequestParam(required = false) String color,
            @RequestParam(required = false) String size) {
        return Result.success(materialStockOrchestrator.getBatchDetails(materialCode, color, size));
    }

    /**
     * 手动出库（仓库页面直接扣减库存，并写入出库日志）
     */
    @PostMapping("/manual-outbound")
    public Result<Map<String, String>> manualOutbound(@RequestBody ManualOutboundRequest body) {
        String outboundNo = materialStockOrchestrator.manualOutbound(
                body.getStockId(),
                body.getQuantity(),
                body.getReason(),
                body.getOrderNo(),
                body.getStyleNo(),
                body.getFactoryId(),
                body.getFactoryName(),
                body.getFactoryType(),
                body.getReceiverId(),
                body.getReceiverName(),
                body.getPickupType(),
                body.getUsageType(),
                body.getWarehouseAreaId());
        return Result.success(Map.of("outboundNo", outboundNo));
    }

    /**
     * 查询面辅料出入库流水（合并入库+出库，按时间倒序）
     */
    @GetMapping("/transactions")
    public Result<List<MaterialTransactionDto>> getTransactions(
            @RequestParam String materialCode,
            @RequestParam(required = false) String stockId) {
        return Result.success(materialStockOrchestrator.getTransactions(materialCode, stockId));
    }

    /**
     * 更新安全库存
     */
    @PostMapping("/update-safety-stock")
    public Result<Boolean> updateSafetyStock(@RequestBody Map<String, Object> params) {
        String stockId = params.get("stockId") == null ? null : String.valueOf(params.get("stockId"));
        Integer safetyStock = params.get("safetyStock") == null ? null
                : Integer.valueOf(String.valueOf(params.get("safetyStock")));
        return materialStockOrchestrator.updateSafetyStock(stockId, safetyStock);
    }

    public static class ManualOutboundRequest {
        private String stockId;
        /** D-414：手动出库数量支持小数 */
        private BigDecimal quantity;
        private String reason;
        private String orderNo;
        private String styleNo;
        private String factoryId;
        private String factoryName;
        private String factoryType;
        private String receiverId;
        private String receiverName;
        private String pickupType;
        private String usageType;
        private String warehouseAreaId;

        public String getStockId() {
            return stockId;
        }

        public void setStockId(String stockId) {
            this.stockId = stockId;
        }

        public BigDecimal getQuantity() {
            return quantity;
        }

        public void setQuantity(BigDecimal quantity) {
            this.quantity = quantity;
        }

        public String getReason() {
            return reason;
        }

        public void setReason(String reason) {
            this.reason = reason;
        }

        public String getOrderNo() {
            return orderNo;
        }

        public void setOrderNo(String orderNo) {
            this.orderNo = orderNo;
        }

        public String getStyleNo() {
            return styleNo;
        }

        public void setStyleNo(String styleNo) {
            this.styleNo = styleNo;
        }

        public String getFactoryId() {
            return factoryId;
        }

        public void setFactoryId(String factoryId) {
            this.factoryId = factoryId;
        }

        public String getFactoryName() {
            return factoryName;
        }

        public void setFactoryName(String factoryName) {
            this.factoryName = factoryName;
        }

        public String getFactoryType() {
            return factoryType;
        }

        public void setFactoryType(String factoryType) {
            this.factoryType = factoryType;
        }

        public String getReceiverId() {
            return receiverId;
        }

        public void setReceiverId(String receiverId) {
            this.receiverId = receiverId;
        }

        public String getReceiverName() {
            return receiverName;
        }

        public void setReceiverName(String receiverName) {
            this.receiverName = receiverName;
        }

        public String getPickupType() {
            return pickupType;
        }

        public void setPickupType(String pickupType) {
            this.pickupType = pickupType;
        }

        public String getUsageType() {
            return usageType;
        }

        public void setUsageType(String usageType) {
            this.usageType = usageType;
        }

        public String getWarehouseAreaId() {
            return warehouseAreaId;
        }

        public void setWarehouseAreaId(String warehouseAreaId) {
            this.warehouseAreaId = warehouseAreaId;
        }
    }

    @PostMapping("/free-inbound")
    public Result<MaterialInbound> freeInbound(@RequestBody Map<String, Object> params) {
        MaterialInbound result = materialWarehouseOperationOrchestrator.freeInbound(params);
        return Result.success(result);
    }

    @PostMapping("/free-outbound")
    public Result<MaterialOutboundLog> freeOutbound(@RequestBody Map<String, Object> params) {
        MaterialOutboundLog result = materialWarehouseOperationOrchestrator.freeOutbound(params);
        return Result.success(result);
    }

    @PostMapping("/scan-inbound")
    public Result<MaterialStock> scanInbound(@RequestBody Map<String, Object> params) {
        String materialCode = (String) params.get("materialCode");
        // D-410 收尾：不要 intValue()（1.32 → 1），改为按字符串精确保留小数
        BigDecimal quantity = parseQuantity(params.get("quantity"));
        String warehouseLocation = (String) params.get("warehouseLocation");
        String warehouseAreaId = (String) params.get("warehouseAreaId");
        String sourceType = (String) params.get("sourceType");
        String remark = (String) params.get("remark");
        String materialName = (String) params.get("materialName");
        String materialType = (String) params.get("materialType");
        String color = (String) params.get("color");
        String size = (String) params.get("size");
        MaterialStock result = materialWarehouseOperationOrchestrator.scanInbound(
                materialCode, quantity, warehouseLocation, warehouseAreaId, sourceType, remark,
                materialName, materialType, color, size);
        return Result.success(result);
    }

    @PostMapping("/scan-outbound")
    public Result<MaterialOutboundLog> scanOutbound(@RequestBody Map<String, Object> params) {
        String materialCode = (String) params.get("materialCode");
        // D-414：t_material_outbound_log.quantity 已迁移为 DECIMAL(12,4)，
        // 这里与扫码入库一致走 parseQuantity，禁止 intValue()（1.32 → 1 会导致库存少扣）
        BigDecimal quantity = parseQuantity(params.get("quantity"));
        String outstockType = (String) params.get("outstockType");
        String warehouseAreaId = params.get("warehouseAreaId") != null ? String.valueOf(params.get("warehouseAreaId")) : null;
        String remark = (String) params.get("remark");
        MaterialOutboundLog result = materialWarehouseOperationOrchestrator.scanOutbound(materialCode, quantity, outstockType, warehouseAreaId, remark);
        return Result.success(result);
    }

    /**
     * D-410 收尾：把请求里的数量解析为 BigDecimal。
     * 走字符串而不是 doubleValue()，避免 1.32 这类值在二进制浮点里出现精度毛刺。
     */
    private static BigDecimal parseQuantity(Object raw) {
        if (raw instanceof BigDecimal) {
            return ((BigDecimal) raw).setScale(4, java.math.RoundingMode.HALF_UP);
        }
        if (raw instanceof Number) {
            return new BigDecimal(String.valueOf(raw).trim()).setScale(4, java.math.RoundingMode.HALF_UP);
        }
        if (raw != null && String.valueOf(raw).trim().length() > 0) {
            try {
                return new BigDecimal(String.valueOf(raw).trim()).setScale(4, java.math.RoundingMode.HALF_UP);
            } catch (NumberFormatException e) {
                return BigDecimal.ONE;
            }
        }
        return BigDecimal.ONE;
    }

    @GetMapping("/scan-query")
    public Result<Map<String, Object>> scanQuery(@RequestParam String materialCode) {
        Map<String, Object> result = materialWarehouseOperationOrchestrator.scanQuery(materialCode);
        return Result.success(result);
    }

    @PostMapping("/batch-inbound")
    public Result<List<MaterialInbound>> batchInbound(@RequestBody Map<String, Object> body) {
        List<MaterialInbound> results = materialWarehouseOperationOrchestrator.batchInbound(body);
        return Result.success(results);
    }

    @PostMapping("/reverse")
    public Result<MaterialInbound> reverse(@RequestBody Map<String, String> params) {
        String inboundId = params.get("inboundId");
        String reason = params.get("reason");
        MaterialInbound reversal = materialWarehouseOperationOrchestrator.reverse(inboundId, reason);
        return Result.success(reversal);
    }

    @PostMapping("/edit")
    public Result<MaterialInbound> edit(@RequestBody Map<String, Object> params) {
        String inboundId = (String) params.get("inboundId");
        @SuppressWarnings("unchecked")
        Map<String, Object> changes = (Map<String, Object>) params.get("changes");
        MaterialInbound updated = materialWarehouseOperationOrchestrator.edit(inboundId, changes);
        return Result.success(updated);
    }

    @GetMapping("/amount-trace")
    public Result<Map<String, Object>> getAmountTrace(@RequestParam String traceId) {
        Map<String, Object> trace = materialWarehouseOperationOrchestrator.getAmountTrace(traceId);
        return Result.success(trace);
    }
}
