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

                    // 查询关联的款式信息获取封面图
                    String coverImage = null;
                    if (StringUtils.hasText(record.getStyleId())) {
                        try {
                            Long styleId = Long.parseLong(record.getStyleId());
                            StyleInfo styleInfo = styleInfoService.getById(styleId);
                            if (styleInfo != null) {
                                coverImage = styleInfo.getCover();
                            }
                        } catch (Exception e) {
                            log.warn("Failed to get cover image for styleId: {}", record.getStyleId(), e);
                        }
                    }
                    map.put("coverImage", coverImage);

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

        // 设置纸样师傅（如果提供）
        if (params != null && params.containsKey("patternMaker")) {
            record.setPatternMaker((String) params.get("patternMaker"));
        }

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

                    // 同步纸样师到基础信息（sampleSupplier字段）
                    if (StringUtils.hasText(record.getPatternMaker()) && !StringUtils.hasText(styleInfo.getSampleSupplier())) {
                        styleInfo.setSampleSupplier(record.getPatternMaker());
                        updated = true;
                        log.info("Synced pattern maker to style info: styleId={}, patternMaker={}", styleId, record.getPatternMaker());
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
}
