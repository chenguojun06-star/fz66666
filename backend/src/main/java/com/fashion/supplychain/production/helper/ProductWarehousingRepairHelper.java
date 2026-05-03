package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.util.TextUtils;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * 入库返修相关辅助类 — 从 ProductWarehousingOrchestrator 拆分
 * 包含：repairStats / batchRepairStats / listPendingRepairTasks /
 *       markBundleRepaired / startBundleRepair / completeBundleRepair / scrapBundle
 */
@Service
@Slf4j
public class ProductWarehousingRepairHelper {

    @Autowired
    private ProductWarehousingService productWarehousingService;

    @Autowired
    private CuttingBundleService cuttingBundleService;

    public Map<String, Object> repairStats(Map<String, Object> params) {
        String orderId = params == null ? null : String.valueOf(params.getOrDefault("orderId", ""));
        String cuttingBundleQrCode = params == null ? null
                : String.valueOf(params.getOrDefault("cuttingBundleQrCode", ""));
        String excludeWarehousingId = params == null ? null
                : String.valueOf(params.getOrDefault("excludeWarehousingId", ""));

        String oid = TextUtils.safeText(orderId);
        String qr = TextUtils.safeText(cuttingBundleQrCode);
        String exId = TextUtils.safeText(excludeWarehousingId);

        if (!StringUtils.hasText(qr)) {
            throw new IllegalArgumentException("cuttingBundleQrCode不能为空");
        }

        CuttingBundle bundle = cuttingBundleService.getByQrCode(qr);
        if (bundle == null || !StringUtils.hasText(bundle.getId())) {
            throw new NoSuchElementException("未找到对应的裁剪扎号");
        }
        oid = resolveOrderId(oid, bundle);

        List<ProductWarehousing> list = productWarehousingService.list(new LambdaQueryWrapper<ProductWarehousing>()
                .select(ProductWarehousing::getId, ProductWarehousing::getUnqualifiedQuantity,
                        ProductWarehousing::getQualifiedQuantity, ProductWarehousing::getRepairRemark,
                        ProductWarehousing::getWarehousingType)
                .eq(ProductWarehousing::getDeleteFlag, 0)
                .eq(ProductWarehousing::getOrderId, oid)
                .eq(ProductWarehousing::getCuttingBundleId, bundle.getId())
                .ne(StringUtils.hasText(exId), ProductWarehousing::getId, exId)
                .orderByDesc(ProductWarehousing::getCreateTime));

        long[] stats = calculateRepairStats(list);
        return buildRepairStatsResult(oid, bundle.getId(), qr, stats);
    }

    private String resolveOrderId(String oid, CuttingBundle bundle) {
        if (!StringUtils.hasText(oid)) {
            oid = StringUtils.hasText(bundle.getProductionOrderId()) ? bundle.getProductionOrderId().trim() : null;
        }
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("未匹配到订单");
        }
        String bundleOid = StringUtils.hasText(bundle.getProductionOrderId()) ? bundle.getProductionOrderId().trim() : null;
        if (bundleOid != null && !bundleOid.isEmpty() && !bundleOid.equals(oid)) {
            throw new IllegalArgumentException("扎号与订单不匹配");
        }
        return oid;
    }

    private long[] calculateRepairStats(List<ProductWarehousing> list) {
        long repairPool = 0;
        long repairReturnQty = 0;
        long reQcDoneQty = 0;
        if (list != null) {
            for (ProductWarehousing w : list) {
                if (w == null) continue;
                int uq = w.getUnqualifiedQuantity() == null ? 0 : w.getUnqualifiedQuantity();
                if (uq > 0) repairPool += uq;

                boolean isRepairReturn = "repair_return".equalsIgnoreCase(
                        w.getWarehousingType() == null ? "" : w.getWarehousingType().trim());
                String rr = TextUtils.safeText(w.getRepairRemark());
                int q = w.getQualifiedQuantity() == null ? 0 : w.getQualifiedQuantity();
                if (q > 0) {
                    if (isRepairReturn) {
                        repairReturnQty += q;
                    } else if (rr != null) {
                        reQcDoneQty += q;
                    }
                }
            }
        }
        return new long[]{repairPool, repairReturnQty, reQcDoneQty};
    }

    private Map<String, Object> buildRepairStatsResult(String oid, String bundleId, String qr, long[] stats) {
        long repairPool = stats[0];
        long repairReturnQty = stats[1];
        long reQcDoneQty = stats[2];
        long awaitingReQc = Math.max(0, repairReturnQty - reQcDoneQty);
        long awaitingRepair = Math.max(0, repairPool - repairReturnQty - reQcDoneQty);

        Map<String, Object> data = new HashMap<>();
        data.put("orderId", oid);
        data.put("cuttingBundleId", bundleId);
        data.put("cuttingBundleQrCode", qr);
        data.put("repairPool", Math.max(0, repairPool));
        data.put("repairReturnQty", repairReturnQty);
        data.put("reQcDoneQty", reQcDoneQty);
        data.put("awaitingReQc", awaitingReQc);
        data.put("awaitingRepair", awaitingRepair);
        data.put("repairedOut", reQcDoneQty);
        data.put("remaining", awaitingReQc);
        return data;
    }

    public Map<String, Object> batchRepairStats(Map<String, Object> body) {
        Object orderIdRaw = body == null ? null : body.get("orderId");
        String orderId = orderIdRaw == null ? null : String.valueOf(orderIdRaw);
        String oid = TextUtils.safeText(orderId);
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("订单ID不能为空");
        }

        List<String> qrs = parseQrCodes(body);
        if (qrs.isEmpty()) {
            Map<String, Object> resp = new HashMap<>();
            resp.put("items", new ArrayList<>());
            return resp;
        }

        Object excludeWarehousingIdRaw = body == null ? null : body.get("excludeWarehousingId");
        String excludeWarehousingId = excludeWarehousingIdRaw == null ? null : String.valueOf(excludeWarehousingIdRaw);
        String exId = TextUtils.safeText(excludeWarehousingId);

        Map<String, CuttingBundle> bundleByQr = loadBundlesByQrs(qrs);
        Map<String, long[]> statsByBundleId = aggregateStatsByBundle(oid, bundleByQr, exId);
        List<Map<String, Object>> items = buildBatchRepairItems(qrs, bundleByQr, statsByBundleId, oid);

        Map<String, Object> resp = new HashMap<>();
        resp.put("orderId", oid);
        resp.put("items", items);
        return resp;
    }

    private List<String> parseQrCodes(Map<String, Object> body) {
        Object qrsRaw = body == null ? null : body.get("qrs");
        List<?> qrsList = qrsRaw instanceof List<?> l ? l : Collections.emptyList();
        List<String> qrs = new ArrayList<>();
        for (Object v : qrsList) {
            String s = v == null ? null : String.valueOf(v).trim();
            if (StringUtils.hasText(s)) qrs.add(s);
        }
        return qrs;
    }

    private Map<String, CuttingBundle> loadBundlesByQrs(List<String> qrs) {
        List<CuttingBundle> bundles = cuttingBundleService.lambdaQuery()
                .select(CuttingBundle::getId, CuttingBundle::getQrCode, CuttingBundle::getProductionOrderId)
                .in(CuttingBundle::getQrCode, qrs)
                .list();
        Map<String, CuttingBundle> bundleByQr = new HashMap<>();
        if (bundles != null) {
            for (CuttingBundle b : bundles) {
                if (b == null) continue;
                String qr = StringUtils.hasText(b.getQrCode()) ? b.getQrCode().trim() : null;
                String bid = StringUtils.hasText(b.getId()) ? b.getId().trim() : null;
                if (!StringUtils.hasText(qr) || !StringUtils.hasText(bid)) continue;
                bundleByQr.put(qr, b);
            }
        }
        return bundleByQr;
    }

    private Map<String, long[]> aggregateStatsByBundle(String oid, Map<String, CuttingBundle> bundleByQr, String exId) {
        List<String> bundleIds = new ArrayList<>(bundleByQr.values().stream()
                .map(b -> b.getId() == null ? null : b.getId().trim())
                .filter(StringUtils::hasText)
                .distinct().toList());
        Map<String, long[]> statsByBundleId = new HashMap<>();
        if (bundleIds.isEmpty()) return statsByBundleId;

        List<ProductWarehousing> list = productWarehousingService.list(new LambdaQueryWrapper<ProductWarehousing>()
                .select(ProductWarehousing::getId, ProductWarehousing::getCuttingBundleId,
                        ProductWarehousing::getUnqualifiedQuantity, ProductWarehousing::getQualifiedQuantity,
                        ProductWarehousing::getRepairRemark, ProductWarehousing::getWarehousingType)
                .eq(ProductWarehousing::getDeleteFlag, 0)
                .eq(ProductWarehousing::getOrderId, oid)
                .in(ProductWarehousing::getCuttingBundleId, bundleIds)
                .ne(StringUtils.hasText(exId), ProductWarehousing::getId, exId));
        if (list != null) {
            for (ProductWarehousing w : list) {
                if (w == null) continue;
                String bid = StringUtils.hasText(w.getCuttingBundleId()) ? w.getCuttingBundleId().trim() : null;
                if (!StringUtils.hasText(bid)) continue;
                long[] agg = statsByBundleId.computeIfAbsent(bid, k -> new long[]{0, 0, 0});
                int uq = w.getUnqualifiedQuantity() == null ? 0 : w.getUnqualifiedQuantity();
                if (uq > 0) agg[0] += uq;
                boolean isRepairReturn = "repair_return".equalsIgnoreCase(
                        w.getWarehousingType() == null ? "" : w.getWarehousingType().trim());
                String rr = TextUtils.safeText(w.getRepairRemark());
                int q = w.getQualifiedQuantity() == null ? 0 : w.getQualifiedQuantity();
                if (q > 0) {
                    if (isRepairReturn) agg[1] += q;
                    else if (rr != null) agg[2] += q;
                }
            }
        }
        return statsByBundleId;
    }

    private List<Map<String, Object>> buildBatchRepairItems(List<String> qrs,
            Map<String, CuttingBundle> bundleByQr, Map<String, long[]> statsByBundleId, String oid) {
        List<Map<String, Object>> items = new ArrayList<>();
        for (String qr : qrs) {
            CuttingBundle b = bundleByQr.get(qr);
            String bid = b == null ? null : (StringUtils.hasText(b.getId()) ? b.getId().trim() : null);
            String bundleOid = b == null ? null
                    : (StringUtils.hasText(b.getProductionOrderId()) ? b.getProductionOrderId().trim() : null);
            boolean mismatch = bundleOid != null && !bundleOid.isEmpty() && !bundleOid.equals(oid);

            long pool = 0;
            long repairReturnQty = 0;
            long reQcDoneQty = 0;
            if (!mismatch && bid != null) {
                long[] agg = statsByBundleId.get(bid);
                pool = agg == null ? 0 : Math.max(0, agg[0]);
                repairReturnQty = agg == null ? 0 : Math.max(0, agg[1]);
                reQcDoneQty = agg == null ? 0 : Math.max(0, agg[2]);
            }
            long awaitingReQc = Math.max(0, repairReturnQty - reQcDoneQty);

            Map<String, Object> m = new HashMap<>();
            m.put("qr", qr);
            m.put("cuttingBundleId", bid);
            m.put("repairPool", pool);
            m.put("repairReturnQty", repairReturnQty);
            m.put("reQcDoneQty", reQcDoneQty);
            m.put("awaitingReQc", awaitingReQc);
            m.put("repairedOut", reQcDoneQty);
            m.put("remaining", awaitingReQc);
            items.add(m);
        }
        return items;
    }

    /**
     * 待返修任务列表（铃铛专用）
     * 返回当前租户中 status=unqualified（质检不合格、尚未申报返修完成）的菲号列表
     * 逻辑：quality_scan 记录（次品池）关联的菲号中，bundle.status 仍为 unqualified 的
     */
    public List<Map<String, Object>> listPendingRepairTasks(Long tenantId) {
        return listPendingRepairTasks(tenantId, null, null);
    }

    /**
     * 待返修任务列表（按工厂隔离）
     */
    public List<Map<String, Object>> listPendingRepairTasks(Long tenantId, String factoryId) {
        return listPendingRepairTasks(tenantId, factoryId, null);
    }

    /**
     * 待返修任务列表（按操作人过滤）
     * @param tenantId 租户ID
     * @param factoryId 工厂ID（null=不限制）
     * @param operatorId 质检操作人ID（null=不限制，管理员/AI查看全部）
     */
    public List<Map<String, Object>> listPendingRepairTasks(Long tenantId, String factoryId, String operatorId) {
        if (tenantId == null) return Collections.emptyList();

        QueryWrapper<ProductWarehousing> qualityScanQuery = new QueryWrapper<>();
        qualityScanQuery.select("cutting_bundle_id", "order_id", "order_no", "unqualified_quantity", "defect_category", "defect_remark", "unqualified_image_urls", "process_name", "create_time", "repair_status")
            .eq("tenant_id", tenantId)
            .eq("warehousing_type", "quality_scan")
            .eq("delete_flag", 0)
            .gt("unqualified_quantity", 0);
        if (StringUtils.hasText(factoryId)) {
            qualityScanQuery.in("order_id",
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<com.fashion.supplychain.production.entity.ProductionOrder>()
                    .select("id")
                    .eq("factory_id", factoryId)
                    .eq("tenant_id", tenantId));
        }
        if (StringUtils.hasText(operatorId)) {
            qualityScanQuery.eq("quality_operator_id", operatorId);
        }
        List<Map<String, Object>> qualityScans = productWarehousingService.listMaps(qualityScanQuery);

        if (qualityScans == null || qualityScans.isEmpty()) return Collections.emptyList();

        Map<String, Map<String, Object>> qsMap = new HashMap<>();
        for (Map<String, Object> qs : qualityScans) {
            String bid = TextUtils.safeText(qs.get("cutting_bundle_id"));
            if (!StringUtils.hasText(bid)) continue;
            Map<String, Object> existing = qsMap.get(bid);
            int newQty = parseIntOrDefault(qs.get("unqualified_quantity"), 0);
            int oldQty = existing == null ? 0 : parseIntOrDefault(existing.get("unqualified_quantity"), 0);
            if (existing == null || newQty > oldQty) {
                qsMap.put(bid, qs);
            }
        }
        if (qsMap.isEmpty()) return Collections.emptyList();

        List<CuttingBundle> bundleList = cuttingBundleService.lambdaQuery()
            .select(CuttingBundle::getId,
                CuttingBundle::getBundleNo,
                CuttingBundle::getQrCode,
                CuttingBundle::getColor,
                CuttingBundle::getSize,
                CuttingBundle::getStyleNo,
                CuttingBundle::getProductionOrderId,
                CuttingBundle::getProductionOrderNo,
                CuttingBundle::getQuantity,
                CuttingBundle::getStatus)
                .in(CuttingBundle::getId, qsMap.keySet())
                .in(CuttingBundle::getStatus, "unqualified", "repaired_waiting_qc", "scrapped")
                .list();

        if (bundleList == null || bundleList.isEmpty()) return Collections.emptyList();

        List<Map<String, Object>> result = new ArrayList<>();
        for (CuttingBundle bundle : bundleList) {
            Map<String, Object> qs = qsMap.get(bundle.getId());
            Map<String, Object> item = new HashMap<>();
            item.put("bundleId", bundle.getId());
            item.put("bundleNo", bundle.getBundleNo());
            item.put("qrCode", bundle.getQrCode());
            item.put("color", TextUtils.safeText(bundle.getColor()));
            item.put("size", TextUtils.safeText(bundle.getSize()));
            item.put("styleNo", TextUtils.safeText(bundle.getStyleNo()));
            item.put("orderId", bundle.getProductionOrderId());
            item.put("orderNo", bundle.getProductionOrderNo());
            int defectQty = qs != null
                    ? parseIntOrDefault(qs.get("unqualified_quantity"), 0)
                    : (bundle.getQuantity() == null ? 0 : bundle.getQuantity());
            item.put("defectQty", defectQty);
            item.put("unqualifiedQuantity", defectQty);
            item.put("defectCategory", qs != null ? TextUtils.safeText(qs.get("defect_category")) : "");
            item.put("defectRemark", qs != null ? TextUtils.safeText(qs.get("defect_remark")) : "");
            item.put("unqualifiedImageUrls", qs != null ? TextUtils.safeText(qs.get("unqualified_image_urls")) : "");
            item.put("processName", qs != null ? TextUtils.safeText(qs.get("process_name")) : "");
            item.put("createTime", qs != null ? qs.get("create_time") : null);
            String repairStatus = qs != null ? TextUtils.safeText(qs.get("repair_status")) : "";
            if (!StringUtils.hasText(repairStatus)) {
                String bundleStatus = bundle.getStatus() == null ? "" : bundle.getStatus().trim();
                if ("unqualified".equals(bundleStatus)) {
                    repairStatus = "pending";
                } else if ("repaired_waiting_qc".equals(bundleStatus)) {
                    repairStatus = "repair_done";
                } else if ("scrapped".equals(bundleStatus)) {
                    repairStatus = "scrapped";
                }
            }
            item.put("repairStatus", repairStatus);
            item.put("bundleStatus", bundle.getStatus());
            result.add(item);
        }
        return result;
    }

    private int parseIntOrDefault(Object value, int defaultValue) {
        if (value == null) {
            return defaultValue;
        }
        if (value instanceof Number number) {
            return number.intValue();
        }
        String text = String.valueOf(value).trim();
        if (!StringUtils.hasText(text)) {
            return defaultValue;
        }
        try {
            return Integer.parseInt(text);
        } catch (NumberFormatException ex) {
            return defaultValue;
        }
    }

    /**
     * PC端直接标记菲号为「返修完成待质检」
     * 适用场景：质检员在PC端确认工厂已完成返修，无需等待小程序扫码
     * 前置条件：bundle.status 必须为 unqualified
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean markBundleRepaired(String bundleId) {
        if (!StringUtils.hasText(bundleId)) {
            throw new IllegalArgumentException("bundleId 不能为空");
        }
        CuttingBundle bundle = getBundleWithTenant(bundleId);
        if (bundle == null) {
            throw new IllegalArgumentException("菲号不存在: " + bundleId);
        }
        String currentStatus = bundle.getStatus() == null ? "" : bundle.getStatus().trim();
        if (!"unqualified".equals(currentStatus)) {
            throw new IllegalStateException(
                "当前状态不是次品待返修，无法操作（当前：" + currentStatus + "）");
        }
        bundle.setStatus("repaired_waiting_qc");
        // 同步更新 repair_status
        updateRepairStatus(bundleId, "repair_done", null);
        return cuttingBundleService.updateById(bundle);
    }

    /**
     * AI次品处理：标记菲号为「返修中」
     */
    @Transactional(rollbackFor = Exception.class)
    public void startBundleRepair(String bundleId, String operatorName) {
        if (!StringUtils.hasText(bundleId)) {
            throw new IllegalArgumentException("bundleId 不能为空");
        }
        CuttingBundle bundle = getBundleWithTenant(bundleId);
        if (bundle == null) throw new IllegalArgumentException("菲号不存在: " + bundleId);
        if (!"unqualified".equals(bundle.getStatus())) {
            throw new IllegalStateException("当前状态不是次品待返修（当前：" + bundle.getStatus() + "）");
        }
        updateRepairStatus(bundleId, "repairing", operatorName);
    }

    /**
     * AI次品处理：标记返修完成 → 进入待质检
     */
    @Transactional(rollbackFor = Exception.class)
    public void completeBundleRepair(String bundleId) {
        if (!StringUtils.hasText(bundleId)) {
            throw new IllegalArgumentException("bundleId 不能为空");
        }
        CuttingBundle bundle = getBundleWithTenant(bundleId);
        if (bundle == null) throw new IllegalArgumentException("菲号不存在: " + bundleId);
        String st = bundle.getStatus() == null ? "" : bundle.getStatus().trim();
        if (!"unqualified".equals(st) && !"repairing".equalsIgnoreCase(getRepairStatusByBundle(bundleId))) {
            throw new IllegalStateException("菲号未处于返修状态，无法完成（当前：" + st + "）");
        }
        bundle.setStatus("repaired_waiting_qc");
        cuttingBundleService.updateById(bundle);
        updateRepairStatus(bundleId, "repair_done", null);
    }

    /**
     * AI次品处理：标记菲号为报废
     */
    @Transactional(rollbackFor = Exception.class)
    public void scrapBundle(String bundleId) {
        if (!StringUtils.hasText(bundleId)) {
            throw new IllegalArgumentException("bundleId 不能为空");
        }
        CuttingBundle bundle = getBundleWithTenant(bundleId);
        if (bundle == null) throw new IllegalArgumentException("菲号不存在: " + bundleId);
        if (!"unqualified".equals(bundle.getStatus())) {
            throw new IllegalStateException("当前状态不是次品待返修，无法报废（当前：" + bundle.getStatus() + "）");
        }
        bundle.setStatus("scrapped");
        cuttingBundleService.updateById(bundle);
        updateRepairStatus(bundleId, "scrapped", null);
    }

    /** 更新 t_product_warehousing 的 repair_status / repair_operator_name / repair_completed_time */
    private void updateRepairStatus(String bundleId, String status, String operatorName) {
        Long tenantId = UserContext.tenantId();
        LambdaUpdateWrapper<ProductWarehousing> uw = new LambdaUpdateWrapper<ProductWarehousing>()
                .eq(ProductWarehousing::getTenantId, tenantId)
                .eq(ProductWarehousing::getCuttingBundleId, bundleId)
                .eq(ProductWarehousing::getWarehousingType, "quality_scan")
                .set(ProductWarehousing::getRepairStatus, status);
        if (operatorName != null && !operatorName.isBlank()) {
            uw.set(ProductWarehousing::getRepairOperatorName, operatorName);
        }
        if ("repair_done".equals(status)) {
            uw.set(ProductWarehousing::getRepairCompletedTime, LocalDateTime.now());
        }
        productWarehousingService.update(uw);
    }

    private String getRepairStatusByBundle(String bundleId) {
        Long tenantId = UserContext.tenantId();
        ProductWarehousing pw = productWarehousingService.getOne(
                new LambdaQueryWrapper<ProductWarehousing>()
                        .eq(ProductWarehousing::getTenantId, tenantId)
                        .eq(ProductWarehousing::getCuttingBundleId, bundleId)
                        .eq(ProductWarehousing::getWarehousingType, "quality_scan")
                        .eq(ProductWarehousing::getDeleteFlag, 0)
                        .last("LIMIT 1"));
        return pw != null ? pw.getRepairStatus() : null;
    }

    private CuttingBundle getBundleWithTenant(String bundleId) {
        return cuttingBundleService.lambdaQuery()
                .eq(CuttingBundle::getId, bundleId.trim())
                .eq(CuttingBundle::getTenantId, com.fashion.supplychain.common.UserContext.tenantId())
                .one();
    }
}
