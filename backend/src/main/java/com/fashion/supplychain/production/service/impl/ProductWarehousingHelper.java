package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.ProductWarehousingMapper;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.style.service.ProductSkuService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

/**
 * ProductWarehousingServiceImpl 的辅助类，包含常量定义、验证逻辑、
 * 聚合查询和扫码记录维护等非核心方法。
 */
@Component
@Slf4j
public class ProductWarehousingHelper {

    // ──────────── 常量 ────────────

    static final BigDecimal WAREHOUSING_BATCH_MIN_RATIO = new BigDecimal("0.05");
    static final BigDecimal WAREHOUSING_BATCH_MAX_RATIO = new BigDecimal("0.50");

    static final String STATUS_QUALIFIED = "qualified";
    static final String STATUS_UNQUALIFIED = "unqualified";
    static final String STATUS_REPAIRED = "repaired";
    static final String STATUS_COMPLETED = "completed";

    static final String SCAN_RESULT_SUCCESS = "success";
    static final String SCAN_RESULT_FAILURE = "failure";
    static final String SCAN_TYPE_QUALITY = "quality";
    static final String SCAN_TYPE_WAREHOUSE = "warehouse";
    static final String WAREHOUSING_TYPE_MANUAL = "manual";
    static final String WAREHOUSING_TYPE_SCAN = "scan";

    static final Set<String> REPAIRED_STATUS_SET = new HashSet<>(Arrays.asList(
            "repaired", "返修完成", "已返修", "返修合格", "已修复"));

    static final Set<String> UNQUALIFIED_STATUS_SET = new HashSet<>(Arrays.asList(
            "unqualified", "不合格", "次品", "次品待返修", "待返修"));

    // ──────────── 依赖注入 ────────────

    @Autowired
    private ProductWarehousingMapper productWarehousingMapper;

    @Autowired
    private ScanRecordMapper scanRecordMapper;

    @Autowired
    private CuttingBundleService cuttingBundleService;

    @Autowired
    private ProductSkuService productSkuService;

    // ──────────── 工具方法 ────────────

    String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String s = value.trim();
        return StringUtils.hasText(s) ? s : null;
    }

    boolean isBundleBlockedForWarehousing(String rawStatus) {
        String status = rawStatus == null ? "" : rawStatus.trim();
        if (!StringUtils.hasText(status)) {
            return false;
        }
        String s = status.toLowerCase();
        boolean isRepaired = REPAIRED_STATUS_SET.contains(s) || REPAIRED_STATUS_SET.contains(status);
        if (isRepaired) {
            return false;
        }
        return UNQUALIFIED_STATUS_SET.contains(s) || UNQUALIFIED_STATUS_SET.contains(status);
    }

    String buildWarehousingNo(LocalDateTime now) {
        String ts = now.format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss"));
        int rand = (int) (ThreadLocalRandom.current().nextDouble() * 900) + 100;
        return "WH" + ts + rand;
    }

    // ──────────── 聚合查询 ────────────

    int remainingRepairQuantityByBundle(String orderId, String cuttingBundleId, String excludeWarehousingId) {
        String oid = StringUtils.hasText(orderId) ? orderId.trim() : null;
        String bid = StringUtils.hasText(cuttingBundleId) ? cuttingBundleId.trim() : null;
        String exId = StringUtils.hasText(excludeWarehousingId) ? excludeWarehousingId.trim() : null;
        if (!StringUtils.hasText(oid) || !StringUtils.hasText(bid)) {
            return 0;
        }
        List<ProductWarehousing> list;
        try {
            LambdaQueryWrapper<ProductWarehousing> qw = new LambdaQueryWrapper<ProductWarehousing>()
                    .select(ProductWarehousing::getId, ProductWarehousing::getUnqualifiedQuantity,
                            ProductWarehousing::getQualifiedQuantity, ProductWarehousing::getRepairRemark,
                            ProductWarehousing::getQualityStatus)
                    .eq(ProductWarehousing::getDeleteFlag, 0)
                    .eq(ProductWarehousing::getOrderId, oid)
                    .eq(ProductWarehousing::getCuttingBundleId, bid);
            if (StringUtils.hasText(exId)) {
                qw.ne(ProductWarehousing::getId, exId);
            }
            list = productWarehousingMapper.selectList(qw);
        } catch (Exception e) {
            return 0;
        }

        long repairPool = 0;
        long repairedOut = 0;
        if (list != null) {
            for (ProductWarehousing w : list) {
                if (w == null) {
                    continue;
                }
                int uq = w.getUnqualifiedQuantity() == null ? 0 : w.getUnqualifiedQuantity();
                if (uq > 0) {
                    repairPool += uq;
                }

                String rr = trimToNull(w.getRepairRemark());
                if (rr != null) {
                    int q = w.getQualifiedQuantity() == null ? 0 : w.getQualifiedQuantity();
                    if (q > 0) {
                        repairedOut += q;
                    }
                }
            }
        }
        long remaining = repairPool - repairedOut;
        if (remaining <= 0) {
            return 0;
        }
        return (int) Math.min(Integer.MAX_VALUE, remaining);
    }

    void ensureRepairQuantityNotExceeded(String orderId, String cuttingBundleId, int requestWarehousingQty,
            String excludeWarehousingId) {
        int req = Math.max(0, requestWarehousingQty);
        if (req <= 0) {
            throw new IllegalArgumentException("入库数量必须大于0");
        }
        int remaining = remainingRepairQuantityByBundle(orderId, cuttingBundleId, excludeWarehousingId);
        if (remaining <= 0) {
            throw new IllegalStateException("该菲号无可返修入库数量");
        }
        if (req > remaining) {
            throw new IllegalStateException("该菲号可返修入库数量为" + remaining + "，不能超过返修数量");
        }
    }

    int sumCuttingQuantityByOrderId(String orderId) {
        String oid = StringUtils.hasText(orderId) ? orderId.trim() : null;
        if (!StringUtils.hasText(oid)) {
            return 0;
        }

        List<CuttingBundle> bundles;
        try {
            bundles = cuttingBundleService.list(new LambdaQueryWrapper<CuttingBundle>()
                    .select(CuttingBundle::getQuantity)
                    .eq(CuttingBundle::getProductionOrderId, oid));
        } catch (Exception e) {
            return 0;
        }

        long sum = 0;
        if (bundles != null) {
            for (CuttingBundle b : bundles) {
                if (b == null) {
                    continue;
                }
                int q = b.getQuantity() == null ? 0 : b.getQuantity();
                if (q > 0) {
                    sum += q;
                }
            }
        }
        return (int) Math.min(Integer.MAX_VALUE, Math.max(0, sum));
    }

    int sumWarehousingQuantityByOrderId(String orderId) {
        String oid = StringUtils.hasText(orderId) ? orderId.trim() : null;
        if (!StringUtils.hasText(oid)) {
            return 0;
        }
        try {
            List<ProductWarehousing> list = productWarehousingMapper.selectList(
                    new LambdaQueryWrapper<ProductWarehousing>()
                            .select(ProductWarehousing::getWarehousingQuantity)
                            .eq(ProductWarehousing::getOrderId, oid)
                            .eq(ProductWarehousing::getDeleteFlag, 0));
            long sum = 0;
            if (list != null) {
                for (ProductWarehousing w : list) {
                    if (w == null) {
                        continue;
                    }
                    int q = w.getWarehousingQuantity() == null ? 0 : w.getWarehousingQuantity();
                    if (q > 0) {
                        sum += q;
                    }
                }
            }
            return (int) Math.min(Integer.MAX_VALUE, Math.max(0, sum));
        } catch (Exception e) {
            return 0;
        }
    }

    int sumWarehousingQuantityByOrderIdExcludeId(String orderId, String excludeId) {
        String oid = StringUtils.hasText(orderId) ? orderId.trim() : null;
        String ex = StringUtils.hasText(excludeId) ? excludeId.trim() : null;
        if (!StringUtils.hasText(oid)) {
            return 0;
        }
        try {
            LambdaQueryWrapper<ProductWarehousing> w = new LambdaQueryWrapper<ProductWarehousing>()
                    .select(ProductWarehousing::getWarehousingQuantity)
                    .eq(ProductWarehousing::getOrderId, oid)
                    .eq(ProductWarehousing::getDeleteFlag, 0);
            if (StringUtils.hasText(ex)) {
                w.ne(ProductWarehousing::getId, ex);
            }
            List<ProductWarehousing> list = productWarehousingMapper.selectList(w);
            long sum = 0;
            if (list != null) {
                for (ProductWarehousing pw : list) {
                    if (pw == null) {
                        continue;
                    }
                    int q = pw.getWarehousingQuantity() == null ? 0 : pw.getWarehousingQuantity();
                    if (q > 0) {
                        sum += q;
                    }
                }
            }
            return (int) Math.min(Integer.MAX_VALUE, Math.max(0, sum));
        } catch (Exception e) {
            return 0;
        }
    }

    int sumQualifiedByOrderId(String orderId) {
        String oid = StringUtils.hasText(orderId) ? orderId.trim() : null;
        if (!StringUtils.hasText(oid)) {
            return 0;
        }

        try {
            List<ProductWarehousing> list = productWarehousingMapper.selectList(
                    new LambdaQueryWrapper<ProductWarehousing>()
                            .eq(ProductWarehousing::getOrderId, oid)
                            .eq(ProductWarehousing::getDeleteFlag, 0));
            long sum = 0;
            if (list != null) {
                for (ProductWarehousing w : list) {
                    if (w == null) {
                        continue;
                    }
                    int q = w.getQualifiedQuantity() == null ? 0 : w.getQualifiedQuantity();
                    if (q > 0) {
                        sum += q;
                    }
                }
            }
            return (int) Math.min(Integer.MAX_VALUE, Math.max(0, sum));
        } catch (Exception e) {
            return 0;
        }
    }

    String warehousingQuantityRuleViolationMessage(String orderId, Integer requestWarehousingQuantity,
            String excludeWarehousingId) {
        String oid = StringUtils.hasText(orderId) ? orderId.trim() : null;
        int q = requestWarehousingQuantity == null ? 0 : requestWarehousingQuantity;
        if (!StringUtils.hasText(oid)) {
            return "订单ID不能为空";
        }
        int cuttingQty = sumCuttingQuantityByOrderId(oid);

        int existed = StringUtils.hasText(excludeWarehousingId)
                ? sumWarehousingQuantityByOrderIdExcludeId(oid, excludeWarehousingId)
                : sumWarehousingQuantityByOrderId(oid);
        return warehousingQuantityRuleViolationMessageStatic(cuttingQty, existed, q);
    }

    static String warehousingQuantityRuleViolationMessageStatic(int cuttingQty, int existedWarehousingQty,
            int requestQty) {
        int q = requestQty;
        if (q <= 0) {
            return "入库数量必须大于0";
        }
        int cutting = Math.max(0, cuttingQty);
        if (cutting <= 0) {
            return "未找到裁剪数量，暂不能入库";
        }

        int existed = Math.max(0, existedWarehousingQty);
        int remaining = Math.max(0, cutting - existed);
        if (remaining <= 0) {
            return "已全部入库，禁止继续入库";
        }
        if (existed + q > cutting) {
            return "入库数量超出裁剪数量上限（本次" + q + "/已入库" + existed + "/裁剪" + cutting + "）";
        }
        if (q == remaining) {
            return null;
        }

        int min = BigDecimal.valueOf(cutting)
                .multiply(WAREHOUSING_BATCH_MIN_RATIO)
                .setScale(0, RoundingMode.CEILING)
                .intValue();
        int max = BigDecimal.valueOf(cutting)
                .multiply(WAREHOUSING_BATCH_MAX_RATIO)
                .setScale(0, RoundingMode.FLOOR)
                .intValue();
        if (max <= 0) {
            max = 1;
        }
        if (min <= 0) {
            min = 1;
        }
        if (min > max) {
            min = max;
        }
        if (q < min || q > max) {
            return "入库数量不符合规则（本次" + q + "/剩余" + remaining + "/裁剪" + cutting
                    + "）。每次入库数量需在裁剪数量的5%~50%之间（末次可小于5%）";
        }
        return null;
    }

    // ──────────── 验证逻辑 ────────────

    void ensureBundleNotAlreadyQualifiedWarehoused(String orderId, String cuttingBundleId, String excludeId) {
        String oid = StringUtils.hasText(orderId) ? orderId.trim() : null;
        String bid = StringUtils.hasText(cuttingBundleId) ? cuttingBundleId.trim() : null;
        if (!StringUtils.hasText(oid) || !StringUtils.hasText(bid)) {
            return;
        }

        LambdaQueryWrapper<ProductWarehousing> wrapper = new LambdaQueryWrapper<ProductWarehousing>()
                .eq(ProductWarehousing::getOrderId, oid)
                .eq(ProductWarehousing::getCuttingBundleId, bid)
                .eq(ProductWarehousing::getDeleteFlag, 0);
        if (StringUtils.hasText(excludeId)) {
            wrapper.ne(ProductWarehousing::getId, excludeId.trim());
        }

        List<ProductWarehousing> list;
        try {
            list = productWarehousingMapper.selectList(wrapper);
        } catch (Exception e) {
            log.warn(
                    "Failed to query warehousing list for qualified check: orderId={}, cuttingBundleId={}, excludeId={}",
                    oid, bid, excludeId, e);
            return;
        }

        if (list == null || list.isEmpty()) {
            return;
        }

        for (ProductWarehousing w : list) {
            if (w == null) {
                continue;
            }
            int q = w.getQualifiedQuantity() == null ? 0 : w.getQualifiedQuantity();
            if (q <= 0) {
                continue;
            }
            String qs = w.getQualityStatus() == null ? "" : w.getQualityStatus().trim();
            if (!StringUtils.hasText(qs) || STATUS_QUALIFIED.equalsIgnoreCase(qs)) {
                throw new IllegalStateException("该菲号已合格入库，不能重复入库");
            }
        }
    }

    String findExistingWarehousingNoByOrderId(String orderId) {
        String oid = StringUtils.hasText(orderId) ? orderId.trim() : null;
        if (!StringUtils.hasText(oid)) {
            return null;
        }
        try {
            ProductWarehousing one = productWarehousingMapper.selectOne(
                    new LambdaQueryWrapper<ProductWarehousing>()
                            .select(ProductWarehousing::getWarehousingNo)
                            .eq(ProductWarehousing::getOrderId, oid)
                            .eq(ProductWarehousing::getDeleteFlag, 0)
                            .isNotNull(ProductWarehousing::getWarehousingNo)
                            .orderByDesc(ProductWarehousing::getCreateTime)
                            .last("LIMIT 1"));
            if (one == null) {
                return null;
            }
            String no = one.getWarehousingNo() == null ? null : one.getWarehousingNo().trim();
            return StringUtils.hasText(no) ? no : null;
        } catch (Exception e) {
            log.warn("Failed to query latest warehousing no by orderId: orderId={}", oid, e);
            return null;
        }
    }

    // ──────────── 菲号/扫码记录维护 ────────────

    void invalidateBundleFlowAfterReturnToSewing(String cuttingBundleId, LocalDateTime now) {
        String bid = StringUtils.hasText(cuttingBundleId) ? cuttingBundleId.trim() : null;
        if (!StringUtils.hasText(bid)) {
            return;
        }
        try {
            scanRecordMapper.update(null, new LambdaUpdateWrapper<ScanRecord>()
                    .eq(ScanRecord::getCuttingBundleId, bid)
                    .eq(ScanRecord::getScanType, "production")
                    .eq(ScanRecord::getScanResult, SCAN_RESULT_SUCCESS)
                    .in(ScanRecord::getProcessName, Arrays.asList("整烫", "二次工艺", "包装"))
                    .set(ScanRecord::getScanResult, SCAN_RESULT_FAILURE)
                    .set(ScanRecord::getRemark, "次品退回缝制，后续环节作废")
                    .set(ScanRecord::getUpdateTime, now));
        } catch (Exception e) {
            log.warn("Failed to invalidate bundle flow after return to sewing: cuttingBundleId={}", bid, e);
        }
    }

    void updateBundleStatusAfterWarehousing(CuttingBundle bundle, String computedQualityStatus,
            String repairRemark, LocalDateTime now) {
        if (bundle == null || !StringUtils.hasText(bundle.getId()))
            return;

        boolean blocked = isBundleBlockedForWarehousing(bundle.getStatus());
        String nextBundleStatus;
        if (STATUS_UNQUALIFIED.equalsIgnoreCase(computedQualityStatus)) {
            nextBundleStatus = STATUS_UNQUALIFIED;
        } else if (STATUS_QUALIFIED.equalsIgnoreCase(computedQualityStatus) && blocked
                && StringUtils.hasText(repairRemark)) {
            nextBundleStatus = STATUS_REPAIRED;
        } else {
            nextBundleStatus = STATUS_QUALIFIED;
        }

        if (STATUS_UNQUALIFIED.equalsIgnoreCase(nextBundleStatus)) {
            invalidateBundleFlowAfterReturnToSewing(bundle.getId(), now);
        }

        try {
            cuttingBundleService.lambdaUpdate()
                    .eq(CuttingBundle::getId, bundle.getId())
                    .set(CuttingBundle::getStatus, nextBundleStatus)
                    .set(CuttingBundle::getUpdateTime, now)
                    .update();
        } catch (Exception e) {
            log.warn("Failed to update cutting bundle status: bundleId={}, status={}", bundle.getId(), nextBundleStatus,
                    e);
        }
    }

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
        } else if (order != null) {
            color = order.getColor();
            size = order.getSize();
        }

        if (StringUtils.hasText(styleNo) && StringUtils.hasText(color) && StringUtils.hasText(size)) {
            String skuCode = String.format("%s-%s-%s", styleNo.trim(), color.trim(), size.trim());
            productSkuService.updateStock(skuCode, deltaQuantity);
        }
    }

    void upsertWarehousingStageScanRecord(ProductWarehousing warehousing, ProductionOrder order,
            CuttingBundle bundle, LocalDateTime now) {
        upsertScanRecord(warehousing, order, bundle, now, "WAREHOUSING:", "quality_warehousing",
                "质检", "质检", SCAN_TYPE_QUALITY, "质检完成", "次品退回，质检记录作废");
    }

    void upsertWarehouseScanRecord(ProductWarehousing warehousing, ProductionOrder order,
            CuttingBundle bundle, LocalDateTime now) {
        String wt = warehousing.getWarehousingType() == null ? "" : warehousing.getWarehousingType().trim();
        if (WAREHOUSING_TYPE_SCAN.equalsIgnoreCase(wt)) {
            return;
        }
        String warehouse = trimToNull(warehousing.getWarehouse());
        if (!StringUtils.hasText(warehouse)) {
            return;
        }
        upsertScanRecord(warehousing, order, bundle, now, "WAREHOUSE:", "warehouse_manual",
                "入库", "入库", SCAN_TYPE_WAREHOUSE, "入库完成", "次品退回，入库记录作废");
    }

    void upsertScanRecord(ProductWarehousing warehousing, ProductionOrder order, CuttingBundle bundle,
            LocalDateTime now, String requestIdPrefix, String processCode, String progressStage,
            String processName, String scanType, String successRemark, String failureRemark) {

        if (warehousing == null || order == null || !StringUtils.hasText(warehousing.getId())
                || !StringUtils.hasText(order.getId())) {
            return;
        }

        String qs = warehousing.getQualityStatus() == null ? "" : warehousing.getQualityStatus().trim();
        boolean qualified = !StringUtils.hasText(qs) || STATUS_QUALIFIED.equalsIgnoreCase(qs);
        String requestId = requestIdPrefix + warehousing.getId().trim();

        ScanRecord existing = null;
        try {
            existing = scanRecordMapper.selectOne(new LambdaQueryWrapper<ScanRecord>()
                    .eq(ScanRecord::getRequestId, requestId)
                    .last("limit 1"));
        } catch (Exception e) {
            log.warn("Failed to query existing scan record: requestId={}", requestId, e);
        }

        int qualifiedQty = warehousing.getQualifiedQuantity() == null ? 0 : warehousing.getQualifiedQuantity();
        LocalDateTime t = now == null ? LocalDateTime.now() : now;

        UserContext ctx = UserContext.get();
        String operatorId = ctx == null ? null : ctx.getUserId();
        String operatorName = ctx == null ? null : ctx.getUsername();

        String cuttingBundleId = trimToNull(warehousing.getCuttingBundleId());
        Integer cuttingBundleNo = warehousing.getCuttingBundleNo();
        String cuttingBundleQr = trimToNull(warehousing.getCuttingBundleQrCode());
        String scanCode = cuttingBundleQr;

        String color = bundle == null ? null : trimToNull(bundle.getColor());
        String size = bundle == null ? null : trimToNull(bundle.getSize());
        if (color == null) {
            color = trimToNull(order.getColor());
        }
        if (size == null) {
            size = trimToNull(order.getSize());
        }

        if (!qualified) {
            if (existing != null && StringUtils.hasText(existing.getId())) {
                ScanRecord patch = new ScanRecord();
                patch.setId(existing.getId());
                patch.setScanResult(SCAN_RESULT_FAILURE);
                patch.setRemark(failureRemark);
                patch.setUpdateTime(t);
                scanRecordMapper.updateById(patch);
            }
            return;
        }

        if (existing == null) {
            ScanRecord sr = new ScanRecord();
            sr.setId(UUID.randomUUID().toString());
            sr.setScanCode(scanCode);
            sr.setRequestId(requestId);
            sr.setOrderId(order.getId());
            sr.setOrderNo(order.getOrderNo());
            sr.setStyleId(order.getStyleId());
            sr.setStyleNo(order.getStyleNo());
            sr.setColor(color);
            sr.setSize(size);
            sr.setQuantity(Math.max(0, qualifiedQty));
            sr.setProcessCode(processCode);
            sr.setProgressStage(progressStage);
            sr.setProcessName(processName);
            sr.setOperatorId(trimToNull(operatorId));
            sr.setOperatorName(trimToNull(operatorName));
            sr.setScanTime(t);
            sr.setScanType(scanType);
            sr.setScanResult(SCAN_RESULT_SUCCESS);
            sr.setRemark(successRemark);
            sr.setCuttingBundleId(cuttingBundleId);
            sr.setCuttingBundleNo(cuttingBundleNo);
            sr.setCuttingBundleQrCode(cuttingBundleQr);
            sr.setCreateTime(t);
            sr.setUpdateTime(t);
            scanRecordMapper.insert(sr);
        } else {
            ScanRecord patch = new ScanRecord();
            patch.setId(existing.getId());
            patch.setScanCode(scanCode);
            patch.setOrderId(order.getId());
            patch.setOrderNo(order.getOrderNo());
            patch.setStyleId(order.getStyleId());
            patch.setStyleNo(order.getStyleNo());
            patch.setColor(color);
            patch.setSize(size);
            patch.setQuantity(Math.max(0, qualifiedQty));
            patch.setProcessCode(processCode);
            patch.setProgressStage(progressStage);
            patch.setProcessName(processName);
            patch.setOperatorId(trimToNull(operatorId));
            patch.setOperatorName(trimToNull(operatorName));
            patch.setScanTime(t);
            patch.setScanType(scanType);
            patch.setScanResult(SCAN_RESULT_SUCCESS);
            patch.setRemark(successRemark);
            patch.setCuttingBundleId(cuttingBundleId);
            patch.setCuttingBundleNo(cuttingBundleNo);
            patch.setCuttingBundleQrCode(cuttingBundleQr);
            patch.setUpdateTime(t);
            scanRecordMapper.updateById(patch);
        }
    }
}
