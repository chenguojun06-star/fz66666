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
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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
    public Map<String, Object> submitScan(String patternId, String operationType, String operatorRole, String remark) {
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

        String operatorId = UserContext.userId();
        String operatorName = UserContext.username();

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

        Map<String, Object> result = submitScan(patternId, "WAREHOUSE_IN", "WAREHOUSE", remark);
        result.put("message", "样衣入库成功");
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

        switch (operationType) {
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
                needUpdate = true;
                break;
            case "FOLLOW_UP":
                updateProgressNode(pattern, "车缝", 100);
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
                needUpdate = true;
                break;
            default:
                log.warn("Unknown operation type: {}", operationType);
        }

        if (needUpdate) {
            pattern.setUpdateTime(LocalDateTime.now());
            patternProductionService.updateById(pattern);
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

            nodesMap.put(nodeName, progress);
            pattern.setProgressNodes(objectMapper.writeValueAsString(nodesMap));
        } catch (Exception e) {
            log.error("更新进度节点失败: {}", nodeName, e);
        }
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
