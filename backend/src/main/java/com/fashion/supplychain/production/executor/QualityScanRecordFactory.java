package com.fashion.supplychain.production.executor;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.util.TextUtils;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.SKUService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.impl.ProductWarehousingHelper;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@Slf4j
public class QualityScanRecordFactory {

    @Autowired
    private ProductWarehousingService productWarehousingService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private SKUService skuService;

    @Autowired
    private CuttingBundleService cuttingBundleService;

    @Autowired
    private ProductWarehousingHelper warehousingHelper;

    public ScanRecord buildQualityRecord(Map<String, Object> params, String requestId, String operatorId,
                                          String operatorName, ProductionOrder order, CuttingBundle bundle,
                                          int qty, String stageCode, String stageName,
                                          java.util.function.Function<String, String> colorResolver,
                                          java.util.function.Function<String, String> sizeResolver) {
        ScanRecord sr = new ScanRecord();
        sr.setRequestId(requestId);
        sr.setScanCode(TextUtils.safeText(params.get("scanCode")));
        sr.setOrderId(order.getId());
        sr.setOrderNo(order.getOrderNo());
        sr.setStyleId(order.getStyleId());
        sr.setStyleNo(order.getStyleNo());
        sr.setTenantId(order.getTenantId());
        sr.setFactoryId(UserContext.factoryId());
        String color = colorResolver.apply(null);
        if (!hasText(color) && bundle != null) {
            color = TextUtils.safeText(bundle.getColor());
        }
        if (!hasText(color) && order != null) {
            color = TextUtils.safeText(order.getColor());
        }
        String size = sizeResolver.apply(null);
        if (!hasText(size) && bundle != null) {
            size = TextUtils.safeText(bundle.getSize());
        }
        if (!hasText(size) && order != null) {
            size = TextUtils.safeText(order.getSize());
        }
        sr.setColor(color);
        sr.setSize(size);
        sr.setQuantity(qty);
        sr.setProcessCode(stageCode);
        sr.setProgressStage("质检");
        sr.setProcessName("质检");
        sr.setOperatorId(operatorId);
        sr.setOperatorName(operatorName);
        sr.setScanTime(LocalDateTime.now());
        sr.setScanType("quality");
        sr.setScanResult("success");
        sr.setRemark(stageName);
        sr.setCuttingBundleId(bundle.getId());
        sr.setCuttingBundleNo(bundle.getBundleNo());
        sr.setCuttingBundleQrCode(bundle.getQrCode());

        if (skuService != null) {
            skuService.attachProcessUnitPrice(sr);
        }

        return sr;
    }

    public void createQualityScanRecord(ProductionOrder order, CuttingBundle bundle,
                                         int defectQty, String operatorId, String operatorName) {
        try {
            long existingCount = productWarehousingService.count(
                    new LambdaQueryWrapper<ProductWarehousing>()
                            .eq(ProductWarehousing::getOrderId, order.getId())
                            .eq(ProductWarehousing::getCuttingBundleId, bundle.getId())
                            .eq(ProductWarehousing::getWarehousingType, "quality_scan")
                            .eq(ProductWarehousing::getDeleteFlag, 0));
            if (existingCount > 0) {
                log.info("[QualityScan] quality_scan 记录已存在，跳过: orderId={}, bundleId={}",
                        order.getId(), bundle.getId());
                return;
            }

            LocalDateTime now = LocalDateTime.now();
            ProductWarehousing w = new ProductWarehousing();
            w.setOrderId(order.getId());
            w.setOrderNo(order.getOrderNo());
            w.setStyleId(order.getStyleId());
            w.setStyleNo(order.getStyleNo());
            w.setStyleName(order.getStyleName());
            w.setWarehousingType("quality_scan");
            w.setWarehouse("待分配");
            w.setWarehousingQuantity(0);
            w.setQualifiedQuantity(0);
            w.setUnqualifiedQuantity(defectQty);
            w.setQualityStatus("unqualified");
            w.setCuttingBundleId(bundle.getId());
            w.setCuttingBundleNo(bundle.getBundleNo());
            w.setCuttingBundleQrCode(bundle.getQrCode());
            w.setTenantId(order.getTenantId());
            String existingWhNo = productWarehousingService.findExistingWarehousingNoByOrderId(order.getId());
            w.setWarehousingNo(hasText(existingWhNo) ? existingWhNo : productWarehousingService.buildWarehousingNo(now));
            if (hasText(operatorId)) {
                w.setQualityOperatorId(operatorId);
            }
            if (hasText(operatorName)) {
                w.setQualityOperatorName(operatorName);
            }
            w.setCreateTime(now);
            w.setUpdateTime(now);
            w.setDeleteFlag(0);

            productWarehousingService.save(w);
            log.info("[QualityScan] 已创建 quality_scan 次品池记录: orderId={}, bundleId={}, defectQty={}, warehousingNo={}",
                    order.getId(), bundle.getId(), defectQty, w.getWarehousingNo());

            syncBundleStatusAfterQualityScan(order.getId(), bundle);

        } catch (org.springframework.dao.DuplicateKeyException dke) {
            log.info("[QualityScan] quality_scan 记录重复（幂等）: orderId={}, bundleId={}",
                    order.getId(), bundle.getId());
        } catch (Exception e) {
            log.warn("[QualityScan] 创建 quality_scan 记录失败（不阻断主流程）: orderId={}, bundleId={}, error={}",
                    order.getId(), bundle.getId(), e.getMessage(), e);
        }
    }

    public void createQualifiedScanRecord(ProductionOrder order, CuttingBundle bundle,
                                           int qualifiedQty, String operatorId, String operatorName) {
        try {
            long existingCount = productWarehousingService.count(
                    new LambdaQueryWrapper<ProductWarehousing>()
                            .eq(ProductWarehousing::getOrderId, order.getId())
                            .eq(ProductWarehousing::getCuttingBundleId, bundle.getId())
                            .eq(ProductWarehousing::getWarehousingType, "quality_scan")
                            .eq(ProductWarehousing::getDeleteFlag, 0));
            if (existingCount > 0) {
                log.info("[QualityScan] quality_scan 记录已存在，跳过合格记录创建: orderId={}, bundleId={}",
                        order.getId(), bundle.getId());
                return;
            }

            LocalDateTime now = LocalDateTime.now();
            ProductWarehousing w = new ProductWarehousing();
            w.setOrderId(order.getId());
            w.setOrderNo(order.getOrderNo());
            w.setStyleId(order.getStyleId());
            w.setStyleNo(order.getStyleNo());
            w.setStyleName(order.getStyleName());
            w.setWarehousingType("quality_scan");
            w.setWarehouse("待分配");
            w.setWarehousingQuantity(0);
            w.setQualifiedQuantity(qualifiedQty);
            w.setUnqualifiedQuantity(0);
            w.setQualityStatus("qualified");
            w.setCuttingBundleId(bundle.getId());
            w.setCuttingBundleNo(bundle.getBundleNo());
            w.setCuttingBundleQrCode(bundle.getQrCode());
            w.setTenantId(order.getTenantId());
            String existingWhNo = productWarehousingService.findExistingWarehousingNoByOrderId(order.getId());
            w.setWarehousingNo(hasText(existingWhNo) ? existingWhNo : productWarehousingService.buildWarehousingNo(now));
            if (hasText(operatorId)) {
                w.setQualityOperatorId(operatorId);
            }
            if (hasText(operatorName)) {
                w.setQualityOperatorName(operatorName);
            }
            w.setCreateTime(now);
            w.setUpdateTime(now);
            w.setDeleteFlag(0);

            productWarehousingService.save(w);
            log.info("[QualityScan] 已创建 quality_scan 合格记录: orderId={}, bundleId={}, qualifiedQty={}, warehousingNo={}",
                    order.getId(), bundle.getId(), qualifiedQty, w.getWarehousingNo());

            try {
                int qualifiedSum = productWarehousingService.sumQualifiedByOrderId(order.getId());
                ProductionOrder patch = new ProductionOrder();
                patch.setId(order.getId());
                patch.setCompletedQuantity(qualifiedSum);
                patch.setUpdateTime(LocalDateTime.now());
                productionOrderService.updateById(patch);
                log.info("[QualityScan] 已更新订单合格入库数量: orderId={}, completedQuantity={}", order.getId(), qualifiedSum);
            } catch (Exception ex) {
                log.warn("[QualityScan] 更新订单合格入库数量失败（不阻断主流程）: orderId={}", order.getId(), ex);
            }

            syncBundleStatusAfterQualityScan(order.getId(), bundle);

        } catch (org.springframework.dao.DuplicateKeyException dke) {
            log.info("[QualityScan] quality_scan 合格记录重复（幂等）: orderId={}, bundleId={}",
                    order.getId(), bundle.getId());
        } catch (Exception e) {
            log.warn("[QualityScan] 创建合格质检记录失败（不阻断主流程）: orderId={}, bundleId={}, error={}",
                    order.getId(), bundle.getId(), e.getMessage(), e);
        }
    }

    public void createScrapRecord(ProductionOrder order, CuttingBundle bundle,
                                   int defectQty, String operatorId, String operatorName) {
        try {
            convertOldQualityScanToScrap(order, bundle);
            createNewScrapWarehousing(order, bundle, defectQty, operatorId, operatorName);
            syncBundleStatusAfterQualityScan(order.getId(), bundle);
        } catch (org.springframework.dao.DuplicateKeyException dke) {
            log.info("[QualityScan] quality_scan_scrap 记录重复（幂等）: orderId={}, bundleId={}",
                    order.getId(), bundle.getId());
        } catch (Exception e) {
            log.warn("[QualityScan] 创建报废记录失败（不阻断主流程）: orderId={}, bundleId={}, error={}",
                    order.getId(), bundle.getId(), e.getMessage(), e);
        }
    }

    private void convertOldQualityScanToScrap(ProductionOrder order, CuttingBundle bundle) {
        try {
            boolean converted = productWarehousingService.update(
                    null,
                    new LambdaUpdateWrapper<ProductWarehousing>()
                            .eq(ProductWarehousing::getOrderId, order.getId())
                            .eq(ProductWarehousing::getCuttingBundleId, bundle.getId())
                            .eq(ProductWarehousing::getWarehousingType, "quality_scan")
                            .eq(ProductWarehousing::getDeleteFlag, 0)
                            .set(ProductWarehousing::getWarehousingType, "quality_scan_scrap")
                            .set(ProductWarehousing::getQualityStatus, "scrapped")
                            .set(ProductWarehousing::getWarehouse, "报废")
                            .set(ProductWarehousing::getUpdateTime, LocalDateTime.now()));
            if (converted) {
                log.info("[QualityScan] 已将旧quality_scan转为scrap: orderId={}, bundleId={}",
                        order.getId(), bundle.getId());
            }
        } catch (Exception e) {
            log.warn("[QualityScan] 转换旧quality_scan记录失败（继续创建新记录）: orderId={}, bundleId={}",
                    order.getId(), bundle.getId(), e);
        }
    }

    private void createNewScrapWarehousing(ProductionOrder order, CuttingBundle bundle,
                                            int defectQty, String operatorId, String operatorName) {
        long scrapCount = productWarehousingService.count(
                new LambdaQueryWrapper<ProductWarehousing>()
                        .eq(ProductWarehousing::getOrderId, order.getId())
                        .eq(ProductWarehousing::getCuttingBundleId, bundle.getId())
                        .eq(ProductWarehousing::getWarehousingType, "quality_scan_scrap")
                        .eq(ProductWarehousing::getDeleteFlag, 0));
        if (scrapCount > 0) {
            log.info("[QualityScan] quality_scan_scrap 记录已存在（含转换），跳过新建: orderId={}, bundleId={}",
                    order.getId(), bundle.getId());
            return;
        }
        LocalDateTime now = LocalDateTime.now();
        ProductWarehousing w = new ProductWarehousing();
        w.setOrderId(order.getId());
        w.setOrderNo(order.getOrderNo());
        w.setStyleId(order.getStyleId());
        w.setStyleNo(order.getStyleNo());
        w.setStyleName(order.getStyleName());
        w.setWarehousingType("quality_scan_scrap");
        w.setWarehouse("报废");
        w.setWarehousingQuantity(0);
        w.setQualifiedQuantity(0);
        w.setUnqualifiedQuantity(defectQty);
        w.setQualityStatus("scrapped");
        w.setCuttingBundleId(bundle.getId());
        w.setCuttingBundleNo(bundle.getBundleNo());
        w.setCuttingBundleQrCode(bundle.getQrCode());
        w.setTenantId(order.getTenantId());
        String existingWhNo = productWarehousingService.findExistingWarehousingNoByOrderId(order.getId());
        w.setWarehousingNo(hasText(existingWhNo) ? existingWhNo : productWarehousingService.buildWarehousingNo(now));
        if (hasText(operatorId)) w.setQualityOperatorId(operatorId);
        if (hasText(operatorName)) w.setQualityOperatorName(operatorName);
        w.setCreateTime(now);
        w.setUpdateTime(now);
        w.setDeleteFlag(0);
        productWarehousingService.save(w);
        log.info("[QualityScan] 已创建报废记录: orderId={}, bundleId={}, scrapQty={}, warehousingNo={}",
                order.getId(), bundle.getId(), defectQty, w.getWarehousingNo());
    }

    private void syncBundleStatusAfterQualityScan(String orderId, CuttingBundle bundle) {
        try {
            int repairPool = warehousingHelper.calcRepairBreakdown(orderId, bundle.getId(), null)[0];
            String currentStatus = bundle.getStatus() == null ? "" : bundle.getStatus().trim();

            if (repairPool > 0) {
                if (!"unqualified".equals(currentStatus)) {
                    try {
                        cuttingBundleService.lambdaUpdate()
                                .eq(CuttingBundle::getId, bundle.getId())
                                .set(CuttingBundle::getStatus, "unqualified")
                                .set(CuttingBundle::getUpdateTime, LocalDateTime.now())
                                .update();
                    } catch (Exception e) {
                        log.warn("[QualityScan] 更新菲号状态失败: bundleId={}", bundle.getId(), e);
                    }
                    log.info("[QualityScan] 有返修池，菲号状态→unqualified: bundleId={}", bundle.getId());
                }
            } else {
                if (!"qualified".equals(currentStatus)) {
                    try {
                        cuttingBundleService.lambdaUpdate()
                                .eq(CuttingBundle::getId, bundle.getId())
                                .set(CuttingBundle::getStatus, "qualified")
                                .set(CuttingBundle::getUpdateTime, LocalDateTime.now())
                                .update();
                    } catch (Exception e) {
                        log.warn("[QualityScan] 更新菲号状态失败: bundleId={}", bundle.getId(), e);
                    }
                    log.info("[QualityScan] 无返修池，菲号状态→qualified: bundleId={}", bundle.getId());
                }
            }
        } catch (Exception e) {
            log.warn("[QualityScan] 同步菲号状态失败（不阻断流程）: bundleId={}", bundle.getId(), e);
        }
    }

    public String buildDefectRemark(Map<String, Object> params, String qualityResult,
                                     boolean isUnqualified, int defectQty) {
        if (!isUnqualified) return qualityResult;
        String defectCategory = TextUtils.safeText(params.get("defectCategory"));
        String defectRemark = TextUtils.safeText(params.get("defectRemark"));
        return hasText(defectCategory)
                ? "unqualified|" + defectCategory
                  + (hasText(defectRemark) ? "|" + defectRemark : "")
                  + "|defectQty=" + defectQty
                : "unqualified|defectQty=" + defectQty;
    }

    public Map<String, Object> buildOrderInfo(ProductionOrder order) {
        Map<String, Object> info = new HashMap<>();
        info.put("orderNo", order.getOrderNo());
        info.put("styleNo", order.getStyleNo());
        return info;
    }

    private boolean hasText(String str) {
        return StringUtils.hasText(str);
    }
}
