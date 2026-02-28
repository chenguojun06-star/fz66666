package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.finance.entity.MaterialReconciliation;
import com.fashion.supplychain.finance.entity.ShipmentReconciliation;
import com.fashion.supplychain.finance.service.MaterialReconciliationService;
import com.fashion.supplychain.finance.service.ShipmentReconciliationService;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.CuttingTask;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.CuttingBundleMapper;
import com.fashion.supplychain.production.mapper.MaterialPurchaseMapper;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.production.service.CuttingTaskService;
import com.fashion.supplychain.production.service.ProductOutstockService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import com.fashion.supplychain.style.entity.StyleQuotation;
import com.fashion.supplychain.style.mapper.StyleQuotationMapper;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
@Slf4j
public class ProductionOrderFlowOrchestrationService {

    public static class OrderFlowResponse {
        private final ProductionOrder order;
        private final List<Map<String, Object>> stages;
        private final List<ScanRecord> records;
        private final List<MaterialPurchase> materialPurchases;
        private final List<CuttingTask> cuttingTasks;
        private final List<CuttingBundle> cuttingBundles;
        private final List<ProductWarehousing> warehousings;
        private final List<ProductOutstock> outstocks;
        private final List<ShipmentReconciliation> shipmentReconciliations;
        private final List<MaterialReconciliation> materialReconciliations;
        private final StyleQuotation styleQuotation;

        public OrderFlowResponse(
                ProductionOrder order,
                List<Map<String, Object>> stages,
                List<ScanRecord> records,
                List<MaterialPurchase> materialPurchases,
                List<CuttingTask> cuttingTasks,
                List<CuttingBundle> cuttingBundles,
                List<ProductWarehousing> warehousings,
                List<ProductOutstock> outstocks,
                List<ShipmentReconciliation> shipmentReconciliations,
                List<MaterialReconciliation> materialReconciliations,
                StyleQuotation styleQuotation) {
            this.order = order;
            this.stages = stages;
            this.records = records;
            this.materialPurchases = materialPurchases;
            this.cuttingTasks = cuttingTasks;
            this.cuttingBundles = cuttingBundles;
            this.warehousings = warehousings;
            this.outstocks = outstocks;
            this.shipmentReconciliations = shipmentReconciliations;
            this.materialReconciliations = materialReconciliations;
            this.styleQuotation = styleQuotation;
        }

        public ProductionOrder getOrder() {
            return order;
        }

        public List<Map<String, Object>> getStages() {
            return stages;
        }

        public List<ScanRecord> getRecords() {
            return records;
        }

        public List<MaterialPurchase> getMaterialPurchases() {
            return materialPurchases;
        }

        public List<CuttingTask> getCuttingTasks() {
            return cuttingTasks;
        }

        public List<CuttingBundle> getCuttingBundles() {
            return cuttingBundles;
        }

        public List<ProductWarehousing> getWarehousings() {
            return warehousings;
        }

        public List<ProductOutstock> getOutstocks() {
            return outstocks;
        }

        public List<ShipmentReconciliation> getShipmentReconciliations() {
            return shipmentReconciliations;
        }

        public List<MaterialReconciliation> getMaterialReconciliations() {
            return materialReconciliations;
        }

        public StyleQuotation getStyleQuotation() {
            return styleQuotation;
        }
    }

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ScanRecordMapper scanRecordMapper;

    @Autowired
    private MaterialPurchaseMapper materialPurchaseMapper;

    @Autowired
    private CuttingTaskService cuttingTaskService;

    @Autowired
    private CuttingBundleMapper cuttingBundleMapper;

    @Autowired
    private ProductWarehousingService productWarehousingService;

    @Autowired
    private ProductOutstockService productOutstockService;

    @Autowired
    private ShipmentReconciliationService shipmentReconciliationService;

    @Autowired
    private MaterialReconciliationService materialReconciliationService;

    @Autowired
    private TemplateLibraryService templateLibraryService;

    @Autowired
    private StyleQuotationMapper styleQuotationMapper;

    @Autowired(required = false)
    private JdbcTemplate jdbcTemplate;

    /**
     * 批量查询用户真实显示名（优先 name，回退 username）
     * 用于在 Flow 展示时将 operatorId 映射到当前最新姓名，解决历史记录显示 "system" 等问题
     */
    private Map<String, String> batchLookupUserDisplayNames(Set<String> userIds) {
        Map<String, String> result = new HashMap<>();
        if (userIds == null || userIds.isEmpty() || jdbcTemplate == null) {
            return result;
        }
        try {
            List<Long> ids = new ArrayList<>();
            for (String uid : userIds) {
                if (!StringUtils.hasText(uid)) continue;
                try { ids.add(Long.parseLong(uid.trim())); } catch (NumberFormatException ignored) {}
            }
            if (ids.isEmpty()) return result;
            String placeholders = ids.stream().map(x -> "?").collect(java.util.stream.Collectors.joining(","));
            String sql = "SELECT id, name, username FROM t_user WHERE id IN (" + placeholders + ")";
            jdbcTemplate.query(sql, rs -> {
                String uid = String.valueOf(rs.getLong("id"));
                String name = rs.getString("name");
                String username = rs.getString("username");
                String displayName = StringUtils.hasText(name) ? name : username;
                if (StringUtils.hasText(displayName)) {
                    result.put(uid, displayName);
                }
            }, ids.toArray());
        } catch (Exception e) {
            log.warn("[OrderFlow] 批量查询用户名失败: {}", e.getMessage());
        }
        return result;
    }

    /** 用真实姓名替换 row 中的 operatorName 字段 */
    private void enrichOperatorName(Map<String, Object> row, String idKey, String nameKey,
            Map<String, String> userNames) {
        Object idObj = row.get(idKey);
        if (idObj == null) return;
        String uid = String.valueOf(idObj).trim();
        String realName = userNames.get(uid);
        if (StringUtils.hasText(realName)) {
            row.put(nameKey, realName);
        }
    }

    public OrderFlowResponse getOrderFlow(String orderId) {
        String oid = StringUtils.hasText(orderId) ? orderId.trim() : null;
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("参数错误");
        }

        ProductionOrder order = productionOrderService.getDetailById(oid);
        if (order == null) {
            throw new NoSuchElementException("生产订单不存在");
        }

        List<ScanRecord> records = scanRecordMapper.selectList(new LambdaQueryWrapper<ScanRecord>()
                .eq(ScanRecord::getOrderId, oid)
                .orderByAsc(ScanRecord::getScanTime)
                .orderByAsc(ScanRecord::getCreateTime));

        List<Map<String, Object>> stages = buildProductionStageFlow(order, records);

        // ─── 批量查 DB 将所有 operatorId 替换为用户当前真实显示名 ───────────────────
        try {
            Set<String> operatorIds = new HashSet<>();
            for (Map<String, Object> row : stages) {
                Object sid = row.get("startOperatorId");
                Object cid = row.get("completeOperatorId");
                Object lid = row.get("lastOperatorId");
                if (sid != null && StringUtils.hasText(String.valueOf(sid))) operatorIds.add(String.valueOf(sid).trim());
                if (cid != null && StringUtils.hasText(String.valueOf(cid))) operatorIds.add(String.valueOf(cid).trim());
                if (lid != null && StringUtils.hasText(String.valueOf(lid))) operatorIds.add(String.valueOf(lid).trim());
            }
            if (order.getCreatedById() != null) operatorIds.add(order.getCreatedById().trim());

            if (!operatorIds.isEmpty()) {
                Map<String, String> userNames = batchLookupUserDisplayNames(operatorIds);
                for (Map<String, Object> row : stages) {
                    enrichOperatorName(row, "startOperatorId", "startOperatorName", userNames);
                    enrichOperatorName(row, "completeOperatorId", "completeOperatorName", userNames);
                    enrichOperatorName(row, "lastOperatorId", "lastOperatorName", userNames);
                }
            }
        } catch (Exception e) {
            log.warn("[OrderFlow] 操作人名称补全失败，使用原始值: {}", e.getMessage());
        }
        // ─────────────────────────────────────────────────────────────────────────

        List<MaterialPurchase> materialPurchases = materialPurchaseMapper
                .selectList(new LambdaQueryWrapper<MaterialPurchase>()
                        .eq(MaterialPurchase::getOrderId, oid)
                        .eq(MaterialPurchase::getDeleteFlag, 0)
                        .orderByDesc(MaterialPurchase::getCreateTime));

        // 批量查 DB 补全采购记录中的 creatorName/updaterName
        try {
            Set<String> purchaseUserIds = new HashSet<>();
            for (MaterialPurchase mp : materialPurchases) {
                if (StringUtils.hasText(mp.getCreatorId())) purchaseUserIds.add(mp.getCreatorId().trim());
            }
            if (!purchaseUserIds.isEmpty()) {
                Map<String, String> purchaseNames = batchLookupUserDisplayNames(purchaseUserIds);
                for (MaterialPurchase mp : materialPurchases) {
                    if (StringUtils.hasText(mp.getCreatorId())) {
                        String realName = purchaseNames.get(mp.getCreatorId().trim());
                        if (StringUtils.hasText(realName)) {
                            mp.setCreatorName(realName);
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.warn("[OrderFlow] 采购操作人名称补全失败: {}", e.getMessage());
        }

        List<CuttingTask> cuttingTasks = cuttingTaskService.list(new LambdaQueryWrapper<CuttingTask>()
                .eq(CuttingTask::getProductionOrderId, oid)
                .orderByDesc(CuttingTask::getCreateTime));

        List<CuttingBundle> cuttingBundles = cuttingBundleMapper.selectList(new LambdaQueryWrapper<CuttingBundle>()
                .eq(CuttingBundle::getProductionOrderId, oid)
                .orderByAsc(CuttingBundle::getBundleNo)
                .orderByAsc(CuttingBundle::getCreateTime));

        List<ProductWarehousing> warehousings = productWarehousingService
                .list(new LambdaQueryWrapper<ProductWarehousing>()
                        .eq(ProductWarehousing::getOrderId, oid)
                        .eq(ProductWarehousing::getDeleteFlag, 0)
                        .orderByDesc(ProductWarehousing::getCreateTime));

        List<ProductOutstock> outstocks = productOutstockService.list(new LambdaQueryWrapper<ProductOutstock>()
                .eq(ProductOutstock::getOrderId, oid)
                .eq(ProductOutstock::getDeleteFlag, 0)
                .orderByDesc(ProductOutstock::getCreateTime));

        List<ShipmentReconciliation> shipmentReconciliations = shipmentReconciliationService.lambdaQuery()
                .eq(ShipmentReconciliation::getOrderId, oid)
                .orderByDesc(ShipmentReconciliation::getCreateTime)
                .list();

        List<MaterialReconciliation> materialReconciliations = materialReconciliationService.lambdaQuery()
                .eq(MaterialReconciliation::getOrderId, oid)
                .eq(MaterialReconciliation::getDeleteFlag, 0)
                .orderByDesc(MaterialReconciliation::getCreateTime)
                .list();

        // 查询款号报价单
        StyleQuotation styleQuotation = null;
        if (order.getStyleId() != null) {
            try {
                styleQuotation = styleQuotationMapper.selectOne(
                    new LambdaQueryWrapper<StyleQuotation>()
                        .eq(StyleQuotation::getStyleId, Long.valueOf(order.getStyleId()))
                );
            } catch (Exception e) {
                log.warn("Failed to load style quotation: orderId={}, styleId={}", oid, order.getStyleId(), e);
            }
        }

        return new OrderFlowResponse(
                order,
                stages,
                records,
                materialPurchases,
                cuttingTasks,
                cuttingBundles,
                warehousings,
                outstocks,
                shipmentReconciliations,
                materialReconciliations,
                styleQuotation);
    }

    private List<Map<String, Object>> buildProductionStageFlow(ProductionOrder order, List<ScanRecord> records) {
        if (order == null) {
            return new ArrayList<>();
        }

        int orderQty = order.getOrderQuantity() == null ? 0 : order.getOrderQuantity();

        List<String> processOrder = new ArrayList<>();
        try {
            templateLibraryService.loadProgressWeights(order.getStyleNo(), new LinkedHashMap<>(), processOrder);
        } catch (Exception e) {
            log.warn("Failed to load progress weights from template: orderId={}, styleNo={}", order.getId(),
                    order.getStyleNo(), e);
        }

        // ---------- 分组：严格用 progressStage 作 key（保留原始语义）----------
        // 不做任何"降级到子工序名"操作，因为 progressStageNameMatches 的 contains
        // 语义会导致不同工序内容被错误地归并在一起。
        // 过滤父分类行（不在 processOrder 中的 key）在下面的输出循环里处理。
        Map<String, List<ScanRecord>> byProcess = new LinkedHashMap<>();
        if (records != null) {
            for (ScanRecord r : records) {
                if (r == null) {
                    continue;
                }
                if (!"success".equals(r.getScanResult())) {
                    continue;
                }
                String pn = r.getProgressStage() == null ? "" : r.getProgressStage().trim();
                if (!StringUtils.hasText(pn)) {
                    pn = r.getProcessName() == null ? "" : r.getProcessName().trim();
                }
                String pc = r.getProcessCode() == null ? "" : r.getProcessCode().trim();
                if ("quality_warehousing".equals(pc)) {
                    pn = "质检";
                }
                if (!StringUtils.hasText(pn)) {
                    continue;
                }
                byProcess.computeIfAbsent(pn, k -> new ArrayList<>()).add(r);
            }
        }

        List<Map<String, Object>> result = new ArrayList<>();
        // processes = 模板节点顺序；若无模板则保留扫码记录中出现的所有 key
        List<String> processes = processOrder.isEmpty() ? new ArrayList<>(byProcess.keySet())
                : new ArrayList<>(processOrder);
        if (!processOrder.isEmpty()) {
            // 追加扫码记录中有、但模板里可以匹配到的别名 key（用于后续 list 收集）
            // 不追加完全不在模板里的父分类 key（如"尾部"/"二次工艺"），避免乱入行
            for (String pn : byProcess.keySet()) {
                if (!StringUtils.hasText(pn)) {
                    continue;
                }
                boolean matched = false;
                for (String tpl : processes) {
                    if (templateLibraryService.progressStageNameMatches(tpl, pn)) {
                        matched = true;
                        break;
                    }
                }
                // 仅当能匹配到模板节点时才可能需要追加（实际上模板节点已在 processes 里，
                // 不匹配的父分类直接跳过，不追加）
                if (!matched) {
                    // 父分类（不在模板里）—— 直接丢弃，不追加到 processes
                    // 其扫码数据已在 byProcess 里，会在下面 list 收集时被同义词匹配捞到
                }
            }
        }

        for (String name : processes) {
            String pn = name == null ? "" : name.trim();
            if (!StringUtils.hasText(pn)) {
                continue;
            }

            List<ScanRecord> list = new ArrayList<>();
            for (Map.Entry<String, List<ScanRecord>> e : byProcess.entrySet()) {
                if (e == null) {
                    continue;
                }
                String k = e.getKey();
                if (!templateLibraryService.progressStageNameMatches(pn, k)) {
                    continue;
                }
                List<ScanRecord> v = e.getValue();
                if (v != null && !v.isEmpty()) {
                    list.addAll(v);
                }
            }
            list.sort((a, b) -> {
                LocalDateTime ta = a == null ? null : a.getScanTime();
                LocalDateTime tb = b == null ? null : b.getScanTime();
                if (ta == null && tb == null) {
                    return 0;
                }
                if (ta == null) {
                    return -1;
                }
                if (tb == null) {
                    return 1;
                }
                return ta.compareTo(tb);
            });

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("processName", pn);

            // ─── 【下单】环节：直接取 order 创建人信息，不依赖 scan record ──────
            if (templateLibraryService.progressStageNameMatches("下单", pn)) {
                row.put("status", "completed");
                row.put("totalQuantity", orderQty);
                row.put("startTime", order.getCreateTime());
                row.put("completeTime", order.getCreateTime());
                String creatorId = order.getCreatedById() != null ? String.valueOf(order.getCreatedById()) : null;
                String creatorName = StringUtils.hasText(order.getCreatedByName()) ? order.getCreatedByName() : null;
                row.put("startOperatorId", creatorId);
                row.put("startOperatorName", creatorName);
                row.put("completeOperatorId", creatorId);
                row.put("completeOperatorName", creatorName);
                result.add(row);
                continue;
            }
            // ──────────────────────────────────────────────────────────────────────

            if (list.isEmpty()) {
                row.put("status", "not_started");
                row.put("totalQuantity", 0);
                result.add(row);
                continue;
            }

            ScanRecord first = list.get(0);
            ScanRecord last = list.get(list.size() - 1);

            row.put("startTime", first == null ? null : first.getScanTime());
            row.put("startOperatorId", first == null ? null : first.getOperatorId());
            row.put("startOperatorName", first == null ? null : first.getOperatorName());

            long sum = 0;
            LocalDateTime doneTime = null;
            String doneOpId = null;
            String doneOpName = null;
            Map<String, Integer> maxByBundle = new HashMap<>();
            for (ScanRecord r : list) {
                if (r == null) {
                    continue;
                }
                int q = r.getQuantity() == null ? 0 : r.getQuantity();
                if (q <= 0) {
                    continue;
                }
                String bundleId = r.getCuttingBundleId() == null ? null : r.getCuttingBundleId().trim();
                if (StringUtils.hasText(bundleId)) {
                    int prev = maxByBundle.getOrDefault(bundleId, 0);
                    int next = Math.max(prev, q);
                    int delta = Math.max(0, next - prev);
                    if (delta > 0) {
                        sum += delta;
                        maxByBundle.put(bundleId, next);
                    }
                } else {
                    sum += q;
                }
                if (orderQty > 0 && doneTime == null && sum >= orderQty) {
                    doneTime = r.getScanTime();
                    doneOpId = r.getOperatorId();
                    doneOpName = r.getOperatorName();
                    break;
                }
            }

            row.put("totalQuantity", (int) Math.min((long) Integer.MAX_VALUE, Math.max(0L, sum)));

            if (doneTime != null) {
                row.put("completeTime", doneTime);
                row.put("completeOperatorId", doneOpId);
                row.put("completeOperatorName", doneOpName);
                row.put("status", "completed");
            } else {
                row.put("completeTime", null);
                row.put("completeOperatorId", null);
                row.put("completeOperatorName", null);
                row.put("status", "in_progress");
                row.put("lastTime", last == null ? null : last.getScanTime());
                row.put("lastOperatorId", last == null ? null : last.getOperatorId());
                row.put("lastOperatorName", last == null ? null : last.getOperatorName());
            }

            result.add(row);
        }

        return result;
    }
}
