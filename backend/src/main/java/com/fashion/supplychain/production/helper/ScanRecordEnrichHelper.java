package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.ScanRecordService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.*;
import java.util.stream.Collectors;

/**
 * 扫码记录富化辅助类：床号填充、下一环节扫码标注。
 * 从 ScanRecordOrchestrator 拆分而来，降低编排器行数。
 */
@Component
@Slf4j
public class ScanRecordEnrichHelper {

    @Autowired
    private CuttingBundleService cuttingBundleService;

    @Autowired
    private ScanRecordService scanRecordService;

    /**
     * 批量填充床号：从 t_cutting_bundle 查询 bedNo 并写入扫码记录
     */
    public void enrichBedNo(List<ScanRecord> records) {
        if (records == null || records.isEmpty()) return;
        try {
            List<String> orderNos = records.stream()
                    .map(ScanRecord::getOrderNo)
                    .filter(StringUtils::hasText)
                    .map(String::trim)
                    .distinct()
                    .collect(Collectors.toList());
            if (orderNos.isEmpty()) {
                return;
            }
            Map<String, Integer> bedNoMap = cuttingBundleService.list(
                            new LambdaQueryWrapper<CuttingBundle>()
                                    .select(CuttingBundle::getProductionOrderNo, CuttingBundle::getBundleNo, CuttingBundle::getBedNo)
                                    .in(CuttingBundle::getProductionOrderNo, orderNos))
                    .stream()
                    .filter(b -> StringUtils.hasText(b.getProductionOrderNo()))
                    .filter(b -> b.getBundleNo() != null)
                    .filter(b -> b.getBedNo() != null)
                    .collect(Collectors.toMap(
                            b -> buildBedNoKey(b.getProductionOrderNo(), b.getBundleNo()),
                            CuttingBundle::getBedNo,
                            (a, b) -> a));
            records.forEach(r -> {
                if (StringUtils.hasText(r.getOrderNo()) && r.getCuttingBundleNo() != null) {
                    r.setBedNo(bedNoMap.get(buildBedNoKey(r.getOrderNo(), r.getCuttingBundleNo())));
                }
            });
        } catch (Exception e) {
            log.warn("Failed to enrich bedNo for scan records: recordCount={}", records.size(), e);
        }
    }

    public String buildBedNoKey(String orderNo, Integer bundleNo) {
        return (orderNo == null ? "" : orderNo.trim()) + "#" + bundleNo;
    }

    /**
     * 批量标注扫码记录的「下一生产环节是否已扫码」字段 (hasNextStageScan)
     * 原理：只查这批菲号在后继环节的扫码情况，避免 N+1 查询
     * cutting→production→quality→warehouse
     */
    public void markHasNextStageScan(List<ScanRecord> records) {
        if (records == null || records.isEmpty()) return;

        // 收集需要检查的 cuttingBundleId（只有有「下一环节」类型的材料才检查）
        Set<String> bundleIdsToCheck = new HashSet<>();
        for (ScanRecord r : records) {
            if (r.getCuttingBundleId() == null) continue;
            if (!"success".equalsIgnoreCase(r.getScanResult())) continue;
            if (getNextStageScanType(r.getScanType()) != null) {
                bundleIdsToCheck.add(r.getCuttingBundleId());
            }
        }
        if (bundleIdsToCheck.isEmpty()) return;

        // 批量查询：这些菲号在 production/quality/warehouse 三类中是否有 success 扫码
        List<ScanRecord> nextScans = scanRecordService.list(
                new LambdaQueryWrapper<ScanRecord>()
                        .in(ScanRecord::getCuttingBundleId, bundleIdsToCheck)
                        .in(ScanRecord::getScanType, Arrays.asList("production", "quality", "warehouse"))
                        .eq(ScanRecord::getScanResult, "success")
                        .select(ScanRecord::getCuttingBundleId, ScanRecord::getScanType));

        // 构建「被阻断的 bundleId:prevScanType」集合
        // 示例：发现 bundleX 有 quality 成功记录 → bundleX:production 被阻断
        final Map<String, String> prevStageType = new HashMap<>();
        prevStageType.put("production", "cutting");
        prevStageType.put("quality", "production");
        prevStageType.put("warehouse", "quality");

        Set<String> blockedKeys = new HashSet<>();
        for (ScanRecord ns : nextScans) {
            String prev = prevStageType.get(ns.getScanType());
            if (prev != null && ns.getCuttingBundleId() != null) {
                blockedKeys.add(ns.getCuttingBundleId() + ":" + prev);
            }
        }

        // 标注每条记录
        for (ScanRecord r : records) {
            if (r.getCuttingBundleId() != null && r.getScanType() != null) {
                String key = r.getCuttingBundleId() + ":" + r.getScanType();
                r.setHasNextStageScan(blockedKeys.contains(key));
            }
        }
    }

    /**
     * 返回下一生产环节的 scanType：cutting→production→quality→warehouse→null
     */
    public String getNextStageScanType(String currentScanType) {
        if (currentScanType == null || currentScanType.trim().isEmpty()) return null;
        switch (currentScanType.trim().toLowerCase()) {
            case "cutting":    return "production";
            case "production": return "quality";
            case "quality":    return "warehouse";
            default:           return null;
        }
    }
}
