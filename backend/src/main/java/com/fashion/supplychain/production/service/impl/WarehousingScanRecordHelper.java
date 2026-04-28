package com.fashion.supplychain.production.service.impl;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.production.orchestration.ProductionProcessTrackingOrchestrator;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@Slf4j
public class WarehousingScanRecordHelper {

    @Autowired
    private ScanRecordMapper scanRecordMapper;

    @Autowired
    private ProductionProcessTrackingOrchestrator processTrackingOrchestrator;

    private final ProductWarehousingHelper warehousingHelper;

    public WarehousingScanRecordHelper(ProductWarehousingHelper warehousingHelper) {
        this.warehousingHelper = warehousingHelper;
    }

    void upsertWarehousingStageScanRecord(ProductWarehousing warehousing, ProductionOrder order,
            CuttingBundle bundle, LocalDateTime now) {
        upsertScanRecord(warehousing, order, bundle, now, "WAREHOUSING:", "quality_warehousing",
                "质检", "质检", ProductWarehousingHelper.SCAN_TYPE_QUALITY, "质检完成", "次品退回，质检记录作废");
    }

    void upsertWarehouseScanRecord(ProductWarehousing warehousing, ProductionOrder order,
            CuttingBundle bundle, LocalDateTime now) {
        String wt = warehousing.getWarehousingType() == null ? "" : warehousing.getWarehousingType().trim();
        if (ProductWarehousingHelper.WAREHOUSING_TYPE_SCAN.equalsIgnoreCase(wt)) {
            return;
        }
        String warehouse = warehousingHelper.trimToNull(warehousing.getWarehouse());
        if (!StringUtils.hasText(warehouse)) {
            return;
        }
        upsertScanRecord(warehousing, order, bundle, now, "WAREHOUSE:", "warehouse_manual",
                "入库", "入库", ProductWarehousingHelper.SCAN_TYPE_WAREHOUSE, "入库完成", "次品退回，入库记录作废");
    }

    void invalidateBundleFlowAfterReturnToSewing(String cuttingBundleId, LocalDateTime now) {
        scanRecordMapper.update(null, new LambdaUpdateWrapper<ScanRecord>()
                .eq(ScanRecord::getCuttingBundleId, cuttingBundleId)
                .eq(ScanRecord::getScanType, "production")
                .eq(ScanRecord::getScanResult, ProductWarehousingHelper.SCAN_RESULT_SUCCESS)
                .in(ScanRecord::getProcessName, Arrays.asList("整烫", "二次工艺", "包装"))
                .set(ScanRecord::getScanResult, ProductWarehousingHelper.SCAN_RESULT_FAILURE)
                .set(ScanRecord::getRemark, "次品退回缝制，后续环节作废")
                .set(ScanRecord::getUpdateTime, now));
    }

    void upsertScanRecord(ProductWarehousing warehousing, ProductionOrder order, CuttingBundle bundle,
            LocalDateTime now, String requestIdPrefix, String processCode, String progressStage,
            String processName, String scanType, String successRemark, String failureRemark) {

        if (warehousing == null || order == null || !StringUtils.hasText(warehousing.getId())
                || !StringUtils.hasText(order.getId())) {
            return;
        }

        String qs = warehousing.getQualityStatus() == null ? "" : warehousing.getQualityStatus().trim();
        boolean qualified = !StringUtils.hasText(qs) || ProductWarehousingHelper.STATUS_QUALIFIED.equalsIgnoreCase(qs);
        String requestId = requestIdPrefix + warehousing.getId().trim();

        ScanRecord existing = queryExistingScanRecord(requestId);
        int qualifiedQty = warehousing.getQualifiedQuantity() == null ? 0 : warehousing.getQualifiedQuantity();
        LocalDateTime t = now == null ? LocalDateTime.now() : now;

        ScanRecordFieldBundle fields = resolveScanRecordFields(warehousing, order, bundle, t);

        if (!qualified) {
            markScanRecordAsFailure(existing, failureRemark, t);
            return;
        }

        String scanRecordId;
        if (existing == null) {
            scanRecordId = insertNewScanRecord(fields, requestId, order, processCode, progressStage,
                    processName, scanType, successRemark, qualifiedQty, t);
        } else {
            scanRecordId = existing.getId();
            patchExistingScanRecord(existing, fields, order, processCode, progressStage,
                    processName, scanType, successRemark, qualifiedQty, t);
        }

        syncProcessTrackingAfterWarehousing(fields.cuttingBundleId, progressStage, fields.operatorId, fields.operatorName, scanRecordId);
    }

    private ScanRecord queryExistingScanRecord(String requestId) {
        try {
            return scanRecordMapper.selectOne(new LambdaQueryWrapper<ScanRecord>()
                    .eq(ScanRecord::getRequestId, requestId)
                    .last("limit 1"));
        } catch (Exception e) {
            log.warn("Failed to query existing scan record: requestId={}", requestId, e);
            return null;
        }
    }

    private record ScanRecordFieldBundle(String operatorId, String operatorName,
            String cuttingBundleId, Integer cuttingBundleNo, String cuttingBundleQr,
            String scanCode, String color, String size) {}

    private ScanRecordFieldBundle resolveScanRecordFields(ProductWarehousing warehousing,
            ProductionOrder order, CuttingBundle bundle, LocalDateTime now) {
        UserContext ctx = UserContext.get();
        String operatorId = ctx == null ? null : ctx.getUserId();
        String operatorName = ctx == null ? null : ctx.getUsername();

        String cuttingBundleId = warehousingHelper.trimToNull(warehousing.getCuttingBundleId());
        Integer cuttingBundleNo = warehousing.getCuttingBundleNo();
        String cuttingBundleQr = warehousingHelper.trimToNull(warehousing.getCuttingBundleQrCode());

        String color = bundle == null ? null : warehousingHelper.trimToNull(bundle.getColor());
        String size = bundle == null ? null : warehousingHelper.trimToNull(bundle.getSize());
        if (color == null) color = warehousingHelper.trimToNull(order.getColor());
        if (size == null) size = warehousingHelper.trimToNull(order.getSize());

        return new ScanRecordFieldBundle(
                warehousingHelper.trimToNull(operatorId), warehousingHelper.trimToNull(operatorName),
                cuttingBundleId, cuttingBundleNo, cuttingBundleQr, cuttingBundleQr,
                color, size);
    }

    private void markScanRecordAsFailure(ScanRecord existing, String failureRemark, LocalDateTime t) {
        if (existing != null && StringUtils.hasText(existing.getId())) {
            ScanRecord patch = new ScanRecord();
            patch.setId(existing.getId());
            patch.setScanResult(ProductWarehousingHelper.SCAN_RESULT_FAILURE);
            patch.setRemark(failureRemark);
            patch.setUpdateTime(t);
            scanRecordMapper.updateById(patch);
        }
    }

    private void populateScanRecordFields(ScanRecord sr, ProductionOrder order,
            ScanRecordFieldBundle fields, String processCode, String progressStage,
            String processName, String scanType, String remark, int qualifiedQty) {
        sr.setOrderId(order.getId());
        sr.setOrderNo(order.getOrderNo());
        sr.setStyleId(order.getStyleId());
        sr.setStyleNo(order.getStyleNo());
        sr.setColor(fields.color);
        sr.setSize(fields.size);
        sr.setQuantity(Math.max(0, qualifiedQty));
        sr.setProcessCode(processCode);
        sr.setProgressStage(progressStage);
        sr.setProcessName(processName);
        sr.setOperatorId(fields.operatorId);
        sr.setOperatorName(fields.operatorName);
        sr.setScanType(scanType);
        sr.setScanResult(ProductWarehousingHelper.SCAN_RESULT_SUCCESS);
        sr.setRemark(remark);
        sr.setCuttingBundleId(fields.cuttingBundleId);
        sr.setCuttingBundleNo(fields.cuttingBundleNo);
        sr.setCuttingBundleQrCode(fields.cuttingBundleQr);
    }

    private String insertNewScanRecord(ScanRecordFieldBundle fields, String requestId,
            ProductionOrder order, String processCode, String progressStage, String processName, String scanType,
            String successRemark, int qualifiedQty, LocalDateTime t) {
        ScanRecord sr = new ScanRecord();
        String scanRecordId = UUID.randomUUID().toString();
        sr.setId(scanRecordId);
        sr.setScanCode(fields.scanCode);
        sr.setRequestId(requestId);
        sr.setTenantId(order.getTenantId());
        populateScanRecordFields(sr, order, fields, processCode, progressStage,
                processName, scanType, successRemark, qualifiedQty);
        sr.setCreateTime(t);
        sr.setUpdateTime(t);
        scanRecordMapper.insert(sr);
        return scanRecordId;
    }

    private void patchExistingScanRecord(ScanRecord existing, ScanRecordFieldBundle fields,
            ProductionOrder order, String processCode, String progressStage, String processName, String scanType,
            String successRemark, int qualifiedQty, LocalDateTime t) {
        ScanRecord patch = new ScanRecord();
        patch.setId(existing.getId());
        patch.setScanCode(fields.scanCode);
        populateScanRecordFields(patch, order, fields, processCode, progressStage,
                processName, scanType, successRemark, qualifiedQty);
        patch.setUpdateTime(t);
        scanRecordMapper.updateById(patch);
    }

    private void syncProcessTrackingAfterWarehousing(String cuttingBundleId, String progressStage,
            String operatorId, String operatorName, String scanRecordId) {
        if (!StringUtils.hasText(cuttingBundleId)) return;
        try {
            boolean updated = processTrackingOrchestrator.updateScanRecord(
                    cuttingBundleId, progressStage, operatorId, operatorName, scanRecordId);
            if (updated) {
                log.info("PC入库工序跟踪更新成功: bundleId={}, stage={}", cuttingBundleId, progressStage);
            } else {
                log.warn("PC入库工序跟踪未找到记录（不阻断入库）: bundleId={}, stage={}", cuttingBundleId, progressStage);
            }
        } catch (Exception e) {
            log.warn("PC入库工序跟踪更新失败（不阻断入库）: bundleId={}, stage={}, msg={}",
                    cuttingBundleId, progressStage, e.getMessage());
        }
    }
}
