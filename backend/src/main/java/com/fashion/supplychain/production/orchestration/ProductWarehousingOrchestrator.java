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
import com.fashion.supplychain.style.service.ProductSkuService;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.HashMap;
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

    @Autowired
    private ProductSkuService productSkuService;

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

    private void normalizeAndValidateDefectInfo(ProductWarehousing w) {
        if (w == null) {
            return;
        }
        Integer uq = w.getUnqualifiedQuantity();
        String qs = trimToNull(w.getQualityStatus());
        boolean hasUnqualified = (uq != null && uq > 0) || (qs != null && "unqualified".equalsIgnoreCase(qs));

        if (!hasUnqualified) {
            w.setDefectCategory(null);
            w.setDefectRemark(null);
            return;
        }

        String defectCategory = trimToNull(w.getDefectCategory());
        String defectRemark = trimToNull(w.getDefectRemark());

        if (!StringUtils.hasText(defectCategory)) {
            throw new IllegalArgumentException("请选择次品类别");
        }
        if (!StringUtils.hasText(defectRemark)) {
            throw new IllegalArgumentException("请选择次品处理方式");
        }

        if (!("返修".equals(defectRemark) || "报废".equals(defectRemark))) {
            throw new IllegalArgumentException("次品处理方式只能选择：返修/报废");
        }

        boolean okCategory = "appearance_integrity".equals(defectCategory)
                || "size_accuracy".equals(defectCategory)
                || "process_compliance".equals(defectCategory)
                || "functional_effectiveness".equals(defectCategory)
                || "other".equals(defectCategory);
        if (!okCategory) {
            throw new IllegalArgumentException("次品类别不合法");
        }

        w.setDefectCategory(defectCategory);
        w.setDefectRemark(defectRemark);
    }

    public boolean save(ProductWarehousing productWarehousing) {
        if (productWarehousing == null) {
            throw new IllegalArgumentException("参数错误");
        }

        // 如果没有orderId但有orderNo，自动查找orderId
        String orderId = StringUtils.hasText(productWarehousing.getOrderId())
                ? productWarehousing.getOrderId().trim()
                : null;
        String orderNo = StringUtils.hasText(productWarehousing.getOrderNo())
                ? productWarehousing.getOrderNo().trim()
                : null;

        if (!StringUtils.hasText(orderId) && StringUtils.hasText(orderNo)) {
            ProductionOrder order = productionOrderService.getByOrderNo(orderNo);
            if (order == null || !StringUtils.hasText(order.getId())) {
                throw new IllegalArgumentException("订单不存在: " + orderNo);
            }
            productWarehousing.setOrderId(order.getId());
            orderId = order.getId();
        }

        // 如果没有cuttingBundleId，尝试通过qrCode或bundleNo查找
        String bundleId = StringUtils.hasText(productWarehousing.getCuttingBundleId())
                ? productWarehousing.getCuttingBundleId().trim()
                : null;
        String bundleQrCode = StringUtils.hasText(productWarehousing.getCuttingBundleQrCode())
                ? productWarehousing.getCuttingBundleQrCode().trim()
                : null;
        Integer bundleNo = productWarehousing.getCuttingBundleNo();

        if (!StringUtils.hasText(bundleId)) {
            CuttingBundle bundle = null;
            // 方式1：通过二维码查找
            if (StringUtils.hasText(bundleQrCode)) {
                bundle = cuttingBundleService.getByQrCode(bundleQrCode);
            }
            // 方式2：通过订单号+菲号序号查找
            if (bundle == null && StringUtils.hasText(orderNo) && bundleNo != null && bundleNo > 0) {
                bundle = cuttingBundleService.lambdaQuery()
                        .eq(CuttingBundle::getProductionOrderNo, orderNo)
                        .eq(CuttingBundle::getBundleNo, bundleNo)
                        .last("LIMIT 1")
                        .one();
            }
            if (bundle != null && StringUtils.hasText(bundle.getId())) {
                productWarehousing.setCuttingBundleId(bundle.getId());
                // 同步填充其他菲号信息
                if (!StringUtils.hasText(bundleQrCode)) {
                    productWarehousing.setCuttingBundleQrCode(bundle.getQrCode());
                }
                if (bundleNo == null || bundleNo <= 0) {
                    productWarehousing.setCuttingBundleNo(bundle.getBundleNo());
                }
            }
        }

        normalizeAndValidateDefectInfo(productWarehousing);
        boolean ok = productWarehousingService.saveWarehousingAndUpdateOrder(productWarehousing);
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }

        orderId = StringUtils.hasText(productWarehousing.getOrderId()) ? productWarehousing.getOrderId().trim()
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

            // 已禁用系统自动完成
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
            if (StringUtils.hasText(warehouse)) {
                w.setWarehouse(warehouse);
            }
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

        // 已禁用系统自动完成
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
        normalizeAndValidateDefectInfo(productWarehousing);
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

            // 已禁用系统自动完成
        }
        return true;
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

            // 如果bundle为null，尝试根据cuttingBundleId加载
            if (color == null && StringUtils.hasText(w.getCuttingBundleId())) {
                try {
                    CuttingBundle b = cuttingBundleService.getById(w.getCuttingBundleId());
                    if (b != null) {
                        color = b.getColor();
                        size = b.getSize();
                    }
                } catch (Exception ignored) {
                }
            }

            if (StringUtils.hasText(styleNo) && StringUtils.hasText(color) && StringUtils.hasText(size)) {
                String skuCode = String.format("%s-%s-%s", styleNo.trim(), color.trim(), size.trim());
                productSkuService.updateStock(skuCode, deltaQuantity);
            }
        } catch (Exception e) {
            log.warn("Failed to update SKU stock in orchestrator: warehousingId={}, delta={}, error={}", w.getId(),
                    deltaQuantity, e.getMessage());
        }
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

        // Decrement Stock
        if (current.getQualifiedQuantity() != null && current.getQualifiedQuantity() > 0) {
            updateSkuStock(current, null, null, -current.getQualifiedQuantity());
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

    public Map<String, Object> repairStats(Map<String, Object> params) {
        String orderId = params == null ? null : String.valueOf(params.getOrDefault("orderId", ""));
        String cuttingBundleQrCode = params == null ? null
                : String.valueOf(params.getOrDefault("cuttingBundleQrCode", ""));
        String excludeWarehousingId = params == null ? null
                : String.valueOf(params.getOrDefault("excludeWarehousingId", ""));

        String oid = trimToNull(orderId);
        String qr = trimToNull(cuttingBundleQrCode);
        String exId = trimToNull(excludeWarehousingId);

        if (!StringUtils.hasText(qr)) {
            throw new IllegalArgumentException("cuttingBundleQrCode不能为空");
        }

        CuttingBundle bundle = cuttingBundleService.getByQrCode(qr);
        if (bundle == null || !StringUtils.hasText(bundle.getId())) {
            throw new NoSuchElementException("未找到对应的裁剪扎号");
        }
        if (!StringUtils.hasText(oid)) {
            oid = StringUtils.hasText(bundle.getProductionOrderId()) ? bundle.getProductionOrderId().trim() : null;
        }
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("未匹配到订单");
        }
        String bundleOid = StringUtils.hasText(bundle.getProductionOrderId()) ? bundle.getProductionOrderId().trim()
                : null;
        if (bundleOid != null && !bundleOid.isEmpty() && !bundleOid.equals(oid)) {
            throw new IllegalArgumentException("扎号与订单不匹配");
        }

        List<ProductWarehousing> list = productWarehousingService.list(new LambdaQueryWrapper<ProductWarehousing>()
                .select(ProductWarehousing::getId, ProductWarehousing::getUnqualifiedQuantity,
                        ProductWarehousing::getQualifiedQuantity, ProductWarehousing::getRepairRemark)
                .eq(ProductWarehousing::getDeleteFlag, 0)
                .eq(ProductWarehousing::getOrderId, oid)
                .eq(ProductWarehousing::getCuttingBundleId, bundle.getId())
                .ne(StringUtils.hasText(exId), ProductWarehousing::getId, exId)
                .orderByDesc(ProductWarehousing::getCreateTime));

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

        Map<String, Object> data = new HashMap<>();
        data.put("orderId", oid);
        data.put("cuttingBundleId", bundle.getId());
        data.put("cuttingBundleQrCode", qr);
        data.put("repairPool", Math.max(0, repairPool));
        data.put("repairedOut", Math.max(0, repairedOut));
        data.put("remaining", remaining <= 0 ? 0 : remaining);
        return data;
    }

    public Map<String, Object> batchRepairStats(Map<String, Object> body) {
        Object orderIdRaw = body == null ? null : body.get("orderId");
        String orderId = orderIdRaw == null ? null : String.valueOf(orderIdRaw);
        String oid = trimToNull(orderId);
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("订单ID不能为空");
        }

        Object qrsRaw = body == null ? null : body.get("qrs");
        List<?> qrsList = qrsRaw instanceof List<?> l ? l : Collections.emptyList();
        List<String> qrs = new ArrayList<>();
        for (Object v : qrsList) {
            String s = v == null ? null : String.valueOf(v).trim();
            if (StringUtils.hasText(s)) {
                qrs.add(s);
            }
        }
        if (qrs.isEmpty()) {
            Map<String, Object> resp = new HashMap<>();
            resp.put("items", new ArrayList<>());
            return resp;
        }

        Object excludeWarehousingIdRaw = body == null ? null : body.get("excludeWarehousingId");
        String excludeWarehousingId = excludeWarehousingIdRaw == null ? null : String.valueOf(excludeWarehousingIdRaw);
        String exId = trimToNull(excludeWarehousingId);

        List<CuttingBundle> bundles = cuttingBundleService.lambdaQuery()
                .select(CuttingBundle::getId, CuttingBundle::getQrCode, CuttingBundle::getProductionOrderId)
                .in(CuttingBundle::getQrCode, qrs)
                .list();
        Map<String, CuttingBundle> bundleByQr = new HashMap<>();
        List<String> bundleIds = new ArrayList<>();
        if (bundles != null) {
            for (CuttingBundle b : bundles) {
                if (b == null) {
                    continue;
                }
                String qr = StringUtils.hasText(b.getQrCode()) ? b.getQrCode().trim() : null;
                String bid = StringUtils.hasText(b.getId()) ? b.getId().trim() : null;
                if (!StringUtils.hasText(qr) || !StringUtils.hasText(bid)) {
                    continue;
                }
                bundleByQr.put(qr, b);
                bundleIds.add(bid);
            }
        }

        Map<String, long[]> statsByBundleId = new HashMap<>();
        if (!bundleIds.isEmpty()) {
            List<ProductWarehousing> list = productWarehousingService.list(new LambdaQueryWrapper<ProductWarehousing>()
                    .select(ProductWarehousing::getId, ProductWarehousing::getCuttingBundleId,
                            ProductWarehousing::getUnqualifiedQuantity, ProductWarehousing::getQualifiedQuantity,
                            ProductWarehousing::getRepairRemark)
                    .eq(ProductWarehousing::getDeleteFlag, 0)
                    .eq(ProductWarehousing::getOrderId, oid)
                    .in(ProductWarehousing::getCuttingBundleId, bundleIds)
                    .ne(StringUtils.hasText(exId), ProductWarehousing::getId, exId));
            if (list != null) {
                for (ProductWarehousing w : list) {
                    if (w == null) {
                        continue;
                    }
                    String bid = StringUtils.hasText(w.getCuttingBundleId()) ? w.getCuttingBundleId().trim() : null;
                    if (!StringUtils.hasText(bid)) {
                        continue;
                    }
                    long[] agg = statsByBundleId.computeIfAbsent(bid, k -> new long[] { 0, 0 });
                    int uq = w.getUnqualifiedQuantity() == null ? 0 : w.getUnqualifiedQuantity();
                    if (uq > 0) {
                        agg[0] += uq;
                    }
                    String rr = trimToNull(w.getRepairRemark());
                    if (rr != null) {
                        int q = w.getQualifiedQuantity() == null ? 0 : w.getQualifiedQuantity();
                        if (q > 0) {
                            agg[1] += q;
                        }
                    }
                }
            }
        }

        List<Map<String, Object>> items = new ArrayList<>();
        for (String qr : qrs) {
            CuttingBundle b = bundleByQr.get(qr);
            String bid = b == null ? null : (StringUtils.hasText(b.getId()) ? b.getId().trim() : null);
            String bundleOid = b == null ? null
                    : (StringUtils.hasText(b.getProductionOrderId()) ? b.getProductionOrderId().trim() : null);
            boolean mismatch = bundleOid != null && !bundleOid.isEmpty() && !bundleOid.equals(oid);

            long pool = 0;
            long out = 0;
            long remain = 0;
            if (mismatch || bid == null) {
                pool = 0;
                out = 0;
                remain = 0;
            } else {
                long[] agg = statsByBundleId.get(bid);
                pool = agg == null ? 0 : Math.max(0, agg[0]);
                out = agg == null ? 0 : Math.max(0, agg[1]);
                remain = pool - out;
                if (remain < 0) {
                    remain = 0;
                }
            }

            Map<String, Object> m = new HashMap<>();
            m.put("qr", qr);
            m.put("cuttingBundleId", bid);
            m.put("repairPool", pool);
            m.put("repairedOut", out);
            m.put("remaining", remain);
            items.add(m);
        }

        Map<String, Object> resp = new HashMap<>();
        resp.put("orderId", oid);
        resp.put("items", items);
        return resp;
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
                ProductWarehousing patch = new ProductWarehousing();
                patch.setId(w.getId());
                patch.setDeleteFlag(1);
                patch.setUpdateTime(now);
                productWarehousingService.updateById(patch);
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
        if (v instanceof Number number) {
            return number.intValue();
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
