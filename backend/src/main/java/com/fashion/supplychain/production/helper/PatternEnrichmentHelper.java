package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.ProcessSynonymMapping;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.PatternProduction;
import com.fashion.supplychain.production.entity.PatternScanRecord;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.PatternProductionService;
import com.fashion.supplychain.production.service.PatternScanRecordService;
import com.fashion.supplychain.production.service.ProcessParentMappingService;
import com.fashion.supplychain.style.entity.StyleAttachment;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.service.StyleAttachmentService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleProcessService;
import com.fashion.supplychain.template.entity.TemplateLibrary;
import com.fashion.supplychain.template.service.TemplateLibraryService;
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
    private StyleAttachmentService styleAttachmentService;

    @Autowired
    private StyleProcessService styleProcessService;

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private PatternProductionService patternProductionService;

    @Autowired
    private PatternScanRecordService patternScanRecordService;

    @Autowired
    private TemplateLibraryService templateLibraryService;

    @Autowired
    private ProcessParentMappingService processParentMappingService;

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
        map.put("size", record.getSize());
        map.put("quantity", record.getQuantity());
        map.put("releaseTime", record.getReleaseTime() != null ? record.getReleaseTime().format(fmt) : null);
        map.put("deliveryTime", record.getDeliveryTime() != null
                ? record.getDeliveryTime().toLocalDate().toString() : null);
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
        map.put("createBy", record.getCreateBy()); // 创建人
        map.put("reviewStatus", record.getReviewStatus());
        map.put("reviewResult", record.getReviewResult());
        map.put("reviewRemark", record.getReviewRemark());
        map.put("reviewBy", record.getReviewBy());
        map.put("reviewById", record.getReviewById());
        map.put("reviewTime", record.getReviewTime());
        map.put("productionOrderId", record.getProductionOrderId());

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
            map.put("processConfig", Collections.emptyList());
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
        String styleNo = null;
        // ★ 颜色兜底候选：历史 PatternProduction.color 可能为空（创建时款式未配色）
        // 展示层用款式主色 / 色码矩阵第一色补全，避免前端显示"-"
        String fallbackStyleColor = null;
        String firstMatrixColor = null;

        if (StringUtils.hasText(styleIdStr)) {
            try {
                Long styleId = Long.parseLong(styleIdStr);
                StyleInfo styleInfo = styleInfoService.getById(styleId);
                if (styleInfo != null) {
                    coverImage = styleInfo.getCover();
                    fallbackStyleColor = StringUtils.hasText(styleInfo.getColor())
                            ? styleInfo.getColor().trim() : null;
                    designer = styleInfo.getSampleNo();
                    patternDeveloper = styleInfo.getSampleSupplier();
                    plateWorker = styleInfo.getPlateWorker();
                    merchandiser = styleInfo.getOrderType();
                    styleName = styleInfo.getStyleName();
                    category = styleInfo.getCategory();
                    customer = styleInfo.getCustomer();
                    developmentSourceType = styleInfo.getDevelopmentSourceType();
                    styleNo = styleInfo.getStyleNo();

                    // 交期兜底
                    if (map.get("deliveryTime") == null && styleInfo.getDeliveryDate() != null) {
                        map.put("deliveryTime", styleInfo.getDeliveryDate().toLocalDate().toString());
                    }

                    // ★ 补全阶段时间字段（小程序样衣开发进度条依赖这些字段）
                    Map<String, Object> stageFields = new LinkedHashMap<>();
                    stageFields.put("bomStartTime", styleInfo.getBomStartTime());
                    stageFields.put("bomCompletedTime", styleInfo.getBomCompletedTime());
                    stageFields.put("bomAssignee", styleInfo.getBomAssignee());
                    stageFields.put("patternStartTime", styleInfo.getPatternStartTime());
                    stageFields.put("patternCompletedTime", styleInfo.getPatternCompletedTime());
                    stageFields.put("patternAssignee", styleInfo.getPatternAssignee());
                    stageFields.put("sizeStartTime", styleInfo.getSizeStartTime());
                    stageFields.put("sizeCompletedTime", styleInfo.getSizeCompletedTime());
                    stageFields.put("sizeAssignee", styleInfo.getSizeAssignee());
                    stageFields.put("processStartTime", styleInfo.getProcessStartTime());
                    stageFields.put("processCompletedTime", styleInfo.getProcessCompletedTime());
                    stageFields.put("processAssignee", styleInfo.getProcessAssignee());
                    stageFields.put("secondaryStartTime", styleInfo.getSecondaryStartTime());
                    stageFields.put("secondaryCompletedTime", styleInfo.getSecondaryCompletedTime());
                    stageFields.put("secondaryAssignee", styleInfo.getSecondaryAssignee());
                    stageFields.put("productionStartTime", styleInfo.getProductionStartTime());
                    stageFields.put("productionCompletedTime", styleInfo.getProductionCompletedTime());
                    stageFields.put("productionAssignee", styleInfo.getProductionAssignee());
                    stageFields.put("sizePriceStartTime", styleInfo.getSizePriceStartTime());
                    stageFields.put("sizePriceCompletedTime", styleInfo.getSizePriceCompletedTime());
                    stageFields.put("sizePriceAssignee", styleInfo.getSizePriceAssignee());
                    stageFields.put("sampleStatus", styleInfo.getSampleStatus());
                    stageFields.put("sampleProgress", styleInfo.getSampleProgress());
                    stageFields.put("sampleStartTime", styleInfo.getSampleStartTime());
                    stageFields.put("sampleCompletedTime", styleInfo.getSampleCompletedTime());
                    stageFields.put("sampleReviewStatus", styleInfo.getSampleReviewStatus());
                    stageFields.put("sampleReviewComment", styleInfo.getSampleReviewComment());
                    stageFields.put("sampleReviewer", styleInfo.getSampleReviewer());
                    stageFields.put("sampleReviewTime", styleInfo.getSampleReviewTime());
                    stageFields.put("progressNode", styleInfo.getProgressNode());
                    stageFields.put("deliveryDate", styleInfo.getDeliveryDate());
                    stageFields.put("season", styleInfo.getSeason());
                    stageFields.put("sampleNo", styleInfo.getSampleNo());
                    stageFields.put("sampleSupplier", styleInfo.getSampleSupplier());
                    map.put("styleInfo", stageFields);

                    String sizeColorConfig = styleInfo.getSizeColorConfig();
                    if (StringUtils.hasText(sizeColorConfig)) {
                        try {
                            Map<String, Object> configMap = objectMapper.readValue(sizeColorConfig,
                                    new TypeReference<Map<String, Object>>() {});
                            Object sizesObj = configMap.get("sizes");
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
                            Object matrixRowsObj = configMap.get("matrixRows");
                            if (sizesObj instanceof List && matrixRowsObj instanceof List
                                    && !((List<?>) sizesObj).isEmpty()
                                    && !((List<?>) matrixRowsObj).isEmpty()) {
                                Map<String, Object> matrixData = new LinkedHashMap<>();
                                matrixData.put("sizes", sizesObj);
                                matrixData.put("matrixRows", matrixRowsObj);
                                map.put("sizeColorMatrix", matrixData);
                                // 矩阵仅 1 个颜色时可作为记录颜色兜底（多色时无法判断归属，不用）
                                Set<String> matrixColors = new LinkedHashSet<>();
                                for (Object rowObj : (List<?>) matrixRowsObj) {
                                    if (rowObj instanceof Map<?, ?> row && row.get("color") != null) {
                                        String c = String.valueOf(row.get("color")).trim();
                                        if (!c.isEmpty()) {
                                            matrixColors.add(c);
                                        }
                                    }
                                }
                                if (matrixColors.size() == 1) {
                                    firstMatrixColor = matrixColors.iterator().next();
                                }
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
            // 二级兜底：StyleInfo.cover 为空时，从 StyleAttachment 查图片附件
            if (!StringUtils.hasText(coverImage)) {
                coverImage = fillCoverFromAttachments(styleIdStr);
            }
            // 三级兜底：StyleAttachment 仍为空时，从 TemplateLibrary 查模板图
            if (!StringUtils.hasText(coverImage) && StringUtils.hasText(styleNo)) {
                coverImage = fillCoverFromTemplates(styleNo);
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

        // ★ 颜色兜底：记录 color 为空（或占位"-"）时用款式主色 / 唯一矩阵色补全
        // 仅影响展示，不回写数据库；下次款式保存时 syncPatternProductionInfo 会真正修复
        Object recordColorObj = map.get("color");
        String recordColor = recordColorObj == null ? "" : String.valueOf(recordColorObj).trim();
        if (recordColor.isEmpty() || "-".equals(recordColor)) {
            if (fallbackStyleColor != null) {
                map.put("color", fallbackStyleColor);
            } else if (firstMatrixColor != null) {
                map.put("color", firstMatrixColor);
            }
        }
    }

    /**
     * 二级兜底：从 StyleAttachment 查图片附件作为封面图
     * 参考 ProductionOrderQueryService.fillCoverFromAttachments 实现
     */
    private String fillCoverFromAttachments(String styleIdStr) {
        if (!StringUtils.hasText(styleIdStr)) {
            return null;
        }
        try {
            List<StyleAttachment> attachments = styleAttachmentService.list(
                    new LambdaQueryWrapper<StyleAttachment>()
                            .eq(StyleAttachment::getStyleId, styleIdStr.trim())
                            .like(StyleAttachment::getFileType, "image")
                            .eq(StyleAttachment::getStatus, "active")
                            .orderByAsc(StyleAttachment::getCreateTime));
            if (attachments == null || attachments.isEmpty()) {
                return null;
            }
            for (StyleAttachment a : attachments) {
                if (a != null && StringUtils.hasText(a.getFileUrl())) {
                    return a.getFileUrl();
                }
            }
        } catch (Exception e) {
            log.warn("从 StyleAttachment 查封面图失败: styleId={}", styleIdStr, e);
        }
        return null;
    }

    /**
     * 三级兜底：从 TemplateLibrary 查模板图作为封面图
     * 参考 ProductionOrderQueryService.fillCoverFromTemplates 实现
     */
    private String fillCoverFromTemplates(String styleNo) {
        if (!StringUtils.hasText(styleNo)) {
            return null;
        }
        try {
            List<TemplateLibrary> templates = templateLibraryService.list(
                    new LambdaQueryWrapper<TemplateLibrary>()
                            .eq(TemplateLibrary::getTemplateType, "process_price")
                            .eq(TemplateLibrary::getSourceStyleNo, styleNo.trim())
                            .orderByDesc(TemplateLibrary::getUpdateTime)
                            .orderByDesc(TemplateLibrary::getCreateTime));
            if (templates == null || templates.isEmpty()) {
                return null;
            }
            for (TemplateLibrary t : templates) {
                if (t == null || !StringUtils.hasText(t.getTemplateContent())) {
                    continue;
                }
                String image = extractFirstTemplateImage(t.getTemplateContent());
                if (StringUtils.hasText(image)) {
                    return image;
                }
            }
        } catch (Exception e) {
            log.warn("从 TemplateLibrary 查模板封面图失败: styleNo={}", styleNo, e);
        }
        return null;
    }

    /**
     * 从模板内容中提取第一张图片URL
     * 复用 ProductionOrderQueryService 的同名方法逻辑
     */
    private String extractFirstTemplateImage(String templateContent) {
        if (!StringUtils.hasText(templateContent)) {
            return null;
        }
        try {
            List<Map<String, Object>> nodes = objectMapper.readValue(templateContent,
                    new TypeReference<List<Map<String, Object>>>() {});
            if (nodes == null || nodes.isEmpty()) {
                return null;
            }
            for (Map<String, Object> node : nodes) {
                if (node == null) continue;
                Object imageObj = node.get("image");
                if (imageObj instanceof String && StringUtils.hasText((String) imageObj)) {
                    return ((String) imageObj).trim();
                }
                Object imgObj = node.get("img");
                if (imgObj instanceof String && StringUtils.hasText((String) imgObj)) {
                    return ((String) imgObj).trim();
                }
            }
        } catch (Exception e) {
            log.debug("解析模板内容图片失败: {}", e.getMessage());
        }
        return null;
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
                        .eq(MaterialPurchase::getDeleteFlag, 0)
                        // 样衣开发采购进度只统计样衣采购（source_type='sample'）：
                        // 大货下单自动生成的 order 采购单不得混入（大货/样衣数据隔离）。
                        // 历史 NULL 数据按 pattern_production_id 非空兜底，口径与 saveAndSync 一致。
                        .and(w -> w.eq(MaterialPurchase::getSourceType, "sample")
                                .or(nested -> nested.isNull(MaterialPurchase::getSourceType)
                                        .isNotNull(MaterialPurchase::getPatternProductionId)));
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
            return Collections.emptyList();
        }

        LambdaQueryWrapper<StyleProcess> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(StyleProcess::getStyleId, styleId)
                .orderByAsc(StyleProcess::getSortOrder)
                .orderByAsc(StyleProcess::getId);
        List<StyleProcess> processes = styleProcessService.list(wrapper);
        if (processes == null || processes.isEmpty()) {
            // 未配置子工序时返回空，由前端提醒用户配置，不再走模板兜底硬塞默认流程
            return Collections.emptyList();
        }

        // 查询扫码记录，推导每道工序的状态（MES 报工模型：领取 CLAIM → 完成报工）
        List<PatternScanRecord> scanRecords = listPatternScanRecords(patternId);
        boolean hasGlobalComplete = scanRecords.stream()
                .anyMatch(r -> "COMPLETE".equalsIgnoreCase(safeTrim(r.getOperationType())));

        List<Map<String, Object>> result = new ArrayList<>();
        int sort = 1;
        for (StyleProcess process : processes) {
            String processName = StringUtils.hasText(process.getProcessName())
                    ? process.getProcessName().trim()
                    : StringUtils.hasText(process.getProgressStage()) ? process.getProgressStage().trim() : "";
            if (!StringUtils.hasText(processName)) {
                continue;
            }

            String progressStage = resolveProgressStage(process.getProgressStage(), processName);

            Map<String, Object> item = new LinkedHashMap<>();
            item.put("operationType", processName);
            item.put("processName", processName);
            item.put("progressStage", progressStage);
            item.put("sortOrder", process.getSortOrder() != null ? process.getSortOrder() : sort);
            item.put("scanType", inferPatternScanType(progressStage, processName));
            item.put("price", process.getPrice() != null ? process.getPrice() : BigDecimal.ZERO);
            item.put("unitPrice", process.getPrice() != null ? process.getPrice() : BigDecimal.ZERO);

            // 工序状态：COMPLETED（已报工完成）/ CLAIMED（已领取制作中）/ PENDING（待领取）
            boolean completed = hasGlobalComplete
                    || isProcessCompletedByRecords(scanRecords, processName, progressStage);
            PatternScanRecord activeClaim = null;
            if (!completed) {
                activeClaim = findActiveClaim(scanRecords, processName);
            }
            item.put("status", completed ? "COMPLETED" : (activeClaim != null ? "CLAIMED" : "PENDING"));
            if (activeClaim != null) {
                item.put("claimedBy", activeClaim.getOperatorName());
                item.put("claimedById", activeClaim.getOperatorId());
                item.put("claimedByMe", isCurrentUser(activeClaim.getOperatorId()));
                item.put("claimedTime", activeClaim.getScanTime() != null ? activeClaim.getScanTime() : activeClaim.getCreateTime());
            }
            result.add(item);
            sort++;
        }

        if (result.isEmpty()) {
            // 子工序数据存在但全部无有效名称，同样返回空由前端提醒配置
            return Collections.emptyList();
        }
        return result;
    }

    private List<Map<String, Object>> resolveFromTemplate(PatternProduction pattern) {
        try {
            String styleNo = pattern.getStyleNo();
            if (!StringUtils.hasText(styleNo)) {
                StyleInfo styleInfo = styleInfoService.getById(pattern.getStyleId());
                if (styleInfo != null) {
                    styleNo = styleInfo.getStyleNo();
                }
            }
            if (!StringUtils.hasText(styleNo)) {
                return Collections.emptyList();
            }
            List<Map<String, Object>> templateNodes = templateLibraryService.resolveProgressNodeUnitPrices(styleNo);
            if (templateNodes == null || templateNodes.isEmpty()) {
                return Collections.emptyList();
            }

            List<Map<String, Object>> result = new ArrayList<>();
            for (int i = 0; i < templateNodes.size(); i++) {
                Map<String, Object> node = templateNodes.get(i);
                if (node == null) continue;
                String processName = String.valueOf(node.getOrDefault("name", "")).trim();
                if (!StringUtils.hasText(processName)) continue;

                String progressStage = resolveProgressStage(
                        String.valueOf(node.getOrDefault("progressStage", "")).trim(),
                        processName);

                BigDecimal unitPrice = BigDecimal.ZERO;
                Object priceObj = node.get("unitPrice");
                if (priceObj instanceof BigDecimal bd) {
                    unitPrice = bd;
                } else if (priceObj != null) {
                    try { unitPrice = new BigDecimal(String.valueOf(priceObj)); } catch (Exception e) {
                        log.warn("[PatternEnrichment] 解析工序单价失败: {}", e.getMessage());
                    }
                }

                Map<String, Object> item = new LinkedHashMap<>();
                item.put("operationType", processName);
                item.put("processName", processName);
                item.put("progressStage", progressStage);
                item.put("sortOrder", i + 1);
                item.put("scanType", inferPatternScanType(progressStage, processName));
                item.put("price", unitPrice);
                item.put("unitPrice", unitPrice);
                result.add(item);
            }
            return result;
        } catch (Exception e) {
            log.warn("从模版解析样衣工序配置失败: patternId={}", pattern.getId(), e);
            return Collections.emptyList();
        }
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

    private static final List<String> FIXED_PARENT_STAGES = List.of("采购", "裁剪", "二次工艺", "车缝", "尾部", "入库");

    /**
     * 解析工序的父阶段名。
     * 优先使用 progressStage（如果它是标准父阶段名），
     * 否则通过 ProcessSynonymMapping / ProcessParentMappingService 解析。
     */
    private String resolveProgressStage(String progressStage, String processName) {
        // 1. 如果 progressStage 是标准父阶段名，直接使用
        if (StringUtils.hasText(progressStage) && isFixedParentStage(progressStage.trim())) {
            return progressStage.trim();
        }
        // 2. 如果 progressStage 是同义词（如"缝制"→"车缝"），标准化后使用
        if (StringUtils.hasText(progressStage) && !progressStage.trim().equals(processName)) {
            String normalized = ProcessSynonymMapping.normalize(progressStage.trim());
            if (isFixedParentStage(normalized)) {
                return normalized;
            }
        }
        // 3. 通过动态映射表解析 processName → 父阶段
        if (StringUtils.hasText(processName)) {
            String mapped = processParentMappingService.resolveParentNode(processName.trim());
            if (StringUtils.hasText(mapped)) {
                String normalized = ProcessSynonymMapping.normalize(mapped.trim());
                if (isFixedParentStage(normalized)) {
                    return normalized;
                }
                if (StringUtils.hasText(mapped.trim())) {
                    return mapped.trim();
                }
            }
            // 4. 同义词标准化 processName 本身
            String normalized = ProcessSynonymMapping.normalize(processName.trim());
            if (isFixedParentStage(normalized)) {
                return normalized;
            }
        }
        // 5. 兜底：返回 progressStage 或 processName
        return StringUtils.hasText(progressStage) ? progressStage.trim() : processName;
    }

    private boolean isFixedParentStage(String name) {
        if (!StringUtils.hasText(name)) return false;
        for (String stage : FIXED_PARENT_STAGES) {
            if (stage.equals(name)) return true;
        }
        return false;
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

    // ==================== MES 报工模型：工序状态推导 ====================

    private List<PatternScanRecord> listPatternScanRecords(String patternId) {
        try {
            LambdaQueryWrapper<PatternScanRecord> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(PatternScanRecord::getPatternProductionId, patternId)
                    .eq(PatternScanRecord::getDeleteFlag, 0);
            List<PatternScanRecord> records = patternScanRecordService.list(wrapper);
            return records != null ? records : Collections.emptyList();
        } catch (Exception e) {
            log.warn("[PatternEnrichment] 查询样衣扫码记录失败: patternId={}", patternId, e);
            return Collections.emptyList();
        }
    }

    private String safeTrim(String s) {
        return s == null ? "" : s.trim();
    }

    /**
     * 判断工序是否已报工完成（与 PatternStatusHelper.isPatternAllProcessesCompleted 同口径）。
     * CLAIM（领取）记录不算完成。
     */
    private boolean isProcessCompletedByRecords(List<PatternScanRecord> records, String processName, String progressStage) {
        Set<String> scannedOps = new HashSet<>();
        Set<String> scannedProcessNames = new HashSet<>();
        for (PatternScanRecord r : records) {
            String opType = safeTrim(r.getOperationType());
            if (!StringUtils.hasText(opType) || "CLAIM".equalsIgnoreCase(opType)) {
                continue;
            }
            scannedOps.add(opType.toLowerCase());
            if (StringUtils.hasText(r.getProcessName())) {
                scannedProcessNames.add(r.getProcessName().trim().toLowerCase());
            }
        }

        List<String> candidates = new ArrayList<>();
        if (StringUtils.hasText(processName)) {
            candidates.add(processName.trim().toLowerCase());
        }
        if (StringUtils.hasText(progressStage)) {
            candidates.add(progressStage.trim().toLowerCase());
        }
        String legacyOp = mapLegacyOperationByStage(progressStage);
        if (StringUtils.hasText(legacyOp)) {
            candidates.add(legacyOp.toLowerCase());
        }

        for (String candidate : candidates) {
            if (StringUtils.hasText(candidate)
                    && (scannedOps.contains(candidate) || scannedProcessNames.contains(candidate))) {
                return true;
            }
        }
        return false;
    }

    /**
     * 查找工序的活跃领取记录（CLAIM 且工序未完成）：取最新一条。
     */
    private PatternScanRecord findActiveClaim(List<PatternScanRecord> records, String processName) {
        if (!StringUtils.hasText(processName)) {
            return null;
        }
        String target = processName.trim().toLowerCase();
        PatternScanRecord latest = null;
        for (PatternScanRecord r : records) {
            if (!"CLAIM".equalsIgnoreCase(safeTrim(r.getOperationType()))) {
                continue;
            }
            String recordProcess = safeTrim(r.getProcessName());
            if (!StringUtils.hasText(recordProcess) || !recordProcess.trim().toLowerCase().equals(target)) {
                continue;
            }
            if (latest == null || compareScanTime(r, latest) > 0) {
                latest = r;
            }
        }
        return latest;
    }

    private int compareScanTime(PatternScanRecord a, PatternScanRecord b) {
        LocalDateTime ta = a.getScanTime() != null ? a.getScanTime() : a.getCreateTime();
        LocalDateTime tb = b.getScanTime() != null ? b.getScanTime() : b.getCreateTime();
        if (ta == null && tb == null) return 0;
        if (ta == null) return -1;
        if (tb == null) return 1;
        return ta.compareTo(tb);
    }

    private boolean isCurrentUser(String operatorId) {
        if (!StringUtils.hasText(operatorId)) {
            return false;
        }
        try {
            return operatorId.equals(String.valueOf(com.fashion.supplychain.common.UserContext.userId()));
        } catch (Exception e) {
            return false;
        }
    }

    private String mapLegacyOperationByStage(String stage) {
        if (!StringUtils.hasText(stage)) {
            return null;
        }
        String normalized = stage.trim();
        if (Objects.equals(normalized, "采购")) return "RECEIVE";
        if (Objects.equals(normalized, "裁剪")) return "PLATE";
        if (Objects.equals(normalized, "车缝")) return "FOLLOW_UP";
        if (Objects.equals(normalized, "尾部")) return "COMPLETE";
        if (Objects.equals(normalized, "入库")) return "WAREHOUSE_IN";
        if (Objects.equals(normalized, "出库")) return "WAREHOUSE_OUT";
        if (Objects.equals(normalized, "归还")) return "WAREHOUSE_RETURN";
        return null;
    }
}
