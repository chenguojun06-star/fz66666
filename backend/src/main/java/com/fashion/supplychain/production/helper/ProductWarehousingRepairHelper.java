package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.constant.OrderStatusConstants;
import com.fashion.supplychain.common.util.TextUtils;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
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

    @Autowired
    private com.fashion.supplychain.style.service.StyleInfoService styleInfoService;

    @Autowired
    private ProductionOrderService productionOrderService;

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
        qualityScanQuery.select("cutting_bundle_id", "order_id", "order_no", "style_name", "unqualified_quantity", "qualified_quantity", "warehousing_quantity", "cutting_quantity", "defect_category", "defect_remark", "unqualified_image_urls", "create_time", "repair_status", "process_name", "repair_remark", "quality_operator_name", "scan_mode", "warehousing_no", "factory_name", "quality_status")
            .eq("tenant_id", tenantId)
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

        // 过滤掉订单已处于终态（已关单/已完成/已取消/已报废/已归档）的记录
        // 修复：订单关单后次品记录仍在，但不应再显示返修按钮
        Set<String> orderIds = new HashSet<>();
        for (Map<String, Object> qs : qualityScans) {
            String oid = TextUtils.safeText(qs.get("order_id"));
            if (StringUtils.hasText(oid)) orderIds.add(oid);
        }
        Map<String, String> orderStatusMap = new HashMap<>();
        if (!orderIds.isEmpty()) {
            List<ProductionOrder> orders = productionOrderService.lambdaQuery()
                .select(ProductionOrder::getId, ProductionOrder::getStatus)
                .in(ProductionOrder::getId, orderIds)
                .list();
            if (orders != null) {
                for (ProductionOrder o : orders) {
                    orderStatusMap.put(String.valueOf(o.getId()),
                        o.getStatus() == null ? "" : o.getStatus().trim().toLowerCase());
                }
            }
        }
        // 移除终态订单的质检记录
        qualityScans.removeIf(qs -> {
            String oid = TextUtils.safeText(qs.get("order_id"));
            String st = orderStatusMap.getOrDefault(oid, "");
            return OrderStatusConstants.isTerminal(st);
        });
        if (qualityScans.isEmpty()) return Collections.emptyList();

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
            item.put("styleName", qs != null ? TextUtils.safeText(qs.get("style_name")) : "");
            item.put("orderId", bundle.getProductionOrderId());
            item.put("orderNo", bundle.getProductionOrderNo());
            // 返回订单状态，前端用于判断是否显示返修按钮（兜底防御）
            String orderStatus = orderStatusMap.getOrDefault(String.valueOf(bundle.getProductionOrderId()), "");
            item.put("orderStatus", orderStatus);
            int defectQty = qs != null
                    ? parseIntOrDefault(qs.get("unqualified_quantity"), 0)
                    : (bundle.getQuantity() == null ? 0 : bundle.getQuantity());
            item.put("defectQty", defectQty);
            item.put("unqualifiedQuantity", defectQty);
            item.put("qualifiedQuantity", qs != null ? parseIntOrDefault(qs.get("qualified_quantity"), 0) : 0);
            item.put("warehousingQuantity", qs != null ? parseIntOrDefault(qs.get("warehousing_quantity"), 0) : 0);
            item.put("cuttingQuantity", qs != null ? parseIntOrDefault(qs.get("cutting_quantity"), 0) : (bundle.getQuantity() == null ? 0 : bundle.getQuantity()));
            item.put("defectCategory", qs != null ? TextUtils.safeText(qs.get("defect_category")) : "");
            item.put("defectRemark", qs != null ? TextUtils.safeText(qs.get("defect_remark")) : "");
            item.put("unqualifiedImageUrls", qs != null ? TextUtils.safeText(qs.get("unqualified_image_urls")) : "");
            item.put("processName", qs != null ? TextUtils.safeText(qs.get("process_name")) : "");
            item.put("createTime", qs != null ? qs.get("create_time") : null);
            item.put("remark", qs != null ? TextUtils.safeText(qs.get("repair_remark")) : "");
            item.put("qualityOperatorName", qs != null ? TextUtils.safeText(qs.get("quality_operator_name")) : "");
            item.put("scanMode", qs != null ? TextUtils.safeText(qs.get("scan_mode")) : "");
            item.put("warehousingNo", qs != null ? TextUtils.safeText(qs.get("warehousing_no")) : "");
            item.put("factoryName", qs != null ? TextUtils.safeText(qs.get("factory_name")) : "");
            item.put("qualityStatus", qs != null ? TextUtils.safeText(qs.get("quality_status")) : "");
            String repairStatus = qs != null ? TextUtils.safeText(qs.get("repair_status")) : "";
            if ("pending_repair".equals(repairStatus)) {
                repairStatus = "pending";
            }
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

        // 注入款式图（coverImage）供小程序通知卡片展示
        injectStyleCover(result, tenantId);

        return result;
    }

    /**
     * 批量注入款式图（coverImage）到返修任务列表
     * 按 styleNo 关联查询 StyleInfo.cover，填充到 coverImage/styleImage 字段
     */
    private void injectStyleCover(List<Map<String, Object>> taskList, Long tenantId) {
        if (taskList == null || taskList.isEmpty() || tenantId == null) return;
        java.util.Set<String> styleNos = new java.util.HashSet<>();
        for (Map<String, Object> item : taskList) {
            String sn = TextUtils.safeText(item.get("styleNo"));
            if (StringUtils.hasText(sn)) styleNos.add(sn);
        }
        if (styleNos.isEmpty()) return;

        try {
            java.util.Map<String, String> styleNoToCover = styleInfoService.lambdaQuery()
                    .select(com.fashion.supplychain.style.entity.StyleInfo::getStyleNo,
                            com.fashion.supplychain.style.entity.StyleInfo::getCover)
                    .in(com.fashion.supplychain.style.entity.StyleInfo::getStyleNo, styleNos)
                    .eq(com.fashion.supplychain.style.entity.StyleInfo::getTenantId, tenantId)
                    .list()
                    .stream()
                    .filter(s -> StringUtils.hasText(s.getStyleNo()) && StringUtils.hasText(s.getCover()))
                    .collect(java.util.stream.Collectors.toMap(
                            com.fashion.supplychain.style.entity.StyleInfo::getStyleNo,
                            com.fashion.supplychain.style.entity.StyleInfo::getCover,
                            (v1, v2) -> v1));

            if (!styleNoToCover.isEmpty()) {
                for (Map<String, Object> item : taskList) {
                    String sn = TextUtils.safeText(item.get("styleNo"));
                    if (StringUtils.hasText(sn)) {
                        String cover = styleNoToCover.get(sn);
                        if (cover != null) {
                            item.put("coverImage", cover);
                            item.put("styleImage", cover);
                            item.put("styleCover", cover);
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.warn("[RepairTask] 注入款式图失败（不影响主流程）: styleNos={}, err={}", styleNos, e.getMessage());
        }
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
    // D-001 修复：移除 Helper 层 @Transactional（调用方 ProductWarehousingOrchestrator.markBundleRepaired 已有事务保护）
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
    // D-001 修复：移除 Helper 层 @Transactional（调用方 ProductWarehousingOrchestrator.startBundleRepair 已有事务保护）
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
     * 完成后通知该订单的跟单员 + 质检操作人
     */
    // D-001 修复：移除 Helper 层 @Transactional（调用方 ProductWarehousingOrchestrator.completeBundleRepair 已有事务保护）
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

        // 通知该订单的跟单员 + 质检操作人（fail-safe，失败不影响主流程）
        notifyRepairComplete(bundle);
    }

    /**
     * 返修完成通知：通知该订单跟单员 + 质检操作人
     * 通知失败降级为 log.warn，不抛异常。
     */
    private void notifyRepairComplete(CuttingBundle bundle) {
        try {
            if (bundle == null || bundle.getProductionOrderId() == null) return;
            Long tenantId = UserContext.tenantId();
            if (tenantId == null) return;

            // 查询订单，获取跟单员
            ProductionOrder order = productionOrderService.lambdaQuery()
                .select(ProductionOrder::getId, ProductionOrder::getOrderNo,
                        ProductionOrder::getMerchandiser, ProductionOrder::getFactoryContactPerson)
                .eq(ProductionOrder::getId, bundle.getProductionOrderId())
                .one();
            if (order == null) return;

            String orderNo = order.getOrderNo() == null
                ? (bundle.getProductionOrderNo() == null ? "" : String.valueOf(bundle.getProductionOrderNo()))
                : String.valueOf(order.getOrderNo());
            String bundleNo = bundle.getBundleNo() == null ? "" : String.valueOf(bundle.getBundleNo());
            String title = "返修完成待复检";
            String content = "订单 " + orderNo + " 菲号 " + bundleNo + " 已完成返修，请安排复检。";

            // 通知跟单员
            if (StringUtils.hasText(order.getMerchandiser())) {
                sendRepairNotice(tenantId, order.getMerchandiser(), orderNo, title, content);
            }
            // 通知工厂联系人（如与跟单员不同）
            if (StringUtils.hasText(order.getFactoryContactPerson())
                && !order.getFactoryContactPerson().equals(order.getMerchandiser())) {
                sendRepairNotice(tenantId, order.getFactoryContactPerson(), orderNo, title, content);
            }
        } catch (Exception e) {
            log.warn("[RepairNotify] 返修完成通知失败(降级): bundleId={}, error={}",
                bundle == null ? null : bundle.getId(), e.getMessage());
        }
    }

    /**
     * 发送返修站内信通知
     */
    private void sendRepairNotice(Long tenantId, String toName, String orderNo,
                                   String title, String content) {
        try {
            com.fashion.supplychain.production.entity.SysNotice notice = new com.fashion.supplychain.production.entity.SysNotice();
            notice.setTenantId(tenantId);
            notice.setToName(toName);
            notice.setFromName("返修系统");
            notice.setOrderNo(orderNo);
            notice.setTitle(title);
            notice.setContent(content);
            notice.setNoticeType("REPAIR_DONE");
            notice.setIsRead(0);
            notice.setHandlingStatus("none");
            notice.setCreatedAt(LocalDateTime.now());
            // 通过 Spring 上下文获取 SysNoticeService（避免循环依赖）
            com.fashion.supplychain.production.service.SysNoticeService noticeService =
                com.fashion.supplychain.common.SpringContextHolder.getBean(
                    com.fashion.supplychain.production.service.SysNoticeService.class);
            if (noticeService != null) {
                noticeService.save(notice);
                log.info("[RepairNotify] 通知已发送: tenant={}, to={}, order={}", tenantId, toName, orderNo);
            }
        } catch (Exception e) {
            log.warn("[RepairNotify] 站内信发送失败(降级): to={}, order={}, error={}", toName, orderNo, e.getMessage());
        }
    }

    /**
     * AI次品处理：标记菲号为报废
     */
    // D-001 修复：移除 Helper 层 @Transactional（调用方 ProductWarehousingOrchestrator.scrapBundle 已有事务保护）
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
                .gt(ProductWarehousing::getUnqualifiedQuantity, 0)
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
                        .gt(ProductWarehousing::getUnqualifiedQuantity, 0)
                        .eq(ProductWarehousing::getDeleteFlag, 0)
                        .orderByDesc(ProductWarehousing::getCreateTime)
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
