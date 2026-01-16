package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import java.time.LocalDateTime;
import java.util.NoSuchElementException;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
@Slf4j
public class ProductWarehousingOrchestrator {

    @Autowired
    private ProductWarehousingService productWarehousingService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ProductionOrderOrchestrator productionOrderOrchestrator;

    @Autowired
    private CuttingBundleService cuttingBundleService;

    @Autowired
    private ScanRecordMapper scanRecordMapper;

    @Autowired
    private ProductionOrderScanRecordDomainService scanRecordDomainService;

    public IPage<ProductWarehousing> list(Map<String, Object> params) {
        return productWarehousingService.queryPage(params);
    }

    public ProductWarehousing getById(String id) {
        String key = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(key)) {
            throw new IllegalArgumentException("参数错误");
        }
        ProductWarehousing warehousing = productWarehousingService.getById(key);
        if (warehousing == null || (warehousing.getDeleteFlag() != null && warehousing.getDeleteFlag() != 0)) {
            throw new NoSuchElementException("入库记录不存在");
        }
        return warehousing;
    }

    public boolean save(ProductWarehousing productWarehousing) {
        if (productWarehousing == null) {
            throw new IllegalArgumentException("参数错误");
        }
        boolean ok = productWarehousingService.saveWarehousingAndUpdateOrder(productWarehousing);
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }

        String orderId = StringUtils.hasText(productWarehousing.getOrderId()) ? productWarehousing.getOrderId().trim()
                : null;
        if (StringUtils.hasText(orderId)) {
            try {
                productionOrderOrchestrator.ensureFinanceRecordsForOrder(orderId);
            } catch (Exception e) {
                log.warn("Failed to ensure finance records after warehousing save: orderId={}, warehousingId={}",
                        orderId,
                        productWarehousing == null ? null : productWarehousing.getId(),
                        e);
            }
            productionOrderService.recomputeProgressFromRecords(orderId);

            try {
                productionOrderOrchestrator.autoCloseOrderIfEligible(orderId);
            } catch (Exception e) {
                log.warn("Failed to auto close order after warehousing save: orderId={}, warehousingId={}",
                        orderId,
                        productWarehousing == null ? null : productWarehousing.getId(),
                        e);
                scanRecordDomainService.insertOrchestrationFailure(
                        orderId,
                        null,
                        null,
                        null,
                        "autoCloseOrder",
                        e == null ? "autoCloseOrder failed" : ("autoCloseOrder failed: " + e.getMessage()),
                        LocalDateTime.now());
            }
        }
        return true;
    }

    public boolean batchSave(Map<String, Object> body) {
        String orderId = body == null ? null : (String) body.get("orderId");
        String warehouse = body == null ? null : (String) body.get("warehouse");
        String warehousingType = body == null ? null : (String) body.get("warehousingType");
        Object itemsRaw = body == null ? null : body.get("items");

        String oid = orderId == null ? null : StringUtils.trimWhitespace(orderId);
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("订单ID不能为空");
        }
        if (!StringUtils.hasText(warehouse)) {
            throw new IllegalArgumentException("请选择仓库");
        }
        if (!(itemsRaw instanceof List)) {
            throw new IllegalArgumentException("入库明细不能为空");
        }

        List<?> rawList = (List<?>) itemsRaw;
        List<ProductWarehousing> list = new ArrayList<>();
        for (Object obj : rawList) {
            if (!(obj instanceof Map)) {
                continue;
            }
            Map<?, ?> m = (Map<?, ?>) obj;
            String cuttingBundleQrCode = m.get("cuttingBundleQrCode") == null ? null
                    : String.valueOf(m.get("cuttingBundleQrCode"));
            Integer qty = parseInt(m.get("warehousingQuantity"));
            if (!StringUtils.hasText(cuttingBundleQrCode) || qty == null || qty <= 0) {
                continue;
            }

            ProductWarehousing w = new ProductWarehousing();
            w.setOrderId(oid);
            w.setWarehouse(warehouse);
            w.setWarehousingType(StringUtils.hasText(warehousingType) ? warehousingType : "manual");
            w.setCuttingBundleQrCode(cuttingBundleQrCode);
            w.setWarehousingQuantity(qty);
            w.setQualifiedQuantity(qty);
            w.setUnqualifiedQuantity(0);
            w.setQualityStatus("qualified");
            list.add(w);
        }

        if (list.isEmpty()) {
            throw new IllegalArgumentException("入库明细不能为空");
        }

        boolean ok = productWarehousingService.saveBatchWarehousingAndUpdateOrder(list);
        if (!ok) {
            throw new IllegalStateException("批量入库失败");
        }

        try {
            productionOrderOrchestrator.ensureFinanceRecordsForOrder(oid);
        } catch (Exception e) {
            log.warn("Failed to ensure finance records after warehousing batch save: orderId={}, itemsCount={}",
                    oid,
                    list == null ? 0 : list.size(),
                    e);
            scanRecordDomainService.insertOrchestrationFailure(
                    oid,
                    null,
                    null,
                    null,
                    "ensureFinanceRecords",
                    e == null ? "ensureFinanceRecords failed" : ("ensureFinanceRecords failed: " + e.getMessage()),
                    LocalDateTime.now());
        }
        productionOrderService.recomputeProgressFromRecords(oid);

        try {
            productionOrderOrchestrator.autoCloseOrderIfEligible(oid);
        } catch (Exception e) {
            log.warn("Failed to auto close order after warehousing batch save: orderId={}, itemsCount={}",
                    oid,
                    list == null ? 0 : list.size(),
                    e);
            scanRecordDomainService.insertOrchestrationFailure(
                    oid,
                    null,
                    null,
                    null,
                    "autoCloseOrder",
                    e == null ? "autoCloseOrder failed" : ("autoCloseOrder failed: " + e.getMessage()),
                    LocalDateTime.now());
        }
        return true;
    }

    public boolean update(ProductWarehousing productWarehousing) {
        if (productWarehousing == null || !StringUtils.hasText(productWarehousing.getId())) {
            throw new IllegalArgumentException("参数错误");
        }
        ProductWarehousing current = productWarehousingService.getById(productWarehousing.getId().trim());
        if (current == null || (current.getDeleteFlag() != null && current.getDeleteFlag() != 0)) {
            throw new NoSuchElementException("入库记录不存在");
        }
        boolean ok = productWarehousingService.updateWarehousingAndUpdateOrder(productWarehousing);
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }

        String orderId = StringUtils.hasText(current.getOrderId()) ? current.getOrderId().trim() : null;
        if (StringUtils.hasText(orderId)) {
            try {
                productionOrderOrchestrator.ensureFinanceRecordsForOrder(orderId);
            } catch (Exception e) {
                log.warn("Failed to ensure finance records after warehousing update: orderId={}, warehousingId={}",
                        orderId,
                        productWarehousing == null ? null : productWarehousing.getId(),
                        e);
                scanRecordDomainService.insertOrchestrationFailure(
                        orderId,
                        null,
                        null,
                        null,
                        "ensureFinanceRecords",
                        e == null ? "ensureFinanceRecords failed"
                                : ("ensureFinanceRecords failed: " + e.getMessage()),
                        LocalDateTime.now());
            }
            productionOrderService.recomputeProgressFromRecords(orderId);

            try {
                productionOrderOrchestrator.autoCloseOrderIfEligible(orderId);
            } catch (Exception e) {
                log.warn("Failed to auto close order after warehousing update: orderId={}, warehousingId={}",
                        orderId,
                        productWarehousing == null ? null : productWarehousing.getId(),
                        e);
                scanRecordDomainService.insertOrchestrationFailure(
                        orderId,
                        null,
                        null,
                        null,
                        "autoCloseOrder",
                        e == null ? "autoCloseOrder failed" : ("autoCloseOrder failed: " + e.getMessage()),
                        LocalDateTime.now());
            }
        }
        return true;
    }

    public boolean delete(String id) {
        String key = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(key)) {
            throw new IllegalArgumentException("参数错误");
        }
        ProductWarehousing current = productWarehousingService.getById(key);
        if (current == null || (current.getDeleteFlag() != null && current.getDeleteFlag() != 0)) {
            throw new NoSuchElementException("入库记录不存在");
        }

        String orderId = StringUtils.hasText(current.getOrderId()) ? current.getOrderId().trim() : null;

        ProductWarehousing patch = new ProductWarehousing();
        patch.setId(key);
        patch.setDeleteFlag(1);
        patch.setUpdateTime(LocalDateTime.now());
        boolean ok = productWarehousingService.updateById(patch);
        if (!ok) {
            throw new IllegalStateException("删除失败");
        }

        if (StringUtils.hasText(orderId)) {
            try {
                int qualifiedSum = productWarehousingService.sumQualifiedByOrderId(orderId);
                ProductionOrder orderPatch = new ProductionOrder();
                orderPatch.setId(orderId);
                orderPatch.setCompletedQuantity(qualifiedSum);
                orderPatch.setUpdateTime(LocalDateTime.now());
                productionOrderService.updateById(orderPatch);
            } catch (Exception e) {
                log.warn(
                        "Failed to update production order completed quantity after warehousing delete: orderId={}, warehousingId={}",
                        orderId,
                        key,
                        e);
            }

            try {
                productionOrderOrchestrator.ensureFinanceRecordsForOrder(orderId);
            } catch (Exception e) {
                log.warn("Failed to ensure finance records after warehousing delete: orderId={}, warehousingId={}",
                        orderId,
                        key,
                        e);
                scanRecordDomainService.insertOrchestrationFailure(
                        orderId,
                        null,
                        null,
                        null,
                        "ensureFinanceRecords",
                        e == null ? "ensureFinanceRecords failed"
                                : ("ensureFinanceRecords failed: " + e.getMessage()),
                        LocalDateTime.now());
            }

            try {
                productionOrderService.recomputeProgressFromRecords(orderId);
            } catch (Exception e) {
                log.warn("Failed to recompute progress after warehousing delete: orderId={}, warehousingId={}",
                        orderId,
                        key,
                        e);
            }
        }
        return true;
    }

    public boolean rollbackByBundle(Map<String, Object> body) {
        if (!UserContext.isSupervisorOrAbove()) {
            throw new AccessDeniedException("无权限回退");
        }

        Object orderIdRaw = body == null ? null : body.get("orderId");
        String orderId = orderIdRaw == null ? "" : String.valueOf(orderIdRaw).trim();

        Object cuttingBundleQrCodeRaw = body == null ? null : body.get("cuttingBundleQrCode");
        String cuttingBundleQrCode = cuttingBundleQrCodeRaw == null ? ""
                : String.valueOf(cuttingBundleQrCodeRaw).trim();
        Integer qty = parseInt(body == null ? null : body.get("rollbackQuantity"));
        Object remarkRaw = body == null ? null : body.get("rollbackRemark");
        String remark = remarkRaw == null ? "" : String.valueOf(remarkRaw).trim();

        if (!StringUtils.hasText(cuttingBundleQrCode)) {
            throw new IllegalArgumentException("cuttingBundleQrCode不能为空");
        }

        if (qty == null || qty <= 0) {
            throw new IllegalArgumentException("rollbackQuantity参数错误");
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
                ProductWarehousing patch = new ProductWarehousing();
                patch.setId(w.getId());
                patch.setDeleteFlag(1);
                patch.setUpdateTime(now);
                productWarehousingService.updateById(patch);
                remaining -= q;
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
                remaining = 0;
            }
        }

        int qualifiedSum = productWarehousingService.sumQualifiedByOrderId(oid);
        ProductionOrder orderPatch = new ProductionOrder();
        orderPatch.setId(oid);
        orderPatch.setCompletedQuantity(qualifiedSum);
        if ("completed".equals(String.valueOf(order.getStatus()))
                && (order.getOrderQuantity() == null || qualifiedSum < order.getOrderQuantity())) {
            orderPatch.setStatus("production");
            orderPatch.setActualEndDate(null);
        }
        orderPatch.setUpdateTime(now);
        productionOrderService.updateById(orderPatch);

        UserContext ctx = UserContext.get();
        String operatorId = ctx == null ? null : ctx.getUserId();
        String operatorName = ctx == null ? null : ctx.getUsername();
        String remark = StringUtils.hasText(rollbackRemark) ? rollbackRemark.trim() : "";

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
        rollbackLog.setOperatorId(trimToNull(operatorId));
        rollbackLog.setOperatorName(trimToNull(operatorName));
        rollbackLog.setScanTime(now);
        rollbackLog.setScanType("warehouse");
        rollbackLog.setScanResult("success");
        rollbackLog.setRemark(StringUtils.hasText(remark) ? ("入库回退：" + remark) : "入库回退");
        rollbackLog.setCuttingBundleId(bundle.getId());
        rollbackLog.setCuttingBundleNo(bundle.getBundleNo());
        rollbackLog.setCuttingBundleQrCode(bundle.getQrCode());
        rollbackLog.setCreateTime(now);
        rollbackLog.setUpdateTime(now);
        scanRecordMapper.insert(rollbackLog);

        try {
            List<ScanRecord> warehouseScans = scanRecordMapper.selectList(new LambdaQueryWrapper<ScanRecord>()
                    .eq(ScanRecord::getOrderId, oid)
                    .eq(ScanRecord::getCuttingBundleId, bundle.getId())
                    .eq(ScanRecord::getScanType, "warehouse")
                    .eq(ScanRecord::getScanResult, "success")
                    .ne(ScanRecord::getProcessCode, "warehouse_rollback")
                    .orderByDesc(ScanRecord::getScanTime)
                    .orderByDesc(ScanRecord::getCreateTime));
            if (warehouseScans != null) {
                for (ScanRecord sr : warehouseScans) {
                    if (sr == null || !StringUtils.hasText(sr.getId())) {
                        continue;
                    }
                    ScanRecord patch = new ScanRecord();
                    patch.setId(sr.getId());
                    patch.setScanResult("failure");
                    patch.setRemark("入库记录已回退作废");
                    patch.setUpdateTime(now);
                    scanRecordMapper.updateById(patch);
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
            List<ScanRecord> inspectionRecords = scanRecordMapper.selectList(new LambdaQueryWrapper<ScanRecord>()
                    .eq(ScanRecord::getOrderId, oid)
                    .eq(ScanRecord::getCuttingBundleId, bundle.getId())
                    .eq(ScanRecord::getProcessCode, "quality_warehousing")
                    .eq(ScanRecord::getScanResult, "success")
                    .orderByDesc(ScanRecord::getScanTime)
                    .orderByDesc(ScanRecord::getCreateTime));
            if (inspectionRecords != null) {
                for (ScanRecord sr : inspectionRecords) {
                    if (sr == null || !StringUtils.hasText(sr.getId())) {
                        continue;
                    }
                    ScanRecord patch = new ScanRecord();
                    patch.setId(sr.getId());
                    patch.setScanResult("failure");
                    patch.setRemark("质检入库已回退作废");
                    patch.setUpdateTime(now);
                    scanRecordMapper.updateById(patch);
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

    private String trimToNull(String v) {
        if (!StringUtils.hasText(v)) {
            return null;
        }
        String s = v.trim();
        return s.isEmpty() ? null : s;
    }

    private Integer parseInt(Object v) {
        if (v instanceof Number) {
            return ((Number) v).intValue();
        }
        if (v == null) {
            return null;
        }
        try {
            return Integer.parseInt(String.valueOf(v));
        } catch (Exception e) {
            return null;
        }
    }
}
