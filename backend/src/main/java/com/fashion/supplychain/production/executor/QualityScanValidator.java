package com.fashion.supplychain.production.executor;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.template.service.TemplateLibraryService;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@Slf4j
public class QualityScanValidator {

    @Autowired
    private ProductWarehousingService productWarehousingService;

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private TemplateLibraryService templateLibraryService;

    @Autowired
    private ProductionScanStageSupport stageSupport;

    public void validateNotAlreadyQualityCheckedByPc(String orderId, String bundleId) {
        if (!hasText(orderId) || !hasText(bundleId)) {
            return;
        }
        try {
            long pcQualifiedCount = productWarehousingService.count(
                    new LambdaQueryWrapper<ProductWarehousing>()
                            .eq(ProductWarehousing::getOrderId, orderId)
                            .eq(ProductWarehousing::getCuttingBundleId, bundleId)
                            .eq(ProductWarehousing::getDeleteFlag, 0)
                            .in(ProductWarehousing::getWarehousingType, "manual", "scan")
                            .eq(ProductWarehousing::getQualityStatus, "qualified"));
            if (pcQualifiedCount > 0) {
                throw new IllegalStateException("该菲号已在PC端完成质检入库，手机端不能再做质检，请直接扫码入库");
            }
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            log.warn("检查PC端质检状态失败: orderId={}, bundleId={}", orderId, bundleId, e);
        }
    }

    public void validateProductionPrerequisite(ProductionOrder order, CuttingBundle bundle) {
        if (order == null || bundle == null || !hasText(order.getId()) || !hasText(bundle.getId())) {
            return;
        }
        String orderId = order.getId();
        String bundleId = bundle.getId();
        try {
            List<String> sewingSubProcesses = resolveSewingSubProcesses(order.getStyleNo());

            if (sewingSubProcesses.isEmpty()) {
                validateAtLeastOneProductionRecord(orderId, bundleId);
                stageSupport.validateParentStagePrerequisite(order, bundle, "尾部", null);
                return;
            }

            assertAllSewingSubProcessesCompleted(orderId, bundleId, sewingSubProcesses);
            stageSupport.validateParentStagePrerequisite(order, bundle, "尾部", null);

        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            log.warn("检查质检前置条件失败: orderId={}, bundleId={}", orderId, bundleId, e);
        }
    }

    public void validateInspectAfterReceive(String orderId, String bundleId, String operatorId, String operatorName,
                                             java.util.function.Function<String, ScanRecord> recordFinder) {
        ScanRecord received = recordFinder.apply("quality_receive");
        if (received == null || !hasText(received.getId())) {
            throw new IllegalStateException("请先领取再验收");
        }

        String receivedOperatorId = received.getOperatorId() == null ? null : received.getOperatorId().trim();
        String receivedOperatorName = received.getOperatorName() == null ? null : received.getOperatorName().trim();

        boolean isSameOperator = false;
        if (hasText(operatorId) && hasText(receivedOperatorId)) {
            isSameOperator = operatorId.equals(receivedOperatorId);
        } else if (hasText(operatorName) && hasText(receivedOperatorName)) {
            isSameOperator = operatorName.equals(receivedOperatorName);
        }

        if (!isSameOperator) {
            String otherName = hasText(receivedOperatorName) ? receivedOperatorName : "他人";
            throw new IllegalStateException("该菲号已被「" + otherName + "」领取，只能由领取人验收");
        }
    }

    private void validateAtLeastOneProductionRecord(String orderId, String bundleId) {
        long productionCount = scanRecordService.count(new LambdaQueryWrapper<ScanRecord>()
                .eq(ScanRecord::getOrderId, orderId)
                .eq(ScanRecord::getCuttingBundleId, bundleId)
                .eq(ScanRecord::getScanType, "production")
                .eq(ScanRecord::getScanResult, "success")
                .isNotNull(ScanRecord::getOperatorId));
        if (productionCount <= 0) {
            throw new IllegalStateException("温馨提示：该菲号还未完成生产扫码哦～请先完成所有生产工序（车缝/尾部）后再进行质检");
        }
    }

    private void assertAllSewingSubProcessesCompleted(String orderId, String bundleId, List<String> sewingSubProcesses) {
        Set<String> completedSet = collectCompletedProcessSet(orderId, bundleId);
        List<String> missingProcesses = new ArrayList<>();
        for (String processName : sewingSubProcesses) {
            if (!completedSet.contains(processName)) {
                missingProcesses.add(processName);
            }
        }
        if (!missingProcesses.isEmpty()) {
            throw new IllegalStateException(
                    "温馨提示：车缝工序还未全部完成哦～以下子工序还需要扫码：" + String.join("、", missingProcesses)
                            + "。完成这些工序后就可以进行质检啦！（尾部工序也需全部完成）");
        }
    }

    private Set<String> collectCompletedProcessSet(String orderId, String bundleId) {
        Set<String> completedSet = new HashSet<>();
        String[] selectFields = {"process_code", "process_name", "progress_stage"};
        for (String field : selectFields) {
            QueryWrapper<ScanRecord> qw = new QueryWrapper<ScanRecord>()
                    .select("DISTINCT " + field)
                    .eq("order_id", orderId)
                    .eq("cutting_bundle_id", bundleId)
                    .eq("scan_type", "production")
                    .eq("scan_result", "success")
                    .isNotNull(field);
            List<Map<String, Object>> rows = scanRecordService.listMaps(qw);
            if (rows != null) {
                for (Map<String, Object> row : rows) {
                    Object val = row.get(field);
                    if (val != null) completedSet.add(val.toString().trim());
                }
            }
        }
        return completedSet;
    }

    private List<String> resolveSewingSubProcesses(String styleNo) {
        List<String> result = new ArrayList<>();
        if (!hasText(styleNo) || templateLibraryService == null) {
            return result;
        }
        try {
            List<Map<String, Object>> nodes = templateLibraryService.resolveProgressNodeUnitPrices(styleNo);
            if (nodes == null || nodes.isEmpty()) {
                return result;
            }
            for (Map<String, Object> node : nodes) {
                if (node == null) continue;
                String progressStage = node.get("progressStage") == null ? "" : node.get("progressStage").toString().trim();
                String processName = node.get("name") == null ? "" : node.get("name").toString().trim();
                if (!hasText(processName)) continue;
                if (templateLibraryService.progressStageNameMatches(progressStage, "车缝")
                        || templateLibraryService.progressStageNameMatches(progressStage, "缝制")
                        || templateLibraryService.progressStageNameMatches(progressStage, "生产")) {
                    result.add(processName);
                }
            }
        } catch (Exception e) {
            log.warn("解析车缝子工序失败: styleNo={}", styleNo, e);
        }
        return result;
    }

    private boolean hasText(String str) {
        return StringUtils.hasText(str);
    }
}
