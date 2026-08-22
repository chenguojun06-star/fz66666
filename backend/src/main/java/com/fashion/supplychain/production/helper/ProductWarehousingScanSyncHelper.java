package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.orchestration.ProductionProcessTrackingOrchestrator;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.production.service.SKUService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 质检入库 → 入库扫码记录同步 Helper
 *
 * 背景（2026-08-22 用户反馈）：质检入库模块（成品仓→质检入库）保存入库后只写
 * t_product_warehousing，不写 t_scan_record，导致订单数据链路两处断裂：
 * 1. 订单时间轴"入库"节点：视图 v_production_order_flow_stage_snapshot 按
 *    t_scan_record(scan_type='warehouse') 聚合时间，无记录则永远显示 -- ~ --
 * 2. 工序跟踪（工资结算）"入库"行：按扫码记录判断状态，无记录则永远"待扫码"
 *
 * 本 Helper 在质检入库成功后补写 warehouse 扫码记录并更新工序跟踪行，
 * 与生产端扫码入库（WarehouseScanExecutor）的数据链路对齐。
 * 同步失败只记日志，不阻断入库主流程（入库成功优先于时间轴展示）。
 */
@Component
@Slf4j
public class ProductWarehousingScanSyncHelper {

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private CuttingBundleService cuttingBundleService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ProductionProcessTrackingOrchestrator processTrackingOrchestrator;

    @Autowired
    private ProductWarehousingService warehousingService;

    @Autowired(required = false)
    private SKUService skuService;

    /**
     * 同步入库扫码记录 + 工序跟踪"入库"行（事务内调用，异常不外抛）
     *
     * @param w 已成功保存的质检入库记录（需含 orderId；cuttingBundleId 缺失时按 QR 码解析）
     */
    public void syncWarehouseScan(ProductWarehousing w) {
        if (w == null || !StringUtils.hasText(w.getOrderId())) {
            return;
        }
        Integer qualifiedQty = w.getQualifiedQuantity();
        if (qualifiedQty == null || qualifiedQty <= 0) {
            // 纯次品质检（合格数=0）不入库，不写成功扫码记录
            return;
        }
        try {
            doSync(w, qualifiedQty);
        } catch (Exception e) {
            log.warn("[质检入库同步] 入库扫码记录同步失败（不阻断入库主流程）: warehousingId={}, orderId={}, err={}",
                    w.getId(), w.getOrderId(), e.getMessage(), e);
        }
    }

    private void doSync(ProductWarehousing w, int qualifiedQty) {
        String orderId = w.getOrderId().trim();
        ProductionOrder order = productionOrderService.getById(orderId);
        if (order == null || !StringUtils.hasText(order.getId())) {
            log.warn("[质检入库同步] 订单不存在，跳过: orderId={}", orderId);
            return;
        }

        CuttingBundle bundle = resolveBundle(w);
        if (bundle == null || !StringUtils.hasText(bundle.getId())) {
            log.warn("[质检入库同步] 未匹配到菲号，跳过: orderId={}, qrCode={}",
                    orderId, w.getCuttingBundleQrCode());
            return;
        }

        // 幂等保护：该菲号已有成功入库扫码记录则跳过（防重复写入）
        long existCount = scanRecordService.count(new LambdaQueryWrapper<ScanRecord>()
                .eq(ScanRecord::getOrderId, orderId)
                .eq(ScanRecord::getCuttingBundleId, bundle.getId())
                .eq(ScanRecord::getScanType, "warehouse")
                .eq(ScanRecord::getScanResult, "success"));
        if (existCount > 0) {
            log.info("[质检入库同步] 菲号已有入库扫码记录，跳过: orderNo={}, bundleNo={}",
                    order.getOrderNo(), bundle.getBundleNo());
            return;
        }

        ScanRecord sr = buildWarehouseScanRecord(w, order, bundle, qualifiedQty);
        try {
            scanRecordService.saveScanRecord(sr);
        } catch (DuplicateKeyException dke) {
            log.info("[质检入库同步] 扫码记录已存在（requestId 冲突），跳过: requestId={}",
                    sr.getRequestId());
            return;
        }

        // 更新工序跟踪"入库"行（未命中时追加初始化后重试，与 WarehouseScanExecutor 行为一致）
        updateProcessTracking(order, bundle, sr);
        log.info("[质检入库同步] 入库扫码记录+工序跟踪同步成功: orderNo={}, bundleNo={}, qty={}",
                order.getOrderNo(), bundle.getBundleNo(), qualifiedQty);
    }

    private CuttingBundle resolveBundle(ProductWarehousing w) {
        if (StringUtils.hasText(w.getCuttingBundleId())) {
            CuttingBundle b = cuttingBundleService.getById(w.getCuttingBundleId().trim());
            if (b != null) {
                return b;
            }
        }
        String qrCode = w.getCuttingBundleQrCode();
        if (StringUtils.hasText(qrCode)) {
            return cuttingBundleService.getByQrCode(qrCode.trim());
        }
        return null;
    }

    private void updateProcessTracking(ProductionOrder order, CuttingBundle bundle, ScanRecord sr) {
        boolean updated = processTrackingOrchestrator.updateScanRecord(
                bundle.getId(), "入库", sr.getOperatorId(), sr.getOperatorName(), sr.getId());
        if (updated) {
            return;
        }
        log.warn("[质检入库同步] 工序跟踪行未命中，追加初始化后重试: orderNo={}, bundleNo={}",
                order.getOrderNo(), bundle.getBundleNo());
        processTrackingOrchestrator.appendProcessTracking(order.getId(), List.of(bundle));
        boolean retryUpdated = processTrackingOrchestrator.updateScanRecord(
                bundle.getId(), "入库", sr.getOperatorId(), sr.getOperatorName(), sr.getId());
        if (!retryUpdated) {
            log.warn("[质检入库同步] 工序跟踪重试仍失败: orderNo={}, bundleNo={}",
                    order.getOrderNo(), bundle.getBundleNo());
        }
    }

    /**
     * 构造入库扫码记录（字段与 WarehouseScanExecutor.buildWarehouseRecord 对齐，
     * scanMode=manual 标识质检入库而非扫码枪操作）
     */
    private ScanRecord buildWarehouseScanRecord(ProductWarehousing w, ProductionOrder order,
                                                CuttingBundle bundle, int qualifiedQty) {
        ScanRecord sr = new ScanRecord();
        sr.setRequestId("QCWH-" + UUID.randomUUID().toString().replace("-", ""));
        sr.setScanCode(StringUtils.hasText(w.getCuttingBundleQrCode())
                ? w.getCuttingBundleQrCode() : String.valueOf(bundle.getBundleNo()));
        sr.setOrderId(order.getId());
        sr.setOrderNo(order.getOrderNo());
        sr.setStyleId(order.getStyleId());
        sr.setStyleNo(order.getStyleNo());
        sr.setTenantId(order.getTenantId());
        sr.setColor(bundle.getColor());
        sr.setSize(bundle.getSize());
        sr.setQuantity(qualifiedQty);
        sr.setProcessCode("warehouse");
        sr.setProgressStage("入库");
        sr.setProcessName("入库");
        sr.setOperatorId(StringUtils.hasText(w.getWarehousingOperatorId())
                ? w.getWarehousingOperatorId() : UserContext.userId());
        sr.setOperatorName(StringUtils.hasText(w.getWarehousingOperatorName())
                ? w.getWarehousingOperatorName() : UserContext.username());
        // 回填场景用原入库时间（时间轴显示真实入库时间），新入库用当前时间
        LocalDateTime now = w.getCreateTime() != null ? w.getCreateTime() : LocalDateTime.now();
        sr.setScanTime(now);
        sr.setScanType("warehouse");
        sr.setScanResult("success");
        sr.setRemark("质检入库" + (StringUtils.hasText(w.getWarehouse()) ? ": " + w.getWarehouse() : ""));
        sr.setCuttingBundleId(bundle.getId());
        sr.setCuttingBundleNo(bundle.getBundleNo());
        sr.setCuttingBundleQrCode(bundle.getQrCode());
        sr.setFactoryId(StringUtils.hasText(UserContext.factoryId())
                ? UserContext.factoryId() : order.getFactoryId());
        sr.setScanMode("manual");
        sr.setReceiveTime(now);

        if (skuService != null) {
            skuService.attachProcessUnitPrice(sr);
        }
        return sr;
    }

    /**
     * 查询订单历史质检入库的回填候选（按菲号聚合，只取合格数>0的有效记录）
     * 供 Orchestrator.backfillScanRecords 编排调用，配合 {@link #syncWarehouseScan} 幂等回填
     */
    public List<ProductWarehousing> listBackfillCandidates(String orderId) {
        List<ProductWarehousing> records = scanRecordServiceOfWarehousing(orderId);
        if (records.isEmpty()) {
            return records;
        }
        // 按菲号聚合：合计合格数、最近一条的操作人/时间/仓库
        Map<String, ProductWarehousing> merged = new LinkedHashMap<>();
        for (ProductWarehousing w : records) {
            String key = w.getCuttingBundleId();
            ProductWarehousing agg = merged.get(key);
            if (agg == null) {
                ProductWarehousing c = new ProductWarehousing();
                c.setOrderId(w.getOrderId());
                c.setCuttingBundleId(w.getCuttingBundleId());
                c.setCuttingBundleQrCode(w.getCuttingBundleQrCode());
                c.setQualifiedQuantity(w.getQualifiedQuantity() == null ? 0 : w.getQualifiedQuantity());
                c.setWarehouse(w.getWarehouse());
                c.setWarehousingOperatorId(w.getWarehousingOperatorId());
                c.setWarehousingOperatorName(w.getWarehousingOperatorName());
                c.setCreateTime(w.getCreateTime());
                merged.put(key, c);
            } else {
                agg.setQualifiedQuantity(agg.getQualifiedQuantity()
                        + (w.getQualifiedQuantity() == null ? 0 : w.getQualifiedQuantity()));
                if (w.getCreateTime() != null
                        && (agg.getCreateTime() == null || w.getCreateTime().isAfter(agg.getCreateTime()))) {
                    agg.setCreateTime(w.getCreateTime());
                    agg.setWarehousingOperatorId(w.getWarehousingOperatorId());
                    agg.setWarehousingOperatorName(w.getWarehousingOperatorName());
                    agg.setWarehouse(w.getWarehouse());
                }
            }
        }
        return new ArrayList<>(merged.values());
    }

    private List<ProductWarehousing> scanRecordServiceOfWarehousing(String orderId) {
        return warehousingService.list(new LambdaQueryWrapper<ProductWarehousing>()
                .eq(ProductWarehousing::getOrderId, orderId)
                .eq(ProductWarehousing::getDeleteFlag, 0)
                .gt(ProductWarehousing::getQualifiedQuantity, 0)
                .isNotNull(ProductWarehousing::getCuttingBundleId)
                .orderByAsc(ProductWarehousing::getCreateTime));
    }
}
