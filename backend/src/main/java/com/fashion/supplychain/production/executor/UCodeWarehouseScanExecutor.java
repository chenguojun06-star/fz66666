package com.fashion.supplychain.production.executor;

import com.fashion.supplychain.common.constant.OrderStatusConstants;
import com.fashion.supplychain.common.util.NumberUtils;
import com.fashion.supplychain.common.util.TextUtils;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.SKUService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.service.ProductSkuService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

@Component
@Slf4j
public class UCodeWarehouseScanExecutor {

    @Autowired
    private ProductWarehousingService productWarehousingService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private SKUService skuService;

    @Autowired
    private ProductSkuService productSkuService;

    @Autowired
    private ScanExecutorSupport executorSupport;

    @Autowired
    private WarehousingRecordFactory warehousingRecordFactory;

    public Map<String, Object> execute(Map<String, Object> params, String requestId,
            String operatorId, String operatorName, ProductionOrder order) {
        int quantity = NumberUtils.toInt(params.get("quantity"));
        String scanCode = TextUtils.safeText(params.get("scanCode"));
        String warehouse = TextUtils.safeText(params.get("warehouse"));

        Map<String, Object> validationError = validateUCodeParams(quantity, scanCode, order);
        if (validationError != null) return validationError;

        String[] segments = scanCode.split("-");
        if (segments.length < 3) return failResult("U编码格式不正确，应为: 款号-颜色-尺码");
        String styleNo = segments[0];
        String color = segments[1];
        String size = segments[2];

        resolveOrCreateSku(scanCode, styleNo, color, size, order);
        Map<String, Object> dupError = checkUCodeDuplicate(order, scanCode, quantity);
        if (dupError != null) return dupError;

        productSkuService.updateStock(scanCode, quantity);

        ProductWarehousing pw = warehousingRecordFactory.createScanWarehousingRecord(
                order, quantity, warehouse, scanCode, operatorId, operatorName, "ucode");
        try {
            boolean ok = productWarehousingService.saveWarehousingAndUpdateOrder(pw);
            if (!ok) return failResult("入库记录保存失败");
        } catch (DataAccessException dae) {
            log.error("[U编码入库] 保存入库记录失败: {}", dae.getMessage());
            return failResult("入库记录保存失败");
        }

        executorSupport.recomputeProgressSync(order.getId());

        ScanRecord sr = buildUCodeScanRecord(requestId, scanCode, order, styleNo, color, size,
                quantity, operatorId, operatorName, warehouse);
        try {
            scanRecordService.save(sr);
        } catch (DuplicateKeyException dke) {
            log.warn("[U编码入库] 扫码记录重复: {}", requestId);
        }

        return buildUCodeSuccessResult(scanCode, quantity, order, styleNo, color, size);
    }

    private Map<String, Object> validateUCodeParams(int quantity, String scanCode, ProductionOrder order) {
        if (quantity <= 0) return failResult("入库数量必须大于0");
        if (!hasText(scanCode)) return failResult("扫码内容不能为空");
        if (order == null) return failResult("未找到关联订单，请指定订单号");
        String status = order.getStatus() == null ? "" : order.getStatus().trim();
        if (OrderStatusConstants.isTerminal(status)) {
            return failResult("订单已终态，无法继续入库");
        }
        return null;
    }

    private void resolveOrCreateSku(String scanCode, String styleNo, String color, String size,
            ProductionOrder order) {
        ProductSku sku = productSkuService.lambdaQuery()
                .eq(ProductSku::getSkuCode, scanCode)
                .eq(ProductSku::getTenantId, order.getTenantId())
                .last("limit 1")
                .one();
        if (sku == null) {
            sku = new ProductSku();
            sku.setSkuCode(scanCode);
            sku.setStyleNo(styleNo);
            sku.setColor(color);
            sku.setSize(size);
            sku.setStockQuantity(0);
            if (order.getStyleId() != null) {
                try { sku.setStyleId(Long.parseLong(order.getStyleId())); } catch (NumberFormatException e) {
                    log.warn("[SKU创建] styleId 解析失败: orderId={}, styleId={}", order.getId(), order.getStyleId());
                }
            }
            sku.setTenantId(order.getTenantId());
            productSkuService.save(sku);
            log.info("[U编码入库] 自动创建SKU: {}", scanCode);
        }
    }

    private Map<String, Object> checkUCodeDuplicate(ProductionOrder order, String scanCode, int quantity) {
        int orderQty = order.getOrderQuantity() == null ? 0 : order.getOrderQuantity();
        if (orderQty <= 0) return null;
        try {
            int alreadyWarehoused = productWarehousingService.countUCodeWarehousedQuantity(order.getId(), scanCode);
            if (alreadyWarehoused >= orderQty) {
                return failResult(String.format("该U编码已全部入库！订单数量=%d，已入库=%d，无需重复入库", orderQty, alreadyWarehoused));
            }
            if (alreadyWarehoused + quantity > orderQty) {
                return failResult(String.format("U编码入库数量超出限制！订单数量=%d，已入库=%d，本次=%d，超出%d件",
                        orderQty, alreadyWarehoused, quantity, alreadyWarehoused + quantity - orderQty));
            }
        } catch (Exception e) {
            log.warn("[U编码入库] 查询已入库数量失败，为防止重复入库，拒绝本次操作: orderId={}, scanCode={}", order.getId(), scanCode, e);
            return failResult("查询已入库数量失败，请重试或联系管理员");
        }
        return null;
    }

    private ScanRecord buildUCodeScanRecord(String requestId, String scanCode, ProductionOrder order,
            String styleNo, String color, String size, int quantity,
            String operatorId, String operatorName, String warehouse) {
        ScanRecord sr = new ScanRecord();
        sr.setRequestId(requestId);
        sr.setScanCode(scanCode);
        sr.setOrderId(order.getId());
        sr.setOrderNo(order.getOrderNo());
        sr.setStyleId(order.getStyleId());
        sr.setStyleNo(order.getStyleNo());
        sr.setTenantId(order.getTenantId());
        sr.setColor(color);
        sr.setSize(size);
        sr.setQuantity(quantity);
        sr.setProcessCode("warehouse");
        sr.setProgressStage("入库");
        sr.setProcessName("入库");
        sr.setOperatorId(operatorId);
        sr.setOperatorName(operatorName);
        sr.setScanTime(LocalDateTime.now());
        sr.setScanType("warehouse");
        sr.setScanResult("success");
        sr.setRemark("U编码入库: " + warehouse);
        sr.setCuttingBundleId(null);
        sr.setCuttingBundleNo(null);
        sr.setCuttingBundleQrCode(scanCode);
        sr.setFactoryId(com.fashion.supplychain.common.UserContext.factoryId());
        sr.setScanMode("ucode");
        sr.setReceiveTime(LocalDateTime.now());
        skuService.attachProcessUnitPrice(sr);
        return sr;
    }

    private Map<String, Object> buildUCodeSuccessResult(String skuCode, int quantity,
            ProductionOrder order, String styleNo, String color, String size) {
        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("message", "U编码入库成功");
        result.put("scanMode", "ucode");
        result.put("skuCode", skuCode);
        result.put("quantity", quantity);
        result.put("orderNo", order.getOrderNo());
        result.put("styleNo", styleNo);
        result.put("color", color);
        result.put("size", size);
        return result;
    }

    private Map<String, Object> failResult(String message) {
        Map<String, Object> r = new HashMap<>();
        r.put("success", false);
        r.put("message", message);
        return r;
    }

    private boolean hasText(String str) {
        return ScanExecutorSupport.hasText(str);
    }
}
