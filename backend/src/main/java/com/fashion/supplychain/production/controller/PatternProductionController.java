package com.fashion.supplychain.production.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.dto.PatternDevelopmentStatsDTO;
import com.fashion.supplychain.production.entity.PatternProduction;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.PatternProductionService;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleProcessService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 样板生产控制器
 */
@RestController
@RequestMapping("/api/production/pattern")
@Slf4j
public class PatternProductionController {

    @Autowired
    private PatternProductionService patternProductionService;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleProcessService styleProcessService;

    @Autowired
    private StyleBomService styleBomService;

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private ObjectMapper objectMapper;

    /**
     * 获取样衣开发费用统计
     *
     * @param rangeType 时间范围：day=今日, week=本周, month=本月
     * @return 费用统计
     */
    @GetMapping("/development-stats")
    public Result<PatternDevelopmentStatsDTO> getDevelopmentStats(
            @RequestParam(defaultValue = "day") String rangeType) {
        try {
            PatternDevelopmentStatsDTO stats = patternProductionService.getDevelopmentStats(rangeType);
            return Result.success(stats);
        } catch (Exception e) {
            log.error("获取样衣开发费用统计失败", e);
            return Result.fail("获取统计失败: " + e.getMessage());
        }
    }

    /**
     * 分页查询样板生产记录
     */
    @GetMapping("/list")
    public Result<Map<String, Object>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String keyword) {

        LambdaQueryWrapper<PatternProduction> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(PatternProduction::getDeleteFlag, 0);

        if (StringUtils.hasText(keyword)) {
            wrapper.and(w -> w.like(PatternProduction::getStyleNo, keyword)
                    .or().like(PatternProduction::getColor, keyword)
                    .or().like(PatternProduction::getPatternMaker, keyword));
        }

        wrapper.orderByDesc(PatternProduction::getCreateTime);

        Page<PatternProduction> pageResult = patternProductionService.page(new Page<>(page, size), wrapper);

        // 为每条记录添加封面图
        List<Map<String, Object>> enrichedRecords = pageResult.getRecords().stream()
                .map(record -> {
                    Map<String, Object> map = new HashMap<>();
                    // 复制所有原有字段
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

                    // 查询关联的款式信息获取封面图、码数和人员信息
                    String coverImage = null;
                    List<String> sizes = new ArrayList<>();
                    String designer = null;      // 设计师
                    String patternDeveloper = null; // 纸样师
                    String plateWorker = null;   // 车板师
                    String merchandiser = null;  // 跟单员

                    if (StringUtils.hasText(record.getStyleId())) {
                        try {
                            Long styleId = Long.parseLong(record.getStyleId());
                            StyleInfo styleInfo = styleInfoService.getById(styleId);
                            if (styleInfo != null) {
                                coverImage = styleInfo.getCover();
                                // 获取人员信息
                                designer = styleInfo.getSampleNo();           // 设计师
                                patternDeveloper = styleInfo.getSampleSupplier(); // 纸样师
                                plateWorker = styleInfo.getPlateWorker();     // 车板师
                                merchandiser = styleInfo.getOrderType();      // 跟单员

                                // 从 sizeColorConfig 提取码数
                                // 实际格式: {"sizes":["XS","S","M","L","XL"], "colors":[...], "quantities":[...]}
                                String sizeColorConfig = styleInfo.getSizeColorConfig();
                                if (StringUtils.hasText(sizeColorConfig)) {
                                    try {
                                        Map<String, Object> configMap = objectMapper.readValue(sizeColorConfig,
                                            new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});
                                        Object sizesObj = configMap.get("sizes");
                                        if (sizesObj instanceof List) {
                                            List<?> sizeList = (List<?>) sizesObj;
                                            for (Object sizeItem : sizeList) {
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
                            log.warn("Failed to get cover image for styleId: {}", record.getStyleId(), e);
                        }
                    }
                    map.put("coverImage", coverImage);
                    map.put("sizes", sizes);
                    // 人员信息
                    map.put("designer", designer);
                    map.put("patternDeveloper", patternDeveloper);
                    map.put("plateWorker", plateWorker);
                    map.put("merchandiser", merchandiser);

                    // 获取工序单价并按进度节点汇总（从t_style_process表）
                    Map<String, Object> processUnitPrices = new LinkedHashMap<>();
                    Map<String, Object> processDetails = new LinkedHashMap<>();

                    if (StringUtils.hasText(record.getStyleId())) {
                        try {
                            Long styleId = Long.parseLong(record.getStyleId());
                            List<StyleProcess> processes = styleProcessService.listByStyleId(styleId);
                            if (processes != null) {
                                // 按进度节点分组汇总单价：采购、裁剪、车缝、尾部、入库
                                Map<String, Double> stagePriceMap = new HashMap<>();
                                Map<String, List<Map<String, Object>>> stageDetailsMap = new HashMap<>();

                                // 初始化5个进度节点
                                String[] stages = {"采购", "裁剪", "车缝", "尾部", "入库"};
                                for (String stage : stages) {
                                    stagePriceMap.put(stage, 0.0);
                                    stageDetailsMap.put(stage, new ArrayList<>());
                                }

                                for (StyleProcess process : processes) {
                                    String progressStage = process.getProgressStage(); // 工序所属的进度节点
                                    BigDecimal price = process.getPrice();
                                    double priceValue = price != null ? price.doubleValue() : 0;

                                    if (StringUtils.hasText(progressStage) && stagePriceMap.containsKey(progressStage)) {
                                        // 汇总单价
                                        stagePriceMap.put(progressStage, stagePriceMap.get(progressStage) + priceValue);

                                        // 保存工序明细
                                        Map<String, Object> detail = new HashMap<>();
                                        detail.put("name", process.getProcessName() != null ? process.getProcessName() : process.getProcessCode());
                                        detail.put("unitPrice", priceValue);
                                        detail.put("processCode", process.getProcessCode());
                                        detail.put("machineType", process.getMachineType());
                                        detail.put("standardTime", process.getStandardTime());
                                        stageDetailsMap.get(progressStage).add(detail);
                                    }
                                }

                                // 将汇总后的单价和明细放入返回Map
                                processUnitPrices.putAll(stagePriceMap);
                                processDetails.putAll(stageDetailsMap);
                            }
                        } catch (Exception e) {
                            log.warn("Failed to get process unit prices for styleId: {}", record.getStyleId(), e);
                        }
                    }
                    map.put("processUnitPrices", processUnitPrices);
                    map.put("processDetails", processDetails);

                    // 查询关联的物料采购单信息（用于计算采购进度）
                    Map<String, Object> procurementProgress = new HashMap<>();
                    if (StringUtils.hasText(record.getStyleId())) {
                        try {
                            Long styleId = Long.parseLong(record.getStyleId());
                            // 查询该款式关联的所有物料采购单
                            LambdaQueryWrapper<MaterialPurchase> purchaseWrapper = new LambdaQueryWrapper<>();
                            purchaseWrapper.eq(MaterialPurchase::getStyleId, styleId)
                                    .eq(MaterialPurchase::getDeleteFlag, 0);
                            List<MaterialPurchase> purchases = materialPurchaseService.list(purchaseWrapper);

                            if (purchases != null && !purchases.isEmpty()) {
                                // 计算采购完成情况
                                long completedCount = purchases.stream()
                                        .filter(p -> p.getReceivedTime() != null)
                                        .count();
                                int totalCount = purchases.size();
                                int completionPercent = (int) ((completedCount * 100.0) / totalCount);

                                procurementProgress.put("total", totalCount);
                                procurementProgress.put("completed", completedCount);
                                procurementProgress.put("percent", completionPercent);

                                // 获取最新完成的采购单信息
                                MaterialPurchase latestCompleted = purchases.stream()
                                        .filter(p -> p.getReceivedTime() != null)
                                        .max((p1, p2) -> p1.getReceivedTime().compareTo(p2.getReceivedTime()))
                                        .orElse(null);

                                if (latestCompleted != null) {
                                    procurementProgress.put("completedTime", latestCompleted.getReceivedTime());
                                    procurementProgress.put("receiver", latestCompleted.getReceiverName());
                                }
                            } else {
                                // 没有采购单，进度为0
                                procurementProgress.put("total", 0);
                                procurementProgress.put("completed", 0);
                                procurementProgress.put("percent", 0);
                            }
                        } catch (Exception e) {
                            log.warn("Failed to get procurement progress for styleId: {}", record.getStyleId(), e);
                            procurementProgress.put("total", 0);
                            procurementProgress.put("completed", 0);
                            procurementProgress.put("percent", 0);
                        }
                    }
                    map.put("procurementProgress", procurementProgress);

                    return map;
                })
                .collect(Collectors.toList());

        // 构建返回结果
        Map<String, Object> result = new HashMap<>();
        result.put("records", enrichedRecords);
        result.put("total", pageResult.getTotal());
        result.put("size", pageResult.getSize());
        result.put("current", pageResult.getCurrent());
        result.put("pages", pageResult.getPages());

        return Result.success(result);
    }

    /**
     * 获取单条记录详情
     */
    @GetMapping("/{id}")
    public Result<PatternProduction> getById(@PathVariable String id) {
        PatternProduction record = patternProductionService.getById(id);
        if (record == null || record.getDeleteFlag() == 1) {
            return Result.fail("记录不存在");
        }
        return Result.success(record);
    }

    /**
     * 领取样板（纸样师傅领取）
     */
    @PostMapping("/{id}/receive")
    public Result<String> receive(
            @PathVariable String id,
            @RequestBody(required = false) Map<String, Object> params) {
        PatternProduction record = patternProductionService.getById(id);
        if (record == null || record.getDeleteFlag() == 1) {
            return Result.fail("记录不存在");
        }

        if (!"PENDING".equals(record.getStatus())) {
            return Result.fail("当前状态不允许领取");
        }

        String currentUser = UserContext.username();
        record.setReceiver(currentUser);
        record.setReceiveTime(LocalDateTime.now());
        record.setStatus("IN_PROGRESS");
        record.setUpdateBy(currentUser);
        record.setUpdateTime(LocalDateTime.now());

        // 纸样师傅 = 领取人（自动记录当前操作账号）
        record.setPatternMaker(currentUser);

        // 设置下板时间（如果提供）
        if (params != null && params.containsKey("releaseTime")) {
            try {
                String releaseTimeStr = (String) params.get("releaseTime");
                if (StringUtils.hasText(releaseTimeStr)) {
                    record.setReleaseTime(LocalDateTime.parse(releaseTimeStr.replace(" ", "T")));
                }
            } catch (Exception e) {
                log.warn("Failed to parse releaseTime: {}", params.get("releaseTime"));
            }
        }

        // 设置交板时间（如果提供）
        if (params != null && params.containsKey("deliveryTime")) {
            try {
                String deliveryTimeStr = (String) params.get("deliveryTime");
                if (StringUtils.hasText(deliveryTimeStr)) {
                    record.setDeliveryTime(LocalDateTime.parse(deliveryTimeStr.replace(" ", "T")));
                }
            } catch (Exception e) {
                log.warn("Failed to parse deliveryTime: {}", params.get("deliveryTime"));
            }
        }

        patternProductionService.updateById(record);

        // 同步更新样衣开发表的生产制单开始时间和领取人
        String styleIdStr = record.getStyleId();
        if (StringUtils.hasText(styleIdStr)) {
            try {
                Long styleId = Long.parseLong(styleIdStr);
                StyleInfo styleInfo = styleInfoService.getById(styleId);
                if (styleInfo != null) {
                    boolean updated = false;

                    // 设置领取人（如果还没有）
                    if (!StringUtils.hasText(styleInfo.getProductionAssignee())) {
                        styleInfo.setProductionAssignee(currentUser);
                        updated = true;
                    }

                    // 设置开始时间（如果还没有）
                    if (styleInfo.getProductionStartTime() == null) {
                        styleInfo.setProductionStartTime(LocalDateTime.now());
                        updated = true;
                    }

                    // 同步车板师到基础信息（plateWorker字段）- 样板生产领取人即为车板师
                    if (!StringUtils.hasText(styleInfo.getPlateWorker())) {
                        styleInfo.setPlateWorker(currentUser);
                        updated = true;
                        log.info("Synced plate worker to style info: styleId={}, plateWorker={}", styleId, currentUser);
                    }

                    if (updated) {
                        styleInfoService.updateById(styleInfo);
                        log.info("Synced production start to style info: styleId={}, assignee={}, startTime={}",
                                styleId, currentUser, LocalDateTime.now());
                    }
                }
            } catch (NumberFormatException e) {
                log.warn("Invalid styleId format: {}", styleIdStr);
            }
        }

        log.info("Pattern production received: id={}, receiver={}, patternMaker={}",
                id, currentUser, record.getPatternMaker());
        return Result.success("领取成功");
    }

    /**
     * 更新工序进度
     */
    @PostMapping("/{id}/progress")
    public Result<String> updateProgress(
            @PathVariable String id,
            @RequestBody Map<String, Integer> progressNodes) {

        PatternProduction record = patternProductionService.getById(id);
        if (record == null || record.getDeleteFlag() == 1) {
            return Result.fail("记录不存在");
        }

        try {
            String progressJson = objectMapper.writeValueAsString(progressNodes);
            record.setProgressNodes(progressJson);
            record.setUpdateBy(UserContext.username());
            record.setUpdateTime(LocalDateTime.now());

            // 检查是否全部完成
            boolean allCompleted = progressNodes.values().stream().allMatch(v -> v >= 100);
            if (allCompleted && !"COMPLETED".equals(record.getStatus())) {
                record.setStatus("COMPLETED");
                record.setCompleteTime(LocalDateTime.now());

                // 同步更新样衣开发表的样板生产时间和领取人
                if (StringUtils.hasText(record.getStyleId())) {
                    try {
                        Long styleId = Long.parseLong(record.getStyleId());
                        StyleInfo styleInfo = styleInfoService.getById(styleId);
                        if (styleInfo != null) {
                            String currentUser = UserContext.username();
                            LocalDateTime now = LocalDateTime.now();

                            // 设置领取人（如果还没有）
                            if (!StringUtils.hasText(styleInfo.getProductionAssignee())) {
                                styleInfo.setProductionAssignee(currentUser);
                            }

                            // 设置开始时间（如果还没有）
                            if (styleInfo.getProductionStartTime() == null) {
                                styleInfo.setProductionStartTime(record.getCreateTime() != null ? record.getCreateTime() : now);
                            }

                            // 设置完成时间
                            styleInfo.setProductionCompletedTime(now);

                            styleInfoService.updateById(styleInfo);
                            log.info("Updated StyleInfo production times: styleId={}, assignee={}", styleId, styleInfo.getProductionAssignee());
                        }
                    } catch (Exception e) {
                        log.error("Failed to update StyleInfo production times: styleId={}", record.getStyleId(), e);
                    }
                }
            }

            patternProductionService.updateById(record);

            log.info("Pattern production progress updated: id={}, progress={}", id, progressNodes);
            return Result.success("进度更新成功");

        } catch (Exception e) {
            log.error("Failed to update progress: id={}", id, e);
            return Result.fail("更新失败：" + e.getMessage());
        }
    }

    /**
     * 删除记录（软删除）
     */
    @DeleteMapping("/{id}")
    public Result<String> delete(@PathVariable String id) {
        PatternProduction record = patternProductionService.getById(id);
        if (record == null) {
            return Result.fail("记录不存在");
        }

        record.setDeleteFlag(1);
        record.setUpdateBy(UserContext.username());
        record.setUpdateTime(LocalDateTime.now());

        patternProductionService.updateById(record);

        log.info("Pattern production deleted: id={}", id);
        return Result.success("删除成功");
    }

    /**
     * 根据BOM配置自动生成物料采购记录
     */
    private void createMaterialPurchaseFromBom(PatternProduction patternProduction) {
        if (patternProduction == null || !StringUtils.hasText(patternProduction.getStyleId())) {
            log.warn("Cannot create material purchase: invalid pattern production or styleId");
            return;
        }

        String styleId = patternProduction.getStyleId();

        // 查询BOM配置
        LambdaQueryWrapper<StyleBom> bomWrapper = new LambdaQueryWrapper<>();
        bomWrapper.eq(StyleBom::getStyleId, styleId);
        List<StyleBom> bomList = styleBomService.list(bomWrapper);

        if (bomList == null || bomList.isEmpty()) {
            log.info("No BOM found for styleId={}, skip material purchase creation", styleId);
            return;
        }

        // 检查是否已经生成过采购记录
        LambdaQueryWrapper<MaterialPurchase> existsWrapper = new LambdaQueryWrapper<>();
        existsWrapper.eq(MaterialPurchase::getPatternProductionId, patternProduction.getId())
                .eq(MaterialPurchase::getDeleteFlag, 0);
        long existsCount = materialPurchaseService.count(existsWrapper);

        if (existsCount > 0) {
            log.info("Material purchase already exists for patternProductionId={}, skip creation",
                    patternProduction.getId());
            return;
        }

        // 获取款式信息
        StyleInfo styleInfo = styleInfoService.getById(styleId);

        // 为每个BOM项创建采购记录
        int createdCount = 0;
        for (StyleBom bom : bomList) {
            try {
                MaterialPurchase purchase = new MaterialPurchase();

                // 生成采购单号：MP + 时间戳后8位
                String purchaseNo = "MP" + System.currentTimeMillis() % 100000000;
                purchase.setPurchaseNo(purchaseNo);

                // 物料信息
                purchase.setMaterialCode(bom.getMaterialCode());
                purchase.setMaterialName(bom.getMaterialName());
                purchase.setMaterialType(bom.getMaterialType());
                purchase.setSpecifications(bom.getSpecification());
                purchase.setUnit(bom.getUnit());

                // 采购数量 = 用量 × 样板数量
                int quantity = patternProduction.getQuantity() != null ? patternProduction.getQuantity() : 1;
                BigDecimal usageAmount = bom.getUsageAmount() != null ? bom.getUsageAmount() : BigDecimal.ZERO;
                int purchaseQty = usageAmount.multiply(BigDecimal.valueOf(quantity)).intValue();
                purchase.setPurchaseQuantity(purchaseQty);
                purchase.setArrivedQuantity(0);

                // 供应商和价格
                purchase.setSupplierName(bom.getSupplier());
                purchase.setUnitPrice(bom.getUnitPrice());
                BigDecimal totalAmount = bom.getUnitPrice() != null
                        ? bom.getUnitPrice().multiply(BigDecimal.valueOf(purchaseQty))
                        : BigDecimal.ZERO;
                purchase.setTotalAmount(totalAmount);

                // 款式信息
                purchase.setStyleId(styleId);
                purchase.setStyleNo(patternProduction.getStyleNo());
                if (styleInfo != null) {
                    purchase.setStyleName(styleInfo.getStyleName());
                    purchase.setStyleCover(styleInfo.getCover());
                }

                // 同步颜色和尺码信息
                purchase.setColor(patternProduction.getColor());
                // 尺码从StyleInfo获取
                if (styleInfo != null && StringUtils.hasText(styleInfo.getSize())) {
                    purchase.setSize(styleInfo.getSize());
                }

                // 采购来源：样衣
                purchase.setSourceType("sample");
                purchase.setPatternProductionId(patternProduction.getId());

                // 状态
                purchase.setStatus("PENDING");
                purchase.setDeleteFlag(0);
                purchase.setCreateTime(LocalDateTime.now());
                purchase.setUpdateTime(LocalDateTime.now());

                materialPurchaseService.save(purchase);
                createdCount++;

            } catch (Exception e) {
                log.error("Failed to create material purchase for bom: bomId={}", bom.getId(), e);
            }
        }

        log.info("Created {} material purchase records for patternProductionId={}",
                createdCount, patternProduction.getId());
    }

    // ==================== 扫码记录相关API ====================

    @Autowired
    private com.fashion.supplychain.production.service.PatternScanRecordService patternScanRecordService;

    /**
     * 提交样板生产扫码记录
     * 支持PC端和小程序端同步
     *
     * @param request 扫码请求
     * @return 扫码结果
     */
    @PostMapping("/scan")
    public Result<Map<String, Object>> submitScan(@RequestBody Map<String, Object> request) {
        try {
            String patternId = (String) request.get("patternId");
            String operationType = (String) request.get("operationType"); // RECEIVE, PLATE, FOLLOW_UP, COMPLETE, WAREHOUSE_IN
            String operatorRole = (String) request.get("operatorRole");   // PLATE_WORKER, MERCHANDISER, WAREHOUSE
            String remark = (String) request.get("remark");

            if (!StringUtils.hasText(patternId)) {
                return Result.fail("样板生产ID不能为空");
            }
            if (!StringUtils.hasText(operationType)) {
                return Result.fail("操作类型不能为空");
            }

            // 查询样板生产记录
            PatternProduction pattern = patternProductionService.getById(patternId);
            if (pattern == null || pattern.getDeleteFlag() == 1) {
                return Result.fail("样板生产记录不存在");
            }

            // 获取当前用户信息
            String operatorId = UserContext.userId();
            String operatorName = UserContext.username();

            // 创建扫码记录
            com.fashion.supplychain.production.entity.PatternScanRecord scanRecord =
                    new com.fashion.supplychain.production.entity.PatternScanRecord();
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

            // 根据操作类型更新样板生产状态
            updatePatternStatusByOperation(pattern, operationType, operatorName);

            // 返回结果
            Map<String, Object> result = new HashMap<>();
            result.put("recordId", scanRecord.getId());
            result.put("patternId", patternId);
            result.put("styleNo", pattern.getStyleNo());
            result.put("color", pattern.getColor());
            result.put("operationType", operationType);
            result.put("operatorName", operatorName);
            result.put("scanTime", scanRecord.getScanTime());
            result.put("newStatus", pattern.getStatus());

            return Result.success(result);
        } catch (Exception e) {
            log.error("样板生产扫码失败", e);
            return Result.fail("扫码失败: " + e.getMessage());
        }
    }

    /**
     * 根据操作类型更新样板生产状态
     */
    private void updatePatternStatusByOperation(PatternProduction pattern, String operationType, String operatorName) {
        boolean needUpdate = false;

        switch (operationType) {
            case "RECEIVE":
                // 领取操作
                if (!"IN_PROGRESS".equals(pattern.getStatus()) && !"COMPLETED".equals(pattern.getStatus())) {
                    pattern.setStatus("IN_PROGRESS");
                    pattern.setReceiver(operatorName);
                    pattern.setReceiveTime(LocalDateTime.now());
                    needUpdate = true;
                }
                break;

            case "PLATE":
                // 车板操作 - 更新进度节点中的"裁剪"进度
                updateProgressNode(pattern, "裁剪", 100);
                needUpdate = true;
                break;

            case "FOLLOW_UP":
                // 跟单操作 - 更新进度节点中的"车缝"进度
                updateProgressNode(pattern, "车缝", 100);
                needUpdate = true;
                break;

            case "COMPLETE":
                // 完成操作
                pattern.setStatus("COMPLETED");
                pattern.setCompleteTime(LocalDateTime.now());
                // 所有进度节点设为100%
                updateProgressNode(pattern, "尾部", 100);
                needUpdate = true;
                break;

            case "WAREHOUSE_IN":
                // 入库操作 - 更新进度节点中的"入库"进度
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

    /**
     * 更新进度节点
     */
    private void updateProgressNode(PatternProduction pattern, String nodeName, int progress) {
        try {
            String progressNodes = pattern.getProgressNodes();
            Map<String, Object> nodesMap;

            if (StringUtils.hasText(progressNodes)) {
                nodesMap = objectMapper.readValue(progressNodes,
                        new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});
            } else {
                nodesMap = new HashMap<>();
            }

            nodesMap.put(nodeName, progress);
            pattern.setProgressNodes(objectMapper.writeValueAsString(nodesMap));
        } catch (Exception e) {
            log.error("更新进度节点失败: {}", nodeName, e);
        }
    }

    /**
     * 获取样板生产的扫码记录列表
     *
     * @param patternId 样板生产ID
     * @return 扫码记录列表
     */
    @GetMapping("/{patternId}/scan-records")
    public Result<List<com.fashion.supplychain.production.entity.PatternScanRecord>> getScanRecords(
            @PathVariable String patternId) {
        try {
            LambdaQueryWrapper<com.fashion.supplychain.production.entity.PatternScanRecord> wrapper =
                    new LambdaQueryWrapper<>();
            wrapper.eq(com.fashion.supplychain.production.entity.PatternScanRecord::getPatternProductionId, patternId)
                    .eq(com.fashion.supplychain.production.entity.PatternScanRecord::getDeleteFlag, 0)
                    .orderByDesc(com.fashion.supplychain.production.entity.PatternScanRecord::getScanTime);

            List<com.fashion.supplychain.production.entity.PatternScanRecord> records =
                    patternScanRecordService.list(wrapper);
            return Result.success(records);
        } catch (Exception e) {
            log.error("获取样板扫码记录失败: patternId={}", patternId, e);
            return Result.fail("获取扫码记录失败");
        }
    }

    /**
     * PC端领取样板生产
     */
    @PostMapping("/{patternId}/receive")
    public Result<Map<String, Object>> receivePattern(@PathVariable String patternId) {
        Map<String, Object> request = new HashMap<>();
        request.put("patternId", patternId);
        request.put("operationType", "RECEIVE");
        request.put("operatorRole", "PLATE_WORKER");
        return submitScan(request);
    }

    /**
     * PC端完成样板生产
     */
    @PostMapping("/{patternId}/complete")
    public Result<Map<String, Object>> completePattern(@PathVariable String patternId) {
        Map<String, Object> request = new HashMap<>();
        request.put("patternId", patternId);
        request.put("operationType", "COMPLETE");
        request.put("operatorRole", "PLATE_WORKER");
        return submitScan(request);
    }

    /**
     * 触发样衣入库
     */
    @PostMapping("/{patternId}/warehouse-in")
    public Result<Map<String, Object>> warehouseIn(
            @PathVariable String patternId,
            @RequestBody(required = false) Map<String, Object> request) {
        try {
            // 查询样板生产记录
            PatternProduction pattern = patternProductionService.getById(patternId);
            if (pattern == null || pattern.getDeleteFlag() == 1) {
                return Result.fail("样板生产记录不存在");
            }

            // 检查状态：必须是已完成状态才能入库
            if (!"COMPLETED".equals(pattern.getStatus())) {
                return Result.fail("样板生产未完成，无法入库");
            }

            // 记录扫码（入库操作）
            Map<String, Object> scanRequest = new HashMap<>();
            scanRequest.put("patternId", patternId);
            scanRequest.put("operationType", "WAREHOUSE_IN");
            scanRequest.put("operatorRole", "WAREHOUSE");
            if (request != null && request.get("remark") != null) {
                scanRequest.put("remark", request.get("remark"));
            }
            Result<Map<String, Object>> scanResult = submitScan(scanRequest);

            if (!Integer.valueOf(200).equals(scanResult.getCode())) {
                return scanResult;
            }

            // TODO: 调用样衣仓库入库API（如果存在独立的库存服务）
            // 这里可以添加自动创建样衣库存记录的逻辑
            // sampleStockService.inbound(pattern.getStyleNo(), pattern.getColor(), pattern.getQuantity());

            Map<String, Object> result = scanResult.getData();
            result.put("message", "样衣入库成功");
            return Result.success(result);
        } catch (Exception e) {
            log.error("样衣入库失败: patternId={}", patternId, e);
            return Result.fail("入库失败: " + e.getMessage());
        }
    }

    /**
     * 样板生产维护
     */
    @PostMapping("/{id}/maintenance")
    public Result<Void> maintenance(@PathVariable String id, @RequestBody Map<String, String> request) {
        try {
            String reason = request.get("reason");
            if (!StringUtils.hasText(reason)) {
                return Result.fail("请输入维护原因");
            }

            // 查询样板生产记录
            PatternProduction pattern = patternProductionService.getById(id);
            if (pattern == null || pattern.getDeleteFlag() == 1) {
                return Result.fail("样板生产记录不存在");
            }

            // 更新维护人和维护时间
            String currentUsername = UserContext.username();
            pattern.setMaintainer(currentUsername);
            pattern.setMaintainTime(LocalDateTime.now());
            patternProductionService.updateById(pattern);

            log.info("样板生产维护成功: id={}, maintainer={}, reason={}", id, currentUsername, reason);
            return Result.success();
        } catch (Exception e) {
            log.error("样板生产维护失败: id={}", id, e);
            return Result.fail("维护失败: " + e.getMessage());
        }
    }
}
