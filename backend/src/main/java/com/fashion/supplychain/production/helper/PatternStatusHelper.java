package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.PatternProduction;
import com.fashion.supplychain.production.entity.PatternScanRecord;
import com.fashion.supplychain.production.service.PatternProductionService;
import com.fashion.supplychain.production.service.PatternScanRecordService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleProcessService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 样板生产状态 & 进度管理辅助类
 * 从 PatternProductionOrchestrator 抽取，负责：
 * 1. 状态流转（updatePatternStatusByOperation）
 * 2. 进度节点更新（updateProgressNode / calculatePatternProgressPercent）
 * 3. StyleInfo 同步（syncStyleInfoOnReceive/OnScan/OnComplete/SampleStage/ReviewFields）
 * 4. 仓库流程校验（validateWarehouseOperationFlow）
 * 5. 工序映射与解析（resolveOperationProgressStage / mapLegacyOperationByStage / resolveProgressKey / parseStyleId）
 */
@Slf4j
@Service
public class PatternStatusHelper {

    @Autowired
    private PatternProductionService patternProductionService;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleProcessService styleProcessService;

    @Autowired
    private PatternScanRecordService patternScanRecordService;

    @Autowired
    private PatternEnrichmentHelper enrichmentHelper;

    @Autowired
    private ObjectMapper objectMapper;

    // ==================== 状态流转 ====================

    public void updatePatternStatusByOperation(PatternProduction pattern, String operationType, String operatorName) {
        boolean needUpdate = false;
        LocalDateTime now = LocalDateTime.now();

        if (!StringUtils.hasText(operationType)) {
            return;
        }

        String normalizedOperation = operationType.trim();

        switch (normalizedOperation) {
            case "RECEIVE":
                if (!"IN_PROGRESS".equals(pattern.getStatus())
                        && !"PRODUCTION_COMPLETED".equals(pattern.getStatus())
                        && !"COMPLETED".equals(pattern.getStatus())) {
                    pattern.setStatus("IN_PROGRESS");
                    pattern.setReceiver(operatorName);
                    pattern.setReceiveTime(now);
                    needUpdate = true;
                }
                break;
            case "PLATE":
                updateProgressNode(pattern, "裁剪", 100);
                ensureInProgress(pattern, operatorName);
                needUpdate = true;
                break;
            case "FOLLOW_UP":
                updateProgressNode(pattern, "车缝", 100);
                ensureInProgress(pattern, operatorName);
                needUpdate = true;
                break;
            case "COMPLETE":
                // 标记完成时，将所有进度节点都更新到100%
                updateProgressNode(pattern, "采购", 100);
                updateProgressNode(pattern, "裁剪", 100);
                updateProgressNode(pattern, "二次工艺", 100);
                updateProgressNode(pattern, "车缝", 100);
                updateProgressNode(pattern, "尾部", 100);
                updateProgressNode(pattern, "入库", 100);
                markPatternProductionCompleted(pattern, now);
                needUpdate = true;
                break;
            case "WAREHOUSE_IN":
                updateProgressNode(pattern, "入库", 100);
                pattern.setStatus("COMPLETED");
                if (pattern.getCompleteTime() == null) {
                    pattern.setCompleteTime(now);
                }
                if (!StringUtils.hasText(pattern.getReviewStatus())) {
                    pattern.setReviewStatus("PENDING");
                }
                needUpdate = true;
                break;
            case "WAREHOUSE_OUT":
                updateProgressNode(pattern, "出库", 100);
                pattern.setStatus("COMPLETED");
                needUpdate = true;
                break;
            case "WAREHOUSE_RETURN":
                updateProgressNode(pattern, "归还", 100);
                pattern.setStatus("COMPLETED");
                needUpdate = true;
                break;
            case "PROCUREMENT":
                updateProgressNode(pattern, "采购", 100);
                ensureInProgress(pattern, operatorName);
                needUpdate = true;
                break;
            case "CUTTING":
                updateProgressNode(pattern, "裁剪", 100);
                ensureInProgress(pattern, operatorName);
                needUpdate = true;
                break;
            case "SECONDARY":
                updateProgressNode(pattern, "二次工艺", 100);
                ensureInProgress(pattern, operatorName);
                needUpdate = true;
                break;
            case "SEWING":
                updateProgressNode(pattern, "车缝", 100);
                ensureInProgress(pattern, operatorName);
                needUpdate = true;
                break;
            case "TAIL":
                updateProgressNode(pattern, "尾部", 100);
                markPatternProductionCompleted(pattern, now);
                needUpdate = true;
                break;
            default:
                ensureInProgress(pattern, operatorName);
                String dynamicStage = resolveOperationProgressStage(pattern, normalizedOperation);
                updateProgressNode(pattern, dynamicStage, 100);

                if (isPatternAllProcessesCompleted(pattern.getId(), pattern.getStyleId())) {
                    markPatternProductionCompleted(pattern, now);
                }
                needUpdate = true;
        }

        if (needUpdate) {
            pattern.setUpdateTime(now);
            patternProductionService.updateById(pattern);
            syncStyleInfoSampleStage(pattern);
        }
    }

    public void markPatternProductionCompleted(PatternProduction pattern, LocalDateTime completedTime) {
        pattern.setStatus("PRODUCTION_COMPLETED");
        if (pattern.getCompleteTime() == null) {
            pattern.setCompleteTime(completedTime);
        }
        if (!StringUtils.hasText(pattern.getReviewStatus())) {
            pattern.setReviewStatus("PENDING");
        }
        // 同步 StyleInfo 的 productionCompletedTime
        syncStyleInfoOnComplete(pattern);
    }

    // ==================== StyleInfo 同步 ====================

    public void syncStyleInfoOnReceive(String styleIdStr, String currentUser) {
        if (!StringUtils.hasText(styleIdStr)) return;
        try {
            Long styleId = Long.parseLong(styleIdStr);
            StyleInfo styleInfo = styleInfoService.getById(styleId);
            if (styleInfo != null) {
                boolean updated = false;

                if (!StringUtils.hasText(styleInfo.getProductionAssignee())) {
                    styleInfo.setProductionAssignee(currentUser);
                    updated = true;
                }
                if (styleInfo.getProductionStartTime() == null) {
                    styleInfo.setProductionStartTime(LocalDateTime.now());
                    updated = true;
                }
                if (!StringUtils.hasText(styleInfo.getPlateWorker())) {
                    styleInfo.setPlateWorker(currentUser);
                    updated = true;
                    log.info("Synced plate worker to style info: styleId={}, plateWorker={}", styleId, currentUser);
                }

                if (updated) {
                    styleInfoService.updateById(styleInfo);
                    log.info("Synced production start to style info: styleId={}, assignee={}", styleId, currentUser);
                }
            }
        } catch (NumberFormatException e) {
            log.warn("Invalid styleId format: {}", styleIdStr);
        }
    }

    /**
     * 扫码操作时同步人员信息回样衣开发表（t_style_info）
     * 解决直接扫码（未走"领取"流程）时车板师等字段不回写的问题
     */
    public void syncStyleInfoOnScan(String styleIdStr, String operatorName, String operationType) {
        if (!StringUtils.hasText(styleIdStr)) return;
        try {
            Long styleId = Long.parseLong(styleIdStr);
            StyleInfo styleInfo = styleInfoService.getById(styleId);
            if (styleInfo == null) return;

            boolean updated = false;

            // 车板师：扫码的人就是车板师（如果还没设置）
            if (!StringUtils.hasText(styleInfo.getPlateWorker())) {
                styleInfo.setPlateWorker(operatorName);
                updated = true;
                log.info("Scan synced plate worker to style info: styleId={}, plateWorker={}", styleId, operatorName);
            }

            // 纸样师：扫码的人补充为纸样师（如果还没设置）
            if (!StringUtils.hasText(styleInfo.getSampleSupplier())) {
                styleInfo.setSampleSupplier(operatorName);
                updated = true;
                log.info("Scan synced pattern developer to style info: styleId={}, patternDeveloper={}", styleId, operatorName);
            }

            // 生产开始时间：如果还没有，补充
            if (styleInfo.getProductionStartTime() == null) {
                styleInfo.setProductionStartTime(LocalDateTime.now());
                updated = true;
            }
            if (!StringUtils.hasText(styleInfo.getProductionAssignee())) {
                styleInfo.setProductionAssignee(operatorName);
                updated = true;
            }

            if (updated) {
                styleInfo.setUpdateTime(LocalDateTime.now());
                styleInfoService.updateById(styleInfo);
                log.info("Scan synced style info fields: styleId={}, operator={}, operation={}", styleId, operatorName, operationType);
            }
        } catch (NumberFormatException e) {
            log.warn("syncStyleInfoOnScan: invalid styleId format: {}", styleIdStr);
        } catch (Exception e) {
            log.error("syncStyleInfoOnScan failed: styleId={}", styleIdStr, e);
        }
    }

    public void syncStyleInfoOnComplete(PatternProduction record) {
        if (!StringUtils.hasText(record.getStyleId())) return;
        try {
            Long styleId = Long.parseLong(record.getStyleId());
            StyleInfo styleInfo = styleInfoService.getById(styleId);
            if (styleInfo != null) {
                String currentUser = UserContext.username();
                LocalDateTime now = LocalDateTime.now();

                if (!StringUtils.hasText(styleInfo.getProductionAssignee())) {
                    styleInfo.setProductionAssignee(currentUser);
                }
                if (styleInfo.getProductionStartTime() == null) {
                    styleInfo.setProductionStartTime(record.getCreateTime() != null ? record.getCreateTime() : now);
                }
                styleInfo.setProductionCompletedTime(now);

                styleInfoService.updateById(styleInfo);
                log.info("Updated StyleInfo production times: styleId={}, assignee={}", styleId,
                        styleInfo.getProductionAssignee());
            }
        } catch (Exception e) {
            log.error("Failed to update StyleInfo production times: styleId={}", record.getStyleId(), e);
        }
    }

    public void syncStyleInfoSampleStage(PatternProduction pattern) {
        if (pattern == null || !StringUtils.hasText(pattern.getStyleId())) {
            return;
        }

        try {
            Long styleId = Long.parseLong(pattern.getStyleId());
            StyleInfo styleInfo = styleInfoService.getById(styleId);
            if (styleInfo == null) {
                return;
            }

            String currentSampleStatus = String.valueOf(styleInfo.getSampleStatus() == null ? "" : styleInfo.getSampleStatus()).trim().toUpperCase();
            boolean sampleFinished = "COMPLETED".equals(currentSampleStatus) || "PRODUCTION_COMPLETED".equals(currentSampleStatus);
            int progress = calculatePatternProgressPercent(pattern);
            String status = String.valueOf(pattern.getStatus() == null ? "" : pattern.getStatus()).trim().toUpperCase();
            LocalDateTime now = LocalDateTime.now();
            LocalDateTime resolvedCompleteTime = enrichmentHelper.resolvePatternProductionCompleteTime(pattern);

            StyleInfo patch = new StyleInfo();
            patch.setId(styleId);
            patch.setUpdateTime(now);

            if (StringUtils.hasText(pattern.getReceiver()) && !StringUtils.hasText(styleInfo.getProductionAssignee())) {
                patch.setProductionAssignee(pattern.getReceiver());
            }

            if (pattern.getReceiveTime() != null && styleInfo.getProductionStartTime() == null) {
                patch.setProductionStartTime(pattern.getReceiveTime());
            }

            if ("PRODUCTION_COMPLETED".equals(status) || "COMPLETED".equals(status)) {
                patch.setProductionCompletedTime(resolvedCompleteTime != null ? resolvedCompleteTime : now);
                // 生产实际完成时，将样衣状态同步为 PRODUCTION_COMPLETED，使时间轴节点显示「生产完成」而非「进行中」
                if (!sampleFinished) {
                    patch.setSampleStatus("PRODUCTION_COMPLETED");
                    patch.setSampleProgress(100);
                    patch.setSampleCompletedTime(resolvedCompleteTime != null ? resolvedCompleteTime : now);
                }
            } else if (!sampleFinished && !"PENDING".equals(status)) {
                patch.setSampleStatus("IN_PROGRESS");
                patch.setSampleProgress(progress);
                patch.setSampleCompletedTime(null);
            }

            styleInfoService.updateById(patch);
        } catch (Exception e) {
            log.error("Failed to sync style sample stage: patternId={}, styleId={}", pattern.getId(), pattern.getStyleId(), e);
        }
    }

    public void syncStyleInfoReviewFields(PatternProduction pattern, String reviewResult, String reviewRemark, String operatorName) {
        try {
            Long styleId = parseStyleId(pattern.getStyleId());
            if (styleId == null) {
                return;
            }
            StyleInfo styleInfo = styleInfoService.getById(styleId);
            if (styleInfo == null) {
                return;
            }

            String mappedStatus;
            if ("APPROVED".equalsIgnoreCase(reviewResult)) {
                mappedStatus = "PASS";
            } else if ("REJECTED".equalsIgnoreCase(reviewResult)) {
                mappedStatus = "REJECT";
            } else {
                mappedStatus = reviewResult;
            }

            styleInfo.setSampleReviewStatus(mappedStatus);
            styleInfo.setSampleReviewComment(reviewRemark);
            styleInfo.setSampleReviewer(operatorName);
            styleInfo.setSampleReviewTime(LocalDateTime.now());
            styleInfoService.updateById(styleInfo);
        } catch (Exception e) {
            log.error("同步样衣审核结果到StyleInfo失败: patternId={}", pattern.getId(), e);
        }
    }

    // ==================== 进度计算 ====================

    public int calculatePatternProgressPercent(PatternProduction pattern) {
        String status = String.valueOf(pattern.getStatus() == null ? "" : pattern.getStatus()).trim().toUpperCase();
        if ("PRODUCTION_COMPLETED".equals(status) || "COMPLETED".equals(status)) {
            return 100;
        }

        String progressNodes = pattern.getProgressNodes();
        if (!StringUtils.hasText(progressNodes)) {
            return "IN_PROGRESS".equals(status) ? 5 : 0;
        }

        try {
            Map<String, Object> nodes = objectMapper.readValue(progressNodes, new TypeReference<Map<String, Object>>() {});
            List<Integer> percents = new ArrayList<>();
            for (Object value : nodes.values()) {
                if (value instanceof Number) {
                    percents.add(Math.max(0, Math.min(100, ((Number) value).intValue())));
                    continue;
                }
                try {
                    percents.add(Math.max(0, Math.min(100, Integer.parseInt(String.valueOf(value)))));
                } catch (Exception ignored) {
                }
            }

            if (percents.isEmpty()) {
                return "IN_PROGRESS".equals(status) ? 5 : 0;
            }

            int sum = percents.stream().mapToInt(Integer::intValue).sum();
            int avg = Math.round((float) sum / percents.size());
            return Math.max("IN_PROGRESS".equals(status) ? 5 : 0, avg);
        } catch (Exception e) {
            log.warn("Failed to parse pattern progress nodes: patternId={}", pattern.getId(), e);
            return "IN_PROGRESS".equals(status) ? 5 : 0;
        }
    }

    // ==================== 仓库流程校验 ====================

    public void validateWarehouseOperationFlow(String patternId, String operationType) {
        if (!StringUtils.hasText(patternId) || !StringUtils.hasText(operationType)) {
            return;
        }
        String op = operationType.trim();
        // 只对仓库相关操作做流程校验
        if (!"WAREHOUSE_IN".equals(op) && !"WAREHOUSE_OUT".equals(op) && !"WAREHOUSE_RETURN".equals(op)) {
            return;
        }

        // 查询该样衣所有扫码记录
        LambdaQueryWrapper<PatternScanRecord> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(PatternScanRecord::getPatternProductionId, patternId)
                .eq(PatternScanRecord::getDeleteFlag, 0);
        List<PatternScanRecord> records = patternScanRecordService.list(wrapper);
        Set<String> scanned = records.stream()
                .map(PatternScanRecord::getOperationType)
                .filter(StringUtils::hasText)
                .map(String::trim)
                .collect(Collectors.toSet());

        if ("WAREHOUSE_IN".equals(op)) {
            // 入库：必须已完成生产，且不能重复入库
            PatternProduction pattern = patternProductionService.getById(patternId);
            if (pattern != null) {
                String status = StringUtils.hasText(pattern.getStatus()) ? pattern.getStatus().trim().toUpperCase() : "";
                if (!"PRODUCTION_COMPLETED".equals(status) && !"COMPLETED".equals(status)) {
                    throw new IllegalStateException("样衣尚未完成生产，不能入库");
                }
            }
            if (pattern != null && !isReviewApproved(pattern)) {
                throw new IllegalStateException("样衣审核未通过，不能入库");
            }
            if (scanned.contains("WAREHOUSE_IN")) {
                throw new IllegalStateException("该样衣已入库，不能重复入库");
            }
        }
        if ("WAREHOUSE_OUT".equals(op)) {
            // 出库：必须已入库
            if (!scanned.contains("WAREHOUSE_IN")) {
                throw new IllegalStateException("样衣未入库，不能出库");
            }
        }
        if ("WAREHOUSE_RETURN".equals(op)) {
            // 归还：必须有借出记录
            if (!scanned.contains("WAREHOUSE_OUT")) {
                throw new IllegalStateException("样衣未出库，不能归还");
            }
        }
    }

    // ==================== 进度节点更新 ====================

    public void updateProgressNode(PatternProduction pattern, String nodeName, int progress) {
        try {
            String progressNodes = pattern.getProgressNodes();
            Map<String, Object> nodesMap;

            if (StringUtils.hasText(progressNodes)) {
                nodesMap = objectMapper.readValue(progressNodes, new TypeReference<Map<String, Object>>() {});
            } else {
                nodesMap = new HashMap<>();
            }

            String progressKey = resolveProgressKey(nodeName);
            nodesMap.put(progressKey, progress);
            if (!Objects.equals(progressKey, nodeName)) {
                nodesMap.put(nodeName, progress);
            }
            pattern.setProgressNodes(objectMapper.writeValueAsString(nodesMap));
        } catch (Exception e) {
            log.error("更新进度节点失败: {}", nodeName, e);
        }
    }

    // ==================== 审核判断 ====================

    public boolean isReviewApproved(PatternProduction pattern) {
        if (pattern == null) {
            return false;
        }
        String reviewStatus = StringUtils.hasText(pattern.getReviewStatus())
                ? pattern.getReviewStatus().trim().toUpperCase()
                : "";
        String reviewResult = StringUtils.hasText(pattern.getReviewResult())
                ? pattern.getReviewResult().trim().toUpperCase()
                : "";
        return "APPROVED".equals(reviewStatus) || "APPROVED".equals(reviewResult);
    }

    // ==================== 内部辅助 ====================

    private void ensureInProgress(PatternProduction pattern, String operatorName) {
        if (!"IN_PROGRESS".equals(pattern.getStatus())
            && !"PRODUCTION_COMPLETED".equals(pattern.getStatus())
            && !"COMPLETED".equals(pattern.getStatus())) {
            pattern.setStatus("IN_PROGRESS");
        }
        if (!StringUtils.hasText(pattern.getReceiver()) && StringUtils.hasText(operatorName)) {
            pattern.setReceiver(operatorName);
        }
        if (pattern.getReceiveTime() == null) {
            pattern.setReceiveTime(LocalDateTime.now());
        }
    }

    private String resolveOperationProgressStage(PatternProduction pattern, String operationType) {
        if (!StringUtils.hasText(operationType)) {
            return "车缝";
        }

        Map<String, String> legacyStageMap = new HashMap<>();
        legacyStageMap.put("RECEIVE", "采购");
        legacyStageMap.put("PLATE", "裁剪");
        legacyStageMap.put("FOLLOW_UP", "车缝");
        legacyStageMap.put("COMPLETE", "尾部");
        legacyStageMap.put("WAREHOUSE_IN", "入库");
        legacyStageMap.put("WAREHOUSE_OUT", "出库");
        legacyStageMap.put("WAREHOUSE_RETURN", "归还");
        legacyStageMap.put("PROCUREMENT", "采购");
        legacyStageMap.put("CUTTING", "裁剪");
        legacyStageMap.put("SECONDARY", "二次工艺");
        legacyStageMap.put("SEWING", "车缝");
        legacyStageMap.put("TAIL", "尾部");
        if (legacyStageMap.containsKey(operationType)) {
            return legacyStageMap.get(operationType);
        }

        Long styleId = parseStyleId(pattern.getStyleId());
        if (styleId != null) {
            LambdaQueryWrapper<StyleProcess> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(StyleProcess::getStyleId, styleId)
                    .and(w -> w.eq(StyleProcess::getProcessName, operationType)
                            .or().eq(StyleProcess::getProcessCode, operationType))
                    .last("LIMIT 1");
            StyleProcess process = styleProcessService.getOne(wrapper, false);
            if (process != null && StringUtils.hasText(process.getProgressStage())) {
                return process.getProgressStage().trim();
            }
        }

        return operationType;
    }

    private boolean isPatternAllProcessesCompleted(String patternId, String styleIdStr) {
        Long styleId = parseStyleId(styleIdStr);
        if (styleId == null || !StringUtils.hasText(patternId)) {
            return false;
        }

        LambdaQueryWrapper<StyleProcess> processWrapper = new LambdaQueryWrapper<>();
        processWrapper.eq(StyleProcess::getStyleId, styleId);
        List<StyleProcess> processes = styleProcessService.list(processWrapper);
        if (processes == null || processes.isEmpty()) {
            return false;
        }

        LambdaQueryWrapper<PatternScanRecord> recordWrapper = new LambdaQueryWrapper<>();
        recordWrapper.eq(PatternScanRecord::getPatternProductionId, patternId)
                .eq(PatternScanRecord::getDeleteFlag, 0);
        List<PatternScanRecord> scanRecords = patternScanRecordService.list(recordWrapper);
        if (scanRecords == null || scanRecords.isEmpty()) {
            return false;
        }

        Set<String> scanned = scanRecords.stream()
                .map(PatternScanRecord::getOperationType)
                .filter(StringUtils::hasText)
                .map(s -> s.trim().toLowerCase())
                .collect(Collectors.toSet());

        Set<String> legacyDone = new HashSet<>(Arrays.asList("complete"));
        if (!scanned.isEmpty() && scanned.stream().anyMatch(legacyDone::contains)) {
            return true;
        }

        for (StyleProcess process : processes) {
            String processName = StringUtils.hasText(process.getProcessName()) ? process.getProcessName().trim() : "";
            String progressStage = StringUtils.hasText(process.getProgressStage()) ? process.getProgressStage().trim() : "";

            if ("入库".equals(progressStage)
                    || "出库".equals(progressStage)
                    || "归还".equals(progressStage)
                    || "WAREHOUSE_IN".equalsIgnoreCase(processName)
                    || "WAREHOUSE_OUT".equalsIgnoreCase(processName)
                    || "WAREHOUSE_RETURN".equalsIgnoreCase(processName)) {
                continue;
            }

            List<String> candidates = new ArrayList<>();
            if (StringUtils.hasText(processName)) {
                candidates.add(processName.toLowerCase());
            }
            if (StringUtils.hasText(progressStage)) {
                candidates.add(progressStage.toLowerCase());
            }
            String legacyOp = mapLegacyOperationByStage(progressStage);
            if (StringUtils.hasText(legacyOp)) {
                candidates.add(legacyOp.toLowerCase());
            }

            boolean matched = candidates.stream().filter(StringUtils::hasText).anyMatch(scanned::contains);
            if (!matched) {
                return false;
            }
        }
        return true;
    }

    private String mapLegacyOperationByStage(String stage) {
        if (!StringUtils.hasText(stage)) {
            return null;
        }
        String normalized = stage.trim();
        if (Objects.equals(normalized, "采购")) {
            return "RECEIVE";
        }
        if (Objects.equals(normalized, "裁剪")) {
            return "PLATE";
        }
        if (Objects.equals(normalized, "车缝")) {
            return "FOLLOW_UP";
        }
        if (Objects.equals(normalized, "尾部")) {
            return "COMPLETE";
        }
        if (Objects.equals(normalized, "入库")) {
            return "WAREHOUSE_IN";
        }
        if (Objects.equals(normalized, "出库")) {
            return "WAREHOUSE_OUT";
        }
        if (Objects.equals(normalized, "归还")) {
            return "WAREHOUSE_RETURN";
        }
        return null;
    }

    private String resolveProgressKey(String nodeName) {
        if (!StringUtils.hasText(nodeName)) {
            return "unknown";
        }
        String normalized = nodeName.trim();
        Map<String, String> stageIdMap = new HashMap<>();
        stageIdMap.put("采购", "procurement");
        stageIdMap.put("裁剪", "cutting");
        stageIdMap.put("车缝", "sewing");
        stageIdMap.put("缝制", "sewing");
        stageIdMap.put("生产", "sewing");
        stageIdMap.put("尾部", "tail");
        stageIdMap.put("后整", "tail");
        stageIdMap.put("入库", "warehousing");
        stageIdMap.put("出库", "warehouse_out");
        stageIdMap.put("归还", "warehouse_return");
        stageIdMap.put("质检", "quality");
        stageIdMap.put("大烫", "ironing");
        stageIdMap.put("二次工艺", "secondary");
        stageIdMap.put("包装", "packaging");
        if (stageIdMap.containsKey(normalized)) {
            return stageIdMap.get(normalized);
        }
        return normalized;
    }

    public Long parseStyleId(String styleIdStr) {
        if (!StringUtils.hasText(styleIdStr)) {
            return null;
        }
        try {
            return Long.parseLong(styleIdStr.trim());
        } catch (Exception e) {
            return null;
        }
    }
}
