package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.ProcessSynonymMapping;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.production.service.ProcessParentMappingService;
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
            "采购", "裁剪", "二次工艺", "车缝", "尾部", "入库");

    private static final Map<String, String> CHILD_TO_PARENT = new LinkedHashMap<>();
    static {
        CHILD_TO_PARENT.put("采购", "采购");
        CHILD_TO_PARENT.put("裁剪", "裁剪");
        CHILD_TO_PARENT.put("二次工艺", "二次工艺");
        CHILD_TO_PARENT.put("车缝", "车缝");
        CHILD_TO_PARENT.put("尾部", "尾部");
        CHILD_TO_PARENT.put("入库", "入库");
    }

    @Autowired
    private TemplateLibraryService templateLibraryService;

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private ProductionOrderScanRecordDomainService scanRecordDomainService;

    @Autowired
    private ProcessParentMappingService processParentMappingService;

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
            if (r >= 100) return true;
            if (order != null && order.getProcurementManuallyCompleted() != null
                    && order.getProcurementManuallyCompleted() == 1) return true;
            return false;
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
            if (n.equals(v)) {
                return n;
            }
        }
        if (ProcessSynonymMapping.isEquivalent("采购", v)) {
            return "采购";
        }
        if (ProcessSynonymMapping.isEquivalent("裁剪", v)) {
            return "裁剪";
        }
        if (ProcessSynonymMapping.isEquivalent("二次工艺", v)) {
            return "二次工艺";
        }
        if (ProcessSynonymMapping.isEquivalent("车缝", v)) {
            return "车缝";
        }
        if (ProcessSynonymMapping.isEquivalent("尾部", v)) {
            return "尾部";
        }
        if (ProcessSynonymMapping.isEquivalent("入库", v)) {
            return "入库";
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

        // ★ 修复(BUG-11): 节点扫码总量缓存（按需懒加载，同一次识别对同一节点只查一次DB）
        // 解决：productionProgress 指向已完成节点（如裁剪已完成但%未更新）时，
        // isAutoSkippableStageName 只处理采购，无法跳过已完成的裁剪/生产节点，
        // 导致工人扫菲号反复被识别到已完成节点，提示"已完成该节点"
        int orderQtyForNodeCheck = order.getOrderQuantity() == null ? 0 : order.getOrderQuantity();
        Map<String, Long> nodeQtyCache = new java.util.HashMap<>();

        // 向后查找第一个未跳过的工序
        String autoResult = null;
        for (int i = idx; i < nodes.size(); i++) {
            String pnRaw = nodes.get(i) == null ? "" : nodes.get(i).trim();
            if (!hasText(pnRaw)) {
                continue;
            }
            String pn = normalizeFixedProductionNodeName(pnRaw);
            if (pn == null) {
                pn = pnRaw;
            }
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
            // ★ 修复(BUG-11): 节点扫码量已达订单量则跳过（如裁剪已全部完成，不再识别到裁剪）
            if (orderQtyForNodeCheck > 0) {
                long sq = nodeQtyCache.computeIfAbsent(pn, k -> sumScanQtyForParent(order, k));
                if (sq >= orderQtyForNodeCheck) {
                    continue;
                }
            }
            autoResult = pn;
            break;
        }

        // 关键校验：自动识别结果不能跳过未完成的前置父节点
        // 例如：裁剪还没有任何扫码记录，不应直接识别到二次工艺/车缝
        if (autoResult != null) {
            String resolvedParent = resolveParentForAutoCheck(autoResult);
            int resultIdx = indexOfFixedNode(resolvedParent);
            if (resultIdx > 1) {
                boolean hasCuttingRecord = hasAnyScanRecordForParent(order, "裁剪");
                if (!hasCuttingRecord) {
                    log.warn("自动识别跳过裁剪: orderNo={}, autoResult={}, 回退到裁剪", order.getOrderNo(), autoResult);
                    String cuttingProcess = findFirstProcessUnderParent(nodes, order, "裁剪");
                    if (hasText(cuttingProcess)) {
                        return cuttingProcess;
                    }
                    return "裁剪";
                }
            }
        }

        if (autoResult != null) {
            return autoResult;
        }

        // 向前查找未完成的工序
        for (int i = idx; i >= 0; i--) {
            String pnRaw = nodes.get(i) == null ? "" : nodes.get(i).trim();
            if (!hasText(pnRaw)) {
                continue;
            }
            String pn = normalizeFixedProductionNodeName(pnRaw);
            if (pn == null) {
                pn = pnRaw;
            }
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
                if (r >= 100
                        || (order.getProcurementManuallyCompleted() != null
                            && order.getProcurementManuallyCompleted() == 1)) {
                    continue;
                }
            }
            // ★ 修复(BUG-11): 向前兜底路径同样跳过已完成节点
            if (orderQtyForNodeCheck > 0) {
                long sq = nodeQtyCache.computeIfAbsent(pn, k -> sumScanQtyForParent(order, k));
                if (sq >= orderQtyForNodeCheck) {
                    continue;
                }
            }
            return pn;
        }

        // 订单数量校验：订单数量异常为 0 时不应进行扫码
        int orderQty = order.getOrderQuantity() == null ? 0 : order.getOrderQuantity();
        if (orderQty <= 0) {
            // 历史 bug：此处曾返回第一个可用节点（如裁剪/车缝），导致 autoProcess 识别错误。
            // 订单数量=0 是数据异常，应直接中断让业务人员修正数据。
            log.warn("订单[{}]的订单数量异常为 {}，无法自动识别工序", order.getOrderNo(), orderQty);
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

    private String resolveParentForAutoCheck(String processName) {
        String normalized = normalizeFixedProductionNodeName(processName);
        if (hasText(normalized)) {
            for (String n : FIXED_PRODUCTION_NODES) {
                if (n.equals(normalized)) return n;
            }
        }
        String mapped = processParentMappingService.resolveParentNode(processName);
        if (hasText(mapped)) {
            String normalizedMapped = normalizeFixedProductionNodeName(mapped);
            if (hasText(normalizedMapped)) return normalizedMapped;
            return mapped;
        }
        return processName;
    }

    private int indexOfFixedNode(String name) {
        if (!hasText(name)) return -1;
        for (int i = 0; i < FIXED_PRODUCTION_NODES.size(); i++) {
            if (FIXED_PRODUCTION_NODES.get(i).equals(name)) return i;
        }
        return -1;
    }

    private boolean hasAnyScanRecordForParent(ProductionOrder order, String parentName) {
        if (order == null || !hasText(order.getId())) return false;
        try {
            long count = scanRecordService.count(new LambdaQueryWrapper<ScanRecord>()
                    .eq(ScanRecord::getOrderId, order.getId().trim())
                    .in(ScanRecord::getScanType, Arrays.asList("production", "cutting"))
                    .eq(ScanRecord::getScanResult, "success")
                    .and(w -> w.eq(ScanRecord::getProgressStage, parentName)
                            .or(o -> o.isNull(ScanRecord::getProgressStage)
                                    .eq(ScanRecord::getProcessName, parentName)))
                    .gt(ScanRecord::getQuantity, 0));
            return count > 0;
        } catch (Exception e) {
            log.warn("检查父节点扫码记录失败: orderNo={}, parent={}", order.getOrderNo(), parentName, e);
            return false;
        }
    }

    /**
     * 统计指定父节点在该订单的成功扫码总量（含子工序记录）
     * BUG-11修复：totalQty >= orderQty 则视为该节点已全部完成，可跳过
     */
    private long sumScanQtyForParent(ProductionOrder order, String parentName) {
        if (order == null || !hasText(order.getId())) return 0L;
        try {
            List<ScanRecord> records = scanRecordService.list(new LambdaQueryWrapper<ScanRecord>()
                    .select(ScanRecord::getQuantity)
                    .eq(ScanRecord::getOrderId, order.getId().trim())
                    .in(ScanRecord::getScanType, Arrays.asList("production", "cutting"))
                    .eq(ScanRecord::getScanResult, "success")
                    .and(w -> w.eq(ScanRecord::getProgressStage, parentName)
                            .or(o2 -> o2.isNull(ScanRecord::getProgressStage)
                                    .eq(ScanRecord::getProcessName, parentName)))
                    .gt(ScanRecord::getQuantity, 0));
            if (records == null) return 0L;
            return records.stream()
                    .mapToLong(r -> r.getQuantity() == null ? 0L : r.getQuantity())
                    .sum();
        } catch (Exception e) {
            log.warn("查询父节点扫码总量失败: orderNo={}, parent={}", order.getOrderNo(), parentName, e);
            return 0L;
        }
    }

    private String findFirstProcessUnderParent(List<String> nodes, ProductionOrder order, String parentName) {
        try {
            List<Map<String, Object>> templateNodes = templateLibraryService.resolveProgressNodeUnitPrices(order.getStyleNo());
            if (templateNodes != null) {
                for (Map<String, Object> node : templateNodes) {
                    String pStage = node.get("progressStage") == null ? "" : String.valueOf(node.get("progressStage")).trim();
                    String pName = node.get("name") == null ? "" : String.valueOf(node.get("name")).trim();
                    String normalized = normalizeFixedProductionNodeName(pStage);
                    if (parentName.equals(normalized) && hasText(pName)) {
                        return pName;
                    }
                }
            }
        } catch (Exception e) {
            log.warn("查找父节点子工序失败: parent={}", parentName, e);
        }
        for (String n : nodes) {
            String normalized = normalizeFixedProductionNodeName(n);
            if (parentName.equals(normalized)) return n;
        }
        return null;
    }
}
