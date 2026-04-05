package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.util.NumberUtils;
import com.fashion.supplychain.common.util.TextUtils;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.orchestration.ProductionOrderOrchestrator;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.style.service.ProductSkuService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import org.springframework.security.access.AccessDeniedException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;

/**
 * 入库回退 Helper — 从 ProductWarehousingOrchestrator 拆出的回退相关方法
 */
@Service
@Slf4j
public class ProductWarehousingRollbackHelper {

    @Autowired
    private ProductWarehousingService productWarehousingService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ProductionOrderOrchestrator productionOrderOrchestrator;

    @Autowired
    private CuttingBundleService cuttingBundleService;

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private ProductionOrderScanRecordDomainService scanRecordDomainService;

    @Autowired
    private ProductSkuService productSkuService;

    /**
     * 更新 SKU 库存（公开方法，供外部调用）
     */
    public void updateSkuStock(ProductWarehousing w, ProductionOrder order, CuttingBundle bundle, int deltaQuantity) {
        if (deltaQuantity == 0) {
            return;
        }
        String styleNo = w.getStyleNo();
        String color = null;
        String size = null;

        if (bundle != null) {
            color = bundle.getColor();
            size = bundle.getSize();
        } else if (StringUtils.hasText(w.getCuttingBundleId())) {
            // bundle 对象未传入，通过 bundleId 加载
            try {
                CuttingBundle b = cuttingBundleService.getById(w.getCuttingBundleId());
                if (b != null) {
                    color = b.getColor();
                    size = b.getSize();
                }
            } catch (Exception ignored) {
            }
        }
        // ⚠️ 不再使用 order.getColor()/getSize() 兜底：多码订单的 order.size 是单值字段，
        // 用于多码情景会写入错误的 SKU 条目

        if (StringUtils.hasText(styleNo) && StringUtils.hasText(color) && StringUtils.hasText(size)) {
            String skuCode = String.format("%s-%s-%s", styleNo.trim(), color.trim(), size.trim());
            productSkuService.updateStock(skuCode, deltaQuantity);
        } else {
            log.warn("[SKUStock] 无法获取 color/size，跳过 SKU 库存更新: warehousingId={}, styleNo={}, delta={}",
                    w.getId(), styleNo, deltaQuantity);
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean rollbackByBundle(Map<String, Object> body) {
        if (!UserContext.isSupervisorOrAbove()) {
            throw new AccessDeniedException("无权限回退");
        }

        Object orderIdRaw = body == null ? null : body.get("orderId");
        String orderId = orderIdRaw == null ? "" : String.valueOf(orderIdRaw).trim();

        Object cuttingBundleQrCodeRaw = body == null ? null : body.get("cuttingBundleQrCode");
        String cuttingBundleQrCode = cuttingBundleQrCodeRaw == null ? ""
                : String.valueOf(cuttingBundleQrCodeRaw).trim();
        Integer qty = NumberUtils.toInt(body == null ? null : body.get("rollbackQuantity"));
        Object remarkRaw = body == null ? null : body.get("rollbackRemark");
        String remark = remarkRaw == null ? "" : String.valueOf(remarkRaw).trim();

        if (!StringUtils.hasText(cuttingBundleQrCode)) {
            throw new IllegalArgumentException("cuttingBundleQrCode不能为空");
        }

        if (qty == null || qty <= 0) {
            throw new IllegalArgumentException("rollbackQuantity参数错误");
        }
        if (!StringUtils.hasText(remark)) {
            throw new IllegalArgumentException("请填写问题点");
        }

        boolean ok = rollbackQualifiedByBundleQrCode(orderId, cuttingBundleQrCode, qty, remark);
        if (!ok) {
            throw new IllegalStateException("回退失败");
        }

        if (StringUtils.hasText(orderId)) {
            String oid = orderId.trim();
            try {
                productionOrderOrchestrator.ensureFinanceRecordsForOrder(oid);
            } catch (Exception e) {
                log.warn(
                        "Failed to ensure finance records after warehousing rollback: orderId={}, cuttingBundleQrCode={}",
                        oid,
                        cuttingBundleQrCode,
                        e);
                scanRecordDomainService.insertOrchestrationFailure(
                        oid,
                        null,
                        null,
                        null,
                        "ensureFinanceRecords",
                        e == null ? "ensureFinanceRecords failed"
                                : ("ensureFinanceRecords failed: " + e.getMessage()),
                        LocalDateTime.now());
            }
            productionOrderService.recomputeProgressFromRecords(oid);
        }
        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    private boolean rollbackQualifiedByBundleQrCode(String orderId, String cuttingBundleQrCode,
            Integer rollbackQuantity,
            String rollbackRemark) {
        String qr = StringUtils.hasText(cuttingBundleQrCode) ? cuttingBundleQrCode.trim() : null;
        if (!StringUtils.hasText(qr)) {
            throw new IllegalArgumentException("请扫码对应扎号二维码");
        }

        int rq = rollbackQuantity == null ? 0 : rollbackQuantity;
        if (rq <= 0) {
            throw new IllegalArgumentException("回退数量必须大于0");
        }

        CuttingBundle bundle = cuttingBundleService.getByQrCode(qr);
        if (bundle == null || !StringUtils.hasText(bundle.getId())) {
            throw new NoSuchElementException("未找到对应的裁剪扎号");
        }

        String oid = StringUtils.hasText(orderId) ? orderId.trim()
                : (StringUtils.hasText(bundle.getProductionOrderId()) ? bundle.getProductionOrderId().trim() : null);
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("未匹配到订单");
        }
        String bundleOid = StringUtils.hasText(bundle.getProductionOrderId()) ? bundle.getProductionOrderId().trim()
                : null;
        if (bundleOid != null && !bundleOid.isEmpty() && !bundleOid.equals(oid)) {
            throw new IllegalArgumentException("扎号与订单不匹配");
        }

        ProductionOrder order = productionOrderService.getById(oid);
        if (order == null || order.getDeleteFlag() == null || order.getDeleteFlag() != 0) {
            throw new NoSuchElementException("订单不存在");
        }

        List<ProductWarehousing> list = productWarehousingService.list(new LambdaQueryWrapper<ProductWarehousing>()
                .eq(ProductWarehousing::getOrderId, oid)
                .eq(ProductWarehousing::getDeleteFlag, 0)
                .eq(ProductWarehousing::getCuttingBundleId, bundle.getId())
                .orderByDesc(ProductWarehousing::getCreateTime));
        if (list == null || list.isEmpty()) {
            throw new NoSuchElementException("未找到该扎号对应的入库记录");
        }

        long available = 0;
        for (ProductWarehousing w : list) {
            if (w == null) {
                continue;
            }
            int q = w.getQualifiedQuantity() == null ? 0 : w.getQualifiedQuantity();
            if (q > 0) {
                available += q;
            }
        }
        if (available < rq) {
            throw new IllegalArgumentException("回退数量超过该扎号已入库合格数量");
        }

        LocalDateTime now = LocalDateTime.now();
        int remaining = rq;
        for (ProductWarehousing w : list) {
            if (remaining <= 0) {
                break;
            }
            if (w == null || !StringUtils.hasText(w.getId())) {
                continue;
            }
            int q = w.getQualifiedQuantity() == null ? 0 : w.getQualifiedQuantity();
            if (q <= 0) {
                continue;
            }

            if (q <= remaining) {
                productWarehousingService.removeById(w.getId());
                remaining -= q;

                // Decrement Stock
                if (q > 0) {
                    updateSkuStock(w, null, bundle, -q);
                }
            } else {
                int nextQualified = q - remaining;
                int whQty = w.getWarehousingQuantity() == null ? q : w.getWarehousingQuantity();
                int nextWhQty = Math.max(0, whQty - remaining);

                ProductWarehousing patch = new ProductWarehousing();
                patch.setId(w.getId());
                patch.setQualifiedQuantity(nextQualified);
                patch.setWarehousingQuantity(nextWhQty);
                patch.setUpdateTime(now);
                productWarehousingService.updateById(patch);

                // Decrement Stock
                if (remaining > 0) {
                    updateSkuStock(w, null, bundle, -remaining);
                }

                remaining = 0;
            }
        }

        int qualifiedSum = productWarehousingService.sumQualifiedByOrderId(oid);
        ProductionOrder orderPatch = new ProductionOrder();
        orderPatch.setId(oid);
        orderPatch.setCompletedQuantity(qualifiedSum);
        if ("completed".equals(String.valueOf(order.getStatus()))
                && (order.getOrderQuantity() == null || qualifiedSum < order.getOrderQuantity())) {
            // ⚠️ 用 LambdaUpdateWrapper 显式 SET NULL
            LambdaUpdateWrapper<ProductionOrder> undoCompleteUw = new LambdaUpdateWrapper<>();
            undoCompleteUw.eq(ProductionOrder::getId, oid)
                          .set(ProductionOrder::getCompletedQuantity, qualifiedSum)
                          .set(ProductionOrder::getStatus, "production")
                          .set(ProductionOrder::getActualEndDate, null)
                          .set(ProductionOrder::getUpdateTime, now);
            productionOrderService.update(undoCompleteUw);
        } else {
            orderPatch.setUpdateTime(now);
            productionOrderService.updateById(orderPatch);
        }

        UserContext ctx = UserContext.get();
        String operatorId = ctx == null ? null : ctx.getUserId();
        String operatorName = ctx == null ? null : ctx.getUsername();
        String remarkText = StringUtils.hasText(rollbackRemark) ? rollbackRemark.trim() : "";

        ScanRecord rollbackLog = new ScanRecord();
        rollbackLog.setId(UUID.randomUUID().toString());
        rollbackLog.setScanCode(qr);
        rollbackLog.setRequestId("WAREHOUSING_ROLLBACK:" + UUID.randomUUID().toString());
        rollbackLog.setOrderId(oid);
        rollbackLog.setOrderNo(order.getOrderNo());
        rollbackLog.setStyleId(order.getStyleId());
        rollbackLog.setStyleNo(order.getStyleNo());
        rollbackLog.setColor(bundle.getColor());
        rollbackLog.setSize(bundle.getSize());
        rollbackLog.setQuantity(rq);
        rollbackLog.setProcessCode("warehouse_rollback");
        rollbackLog.setProcessName("入库回退");
        rollbackLog.setOperatorId(TextUtils.safeText(operatorId));
        rollbackLog.setOperatorName(TextUtils.safeText(operatorName));
        rollbackLog.setScanTime(now);
        rollbackLog.setScanType("warehouse");
        rollbackLog.setScanResult("success");
        rollbackLog.setRemark(StringUtils.hasText(remarkText) ? ("入库回退：" + remarkText) : "入库回退");
        rollbackLog.setCuttingBundleId(bundle.getId());
        rollbackLog.setCuttingBundleNo(bundle.getBundleNo());
        rollbackLog.setCuttingBundleQrCode(bundle.getQrCode());
        rollbackLog.setCreateTime(now);
        rollbackLog.setUpdateTime(now);
        scanRecordService.save(rollbackLog);

        try {
            List<ScanRecord> warehouseScans = scanRecordService.listByCondition(
                    oid, bundle.getId(), "warehouse", "success", "warehouse_rollback");
            if (warehouseScans != null) {
                List<ScanRecord> toUpdate = new ArrayList<>();
                for (ScanRecord sr : warehouseScans) {
                    if (sr == null || !StringUtils.hasText(sr.getId())) {
                        continue;
                    }
                    ScanRecord scanPatch = new ScanRecord();
                    scanPatch.setId(sr.getId());
                    scanPatch.setScanResult("failure");
                    scanPatch.setRemark("入库记录已回退作废");
                    scanPatch.setUpdateTime(now);
                    toUpdate.add(scanPatch);
                }
                if (!toUpdate.isEmpty()) {
                    scanRecordService.batchUpdateRecords(toUpdate);
                }
            }
        } catch (Exception e) {
            log.warn(
                    "Failed to mark previous warehouse scan records invalid after rollback: orderId={}, cuttingBundleId={}",
                    oid,
                    bundle == null ? null : bundle.getId(),
                    e);
        }

        try {
            List<ScanRecord> inspectionRecords = scanRecordService.listQualityWarehousingRecords(oid, bundle.getId());
            if (inspectionRecords != null) {
                List<ScanRecord> toUpdate = new ArrayList<>();
                for (ScanRecord sr : inspectionRecords) {
                    if (sr == null || !StringUtils.hasText(sr.getId())) {
                        continue;
                    }
                    ScanRecord scanPatch = new ScanRecord();
                    scanPatch.setId(sr.getId());
                    scanPatch.setScanResult("failure");
                    scanPatch.setRemark("质检入库已回退作废");
                    scanPatch.setUpdateTime(now);
                    toUpdate.add(scanPatch);
                }
                if (!toUpdate.isEmpty()) {
                    scanRecordService.batchUpdateRecords(toUpdate);
                }
            }
        } catch (Exception e) {
            log.warn(
                    "Failed to mark previous inspection scan records invalid after rollback: orderId={}, cuttingBundleId={}",
                    oid,
                    bundle == null ? null : bundle.getId(),
                    e);
        }

        return true;
    }
}
