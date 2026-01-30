package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.ProductWarehousingMapper;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.service.ProductSkuService;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.CuttingBundle;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.Arrays;
import java.util.HashSet;
import org.springframework.util.StringUtils;
import org.springframework.transaction.annotation.Transactional;
import java.util.concurrent.ThreadLocalRandom;
import lombok.extern.slf4j.Slf4j;

import java.util.List;
import java.util.UUID;

@Service
@Slf4j
public class ProductWarehousingServiceImpl extends ServiceImpl<ProductWarehousingMapper, ProductWarehousing>
        implements ProductWarehousingService {

    private static final BigDecimal WAREHOUSING_BATCH_MIN_RATIO = new BigDecimal("0.05");
    private static final BigDecimal WAREHOUSING_BATCH_MAX_RATIO = new BigDecimal("0.15");

    private static final String STATUS_QUALIFIED = "qualified";
    private static final String STATUS_UNQUALIFIED = "unqualified";
    private static final String STATUS_REPAIRED = "repaired";
    private static final String STATUS_COMPLETED = "completed";

    private static final String SCAN_RESULT_SUCCESS = "success";
    private static final String SCAN_RESULT_FAILURE = "failure";
    private static final String SCAN_TYPE_QUALITY = "quality";
    private static final String SCAN_TYPE_WAREHOUSE = "warehouse";
    private static final String WAREHOUSING_TYPE_MANUAL = "manual";
    private static final String WAREHOUSING_TYPE_SCAN = "scan";

    private static final Set<String> REPAIRED_STATUS_SET = new HashSet<>(Arrays.asList(
            "repaired", "返修完成", "已返修", "返修合格", "已修复"));

    private static final Set<String> UNQUALIFIED_STATUS_SET = new HashSet<>(Arrays.asList(
            "unqualified", "不合格", "次品", "次品待返修", "待返修"));

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ProductSkuService productSkuService;

    @Autowired
    private CuttingBundleService cuttingBundleService;

    @Autowired
    private ScanRecordMapper scanRecordMapper;

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String s = value.trim();
        return StringUtils.hasText(s) ? s : null;
    }

    private boolean isBundleBlockedForWarehousing(String rawStatus) {
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

    private int remainingRepairQuantityByBundle(String orderId, String cuttingBundleId, String excludeWarehousingId) {
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
            list = this.list(qw);
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

    private void ensureRepairQuantityNotExceeded(String orderId, String cuttingBundleId, int requestWarehousingQty,
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

    private int sumCuttingQuantityByOrderId(String orderId) {
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

    private int sumWarehousingQuantityByOrderId(String orderId) {
        String oid = StringUtils.hasText(orderId) ? orderId.trim() : null;
        if (!StringUtils.hasText(oid)) {
            return 0;
        }
        try {
            List<ProductWarehousing> list = this.list(new LambdaQueryWrapper<ProductWarehousing>()
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

    private int sumWarehousingQuantityByOrderIdExcludeId(String orderId, String excludeId) {
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
            List<ProductWarehousing> list = this.list(w);
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

    @Override
    public String warehousingQuantityRuleViolationMessage(String orderId, Integer requestWarehousingQuantity,
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
        return warehousingQuantityRuleViolationMessage(cuttingQty, existed, q);
    }

    static String warehousingQuantityRuleViolationMessage(int cuttingQty, int existedWarehousingQty, int requestQty) {
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
                    + "）。每次入库数量需在裁剪数量的5%~15%之间（末次可小于5%）";
        }
        return null;
    }

    private void invalidateBundleFlowAfterReturnToSewing(String cuttingBundleId, LocalDateTime now) {
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

    private void ensureBundleNotAlreadyQualifiedWarehoused(String orderId, String cuttingBundleId, String excludeId) {
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
            list = this.list(wrapper);
        } catch (Exception e) {
            log.warn(
                    "Failed to query warehousing list for qualified check: orderId={}, cuttingBundleId={}, excludeId={}",
                    oid,
                    bid,
                    excludeId,
                    e);
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

    private String findExistingWarehousingNoByOrderId(String orderId) {
        String oid = StringUtils.hasText(orderId) ? orderId.trim() : null;
        if (!StringUtils.hasText(oid)) {
            return null;
        }
        try {
            ProductWarehousing one = this.getOne(new LambdaQueryWrapper<ProductWarehousing>()
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

    @Override
    public int sumQualifiedByOrderId(String orderId) {
        String oid = StringUtils.hasText(orderId) ? orderId.trim() : null;
        if (!StringUtils.hasText(oid)) {
            return 0;
        }

        try {
            List<ProductWarehousing> list = this.list(new LambdaQueryWrapper<ProductWarehousing>()
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

    @Override
    public IPage<ProductWarehousing> queryPage(Map<String, Object> params) {
        Map<String, Object> safeParams = params == null ? new java.util.HashMap<>() : params;
        Integer page = ParamUtils.getPage(safeParams);
        Integer pageSize = ParamUtils.getPageSize(safeParams);

        Page<ProductWarehousing> pageInfo = new Page<>(page, pageSize);

        String warehousingNo = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "warehousingNo"));
        String orderId = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "orderId"));
        String orderNo = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "orderNo"));
        String styleNo = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "styleNo"));
        String warehouse = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "warehouse"));
        String qualityStatus = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "qualityStatus"));
        String cuttingBundleId = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "cuttingBundleId"));
        String cuttingBundleQrCode = ParamUtils
                .toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "cuttingBundleQrCode"));

        LambdaQueryWrapper<ProductWarehousing> wrapper = new LambdaQueryWrapper<ProductWarehousing>()
                .eq(ProductWarehousing::getDeleteFlag, 0)
                .like(StringUtils.hasText(warehousingNo), ProductWarehousing::getWarehousingNo, warehousingNo)
                .eq(StringUtils.hasText(orderId), ProductWarehousing::getOrderId, orderId)
                .like(StringUtils.hasText(orderNo), ProductWarehousing::getOrderNo, orderNo)
                .like(StringUtils.hasText(styleNo), ProductWarehousing::getStyleNo, styleNo)
                .eq(StringUtils.hasText(warehouse), ProductWarehousing::getWarehouse, warehouse)
                .eq(StringUtils.hasText(qualityStatus), ProductWarehousing::getQualityStatus, qualityStatus)
                .eq(StringUtils.hasText(cuttingBundleId), ProductWarehousing::getCuttingBundleId, cuttingBundleId)
                .eq(StringUtils.hasText(cuttingBundleQrCode), ProductWarehousing::getCuttingBundleQrCode,
                        cuttingBundleQrCode)
                .orderByDesc(ProductWarehousing::getCreateTime);

        return baseMapper.selectPage(pageInfo, wrapper);
    }

    private void updateSkuStock(ProductWarehousing w, ProductionOrder order, CuttingBundle bundle, int deltaQuantity) {
        if (deltaQuantity == 0) {
            return;
        }
        try {
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
        } catch (Exception e) {
            log.warn("Failed to update SKU stock: warehousingId={}, delta={}, error={}", w.getId(), deltaQuantity,
                    e.getMessage());
        }
    }

    private boolean saveWarehousingAndUpdateOrderInternal(ProductWarehousing productWarehousing,
            boolean skipRangeCheck) {
        // 设置默认值
        LocalDateTime now = LocalDateTime.now();

        if (!StringUtils.hasText(productWarehousing.getOrderId())) {
            throw new IllegalArgumentException("订单ID不能为空");
        }

        ProductionOrder order = productionOrderService.getById(productWarehousing.getOrderId());
        if (order == null || order.getDeleteFlag() == null || order.getDeleteFlag() != 0) {
            throw new NoSuchElementException("订单不存在");
        }

        String st = order.getStatus() == null ? "" : order.getStatus().trim();
        if (STATUS_COMPLETED.equalsIgnoreCase(st)) {
            throw new IllegalStateException("订单已完成，已停止入库");
        }

        String existingWarehousingNo = findExistingWarehousingNoByOrderId(order.getId());
        if (StringUtils.hasText(existingWarehousingNo)) {
            productWarehousing.setWarehousingNo(existingWarehousingNo);
        }

        int qualified = productWarehousing.getQualifiedQuantity() == null ? 0
                : productWarehousing.getQualifiedQuantity();
        int unqualified = productWarehousing.getUnqualifiedQuantity() == null ? 0
                : productWarehousing.getUnqualifiedQuantity();
        if (qualified < 0 || unqualified < 0) {
            throw new IllegalArgumentException("数量不能为负数");
        }
        int warehousingQty = productWarehousing.getWarehousingQuantity() == null ? (qualified + unqualified)
                : productWarehousing.getWarehousingQuantity();
        if (warehousingQty <= 0) {
            throw new IllegalArgumentException("入库数量必须大于0");
        }
        if (qualified + unqualified != warehousingQty) {
            throw new IllegalArgumentException("入库数量必须等于合格数量+不合格数量");
        }
        productWarehousing.setWarehousingQuantity(warehousingQty);
        productWarehousing.setQualifiedQuantity(qualified);
        productWarehousing.setUnqualifiedQuantity(unqualified);

        String computedQualityStatus = unqualified > 0 ? STATUS_UNQUALIFIED : STATUS_QUALIFIED;
        productWarehousing.setQualityStatus(computedQualityStatus);
        String repairRemark = trimToNull(productWarehousing.getRepairRemark());

        if (!skipRangeCheck) {
            String msg = warehousingQuantityRuleViolationMessage(order.getId(), warehousingQty, null);
            if (StringUtils.hasText(msg)) {
                throw new IllegalStateException(msg);
            }
        }

        CuttingBundle bundle = null;
        String bundleId = StringUtils.hasText(productWarehousing.getCuttingBundleId())
                ? productWarehousing.getCuttingBundleId().trim()
                : null;
        String bundleQr = StringUtils.hasText(productWarehousing.getCuttingBundleQrCode())
                ? productWarehousing.getCuttingBundleQrCode().trim()
                : null;
        if (StringUtils.hasText(bundleId) || StringUtils.hasText(bundleQr)) {
            if (StringUtils.hasText(bundleId)) {
                bundle = cuttingBundleService.getById(bundleId);
            }
            if (bundle == null && StringUtils.hasText(bundleQr)) {
                bundle = cuttingBundleService.getByQrCode(bundleQr);
            }
            if (bundle == null || !StringUtils.hasText(bundle.getId())) {
                throw new NoSuchElementException("未找到对应的菲号");
            }
            if (StringUtils.hasText(bundle.getProductionOrderId())
                    && !order.getId().trim().equals(bundle.getProductionOrderId().trim())) {
                throw new IllegalArgumentException("菲号与订单不匹配");
            }
            boolean blocked = isBundleBlockedForWarehousing(bundle.getStatus());
            if (blocked && !STATUS_QUALIFIED.equalsIgnoreCase(computedQualityStatus)) {
                throw new IllegalStateException("该菲号为次品待返修，返修完成后才可入库");
            }
            if (blocked && STATUS_QUALIFIED.equalsIgnoreCase(computedQualityStatus)
                    && !StringUtils.hasText(repairRemark)) {
                throw new IllegalStateException("该菲号为次品待返修，请填写返修备注后再质检入库");
            }
            if (blocked && STATUS_QUALIFIED.equalsIgnoreCase(computedQualityStatus)
                    && StringUtils.hasText(repairRemark)) {
                ensureRepairQuantityNotExceeded(order.getId(), bundle.getId(), warehousingQty, null);
            }
            productWarehousing.setCuttingBundleId(bundle.getId());
            productWarehousing.setCuttingBundleNo(bundle.getBundleNo());
            productWarehousing.setCuttingBundleQrCode(bundle.getQrCode());

            ensureBundleNotAlreadyQualifiedWarehoused(order.getId(), bundle.getId(), null);
        }

        if (!StringUtils.hasText(productWarehousing.getOrderNo())) {
            productWarehousing.setOrderNo(order.getOrderNo());
        }
        if (!StringUtils.hasText(productWarehousing.getStyleId())) {
            productWarehousing.setStyleId(order.getStyleId());
        }
        if (!StringUtils.hasText(productWarehousing.getStyleNo())) {
            productWarehousing.setStyleNo(order.getStyleNo());
        }
        if (!StringUtils.hasText(productWarehousing.getStyleName())) {
            productWarehousing.setStyleName(order.getStyleName());
        }

        if (!StringUtils.hasText(productWarehousing.getWarehousingNo())) {
            productWarehousing.setWarehousingNo(buildWarehousingNo(now));
        }
        if (!StringUtils.hasText(productWarehousing.getWarehousingType())) {
            productWarehousing.setWarehousingType(WAREHOUSING_TYPE_MANUAL);
        }

        // 设置入库时间（入库开始时间和完成时间同时设置为当前时间）
        if (productWarehousing.getWarehousingStartTime() == null) {
            productWarehousing.setWarehousingStartTime(now);
        }
        if (productWarehousing.getWarehousingEndTime() == null) {
            productWarehousing.setWarehousingEndTime(now);
        }
        // 入库人员信息（如果未设置，尝试从receiver复制）
        if (!StringUtils.hasText(productWarehousing.getWarehousingOperatorId())
                && StringUtils.hasText(productWarehousing.getReceiverId())) {
            productWarehousing.setWarehousingOperatorId(productWarehousing.getReceiverId());
        }
        if (!StringUtils.hasText(productWarehousing.getWarehousingOperatorName())
                && StringUtils.hasText(productWarehousing.getReceiverName())) {
            productWarehousing.setWarehousingOperatorName(productWarehousing.getReceiverName());
        }

        productWarehousing.setCreateTime(now);
        productWarehousing.setUpdateTime(now);
        productWarehousing.setDeleteFlag(0);

        // 保存质检入库记录
        boolean ok = this.save(productWarehousing);
        if (ok) {
            if (bundle != null && StringUtils.hasText(bundle.getId())) {
                updateBundleStatusAfterWarehousing(bundle, computedQualityStatus, repairRemark, now);
            }

            int qualifiedSum = sumQualifiedByOrderId(productWarehousing.getOrderId());
            ProductionOrder patch = new ProductionOrder();
            patch.setId(productWarehousing.getOrderId());
            patch.setCompletedQuantity(qualifiedSum);
            patch.setUpdateTime(LocalDateTime.now());
            productionOrderService.updateById(patch);

            try {
                upsertWarehousingStageScanRecord(productWarehousing, order, bundle, now);
            } catch (Exception e) {
                log.warn(
                        "Failed to upsert warehousing stage scan record after warehousing: warehousingId={}, orderId={} ",
                        productWarehousing == null ? null : productWarehousing.getId(),
                        productWarehousing == null ? null : productWarehousing.getOrderId(),
                        e);
            }

            try {
                upsertWarehouseScanRecord(productWarehousing, order, bundle, now);
            } catch (Exception e) {
                log.warn(
                        "Failed to upsert warehouse scan record after warehousing: warehousingId={}, orderId={} ",
                        productWarehousing == null ? null : productWarehousing.getId(),
                        productWarehousing == null ? null : productWarehousing.getOrderId(),
                        e);
            }

            // Update SKU Stock
            if (productWarehousing.getQualifiedQuantity() != null && productWarehousing.getQualifiedQuantity() > 0) {
                updateSkuStock(productWarehousing, order, bundle, productWarehousing.getQualifiedQuantity());
            }
        }
        return ok;
    }

    @Override
    @Transactional
    public boolean saveWarehousingAndUpdateOrder(ProductWarehousing productWarehousing) {
        return saveWarehousingAndUpdateOrderInternal(productWarehousing, false);
    }

    @Override
    @Transactional
    public boolean saveBatchWarehousingAndUpdateOrder(List<ProductWarehousing> list) {
        if (list == null || list.isEmpty()) {
            throw new IllegalArgumentException("入库明细不能为空");
        }

        String orderId = null;
        for (ProductWarehousing w : list) {
            if (w == null) {
                continue;
            }
            if (StringUtils.hasText(w.getOrderId())) {
                orderId = w.getOrderId().trim();
                break;
            }
        }
        if (!StringUtils.hasText(orderId)) {
            throw new IllegalArgumentException("订单ID不能为空");
        }

        ProductionOrder order = productionOrderService.getById(orderId);
        if (order == null || order.getDeleteFlag() == null || order.getDeleteFlag() != 0) {
            throw new NoSuchElementException("订单不存在");
        }
        String st = order.getStatus() == null ? "" : order.getStatus().trim();
        if (STATUS_COMPLETED.equalsIgnoreCase(st)) {
            throw new IllegalStateException("订单已完成，已停止入库");
        }
        int batchSum = 0;
        for (ProductWarehousing w : list) {
            if (w == null) {
                continue;
            }
            int q = w.getWarehousingQuantity() == null ? 0 : w.getWarehousingQuantity();
            if (q > 0) {
                batchSum += q;
            }
        }
        String msg = warehousingQuantityRuleViolationMessage(order.getId(), batchSum, null);
        if (StringUtils.hasText(msg)) {
            throw new IllegalStateException(msg);
        }

        LocalDateTime now = LocalDateTime.now();
        String warehousingNo = findExistingWarehousingNoByOrderId(order.getId());
        if (!StringUtils.hasText(warehousingNo)) {
            warehousingNo = buildWarehousingNo(now);
        }

        for (ProductWarehousing w : list) {
            if (w == null) {
                continue;
            }
            w.setOrderId(order.getId());
            w.setWarehousingNo(warehousingNo);
            if (!StringUtils.hasText(w.getWarehousingType())) {
                w.setWarehousingType(WAREHOUSING_TYPE_MANUAL);
            }
            if (!StringUtils.hasText(w.getQualityStatus())) {
                w.setQualityStatus(STATUS_QUALIFIED);
            }
        }

        boolean okAll = true;
        for (ProductWarehousing w : list) {
            if (w == null) {
                continue;
            }
            boolean ok = saveWarehousingAndUpdateOrderInternal(w, true);
            if (!ok) {
                okAll = false;
                throw new IllegalStateException("批量入库失败");
            }
        }
        return okAll;
    }

    @Override
    @Transactional
    public boolean updateWarehousingAndUpdateOrder(ProductWarehousing productWarehousing) {
        // 查询原入库记录
        ProductWarehousing oldWarehousing = this.getById(productWarehousing.getId());
        if (oldWarehousing == null) {
            return false;
        }

        if (StringUtils.hasText(oldWarehousing.getOrderId())) {
            ProductionOrder order = productionOrderService.getById(oldWarehousing.getOrderId());
            String st = order == null ? "" : (order.getStatus() == null ? "" : order.getStatus().trim());
            if (STATUS_COMPLETED.equalsIgnoreCase(st)) {
                throw new IllegalStateException("订单已完成，已停止入库");
            }
        }

        // 设置更新时间
        LocalDateTime now = LocalDateTime.now();
        productWarehousing.setUpdateTime(now);

        Integer uq = productWarehousing.getUnqualifiedQuantity();
        Integer qq = productWarehousing.getQualifiedQuantity();
        Integer wq = productWarehousing.getWarehousingQuantity();
        if (uq == null) {
            uq = oldWarehousing.getUnqualifiedQuantity();
        }
        if (qq == null) {
            qq = oldWarehousing.getQualifiedQuantity();
        }
        if (wq == null) {
            wq = oldWarehousing.getWarehousingQuantity();
        }
        int unqualified = uq == null ? 0 : uq;
        int qualified = qq == null ? 0 : qq;
        int warehousingQty = wq == null ? (qualified + unqualified) : wq;
        if (qualified < 0 || unqualified < 0) {
            throw new IllegalArgumentException("数量不能为负数");
        }
        if (warehousingQty <= 0) {
            throw new IllegalArgumentException("入库数量必须大于0");
        }
        if (qualified + unqualified != warehousingQty) {
            throw new IllegalArgumentException("入库数量必须等于合格数量+不合格数量");
        }
        productWarehousing.setWarehousingQuantity(warehousingQty);
        productWarehousing.setQualifiedQuantity(qualified);
        productWarehousing.setUnqualifiedQuantity(unqualified);
        String computedQualityStatus = unqualified > 0 ? STATUS_UNQUALIFIED : STATUS_QUALIFIED;
        productWarehousing.setQualityStatus(computedQualityStatus);

        if (StringUtils.hasText(oldWarehousing.getOrderId())) {
            String msg = warehousingQuantityRuleViolationMessage(oldWarehousing.getOrderId(), warehousingQty,
                    oldWarehousing.getId());
            if (StringUtils.hasText(msg)) {
                throw new IllegalStateException(msg);
            }
        }

        if (StringUtils.hasText(productWarehousing.getCuttingBundleId())
                && (oldWarehousing.getCuttingBundleId() == null
                        || !productWarehousing.getCuttingBundleId().trim()
                                .equals(oldWarehousing.getCuttingBundleId().trim()))) {
            String oid = StringUtils.hasText(oldWarehousing.getOrderId()) ? oldWarehousing.getOrderId().trim() : null;
            ensureBundleNotAlreadyQualifiedWarehoused(oid, productWarehousing.getCuttingBundleId(),
                    oldWarehousing.getId());
        }

        boolean ok = this.updateById(productWarehousing);
        if (ok && StringUtils.hasText(oldWarehousing.getOrderId())) {
            int qualifiedSum = sumQualifiedByOrderId(oldWarehousing.getOrderId());
            ProductionOrder patch = new ProductionOrder();
            patch.setId(oldWarehousing.getOrderId());
            patch.setCompletedQuantity(qualifiedSum);
            patch.setUpdateTime(now);
            productionOrderService.updateById(patch);
        }
        CuttingBundle bundle = null;
        if (ok) {
            String bid = StringUtils.hasText(productWarehousing.getCuttingBundleId())
                    ? productWarehousing.getCuttingBundleId().trim()
                    : (StringUtils.hasText(oldWarehousing.getCuttingBundleId())
                            ? oldWarehousing.getCuttingBundleId().trim()
                            : null);
            if (StringUtils.hasText(bid)) {
                try {
                    bundle = cuttingBundleService.getById(bid);
                } catch (Exception e) {
                    log.warn("Failed to load cutting bundle when updating warehousing: cuttingBundleId={}", bid, e);
                }
            }

            // Update SKU Stock (Differential)
            int oldQ = oldWarehousing.getQualifiedQuantity() == null ? 0 : oldWarehousing.getQualifiedQuantity();
            int newQ = productWarehousing.getQualifiedQuantity(); // already set to non-null value above
            int diff = newQ - oldQ;
            if (diff != 0) {
                ProductionOrder order = null;
                if (StringUtils.hasText(oldWarehousing.getOrderId())) {
                    order = productionOrderService.getById(oldWarehousing.getOrderId());
                }
                updateSkuStock(productWarehousing, order, bundle, diff);
            }

            if (bundle != null && StringUtils.hasText(bundle.getId())) {
                String repairRemark = trimToNull(productWarehousing.getRepairRemark());
                if (repairRemark == null) {
                    repairRemark = trimToNull(oldWarehousing.getRepairRemark());
                }

                boolean blocked = isBundleBlockedForWarehousing(bundle.getStatus());
                if (blocked && !STATUS_QUALIFIED.equalsIgnoreCase(computedQualityStatus)) {
                    throw new IllegalStateException("该菲号为次品待返修，返修完成后才可入库");
                }
                if (blocked && STATUS_QUALIFIED.equalsIgnoreCase(computedQualityStatus)
                        && !StringUtils.hasText(repairRemark)) {
                    throw new IllegalStateException("该菲号为次品待返修，请填写返修备注后再质检入库");
                }
                if (blocked && STATUS_QUALIFIED.equalsIgnoreCase(computedQualityStatus)
                        && StringUtils.hasText(repairRemark)) {
                    String oid = StringUtils.hasText(oldWarehousing.getOrderId())
                            ? oldWarehousing.getOrderId().trim()
                            : null;
                    ensureRepairQuantityNotExceeded(oid, bundle.getId(), warehousingQty, oldWarehousing.getId());
                }
                updateBundleStatusAfterWarehousing(bundle, computedQualityStatus, repairRemark, now);
            }
        }

        if (ok && StringUtils.hasText(oldWarehousing.getOrderId())) {
            try {
                ProductionOrder order = productionOrderService.getById(oldWarehousing.getOrderId());
                if (order != null) {
                    ProductWarehousing current = new ProductWarehousing();
                    current.setId(oldWarehousing.getId());
                    current.setOrderId(oldWarehousing.getOrderId());
                    current.setOrderNo(StringUtils.hasText(oldWarehousing.getOrderNo()) ? oldWarehousing.getOrderNo()
                            : order.getOrderNo());
                    current.setStyleId(StringUtils.hasText(oldWarehousing.getStyleId()) ? oldWarehousing.getStyleId()
                            : order.getStyleId());
                    current.setStyleNo(StringUtils.hasText(oldWarehousing.getStyleNo()) ? oldWarehousing.getStyleNo()
                            : order.getStyleNo());
                    current.setWarehousingType(StringUtils.hasText(oldWarehousing.getWarehousingType())
                            ? oldWarehousing.getWarehousingType()
                            : productWarehousing.getWarehousingType());
                    current.setWarehouse(StringUtils.hasText(productWarehousing.getWarehouse())
                            ? productWarehousing.getWarehouse()
                            : oldWarehousing.getWarehouse());
                    current.setCuttingBundleId(StringUtils.hasText(productWarehousing.getCuttingBundleId())
                            ? productWarehousing.getCuttingBundleId()
                            : oldWarehousing.getCuttingBundleId());
                    current.setCuttingBundleNo(
                            productWarehousing.getCuttingBundleNo() != null ? productWarehousing.getCuttingBundleNo()
                                    : oldWarehousing.getCuttingBundleNo());
                    current.setCuttingBundleQrCode(StringUtils.hasText(productWarehousing.getCuttingBundleQrCode())
                            ? productWarehousing.getCuttingBundleQrCode()
                            : oldWarehousing.getCuttingBundleQrCode());
                    current.setQualifiedQuantity(qualified);
                    current.setWarehousingQuantity(warehousingQty);
                    current.setUnqualifiedQuantity(unqualified);
                    current.setQualityStatus(computedQualityStatus);
                    upsertWarehousingStageScanRecord(current, order, bundle, now);
                    upsertWarehouseScanRecord(current, order, bundle, now);
                }
            } catch (Exception e) {
                log.warn(
                        "Failed to upsert warehousing stage scan record after warehousing update: warehousingId={}, orderId={}",
                        oldWarehousing.getId(),
                        oldWarehousing.getOrderId(),
                        e);
            }
        }
        return ok;
    }

    private void updateBundleStatusAfterWarehousing(CuttingBundle bundle, String computedQualityStatus,
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

    private void upsertWarehousingStageScanRecord(ProductWarehousing warehousing, ProductionOrder order,
            CuttingBundle bundle, LocalDateTime now) {
        upsertScanRecord(warehousing, order, bundle, now, "WAREHOUSING:", "quality_warehousing",
                "质检", "质检", SCAN_TYPE_QUALITY, "质检完成", "次品退回，质检记录作废");
    }

    private void upsertWarehouseScanRecord(ProductWarehousing warehousing, ProductionOrder order,
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

    private void upsertScanRecord(ProductWarehousing warehousing, ProductionOrder order, CuttingBundle bundle,
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

    private String buildWarehousingNo(LocalDateTime now) {
        String ts = now.format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss"));
        int rand = (int) (ThreadLocalRandom.current().nextDouble() * 900) + 100;
        return "WH" + ts + rand;
    }
}
