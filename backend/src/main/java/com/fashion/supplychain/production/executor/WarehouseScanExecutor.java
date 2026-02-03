package com.fashion.supplychain.production.executor;

import com.fashion.supplychain.common.util.NumberUtils;
import com.fashion.supplychain.common.util.TextUtils;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.helper.InventoryValidator;
import com.fashion.supplychain.production.service.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

/**
 * 仓库入库扫码执行器
 * 职责：
 * 1. 成品入库
 * 2. 次品阻止入库
 * 3. 重复扫码处理
 * 4. 进度重新计算
 * 
 * 提取自 ScanRecordOrchestrator（减少约140行代码）
 * 
 * @author GitHub Copilot
 * @date 2026-02-03
 */
@Component
@Slf4j
public class WarehouseScanExecutor {

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private CuttingBundleService cuttingBundleService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ProductWarehousingService productWarehousingService;

    @Autowired
    private InventoryValidator inventoryValidator;

    @Autowired
    private SKUService skuService;

    @Autowired
    private ProductionOrderScanRecordDomainService productionOrderScanRecordDomainService;

    /**
     * 执行仓库入库扫码
     */
    public Map<String, Object> execute(Map<String, Object> params, String requestId, String operatorId,
                                       String operatorName, ProductionOrder order,
                                       java.util.function.Function<String, String> colorResolver,
                                       java.util.function.Function<String, String> sizeResolver) {
        Integer qty = NumberUtils.toInt(params.get("quantity"));
        if (qty == null || qty <= 0) {
            throw new IllegalArgumentException("数量必须大于0");
        }

        String scanCode = TextUtils.safeText(params.get("scanCode"));
        if (!hasText(scanCode)) {
            throw new IllegalArgumentException("扫码内容不能为空");
        }

        String warehouse = TextUtils.safeText(params.get("warehouse"));
        if (!hasText(warehouse)) {
            throw new IllegalArgumentException("请指定仓库");
        }

        CuttingBundle bundle = cuttingBundleService.getByQrCode(scanCode);
        if (bundle == null || !hasText(bundle.getId())) {
            throw new IllegalStateException("未匹配到菲号");
        }

        if (order == null) {
            throw new IllegalStateException("未匹配到订单");
        }

        // 检查是否有次品待返修
        if (isBundleBlockedForWarehousingStatus(order.getId(), bundle.getId())) {
            throw new IllegalStateException("该菲号存在待返修次品，需返修完成后才能入库");
        }

        // 验证数量不超过订单数量
        inventoryValidator.validateNotExceedOrderQuantity(order, "warehouse", "入库", qty, bundle);

        // 创建入库记录
        ProductWarehousing w = new ProductWarehousing();
        w.setOrderId(order.getId());
        w.setWarehousingType("scan");
        w.setWarehouse(warehouse);
        w.setWarehousingQuantity(qty);
        w.setQualifiedQuantity(qty);
        w.setUnqualifiedQuantity(0);
        w.setQualityStatus("qualified");
        w.setCuttingBundleQrCode(bundle.getQrCode());

        try {
            boolean ok = productWarehousingService.saveWarehousingAndUpdateOrder(w);
            if (!ok) {
                throw new IllegalStateException("入库失败");
            }
        } catch (DuplicateKeyException dke) {
            log.info("仓库扫码重复: orderId={}, bundle={}, warehouse={}", order.getId(), 
                    bundle.getBundleNo(), warehouse, dke);
            // 忽略重复扫码，视为成功
        }

        // 重新计算订单进度
        try {
            if (productionOrderService != null) {
                productionOrderService.recomputeProgressFromRecords(order.getId());
            }
        } catch (Exception e) {
            log.error("重新计算订单进度失败: orderId={}", order.getId(), e);
        }

        // 查找生成的扫码记录
        ScanRecord sr = findWarehousingGeneratedRecord(w.getId());
        if (sr == null) {
            // 未找到记录，手动创建
            sr = buildWarehouseRecord(params, requestId, operatorId, operatorName, order, bundle, qty, warehouse,
                                     colorResolver, sizeResolver);
            try {
                scanRecordService.saveScanRecord(sr);
            } catch (DuplicateKeyException dke) {
                log.info("仓库扫码记录重复: requestId={}", requestId, dke);
            }
        }

        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("message", "入库成功");
        result.put("scanRecord", sr);
        result.put("orderInfo", buildOrderInfo(order));
        result.put("cuttingBundle", bundle);
        return result;
    }

    /**
     * 检查菲号是否有次品阻止入库
     */
    private boolean isBundleBlockedForWarehousingStatus(String orderId, String bundleId) {
        if (!hasText(orderId) || !hasText(bundleId)) {
            return false;
        }
        
        try {
            java.util.List<ProductWarehousing> warehousingList = 
                    productWarehousingService.lambdaQuery()
                            .select(ProductWarehousing::getId, ProductWarehousing::getQualityStatus,
                                    ProductWarehousing::getDefectRemark,
                                    ProductWarehousing::getUnqualifiedQuantity)
                            .eq(ProductWarehousing::getDeleteFlag, 0)
                            .eq(ProductWarehousing::getOrderId, orderId)
                            .eq(ProductWarehousing::getCuttingBundleId, bundleId)
                            .orderByDesc(ProductWarehousing::getCreateTime)
                            .list();

            if (warehousingList == null || warehousingList.isEmpty()) {
                return false;
            }

            for (ProductWarehousing w : warehousingList) {
                if (w == null) continue;

                String qs = TextUtils.safeText(w.getQualityStatus());
                if (!"unqualified".equalsIgnoreCase(qs)) continue;

                Integer unqualifiedQty = w.getUnqualifiedQuantity();
                if (unqualifiedQty == null || unqualifiedQty <= 0) continue;

                String defectRemark = TextUtils.safeText(w.getDefectRemark());
                if ("返修".equals(defectRemark.trim())) {
                    return true;
                }
            }
        } catch (Exception e) {
            log.warn("检查菲号次品状态失败: orderId={}, bundleId={}", orderId, bundleId, e);
        }

        return false;
    }

    /**
     * 查找入库生成的扫码记录
     */
    private ScanRecord findWarehousingGeneratedRecord(String warehousingId) {
        if (!hasText(warehousingId)) {
            return null;
        }
        String requestId = "WAREHOUSING:" + warehousingId.trim();
        try {
            return scanRecordService.lambdaQuery()
                    .eq(ScanRecord::getRequestId, requestId)
                    .last("limit 1")
                    .one();
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * 构建仓库扫码记录
     */
    private ScanRecord buildWarehouseRecord(Map<String, Object> params, String requestId, String operatorId,
                                           String operatorName, ProductionOrder order, CuttingBundle bundle,
                                           int qty, String warehouse,
                                           java.util.function.Function<String, String> colorResolver,
                                           java.util.function.Function<String, String> sizeResolver) {
        ScanRecord sr = new ScanRecord();
        sr.setRequestId(requestId);
        sr.setScanCode(TextUtils.safeText(params.get("scanCode")));
        sr.setOrderId(order.getId());
        sr.setOrderNo(order.getOrderNo());
        sr.setStyleId(order.getStyleId());
        sr.setStyleNo(order.getStyleNo());
        sr.setColor(colorResolver.apply(null));
        sr.setSize(sizeResolver.apply(null));
        sr.setQuantity(qty);
        sr.setProcessCode("warehouse");
        sr.setProgressStage("入库");
        sr.setProcessName("仓库入库");
        sr.setOperatorId(operatorId);
        sr.setOperatorName(operatorName);
        sr.setScanTime(LocalDateTime.now());
        sr.setScanType("warehouse");
        sr.setScanResult("success");
        sr.setRemark("仓库入库: " + warehouse);
        sr.setCuttingBundleId(bundle.getId());
        sr.setCuttingBundleNo(bundle.getBundleNo());
        sr.setCuttingBundleQrCode(bundle.getQrCode());

        if (skuService != null) {
            skuService.attachProcessUnitPrice(sr);
        }

        return sr;
    }

    /**
     * 构建订单信息
     */
    private Map<String, Object> buildOrderInfo(ProductionOrder order) {
        Map<String, Object> info = new HashMap<>();
        info.put("orderNo", order.getOrderNo());
        info.put("styleNo", order.getStyleNo());
        return info;
    }

    private boolean hasText(String str) {
        return StringUtils.hasText(str);
    }
}
