package com.fashion.supplychain.style.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.PatternProduction;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.PatternProductionService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.SecondaryProcess;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.helper.StyleStageHelper;
import com.fashion.supplychain.style.service.SecondaryProcessService;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleProcessService;
import java.math.BigDecimal;
import com.fashion.supplychain.template.orchestration.TemplateLibraryOrchestrator;
import java.time.LocalDateTime;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.NoSuchElementException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
@Slf4j
public class StyleInfoOrchestrator {

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleStageHelper styleStageHelper;

    @Autowired
    private TemplateLibraryOrchestrator templateLibraryOrchestrator;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private PatternProductionService patternProductionService;

    @Autowired
    private StyleBomService styleBomService;

    @Autowired
    private StyleProcessService styleProcessService;

    @Autowired
    private SecondaryProcessService secondaryProcessService;

    /**
     * 实时计算款式的开发成本（BOM用料成本 + 工序成本 + 二次工艺成本）
     * 不依赖可能过期的报价单快照数据
     */
    private BigDecimal computeLiveDevCost(Long styleId) {
        // BOM成本：优先用 total_price，否则用 usage_amount*(1+loss_rate/100)*unit_price
        List<StyleBom> bomItems = styleBomService.listByStyleId(styleId);
        double materialTotal = bomItems.stream().mapToDouble(bom -> {
            BigDecimal tp = bom.getTotalPrice();
            if (tp != null) return tp.doubleValue();
            double usage = bom.getUsageAmount() != null ? bom.getUsageAmount().doubleValue() : 0.0;
            double loss  = bom.getLossRate()    != null ? bom.getLossRate().doubleValue()    : 0.0;
            double up    = bom.getUnitPrice()   != null ? bom.getUnitPrice().doubleValue()   : 0.0;
            return usage * (1.0 + loss / 100.0) * up;
        }).sum();

        // 工序成本：所有工序单价之和
        List<StyleProcess> processes = styleProcessService.listByStyleId(styleId);
        double processTotal = processes.stream()
                .mapToDouble(p -> p.getPrice() != null ? p.getPrice().doubleValue() : 0.0)
                .sum();

        // 二次工艺成本：从 t_secondary_process 实时查询（total_price 已包含数量）
        List<SecondaryProcess> secondaryList = secondaryProcessService.listByStyleId(styleId);
        double otherTotal = secondaryList.stream()
                .mapToDouble(sp -> sp.getTotalPrice() != null ? sp.getTotalPrice().doubleValue() : 0.0)
                .sum();

        return BigDecimal.valueOf(materialTotal + processTotal + otherTotal)
                .setScale(2, java.math.RoundingMode.HALF_UP);
    }

    public IPage<StyleInfo> list(Map<String, Object> params) {
        IPage<StyleInfo> page = styleInfoService.queryPage(params);
        // 用实时BOM+工序成本覆盖列表中可能过期的price字段
        page.getRecords().forEach(style -> {
            try {
                if (style.getId() != null) {
                    style.setPrice(computeLiveDevCost(style.getId()));
                }
            } catch (Exception e) {
                log.warn("计算款式{}实时成本失败: {}", style.getId(), e.getMessage());
            }
        });
        return page;
    }

    public StyleInfo detail(Long id) {
        StyleInfo styleInfo = styleInfoService.getDetailById(id);
        if (styleInfo == null) {
            throw new NoSuchElementException("款号不存在");
        }
        return styleInfo;
    }

    public boolean save(StyleInfo styleInfo) {
        validateStyleInfo(styleInfo);
        try {
            boolean result = styleInfoService.saveOrUpdateStyle(styleInfo);
            if (result) {
                // 自动创建样板生产记录（待领取状态）
                try {
                    // 如果是新增，重新查询获取完整对象（包含自动生成的ID）
                    if (styleInfo.getId() == null && StringUtils.hasText(styleInfo.getStyleNo())) {
                        StyleInfo savedStyle = styleInfoService.lambdaQuery()
                                .eq(StyleInfo::getStyleNo, styleInfo.getStyleNo())
                                .orderByDesc(StyleInfo::getCreateTime)
                                .last("LIMIT 1")
                                .one();
                        if (savedStyle != null) {
                            createPatternProductionRecord(savedStyle);
                        }
                    } else {
                        createPatternProductionRecord(styleInfo);
                    }
                } catch (Exception e) {
                    log.error("自动创建样板生产记录失败: styleId={}, styleNo={}",
                            styleInfo.getId(), styleInfo.getStyleNo(), e);
                }
                // 移除自动同步到模板库，只有手动推送时才同步
                // tryCreateTemplateFromStyle(styleInfo == null ? null :
                // styleInfo.getStyleNo());
                return true;
            }
            throw new IllegalStateException("操作失败");
        } catch (DataIntegrityViolationException e) {
            String msg = e.getMostSpecificCause() != null ? e.getMostSpecificCause().getMessage() : e.getMessage();
            if (msg != null && msg.toLowerCase().contains("duplicate")) {
                throw new IllegalArgumentException("款号已存在");
            }
            log.error("数据完整性约束失败: {}", msg, e);
            throw new IllegalStateException("保存失败: " + msg);
        } catch (Exception e) {
            log.error("保存样式信息失败", e);
            throw new IllegalStateException("保存失败: " + e.getMessage());
        }
    }

    public boolean update(StyleInfo styleInfo) {
        validateStyleInfo(styleInfo);
        try {
            boolean result = styleInfoService.saveOrUpdateStyle(styleInfo);
            if (result) {
                // 同步更新样板生产记录的颜色和数量
                try {
                    syncPatternProductionInfo(styleInfo);
                } catch (Exception e) {
                    log.warn("同步样板生产信息失败: styleId={}, error={}", styleInfo.getId(), e.getMessage());
                }

                // 移除自动同步到模板库，只有手动推送时才同步
                // try {
                // String styleNo = styleInfo == null ? null : styleInfo.getStyleNo();
                // if (!StringUtils.hasText(styleNo) && styleInfo != null && styleInfo.getId()
                // != null) {
                // StyleInfo current = styleInfoService.getById(styleInfo.getId());
                // styleNo = current == null ? null : current.getStyleNo();
                // }
                // tryCreateTemplateFromStyle(styleNo);
                // } catch (Exception e) {
                // log.warn("Failed to sync templates after style update: styleId={},
                // styleNo={}",
                // styleInfo == null ? null : styleInfo.getId(),
                // styleInfo == null ? null : styleInfo.getStyleNo(), e);
                // }
                return true;
            }
            throw new IllegalStateException("操作失败");
        } catch (DataIntegrityViolationException e) {
            String msg = e.getMostSpecificCause() != null ? e.getMostSpecificCause().getMessage() : e.getMessage();
            if (msg != null && msg.toLowerCase().contains("duplicate")) {
                throw new IllegalArgumentException("款号已存在");
            }
            throw new IllegalStateException("保存失败");
        } catch (Exception e) {
            throw new IllegalStateException("保存失败");
        }
    }

    public boolean updateProductionRequirements(Long id, Map<String, Object> body) {
        return styleStageHelper.updateProductionRequirements(id, body);
    }

    public boolean rollbackProductionRequirements(Long id, Map<String, Object> body) {
        return styleStageHelper.rollbackProductionRequirements(id, body);
    }

    public boolean startProductionStage(Long id) {
        return styleStageHelper.startProductionStage(id);
    }

    public boolean completeProductionStage(Long id) {
        return styleStageHelper.completeProductionStage(id);
    }

    public boolean resetProductionStage(Long id, Map<String, Object> body) {
        return styleStageHelper.resetProductionStage(id, body);
    }

    public boolean startPattern(Long id) {
        return styleStageHelper.startPattern(id);
    }

    public boolean completePattern(Long id) {
        return styleStageHelper.completePattern(id);
    }

    public boolean resetPattern(Long id, Map<String, Object> body) {
        return styleStageHelper.resetPattern(id, body);
    }

    public boolean startSample(Long id) {
        return styleStageHelper.startSample(id);
    }

    public boolean updateSampleProgress(Long id, Map<String, Object> body) {
        return styleStageHelper.updateSampleProgress(id, body);
    }

    public boolean completeSample(Long id) {
        return styleStageHelper.completeSample(id);
    }

    public boolean resetSample(Long id, Map<String, Object> body) {
        return styleStageHelper.resetSample(id, body);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean delete(Long id) {
        // 检查是否存在关联的未删除生产订单
        long activeOrders = productionOrderService.count(
                new LambdaQueryWrapper<ProductionOrder>()
                        .eq(ProductionOrder::getStyleId, String.valueOf(id))
                        .eq(ProductionOrder::getDeleteFlag, 0));
        if (activeOrders > 0) {
            throw new IllegalStateException("该款式下存在 " + activeOrders + " 个生产订单，无法删除");
        }

        // 先删除关联的样板生产记录
        try {
            boolean removed = patternProductionService.lambdaUpdate()
                    .eq(PatternProduction::getStyleId, String.valueOf(id))
                    .remove();
            if (removed) {
                log.info("删除款式时，级联删除了样板生产记录: styleId={}", id);
            }
        } catch (Exception e) {
            log.warn("删除关联的样板生产记录失败: styleId={}", id, e);
            // 继续删除款式信息，不因为样板生产记录删除失败而中断
        }

        // 删除款式信息
        boolean result = styleInfoService.deleteById(id);
        if (!result) {
            throw new IllegalStateException("删除失败");
        }
        return true;
    }

    private void tryCreateTemplateFromStyle(String styleNo) {
        try {
            String styleNoTrimmed = styleNo == null ? null : styleNo.trim();
            if (StringUtils.hasText(styleNoTrimmed)) {
                Map<String, Object> body = new HashMap<>();
                body.put("sourceStyleNo", styleNoTrimmed);
                body.put("templateTypes", List.of());
                templateLibraryOrchestrator.createFromStyle(body);
            }
        } catch (Exception e) {
            log.warn("Failed to create templates from style: styleNo={}", styleNo, e);
        }
    }

    /**
     * 检查生产要求是否被锁定（是否被生产订单引用）
     */
    public boolean isProductionReqLocked(Long styleId) {
        if (styleId == null) {
            return false;
        }

        // 获取款号信息
        StyleInfo styleInfo = styleInfoService.getById(styleId);
        if (styleInfo == null || !StringUtils.hasText(styleInfo.getStyleNo())) {
            return false;
        }

        // 检查是否有生产订单引用了这个款号
        QueryWrapper<ProductionOrder> queryWrapper = new QueryWrapper<>();
        queryWrapper.eq("style_no", styleInfo.getStyleNo());
        queryWrapper.last("LIMIT 1");

        try {
            long count = productionOrderService.count(queryWrapper);
            return count > 0;
        } catch (Exception e) {
            log.error("检查生产要求锁定状态失败: styleId={}, styleNo={}", styleId, styleInfo.getStyleNo(), e);
            return false;
        }
    }

    /**
     * 自动创建样板生产记录
     */
    private void createPatternProductionRecord(StyleInfo styleInfo) {
        if (styleInfo == null || styleInfo.getId() == null) {
            return;
        }

        // 检查是否已存在样板生产记录
        long existingCount = patternProductionService.lambdaQuery()
                .eq(PatternProduction::getStyleId, String.valueOf(styleInfo.getId()))
                .count();

        if (existingCount > 0) {
            log.info("样板生产记录已存在，跳过自动创建: styleId={}", styleInfo.getId());
            return;
        }

        // 初始化6个工序进度节点为0
        String progressNodesJson = "{\"cutting\":0,\"sewing\":0,\"ironing\":0,\"quality\":0,\"secondary\":0,\"packaging\":0}";

        PatternProduction patternProduction = new PatternProduction();
        patternProduction.setStyleId(String.valueOf(styleInfo.getId()));
        patternProduction.setStyleNo(styleInfo.getStyleNo());

        // 从样衣信息复制颜色、数量、下板时间、交板时间
        String color = styleInfo.getColor();
        if (!StringUtils.hasText(color)) {
            color = "-"; // 默认值
        }
        patternProduction.setColor(color);

        // 使用 sampleQuantity，如果为空则默认为 1
        Integer quantity = styleInfo.getSampleQuantity();
        if (quantity == null || quantity == 0) {
            quantity = 1; // 默认至少1件
        }
        patternProduction.setQuantity(quantity);

        patternProduction.setReleaseTime(styleInfo.getCreateTime()); // 下板时间
        patternProduction.setDeliveryTime(styleInfo.getDeliveryDate()); // 交板时间

        patternProduction.setStatus("PENDING");
        patternProduction.setProgressNodes(progressNodesJson);
        patternProduction.setCreateTime(LocalDateTime.now());
        patternProduction.setUpdateTime(LocalDateTime.now());

        UserContext ctx = UserContext.get();
        if (ctx != null) {
            patternProduction.setCreateBy(ctx.getUsername());
        }

        boolean saved = patternProductionService.save(patternProduction);
        if (saved) {
            log.info("自动创建样板生产记录成功: styleId={}, styleNo={}, patternId={}, color={}, quantity={}",
                    styleInfo.getId(), styleInfo.getStyleNo(), patternProduction.getId(),
                    styleInfo.getColor(), styleInfo.getSampleQuantity());
        }
    }

    /**
     * 同步样板生产记录的颜色和数量信息
     * 当款式的颜色或数量更新时，同步更新对应的样板生产记录
     */
    private void syncPatternProductionInfo(StyleInfo styleInfo) {
        if (styleInfo == null || styleInfo.getId() == null) {
            return;
        }

        // 查询该款式对应的样板生产记录
        LambdaQueryWrapper<PatternProduction> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(PatternProduction::getStyleId, String.valueOf(styleInfo.getId()))
                .eq(PatternProduction::getDeleteFlag, 0);

        List<PatternProduction> records = patternProductionService.list(wrapper);
        if (records == null || records.isEmpty()) {
            return;
        }

        // 更新颜色和数量
        String color = styleInfo.getColor();
        if (!StringUtils.hasText(color)) {
            color = "-";
        }
        Integer quantity = styleInfo.getSampleQuantity();
        if (quantity == null || quantity == 0) {
            quantity = 1;
        }

        for (PatternProduction record : records) {
            record.setColor(color);
            record.setQuantity(quantity);
            record.setDeliveryTime(styleInfo.getDeliveryDate()); // 同步交板时间
            record.setUpdateTime(LocalDateTime.now());
        }

        boolean updated = patternProductionService.updateBatchById(records);
        if (updated) {
            log.info("同步样板生产记录成功: styleId={}, recordCount={}, color={}, quantity={}",
                    styleInfo.getId(), records.size(), color, quantity);
        }
    }

    private void validateStyleInfo(StyleInfo styleInfo) {
        if (styleInfo == null) {
            throw new IllegalArgumentException("参数不能为空");
        }
        if (!StringUtils.hasText(styleInfo.getStyleNo())) {
            throw new IllegalArgumentException("请输入款号");
        }
        if (!StringUtils.hasText(styleInfo.getStyleName())) {
            throw new IllegalArgumentException("请输入款名");
        }
        // 品类不再必填，允许创建空记录
    }

    /**
     * 开始配置尺寸表
     */
    public boolean startSize(Long id) {
        return styleStageHelper.startSize(id);
    }

    /**
     * 完成尺寸表配置
     */
    public boolean completeSize(Long id) {
        return styleStageHelper.completeSize(id);
    }

    public boolean startBom(Long id) {
        return styleStageHelper.startBom(id);
    }

    public boolean completeBom(Long id) {
        return styleStageHelper.completeBom(id);
    }

    public boolean resetBom(Long id, Map<String, Object> body) {
        return styleStageHelper.resetBom(id, body);
    }

    public boolean startProcess(Long id) {
        return styleStageHelper.startProcess(id);
    }

    public boolean completeProcess(Long id) {
        return styleStageHelper.completeProcess(id);
    }

    public boolean resetProcess(Long id, Map<String, Object> body) {
        return styleStageHelper.resetProcess(id, body);
    }

    public boolean startSizePrice(Long id) {
        return styleStageHelper.startSizePrice(id);
    }

    public boolean completeSizePrice(Long id) {
        return styleStageHelper.completeSizePrice(id);
    }

    public boolean resetSizePrice(Long id, Map<String, Object> body) {
        return styleStageHelper.resetSizePrice(id, body);
    }

    public boolean startSecondary(Long id) {
        return styleStageHelper.startSecondary(id);
    }

    public boolean completeSecondary(Long id) {
        return styleStageHelper.completeSecondary(id);
    }

    public boolean skipSecondary(Long id) {
        return styleStageHelper.skipSecondary(id);
    }

    public boolean resetSecondary(Long id, Map<String, Object> body) {
        return styleStageHelper.resetSecondary(id, body);
    }

    /**
     * 获取样衣开发费用统计
     */
    public Map<String, Object> getDevelopmentStats(String rangeType) {
        LocalDateTime startTime = getStartTimeByRange(rangeType);
        LocalDateTime endTime = LocalDateTime.now();

        // 查询时间范围内已完成的样衣
        List<StyleInfo> completedStyles = styleInfoService.lambdaQuery()
                .eq(StyleInfo::getSampleStatus, "COMPLETED")
                .ge(StyleInfo::getSampleCompletedTime, startTime)
                .le(StyleInfo::getSampleCompletedTime, endTime)
                .list();

        int styleCount = completedStyles.size();

        // 统计费用：遍历所有已完成的样衣，汇总其报价单费用
        double totalMaterialCost = 0.0;
        double totalProcessCost = 0.0;
        double totalOtherCost = 0.0;

        for (StyleInfo style : completedStyles) {
            // 用实时BOM成本（不依赖可能过期的报价单快照）
            List<StyleBom> bomItems = styleBomService.listByStyleId(style.getId());
            double materialCost = bomItems.stream().mapToDouble(bom -> {
                BigDecimal tp = bom.getTotalPrice();
                if (tp != null) return tp.doubleValue();
                double usage = bom.getUsageAmount() != null ? bom.getUsageAmount().doubleValue() : 0.0;
                double loss  = bom.getLossRate()    != null ? bom.getLossRate().doubleValue()    : 0.0;
                double up    = bom.getUnitPrice()   != null ? bom.getUnitPrice().doubleValue()   : 0.0;
                return usage * (1.0 + loss / 100.0) * up;
            }).sum();
            totalMaterialCost += materialCost;

            // 用实时工序成本
            List<StyleProcess> processes = styleProcessService.listByStyleId(style.getId());
            double processCost = processes.stream()
                    .mapToDouble(p -> p.getPrice() != null ? p.getPrice().doubleValue() : 0.0)
                    .sum();
            totalProcessCost += processCost;

            // 二次工艺成本：从 t_secondary_process 实时计算
            List<SecondaryProcess> secondaryItems = secondaryProcessService.listByStyleId(style.getId());
            double secondaryCost = secondaryItems.stream()
                    .mapToDouble(sp -> sp.getTotalPrice() != null ? sp.getTotalPrice().doubleValue() : 0.0)
                    .sum();
            totalOtherCost += secondaryCost;
        }

        double totalCost = totalMaterialCost + totalProcessCost + totalOtherCost;

        Map<String, Object> stats = new HashMap<>();
        stats.put("patternCount", styleCount);
        stats.put("materialCost", totalMaterialCost);
        stats.put("processCost", totalProcessCost);
        stats.put("secondaryProcessCost", totalOtherCost);  // other_cost 对应二次工艺
        stats.put("totalCost", totalCost);

        return stats;
    }

    private LocalDateTime getStartTimeByRange(String rangeType) {
        LocalDate today = LocalDate.now();
        switch (rangeType) {
            case "day":
                return today.atStartOfDay();
            case "week":
                return today.minusDays(today.getDayOfWeek().getValue() - 1).atStartOfDay();
            case "month":
                return today.withDayOfMonth(1).atStartOfDay();
            default:
                return today.atStartOfDay();
        }
    }

    /**
     * 保存样衣审核结论（评语可选）
     *
     * @param id            款式ID
     * @param reviewStatus  审核状态：PASS / REWORK / REJECT
     * @param reviewComment 审核评语（可为空）
     * @return 更新后的款式信息
     */
    @org.springframework.transaction.annotation.Transactional(rollbackFor = Exception.class)
    public StyleInfo saveSampleReview(Long id, String reviewStatus, String reviewComment) {
        StyleInfo style = styleInfoService.getById(id);
        if (style == null) {
            throw new RuntimeException("款式不存在：" + id);
        }
        style.setSampleReviewStatus(reviewStatus);
        style.setSampleReviewComment(reviewComment);
        style.setSampleReviewer(UserContext.username());
        style.setSampleReviewTime(LocalDateTime.now());
        styleInfoService.updateById(style);
        return styleInfoService.getById(id);
    }
}
