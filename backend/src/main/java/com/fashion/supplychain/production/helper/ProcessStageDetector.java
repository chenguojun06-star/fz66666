package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 工序阶段检测器
 * 职责：
 * 1. 自动识别当前工序阶段
 * 2. 判断工序是否可跳过
 * 3. 标准化工序名称
 *
 * 提取自 ScanRecordOrchestrator（减少约400行代码）
 */
@Component
@Slf4j
public class ProcessStageDetector {

    private static final List<String> FIXED_PRODUCTION_NODES = Arrays.asList(
            "采购", "裁剪", "车缝", "大烫", "质检", "二次工艺", "包装", "入库");

    @Autowired
    private TemplateLibraryService templateLibraryService;

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private ProductionOrderScanRecordDomainService scanRecordDomainService;

    /**
     * 判断工序是否可自动跳过
     */
    public boolean isAutoSkippableStageName(ProductionOrder order, String processName) {
        String pn = hasText(processName) ? processName.trim() : null;
        if (!hasText(pn)) {
            return true;
        }
        if (templateLibraryService.progressStageNameMatches(
                ProductionOrderScanRecordDomainService.STAGE_ORDER_CREATED, pn)) {
            return true;
        }
        if (templateLibraryService.progressStageNameMatches(
                ProductionOrderScanRecordDomainService.STAGE_PROCUREMENT, pn)) {
            int r = order == null || order.getMaterialArrivalRate() == null ? 0 : order.getMaterialArrivalRate();
            if (r < 0) r = 0;
            if (r > 100) r = 100;
            return r >= 100;
        }
        return false;
    }

    /**
     * 标准化固定工序节点名称
     */
    public String normalizeFixedProductionNodeName(String raw) {
        String v = hasText(raw) ? raw.trim() : null;
        if (!hasText(v)) {
            return null;
        }
        for (String n : FIXED_PRODUCTION_NODES) {
            if (!hasText(n)) {
                continue;
            }
            if (n.equals(v) || templateLibraryService.progressStageNameMatches(n, v)) {
                return n;
            }
        }
        return null;
    }

    /**
     * 自动识别当前应该进行的工序阶段
     * 核心逻辑：
     * 1. 根据订单进度和模板节点识别
     * 2. 跳过已完成的工序
     * 3. 返回下一个待处理工序
     */
    public String resolveAutoProcessName(ProductionOrder order) {
        if (order == null || !hasText(order.getId())) {
            return null;
        }

        List<String> nodes = templateLibraryService.resolveProgressNodes(order.getStyleNo());
        if (nodes == null || nodes.isEmpty()) {
            return null;
        }

        // 根据生产进度确定起始节点
        int progress = order.getProductionProgress() == null ? 0 : order.getProductionProgress();
        if (progress < 0) progress = 0;
        if (progress > 100) progress = 100;

        int idx = -1;
        try {
            idx = scanRecordDomainService.getNodeIndexFromProgress(nodes.size(), progress);
        } catch (Exception e) {
            idx = -1;
        }
        if (idx < 0) idx = 0;
        if (idx >= nodes.size()) idx = nodes.size() - 1;

        // 向后查找第一个未跳过的工序
        for (int i = idx; i < nodes.size(); i++) {
            String pnRaw = nodes.get(i) == null ? "" : nodes.get(i).trim();
            if (!hasText(pnRaw)) {
                continue;
            }
            String pn = normalizeFixedProductionNodeName(pnRaw);
            if (!hasText(pn)) {
                continue;
            }
            if (templateLibraryService.isProgressQualityStageName(pnRaw)
                    || templateLibraryService.isProgressQualityStageName(pn)) {
                continue;
            }
            if (isAutoSkippableStageName(order, pn)) {
                continue;
            }
            return pn;
        }

        // 向前查找未完成的工序
        for (int i = idx; i >= 0; i--) {
            String pnRaw = nodes.get(i) == null ? "" : nodes.get(i).trim();
            if (!hasText(pnRaw)) {
                continue;
            }
            String pn = normalizeFixedProductionNodeName(pnRaw);
            if (!hasText(pn)) {
                continue;
            }
            if (templateLibraryService.isProgressQualityStageName(pnRaw)
                    || templateLibraryService.isProgressQualityStageName(pn)) {
                continue;
            }
            if (templateLibraryService.progressStageNameMatches(
                    ProductionOrderScanRecordDomainService.STAGE_ORDER_CREATED, pnRaw)) {
                continue;
            }
            if (templateLibraryService.progressStageNameMatches(
                    ProductionOrderScanRecordDomainService.STAGE_PROCUREMENT, pnRaw)) {
                int r = order.getMaterialArrivalRate() == null ? 0 : order.getMaterialArrivalRate();
                if (r < 0) r = 0;
                if (r > 100) r = 100;
                if (r >= 100) {
                    continue;
                }
            }
            return pn;
        }

        // 订单数量校验
        int orderQty = order.getOrderQuantity() == null ? 0 : order.getOrderQuantity();
        if (orderQty <= 0) {
            for (String n : nodes) {
                String pnRaw = n == null ? "" : n.trim();
                if (!hasText(pnRaw)) {
                    continue;
                }
                String pn = normalizeFixedProductionNodeName(pnRaw);
                if (hasText(pn)
                        && !isAutoSkippableStageName(order, pn)
                        && !templateLibraryService.isProgressQualityStageName(pnRaw)
                        && !templateLibraryService.isProgressQualityStageName(pn)) {
                    return pn;
                }
            }
            return null;
        }

        // 查询已完成的扫码记录，分析已完成数量
        List<ScanRecord> records;
        try {
            records = scanRecordService.list(new LambdaQueryWrapper<ScanRecord>()
                    .select(ScanRecord::getProgressStage, ScanRecord::getProcessName, ScanRecord::getQuantity,
                            ScanRecord::getScanType, ScanRecord::getScanResult, ScanRecord::getProcessCode,
                            ScanRecord::getCuttingBundleId)
                    .eq(ScanRecord::getOrderId, order.getId().trim())
                    .in(ScanRecord::getScanType, Arrays.asList("production", "cutting"))
                    .eq(ScanRecord::getScanResult, "success")
                    .gt(ScanRecord::getQuantity, 0));
        } catch (Exception e) {
            return null;
        }

        // 统计各工序已完成数量（按菲号去重）
        LinkedHashMap<String, Map<String, Integer>> doneByStageBundle = new LinkedHashMap<>();
        LinkedHashMap<String, Long> done = new LinkedHashMap<>();

        if (records != null) {
            for (ScanRecord r : records) {
                if (r == null) continue;

                String pn = r.getProgressStage() == null ? "" : r.getProgressStage().trim();
                if (!hasText(pn)) {
                    pn = r.getProcessName() == null ? "" : r.getProcessName().trim();
                }
                if (!hasText(pn)) continue;
                if (isAutoSkippableStageName(order, pn)) continue;

                String pc = r.getProcessCode() == null ? "" : r.getProcessCode().trim();
                if ("quality_warehousing".equals(pc) || templateLibraryService.isProgressQualityStageName(pn)) {
                    continue;
                }

                int q = r.getQuantity() == null ? 0 : r.getQuantity();
                if (q <= 0) continue;

                String bid = r.getCuttingBundleId() == null ? null : r.getCuttingBundleId().trim();
                if (hasText(bid)) {
                    Map<String, Integer> byBundle = doneByStageBundle.computeIfAbsent(pn,
                            k -> new LinkedHashMap<>());
                    Integer existed = byBundle.get(bid);
                    int next = existed == null ? q : Math.max(existed, q);
                    byBundle.put(bid, next);
                } else {
                    done.put(pn, done.getOrDefault(pn, 0L) + q);
                }
            }
        }

        // 合并菲号统计
        if (!doneByStageBundle.isEmpty()) {
            for (Map.Entry<String, Map<String, Integer>> e : doneByStageBundle.entrySet()) {
                if (e == null) continue;
                String k = e.getKey();
                if (!hasText(k)) continue;

                long sum = 0L;
                Map<String, Integer> byBundle = e.getValue();
                if (byBundle != null) {
                    for (Integer v : byBundle.values()) {
                        int q = v == null ? 0 : v;
                        if (q > 0) sum += q;
                    }
                }
                if (sum > 0) {
                    done.put(k, done.getOrDefault(k, 0L) + sum);
                }
            }
        }

        // 查找第一个未完成的工序
        String lastCandidate = null;
        for (String n : nodes) {
            String pn = n == null ? "" : n.trim();
            if (!hasText(pn)) continue;
            if (isAutoSkippableStageName(order, pn)) continue;
            if (templateLibraryService.isProgressQualityStageName(pn)) continue;

            lastCandidate = pn;
            long v = done.getOrDefault(pn, 0L);
            if (v < orderQty) {
                return pn;
            }
        }
        return lastCandidate;
    }

    private boolean hasText(String str) {
        return StringUtils.hasText(str);
    }
}
