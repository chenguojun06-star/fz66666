package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.PatternProduction;
import com.fashion.supplychain.production.entity.PatternScanRecord;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
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
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 样板生产编排器
 * <p>
 * 编排跨服务调用：样板生产、款式信息、款式工序、物料采购、扫码记录
 * 从 PatternProductionController 提取跨服务业务逻辑
 */
@Slf4j
@Service
public class PatternProductionOrchestrator {

    @Autowired
    private PatternProductionService patternProductionService;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleProcessService styleProcessService;

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private PatternScanRecordService patternScanRecordService;

    @Autowired
    private ObjectMapper objectMapper;

    /**
     * 分页查询并丰富样板生产记录（关联款式、工序、采购数据）
     */
    public Map<String, Object> listWithEnrichment(int page, int size, String keyword, String status,
                                                   String startDate, String endDate) {
        // 构建查询条件
        LambdaQueryWrapper<PatternProduction> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(PatternProduction::getDeleteFlag, 0);

        if (StringUtils.hasText(keyword)) {
            wrapper.and(w -> w.like(PatternProduction::getStyleNo, keyword)
                    .or().like(PatternProduction::getColor, keyword)
                    .or().like(PatternProduction::getPatternMaker, keyword));
        }
        if (StringUtils.hasText(status)) {
            wrapper.eq(PatternProduction::getStatus, status);
        }
        if (StringUtils.hasText(startDate)) {
            wrapper.ge(PatternProduction::getCreateTime, startDate + " 00:00:00");
        }
        if (StringUtils.hasText(endDate)) {
            wrapper.le(PatternProduction::getCreateTime, endDate + " 23:59:59");
        }
        wrapper.orderByDesc(PatternProduction::getCreateTime);

        Page<PatternProduction> pageResult = patternProductionService.page(new Page<>(page, size), wrapper);

        // 丰富每条记录
        List<Map<String, Object>> enrichedRecords = pageResult.getRecords().stream()
                .map(this::enrichRecord)
                .collect(Collectors.toList());

        Map<String, Object> result = new HashMap<>();
        result.put("records", enrichedRecords);
        result.put("total", pageResult.getTotal());
        result.put("size", pageResult.getSize());
        result.put("current", pageResult.getCurrent());
        result.put("pages", pageResult.getPages());
        return result;
    }

    /**
     * 领取样板（跨域更新：PatternProduction + StyleInfo）
     */
    @Transactional(rollbackFor = Exception.class)
    public String receivePattern(String id, Map<String, Object> params) {
        PatternProduction record = patternProductionService.getById(id);
        if (record == null || record.getDeleteFlag() == 1) {
            throw new IllegalArgumentException("记录不存在");
        }
        if (!"PENDING".equals(record.getStatus())) {
            throw new IllegalStateException("当前状态不允许领取");
        }

        String currentUser = UserContext.username();
        record.setReceiver(currentUser);
        record.setReceiveTime(LocalDateTime.now());
        record.setStatus("IN_PROGRESS");
        record.setUpdateBy(currentUser);
        record.setUpdateTime(LocalDateTime.now());
        record.setPatternMaker(currentUser);

        // 解析可选的下板/交板时间
        if (params != null) {
            parseAndSetTime(params, "releaseTime", record);
            parseAndSetTime(params, "deliveryTime", record);
        }

        patternProductionService.updateById(record);

        // 同步更新 StyleInfo
        syncStyleInfoOnReceive(record.getStyleId(), currentUser);

        log.info("Pattern production received: id={}, receiver={}", id, currentUser);
        return "领取成功";
    }

    /**
     * 更新工序进度（跨域更新：PatternProduction + StyleInfo）
     */
    @Transactional(rollbackFor = Exception.class)
    public String updateProgress(String id, Map<String, Integer> progressNodes) {
        PatternProduction record = patternProductionService.getById(id);
        if (record == null || record.getDeleteFlag() == 1) {
            throw new IllegalArgumentException("记录不存在");
        }

        try {
            String progressJson = objectMapper.writeValueAsString(progressNodes);
            record.setProgressNodes(progressJson);
            record.setUpdateBy(UserContext.username());
            record.setUpdateTime(LocalDateTime.now());

            boolean allCompleted = progressNodes.values().stream().allMatch(v -> v >= 100);
            if (allCompleted && !"COMPLETED".equals(record.getStatus())) {
                record.setStatus("COMPLETED");
                record.setCompleteTime(LocalDateTime.now());
                syncStyleInfoOnComplete(record);
            }

            patternProductionService.updateById(record);
            log.info("Pattern production progress updated: id={}, progress={}", id, progressNodes);
            return "进度更新成功";
        } catch (Exception e) {
            log.error("Failed to update progress: id={}", id, e);
            throw new RuntimeException("更新失败：" + e.getMessage(), e);
        }
    }

    /**
     * 提交样板生产扫码记录（跨域：创建扫码记录 + 更新样板状态）
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> submitScan(String patternId, String operationType, String operatorRole, String remark,
                                          Integer quantity, String warehouseCode) {
        if (!StringUtils.hasText(patternId)) {
            throw new IllegalArgumentException("样板生产ID不能为空");
        }
        if (!StringUtils.hasText(operationType)) {
            throw new IllegalArgumentException("操作类型不能为空");
        }

        PatternProduction pattern = patternProductionService.getById(patternId);
        if (pattern == null || pattern.getDeleteFlag() == 1) {
            throw new IllegalArgumentException("样板生产记录不存在");
        }

        validateWarehouseOperationFlow(patternId, operationType);

        String operatorId = UserContext.userId();
        String operatorName = UserContext.username();

        if (quantity != null && quantity > 0
                && !Objects.equals(pattern.getQuantity(), quantity)) {
            pattern.setQuantity(quantity);
            pattern.setUpdateBy(operatorName);
            pattern.setUpdateTime(LocalDateTime.now());
            patternProductionService.updateById(pattern);
        }

        // 创建扫码记录
        PatternScanRecord scanRecord = new PatternScanRecord();
        scanRecord.setPatternProductionId(patternId);
        scanRecord.setStyleId(pattern.getStyleId());
        scanRecord.setStyleNo(pattern.getStyleNo());
        scanRecord.setColor(pattern.getColor());
        scanRecord.setOperationType(operationType);
        scanRecord.setOperatorId(operatorId);
        scanRecord.setOperatorName(operatorName);
        scanRecord.setOperatorRole(operatorRole);
        scanRecord.setScanTime(LocalDateTime.now());
        scanRecord.setWarehouseCode(StringUtils.hasText(warehouseCode) ? warehouseCode.trim() : null);
        scanRecord.setRemark(remark);
        scanRecord.setCreateTime(LocalDateTime.now());
        scanRecord.setDeleteFlag(0);

        patternScanRecordService.save(scanRecord);

        // 更新样板状态
        updatePatternStatusByOperation(pattern, operationType, operatorName);

        Map<String, Object> result = new HashMap<>();
        result.put("recordId", scanRecord.getId());
        result.put("patternId", patternId);
        result.put("styleNo", pattern.getStyleNo());
        result.put("color", pattern.getColor());
        result.put("operationType", operationType);
        result.put("operatorName", operatorName);
        result.put("quantity", pattern.getQuantity());
        result.put("warehouseCode", scanRecord.getWarehouseCode());
        result.put("scanTime", scanRecord.getScanTime());
        result.put("newStatus", pattern.getStatus());
        return result;
    }

    /**
     * 样衣入库（跨域：扫码 + 状态更新）
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> warehouseIn(String patternId, String remark) {
        PatternProduction pattern = patternProductionService.getById(patternId);
        if (pattern == null || pattern.getDeleteFlag() == 1) {
            throw new IllegalArgumentException("样板生产记录不存在");
        }
        if (!"COMPLETED".equals(pattern.getStatus())) {
            throw new IllegalStateException("样板生产未完成，无法入库");
        }

        Map<String, Object> result = submitScan(patternId, "WAREHOUSE_IN", "WAREHOUSE", remark, null, null);
        result.put("message", "样衣入库成功");
        return result;
    }

    /**
     * 获取样衣动态工序配置（对齐大货动态工序思路）
     */
    public List<Map<String, Object>> getPatternProcessConfig(String patternId) {
        if (!StringUtils.hasText(patternId)) {
            throw new IllegalArgumentException("样衣ID不能为空");
        }

        PatternProduction pattern = patternProductionService.getById(patternId);
        if (pattern == null || pattern.getDeleteFlag() == 1) {
            throw new IllegalArgumentException("样板生产记录不存在");
        }

        Long styleId = parseStyleId(pattern.getStyleId());
        if (styleId == null) {
            return buildDefaultPatternProcessConfig();
        }

        LambdaQueryWrapper<StyleProcess> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(StyleProcess::getStyleId, styleId)
                .orderByAsc(StyleProcess::getSortOrder)
                .orderByAsc(StyleProcess::getId);
        List<StyleProcess> processes = styleProcessService.list(wrapper);
        if (processes == null || processes.isEmpty()) {
            return buildDefaultPatternProcessConfig();
        }

        List<Map<String, Object>> result = new ArrayList<>();
        int sort = 1;
        for (StyleProcess process : processes) {
            String processName = StringUtils.hasText(process.getProcessName())
                    ? process.getProcessName().trim()
                    : StringUtils.hasText(process.getProgressStage()) ? process.getProgressStage().trim() : "";
            if (!StringUtils.hasText(processName)) {
                continue;
            }

            String progressStage = StringUtils.hasText(process.getProgressStage())
                    ? process.getProgressStage().trim()
                    : processName;

            Map<String, Object> item = new LinkedHashMap<>();
            item.put("operationType", processName);
            item.put("processName", processName);
            item.put("progressStage", progressStage);
            item.put("sortOrder", process.getSortOrder() != null ? process.getSortOrder() : sort);
            item.put("scanType", inferPatternScanType(progressStage, processName));
            item.put("price", process.getPrice() != null ? process.getPrice() : BigDecimal.ZERO);
            result.add(item);
            sort++;
        }

        if (result.isEmpty()) {
            return buildDefaultPatternProcessConfig();
        }
        return result;
    }

    /**
     * 维护操作
     */
    public void maintenance(String id, String reason) {
        PatternProduction pattern = patternProductionService.getById(id);
        if (pattern == null || pattern.getDeleteFlag() == 1) {
            throw new IllegalArgumentException("样板生产记录不存在");
        }

        String currentUsername = UserContext.username();
        pattern.setMaintainer(currentUsername);
        pattern.setMaintainTime(LocalDateTime.now());
        patternProductionService.updateById(pattern);

        log.info("样板生产维护成功: id={}, maintainer={}, reason={}", id, currentUsername, reason);
    }

    // ========================== 私有辅助方法 ==========================

    /**
     * 丰富单条样板生产记录（关联款式、工序、采购）
     */
    private Map<String, Object> enrichRecord(PatternProduction record) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", record.getId());
        map.put("styleId", record.getStyleId());
        map.put("styleNo", record.getStyleNo());
        map.put("color", record.getColor());
        map.put("quantity", record.getQuantity());
        map.put("releaseTime", record.getReleaseTime());
        map.put("deliveryTime", record.getDeliveryTime());
        map.put("receiver", record.getReceiver());
        map.put("receiveTime", record.getReceiveTime());
        map.put("completeTime", record.getCompleteTime());
        map.put("patternMaker", record.getPatternMaker());
        map.put("progressNodes", record.getProgressNodes());
        map.put("status", record.getStatus());
        map.put("createTime", record.getCreateTime());

        // 从款式信息获取封面图、码数、人员
        enrichWithStyleInfo(map, record.getStyleId());

        // 获取工序单价
        enrichWithProcessPrices(map, record.getStyleId());

        // 获取采购进度
        enrichWithProcurementProgress(map, record.getStyleId());

        // 获取动态工序配置（与小程序端保持一致）
        try {
            List<Map<String, Object>> processConfig = getPatternProcessConfig(record.getId());
            map.put("processConfig", processConfig);
        } catch (Exception e) {
            log.warn("Failed to get processConfig for record: {}", record.getId(), e);
            map.put("processConfig", buildDefaultPatternProcessConfig());
        }

        return map;
    }

    private void enrichWithStyleInfo(Map<String, Object> map, String styleIdStr) {
        String coverImage = null;
        List<String> sizes = new ArrayList<>();
        String designer = null;
        String patternDeveloper = null;
        String plateWorker = null;
        String merchandiser = null;

        if (StringUtils.hasText(styleIdStr)) {
            try {
                Long styleId = Long.parseLong(styleIdStr);
                StyleInfo styleInfo = styleInfoService.getById(styleId);
                if (styleInfo != null) {
                    coverImage = styleInfo.getCover();
                    designer = styleInfo.getSampleNo();
                    patternDeveloper = styleInfo.getSampleSupplier();
                    plateWorker = styleInfo.getPlateWorker();
                    merchandiser = styleInfo.getOrderType();

                    String sizeColorConfig = styleInfo.getSizeColorConfig();
                    if (StringUtils.hasText(sizeColorConfig)) {
                        try {
                            Map<String, Object> configMap = objectMapper.readValue(sizeColorConfig,
                                    new TypeReference<Map<String, Object>>() {});
                            Object sizesObj = configMap.get("sizes");
                            if (sizesObj instanceof List) {
                                for (Object sizeItem : (List<?>) sizesObj) {
                                    if (sizeItem != null) {
                                        String sizeStr = sizeItem.toString().trim();
                                        if (!sizeStr.isEmpty() && !sizes.contains(sizeStr)) {
                                            sizes.add(sizeStr);
                                        }
                                    }
                                }
                            }
                        } catch (Exception e) {
                            log.warn("Failed to parse sizeColorConfig for styleId: {}", styleId, e);
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("Failed to get style info for styleId: {}", styleIdStr, e);
            }
        }
        map.put("coverImage", coverImage);
        map.put("sizes", sizes);
        map.put("designer", designer);
        map.put("patternDeveloper", patternDeveloper);
        map.put("plateWorker", plateWorker);
        map.put("merchandiser", merchandiser);
    }

    private void enrichWithProcessPrices(Map<String, Object> map, String styleIdStr) {
        Map<String, Object> processUnitPrices = new LinkedHashMap<>();
        Map<String, Object> processDetails = new LinkedHashMap<>();

        if (StringUtils.hasText(styleIdStr)) {
            try {
                Long styleId = Long.parseLong(styleIdStr);
                List<StyleProcess> processes = styleProcessService.listByStyleId(styleId);
                if (processes != null) {
                    String[] stages = {"采购", "裁剪", "车缝", "尾部", "入库"};
                    Map<String, Double> stagePriceMap = new HashMap<>();
                    Map<String, List<Map<String, Object>>> stageDetailsMap = new HashMap<>();

                    for (String stage : stages) {
                        stagePriceMap.put(stage, 0.0);
                        stageDetailsMap.put(stage, new ArrayList<>());
                    }

                    for (StyleProcess process : processes) {
                        String progressStage = process.getProgressStage();
                        BigDecimal price = process.getPrice();
                        double priceValue = price != null ? price.doubleValue() : 0;

                        if (StringUtils.hasText(progressStage) && stagePriceMap.containsKey(progressStage)) {
                            stagePriceMap.put(progressStage, stagePriceMap.get(progressStage) + priceValue);

                            Map<String, Object> detail = new HashMap<>();
                            detail.put("name", process.getProcessName() != null ? process.getProcessName() : process.getProcessCode());
                            detail.put("unitPrice", priceValue);
                            detail.put("processCode", process.getProcessCode());
                            detail.put("machineType", process.getMachineType());
                            detail.put("standardTime", process.getStandardTime());
                            stageDetailsMap.get(progressStage).add(detail);
                        }
                    }

                    processUnitPrices.putAll(stagePriceMap);
                    processDetails.putAll(stageDetailsMap);
                }
            } catch (Exception e) {
                log.warn("Failed to get process unit prices for styleId: {}", styleIdStr, e);
            }
        }
        map.put("processUnitPrices", processUnitPrices);
        map.put("processDetails", processDetails);
    }

    private void enrichWithProcurementProgress(Map<String, Object> map, String styleIdStr) {
        Map<String, Object> procurementProgress = new HashMap<>();

        if (StringUtils.hasText(styleIdStr)) {
            try {
                Long styleId = Long.parseLong(styleIdStr);
                LambdaQueryWrapper<MaterialPurchase> purchaseWrapper = new LambdaQueryWrapper<>();
                purchaseWrapper.eq(MaterialPurchase::getStyleId, styleId)
                        .eq(MaterialPurchase::getDeleteFlag, 0);
                List<MaterialPurchase> purchases = materialPurchaseService.list(purchaseWrapper);

                if (purchases != null && !purchases.isEmpty()) {
                    long completedCount = purchases.stream()
                            .filter(p -> p.getReceivedTime() != null)
                            .count();
                    int totalCount = purchases.size();
                    int completionPercent = (int) ((completedCount * 100.0) / totalCount);

                    procurementProgress.put("total", totalCount);
                    procurementProgress.put("completed", completedCount);
                    procurementProgress.put("percent", completionPercent);

                    MaterialPurchase latestCompleted = purchases.stream()
                            .filter(p -> p.getReceivedTime() != null)
                            .max((p1, p2) -> p1.getReceivedTime().compareTo(p2.getReceivedTime()))
                            .orElse(null);

                    if (latestCompleted != null) {
                        procurementProgress.put("completedTime", latestCompleted.getReceivedTime());
                        procurementProgress.put("receiver", latestCompleted.getReceiverName());
                    }
                } else {
                    procurementProgress.put("total", 0);
                    procurementProgress.put("completed", 0);
                    procurementProgress.put("percent", 0);
                }
            } catch (Exception e) {
                log.warn("Failed to get procurement progress for styleId: {}", styleIdStr, e);
                procurementProgress.put("total", 0);
                procurementProgress.put("completed", 0);
                procurementProgress.put("percent", 0);
            }
        }
        map.put("procurementProgress", procurementProgress);
    }

    private void syncStyleInfoOnReceive(String styleIdStr, String currentUser) {
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

    private void syncStyleInfoOnComplete(PatternProduction record) {
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

    private void updatePatternStatusByOperation(PatternProduction pattern, String operationType, String operatorName) {
        boolean needUpdate = false;

        if (!StringUtils.hasText(operationType)) {
            return;
        }

        String normalizedOperation = operationType.trim();

        switch (normalizedOperation) {
            case "RECEIVE":
                if (!"IN_PROGRESS".equals(pattern.getStatus()) && !"COMPLETED".equals(pattern.getStatus())) {
                    pattern.setStatus("IN_PROGRESS");
                    pattern.setReceiver(operatorName);
                    pattern.setReceiveTime(LocalDateTime.now());
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
                pattern.setStatus("COMPLETED");
                pattern.setCompleteTime(LocalDateTime.now());
                updateProgressNode(pattern, "尾部", 100);
                needUpdate = true;
                break;
            case "WAREHOUSE_IN":
                updateProgressNode(pattern, "入库", 100);
                pattern.setStatus("COMPLETED");
                pattern.setCompleteTime(LocalDateTime.now());
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
            default:
                ensureInProgress(pattern, operatorName);
                String dynamicStage = resolveOperationProgressStage(pattern, normalizedOperation);
                updateProgressNode(pattern, dynamicStage, 100);

                if (isPatternAllProcessesCompleted(pattern.getId(), pattern.getStyleId())) {
                    pattern.setStatus("COMPLETED");
                    if (pattern.getCompleteTime() == null) {
                        pattern.setCompleteTime(LocalDateTime.now());
                    }
                }
                needUpdate = true;
        }

        if (needUpdate) {
            pattern.setUpdateTime(LocalDateTime.now());
            patternProductionService.updateById(pattern);
        }
    }

    private void ensureInProgress(PatternProduction pattern, String operatorName) {
        if (!"IN_PROGRESS".equals(pattern.getStatus()) && !"COMPLETED".equals(pattern.getStatus())) {
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

        Set<String> legacyDone = new HashSet<>(Arrays.asList("complete", "warehouse_in"));
        if (!scanned.isEmpty() && scanned.stream().anyMatch(legacyDone::contains)) {
            return true;
        }

        for (StyleProcess process : processes) {
            String processName = StringUtils.hasText(process.getProcessName()) ? process.getProcessName().trim() : "";
            String progressStage = StringUtils.hasText(process.getProgressStage()) ? process.getProgressStage().trim() : "";

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

    private void validateWarehouseOperationFlow(String patternId, String operationType) {
        if (!StringUtils.hasText(patternId) || !StringUtils.hasText(operationType)) {
            return;
        }
        String op = operationType.trim();
        if (!"WAREHOUSE_OUT".equals(op) && !"WAREHOUSE_RETURN".equals(op)) {
            return;
        }

        LambdaQueryWrapper<PatternScanRecord> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(PatternScanRecord::getPatternProductionId, patternId)
                .eq(PatternScanRecord::getDeleteFlag, 0);
        List<PatternScanRecord> records = patternScanRecordService.list(wrapper);
        Set<String> scanned = records.stream()
                .map(PatternScanRecord::getOperationType)
                .filter(StringUtils::hasText)
                .map(String::trim)
                .collect(Collectors.toSet());

        if ("WAREHOUSE_OUT".equals(op) && !scanned.contains("WAREHOUSE_IN")) {
            throw new IllegalStateException("样衣未入库，不能出库");
        }
        if ("WAREHOUSE_RETURN".equals(op) && !scanned.contains("WAREHOUSE_OUT")) {
            throw new IllegalStateException("样衣未出库，不能归还");
        }
    }

    private void updateProgressNode(PatternProduction pattern, String nodeName, int progress) {
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

    private Long parseStyleId(String styleIdStr) {
        if (!StringUtils.hasText(styleIdStr)) {
            return null;
        }
        try {
            return Long.parseLong(styleIdStr.trim());
        } catch (Exception e) {
            return null;
        }
    }

    private List<Map<String, Object>> buildDefaultPatternProcessConfig() {
        List<Map<String, Object>> defaults = new ArrayList<>();
        defaults.add(buildProcessConfigItem("RECEIVE", "领取样衣", "采购", 1, BigDecimal.ZERO));
        defaults.add(buildProcessConfigItem("PLATE", "车板", "裁剪", 2, BigDecimal.ZERO));
        defaults.add(buildProcessConfigItem("FOLLOW_UP", "跟单确认", "车缝", 3, BigDecimal.ZERO));
        defaults.add(buildProcessConfigItem("COMPLETE", "完成确认", "尾部", 4, BigDecimal.ZERO));
        defaults.add(buildProcessConfigItem("WAREHOUSE_IN", "样衣入库", "入库", 5, BigDecimal.ZERO));
        return defaults;
    }

    private Map<String, Object> buildProcessConfigItem(String operationType, String processName,
                                                       String progressStage, int sortOrder,
                                                       BigDecimal price) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("operationType", operationType);
        item.put("processName", processName);
        item.put("progressStage", progressStage);
        item.put("sortOrder", sortOrder);
        item.put("scanType", inferPatternScanType(progressStage, processName));
        item.put("price", price != null ? price : BigDecimal.ZERO);
        return item;
    }

    private String inferPatternScanType(String progressStage, String processName) {
        String stage = StringUtils.hasText(progressStage) ? progressStage.trim() : "";
        String name = StringUtils.hasText(processName) ? processName.trim() : "";
        if ("采购".equals(stage) || name.contains("采购") || name.contains("领取")) {
            return "procurement";
        }
        if ("裁剪".equals(stage) || name.contains("裁剪")) {
            return "cutting";
        }
        if ("入库".equals(stage) || name.contains("入库")) {
            return "warehouse";
        }
        return "production";
    }

    private void parseAndSetTime(Map<String, Object> params, String key, PatternProduction record) {
        if (params.containsKey(key)) {
            try {
                String timeStr = (String) params.get(key);
                if (StringUtils.hasText(timeStr)) {
                    LocalDateTime time = LocalDateTime.parse(timeStr.replace(" ", "T"));
                    if ("releaseTime".equals(key)) {
                        record.setReleaseTime(time);
                    } else if ("deliveryTime".equals(key)) {
                        record.setDeliveryTime(time);
                    }
                }
            } catch (Exception e) {
                log.warn("Failed to parse {}: {}", key, params.get(key));
            }
        }
    }
}
