package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
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
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Slf4j
@Service
public class PatternEnrichmentHelper {

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleProcessService styleProcessService;

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private PatternProductionService patternProductionService;

    @Autowired
    private PatternScanRecordService patternScanRecordService;

    @Autowired
    private ObjectMapper objectMapper;

    /**
     * 丰富单条样板生产记录（关联款式、工序、采购）
     */
    public Map<String, Object> enrichRecord(PatternProduction record) {
        Map<String, Object> map = new HashMap<>();
        LocalDateTime resolvedCompleteTime = resolvePatternProductionCompleteTime(record);
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("MM-dd HH:mm");
        map.put("id", record.getId());
        map.put("styleId", record.getStyleId());
        map.put("styleNo", record.getStyleNo());
        map.put("color", record.getColor());
        map.put("quantity", record.getQuantity());
        map.put("releaseTime", record.getReleaseTime() != null ? record.getReleaseTime().format(fmt) : null);
        map.put("deliveryTime", record.getDeliveryTime());
        map.put("receiver", record.getReceiver());
        map.put("receiveTime", record.getReceiveTime() != null ? record.getReceiveTime().format(fmt) : null);
        map.put("completeTime", resolvedCompleteTime != null ? resolvedCompleteTime.format(fmt) : null);
        // 旧记录 patternMaker 可能为 null（领取时未写入），兜底用 receiver（两者为同一人）
        String patternMakerVal = StringUtils.hasText(record.getPatternMaker())
                ? record.getPatternMaker() : record.getReceiver();
        map.put("patternMaker", patternMakerVal);
        map.put("progressNodes", record.getProgressNodes());
        map.put("status", record.getStatus());
        map.put("createTime", record.getCreateTime());
        map.put("reviewStatus", record.getReviewStatus());
        map.put("reviewResult", record.getReviewResult());
        map.put("reviewRemark", record.getReviewRemark());
        map.put("reviewBy", record.getReviewBy());
        map.put("reviewById", record.getReviewById());
        map.put("reviewTime", record.getReviewTime());

        // 从款式信息获取封面图、码数、人员
        enrichWithStyleInfo(map, record.getStyleId());

        // 获取工序单价
        enrichWithProcessPrices(map, record.getStyleId());

        // 获取采购进度
        enrichWithProcurementProgress(map, record.getStyleId());

        // 获取动态工序配置（与小程序端保持一致）
        try {
            List<Map<String, Object>> processConfig = this.getPatternProcessConfig(record.getId());
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
        String styleName = null;
        String category = null;
        String customer = null;
        String developmentSourceType = null;

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
                    styleName = styleInfo.getStyleName();
                    category = styleInfo.getCategory();
                    customer = styleInfo.getCustomer();
                    developmentSourceType = styleInfo.getDevelopmentSourceType();

                    String sizeColorConfig = styleInfo.getSizeColorConfig();
                    if (StringUtils.hasText(sizeColorConfig)) {
                        try {
                            Map<String, Object> configMap = objectMapper.readValue(sizeColorConfig,
                                    new TypeReference<Map<String, Object>>() {});
                            Object sizesObj = configMap.get("sizes");
                            // Fallback: if no top-level "sizes", use "commonSizes"
                            if (!(sizesObj instanceof List) || ((List<?>) sizesObj).isEmpty()) {
                                sizesObj = configMap.get("commonSizes");
                            }
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
                            // Extract size/color matrix for miniprogram display
                            Object commonSizesObj = configMap.get("commonSizes");
                            Object matrixRowsObj = configMap.get("matrixRows");
                            if (commonSizesObj instanceof List && matrixRowsObj instanceof List
                                    && !((List<?>) commonSizesObj).isEmpty()
                                    && !((List<?>) matrixRowsObj).isEmpty()) {
                                Map<String, Object> matrixData = new LinkedHashMap<>();
                                matrixData.put("commonSizes", commonSizesObj);
                                matrixData.put("matrixRows", matrixRowsObj);
                                map.put("sizeColorMatrix", matrixData);
                            }
                            // Pass raw sizeColorConfig for JS fallback parsing
                            map.put("sizeColorConfig", sizeColorConfig);
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
        map.put("styleName", styleName);
        map.put("category", category);
        map.put("customer", customer);
        map.put("developmentSourceType", developmentSourceType);
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

    public LocalDateTime resolvePatternProductionCompleteTime(PatternProduction pattern) {
        if (pattern == null) {
            return null;
        }
        if (pattern.getCompleteTime() != null) {
            return pattern.getCompleteTime();
        }

        String status = StringUtils.hasText(pattern.getStatus()) ? pattern.getStatus().trim().toUpperCase() : "";
        if (!"PRODUCTION_COMPLETED".equals(status) && !"COMPLETED".equals(status) && !"WAREHOUSE_OUT".equals(status)) {
            return null;
        }

        LambdaQueryWrapper<PatternScanRecord> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(PatternScanRecord::getPatternProductionId, pattern.getId())
                .eq(PatternScanRecord::getDeleteFlag, 0)
                .in(PatternScanRecord::getOperationType, Arrays.asList("COMPLETE", "TAIL"))
                .orderByDesc(PatternScanRecord::getScanTime)
                .orderByDesc(PatternScanRecord::getCreateTime)
                .last("limit 1");
        PatternScanRecord completeRecord = patternScanRecordService.getOne(wrapper, false);
        if (completeRecord != null) {
            return completeRecord.getScanTime() != null ? completeRecord.getScanTime() : completeRecord.getCreateTime();
        }

        return pattern.getUpdateTime();
    }

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
            item.put("unitPrice", process.getPrice() != null ? process.getPrice() : BigDecimal.ZERO);
            result.add(item);
            sort++;
        }

        if (result.isEmpty()) {
            return buildDefaultPatternProcessConfig();
        }
        return result;
    }

    public List<Map<String, Object>> buildDefaultPatternProcessConfig() {
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
        item.put("unitPrice", price != null ? price : BigDecimal.ZERO);
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
