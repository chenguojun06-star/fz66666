package com.fashion.supplychain.style.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.system.orchestration.ChangeApprovalOrchestrator;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.PatternProduction;
import com.fashion.supplychain.production.service.PatternProductionService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.SecondaryProcess;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.helper.StyleCostCalculator;
import com.fashion.supplychain.style.helper.StyleListEnrichmentHelper;
import com.fashion.supplychain.style.helper.StyleLogHelper;
import com.fashion.supplychain.style.helper.StyleStageHelper;
import com.fashion.supplychain.style.helper.StyleStageCompletionHelper;
import com.fashion.supplychain.style.service.SecondaryProcessService;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleProcessService;
import java.time.LocalDateTime;
import java.util.List;
import java.util.HashMap;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.context.annotation.Lazy;

@Service
@Slf4j
public class StyleInfoOrchestrator {

    private static final String STYLE_STATUS_SCRAPPED = "SCRAPPED";

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleStageHelper styleStageHelper;

    @Autowired
    private StyleStageCompletionHelper styleStageCompletionHelper;

    @Autowired
    private StyleLogHelper styleLogHelper;

    @Autowired
    private StyleSelectionSourceHelper styleSelectionSourceHelper;

    @Autowired
    private StylePatternProductionHelper stylePatternProductionHelper;

    @Autowired
    private StyleCostCalculator styleCostCalculator;

    @Autowired
    private StyleListEnrichmentHelper styleListEnrichmentHelper;

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

    @Lazy
    @Autowired(required = false)
    private ChangeApprovalOrchestrator changeApprovalOrchestrator;

    @Autowired
    private com.fashion.supplychain.style.service.StyleOperationLogService styleOperationLogService;

    public IPage<StyleInfo> list(Map<String, Object> params) {
        IPage<StyleInfo> page = styleInfoService.queryPage(params);
        styleSelectionSourceHelper.fillSelectionSourceAndCoverFallback(page.getRecords());

        List<StyleInfo> records = page.getRecords();
        if (records == null || records.isEmpty()) {
            return page;
        }

        List<Long> styleIds = records.stream()
                .map(StyleInfo::getId)
                .filter(id -> id != null)
                .collect(Collectors.toList());
        if (styleIds.isEmpty()) {
            return page;
        }

        Map<Long, List<StyleBom>> bomByStyleId = styleBomService.lambdaQuery()
                .in(StyleBom::getStyleId, styleIds)
                .list()
                .stream()
                .collect(Collectors.groupingBy(StyleBom::getStyleId));

        Map<Long, List<StyleProcess>> processByStyleId = styleProcessService.lambdaQuery()
                .in(StyleProcess::getStyleId, styleIds)
                .list()
                .stream()
                .collect(Collectors.groupingBy(StyleProcess::getStyleId));

        Map<Long, List<SecondaryProcess>> secondaryByStyleId = secondaryProcessService.lambdaQuery()
                .in(SecondaryProcess::getStyleId, styleIds)
                .list()
                .stream()
                .collect(Collectors.groupingBy(SecondaryProcess::getStyleId));

        records.forEach(style -> {
            try {
                if (style.getId() != null) {
                    style.setPrice(styleCostCalculator.computeLiveDevCostFromBatch(
                            style.getId(), bomByStyleId, processByStyleId, secondaryByStyleId));
                }
            } catch (Exception e) {
                log.warn("计算款式{}实时成本失败: {}", style.getId(), e.getMessage());
            }
        });

        styleListEnrichmentHelper.fillQuotationPriceFields(records);
        styleListEnrichmentHelper.fillProgressFields(records);
        styleListEnrichmentHelper.fillOrderCountFields(records);
        styleListEnrichmentHelper.fillScrapFields(records);
        styleListEnrichmentHelper.fillWarehousedFields(records);

        return page;
    }

    public StyleInfo detail(String idOrStyleNo) {
        String key = idOrStyleNo == null ? null : idOrStyleNo.trim();
        if (!StringUtils.hasText(key)) {
            throw new NoSuchElementException("款号不存在");
        }
        Long readableTenantId = resolveReadableTenantId();
        boolean tenantScopedRead = !UserContext.isSuperAdmin();

        if (isNumericKey(key)) {
            StyleInfo styleInfo = styleInfoService.getDetailById(Long.parseLong(key));
            if (styleInfo != null) {
                return styleInfo;
            }
        }

        StyleInfo matched = styleInfoService.getOne(new LambdaQueryWrapper<StyleInfo>()
            .select(StyleInfo::getId)
            .eq(tenantScopedRead, StyleInfo::getTenantId, readableTenantId)
            .eq(StyleInfo::getStyleNo, key)
            .last("limit 1"));
        if (matched == null || matched.getId() == null) {
            throw new NoSuchElementException("款号不存在");
        }

        StyleInfo styleInfo = styleInfoService.getDetailById(matched.getId());
        if (styleInfo == null) {
            throw new NoSuchElementException("款号不存在");
        }
        return styleInfo;
    }

    public StyleInfo detail(Long id) {
        return detail(id == null ? null : String.valueOf(id));
    }

    private Long resolveReadableTenantId() {
        Long tenantId = UserContext.tenantId();
        return tenantId != null ? tenantId : -1L;
    }

    private boolean isTenantScopedRead() {
        return !UserContext.isSuperAdmin();
    }

    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = {"style", "dataCenter"}, allEntries = true)
    public boolean save(StyleInfo styleInfo) {
        if (styleInfo == null) {
            throw new IllegalArgumentException("参数错误");
        }
        Long currentTenantId = UserContext.tenantId();
        if (currentTenantId == null && !UserContext.isSuperAdmin()) {
            log.error("[TenantGuard] 租户信息缺失，拒绝创建款式。userId={}, username={}",
                    UserContext.userId(), UserContext.username());
            throw new IllegalStateException("租户信息异常，请退出重新登录后再试");
        }
        if (currentTenantId != null && styleInfo.getTenantId() == null) {
            styleInfo.setTenantId(currentTenantId);
        }
        if (styleInfo.getTenantId() == null) {
            throw new IllegalArgumentException(
                    UserContext.isSuperAdmin()
                            ? "超级管理员不能直接创建款式，请使用对应租户账号操作"
                            : "租户信息异常，请退出重新登录后再试");
        }
        styleSelectionSourceHelper.normalizeManualSourceFields(styleInfo);
        validateStyleInfo(styleInfo);
        if (styleInfo.getId() == null && StringUtils.hasText(styleInfo.getStyleNo())) {
            styleInfo.setStyleNo(generateUniqueStyleNo(styleInfo.getStyleNo()));
        }
        try {
            boolean result = styleInfoService.saveOrUpdateStyle(styleInfo);
            if (result) {
                try {
                    if (styleInfo.getId() == null && StringUtils.hasText(styleInfo.getStyleNo())) {
                        StyleInfo savedStyle = styleInfoService.lambdaQuery()
                                .eq(StyleInfo::getStyleNo, styleInfo.getStyleNo())
                                .orderByDesc(StyleInfo::getCreateTime)
                                .last("LIMIT 1")
                                .one();
                        if (savedStyle != null) {
                            stylePatternProductionHelper.createPatternProductionRecord(savedStyle);
                        }
                    } else {
                        stylePatternProductionHelper.createPatternProductionRecord(styleInfo);
                    }
                } catch (Exception e) {
                    log.error("自动创建样板生产记录失败: styleId={}, styleNo={}",
                            styleInfo.getId(), styleInfo.getStyleNo(), e);
                }
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

    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = {"style", "dataCenter"}, allEntries = true)
    public boolean update(StyleInfo styleInfo) {
        styleSelectionSourceHelper.normalizeManualSourceFields(styleInfo);
        validateStyleInfo(styleInfo);
        try {
            if (styleInfo.getId() != null) {
                StyleInfo existing = styleInfoService.lambdaQuery()
                        .eq(StyleInfo::getId, styleInfo.getId())
                        .eq(StyleInfo::getTenantId, UserContext.tenantId())
                        .one();
                ensureNotScrapped(existing);
            }
            boolean result = styleInfoService.saveOrUpdateStyle(styleInfo);
            if (result) {
                try {
                    stylePatternProductionHelper.syncPatternProductionInfo(styleInfo);
                } catch (Exception e) {
                    log.warn("同步样板生产信息失败: styleId={}, error={}", styleInfo.getId(), e.getMessage());
                }
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

    public StyleInfo updateProductionRequirements(Long id, Map<String, Object> body) {
        ensureStyleNotScrapped(id);
        return styleStageHelper.updateProductionRequirements(id, body);
    }

    public boolean rollbackProductionRequirements(Long id, Map<String, Object> body) {
        ensureStyleNotScrapped(id);
        return styleStageHelper.rollbackProductionRequirements(id, body);
    }

    public boolean rollbackPatternRevision(Long id, Map<String, Object> body) {
        ensureStyleNotScrapped(id);
        return styleStageHelper.rollbackPatternRevision(id, body);
    }

    public void lockPatternRevision(Long id) {
        ensureStyleNotScrapped(id);
        styleStageHelper.lockPatternRevision(id);
    }

    public void lockProductionRequirements(Long id) {
        ensureStyleNotScrapped(id);
        styleStageHelper.lockProductionRequirements(id);
    }

    private boolean isNumericKey(String key) {
        for (int i = 0; i < key.length(); i++) {
            if (!Character.isDigit(key.charAt(i))) {
                return false;
            }
        }
        return !key.isEmpty();
    }

    public boolean startProductionStage(Long id) {
        ensureStyleNotScrapped(id);
        return styleStageHelper.startProductionStage(id);
    }

    public boolean completeProductionStage(Long id) {
        ensureStyleNotScrapped(id);
        return styleStageHelper.completeProductionStage(id);
    }

    public boolean resetProductionStage(Long id, Map<String, Object> body) {
        ensureStyleNotScrapped(id);
        return styleStageHelper.resetProductionStage(id, body);
    }

    public boolean startPattern(Long id) {
        ensureStyleNotScrapped(id);
        return styleStageHelper.startPattern(id);
    }

    public boolean completePattern(Long id) {
        ensureStyleNotScrapped(id);
        return styleStageHelper.completePattern(id);
    }

    public boolean resetPattern(Long id, Map<String, Object> body) {
        ensureStyleNotScrapped(id);
        return styleStageHelper.resetPattern(id, body);
    }

    public boolean startSample(Long id) {
        ensureStyleNotScrapped(id);
        return styleStageHelper.startSample(id);
    }

    public boolean updateSampleProgress(Long id, Map<String, Object> body) {
        ensureStyleNotScrapped(id);
        return styleStageHelper.updateSampleProgress(id, body);
    }

    public boolean completeSample(Long id) {
        ensureStyleNotScrapped(id);
        return styleStageHelper.completeSample(id);
    }

    public boolean resetSample(Long id, Map<String, Object> body) {
        ensureStyleNotScrapped(id);
        return styleStageHelper.resetSample(id, body);
    }

    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = {"style", "dataCenter"}, allEntries = true)
    public boolean delete(Long id) {
        long activeOrders = productionOrderService.count(
                new LambdaQueryWrapper<ProductionOrder>()
                        .eq(ProductionOrder::getStyleId, String.valueOf(id))
                        .eq(ProductionOrder::getDeleteFlag, 0));
        if (activeOrders > 0) {
            throw new IllegalStateException("该款式下存在 " + activeOrders + " 个生产订单，无法删除");
        }
        if (patternProductionService != null) {
            patternProductionService.lambdaUpdate()
                    .eq(com.fashion.supplychain.production.entity.PatternProduction::getStyleId, id)
                    .remove();
        }
        return styleInfoService.deleteById(id);
    }

    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = {"style", "dataCenter"}, allEntries = true)
    public Object deleteWithApproval(Long id, String reason) {
        StyleInfo style = styleInfoService.lambdaQuery()
                .eq(StyleInfo::getId, id)
                .eq(StyleInfo::getTenantId, UserContext.tenantId())
                .one();
        if (style == null) {
            throw new NoSuchElementException("款式不存在");
        }
        String styleNo = style.getStyleNo() != null ? style.getStyleNo() : String.valueOf(id);

        if (changeApprovalOrchestrator != null) {
            Map<String, Object> opData = new HashMap<>();
            opData.put("styleId", id);
            Map<String, Object> approvalResp = changeApprovalOrchestrator.checkAndCreateIfNeeded(
                    "STYLE_DELETE", String.valueOf(id), styleNo, opData, reason);
            if (approvalResp != null) {
                return approvalResp;
            }
        }
        return scrap(id, reason);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean scrap(Long id, String reason) {
        StyleInfo style = styleInfoService.lambdaQuery()
                .eq(StyleInfo::getId, id)
                .eq(StyleInfo::getTenantId, UserContext.tenantId())
                .one();
        if (style == null) {
            throw new NoSuchElementException("款式不存在");
        }
        if (STYLE_STATUS_SCRAPPED.equalsIgnoreCase(String.valueOf(style.getStatus()))) {
            throw new IllegalStateException("该开发样已报废，无需重复操作");
        }

        String remark = StringUtils.hasText(reason) ? reason.trim() : "未填写报废原因";

        long activeOrders = productionOrderService.count(
                new LambdaQueryWrapper<ProductionOrder>()
                        .eq(ProductionOrder::getStyleId, String.valueOf(id))
                        .eq(ProductionOrder::getDeleteFlag, 0));
        if (activeOrders > 0) {
            throw new IllegalStateException("该款式下存在 " + activeOrders + " 个生产订单，无法报废");
        }

        boolean result = styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .set(StyleInfo::getStatus, STYLE_STATUS_SCRAPPED)
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();
        if (!result) {
            throw new IllegalStateException("报废失败");
        }

        if (patternProductionService != null) {
            try {
                patternProductionService.lambdaUpdate()
                        .eq(PatternProduction::getStyleId, String.valueOf(id))
                        .eq(PatternProduction::getDeleteFlag, 0)
                        .set(PatternProduction::getStatus, "SCRAPPED")
                        .update();
            } catch (Exception e) {
                log.warn("同步样板生产报废状态失败: styleId={}", id, e);
            }
        }

        styleLogHelper.saveMaintenanceLog(id, "STYLE_SCRAPPED", remark);
        log.info("开发样已报废留档: styleId={}, styleNo={}, reason={}", id, style.getStyleNo(), remark);
        return true;
    }

    public boolean isProductionReqLocked(Long styleId) {
        if (styleId == null) {
            return false;
        }

        StyleInfo styleInfo = styleInfoService.getById(styleId);
        if (styleInfo == null || !StringUtils.hasText(styleInfo.getStyleNo())) {
            return false;
        }

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

    private String generateUniqueStyleNo(String requested) {
        String baseNo = requested.trim().replaceAll("-\\d+$", "");
        if (!styleNoExists(baseNo)) {
            return baseNo;
        }
        for (int i = 1; i <= 99; i++) {
            String candidate = baseNo + "-" + i;
            if (!styleNoExists(candidate)) {
                log.info("款号 {} 已存在，自动分配后缀：{}", requested.trim(), candidate);
                return candidate;
            }
        }
        log.warn("款号 {} 的后缀 1-99 均已占用，将使用原款号触发数据库约束", baseNo);
        return requested.trim();
    }

    private boolean styleNoExists(String styleNo) {
        return styleInfoService.lambdaQuery()
                .select(StyleInfo::getId)
                .eq(StyleInfo::getStyleNo, styleNo)
                .last("LIMIT 1")
                .one() != null;
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
    }

    public boolean startSize(Long id) {
        ensureStyleNotScrapped(id);
        return styleStageCompletionHelper.startSize(id);
    }

    public boolean completeSize(Long id) {
        ensureStyleNotScrapped(id);
        return styleStageCompletionHelper.completeSize(id);
    }

    public boolean resetSize(Long id, Map<String, Object> body) {
        ensureStyleNotScrapped(id);
        return styleStageCompletionHelper.resetSize(id, body);
    }

    public boolean startBom(Long id) {
        ensureStyleNotScrapped(id);
        return styleStageCompletionHelper.startBom(id);
    }

    public boolean completeBom(Long id) {
        ensureStyleNotScrapped(id);
        return styleStageCompletionHelper.completeBom(id);
    }

    public boolean resetBom(Long id, Map<String, Object> body) {
        ensureStyleNotScrapped(id);
        return styleStageCompletionHelper.resetBom(id, body);
    }

    public boolean startProcess(Long id) {
        ensureStyleNotScrapped(id);
        return styleStageCompletionHelper.startProcess(id);
    }

    public boolean completeProcess(Long id) {
        ensureStyleNotScrapped(id);
        return styleStageCompletionHelper.completeProcess(id);
    }

    public boolean resetProcess(Long id, Map<String, Object> body) {
        ensureStyleNotScrapped(id);
        return styleStageCompletionHelper.resetProcess(id, body);
    }

    public boolean startSizePrice(Long id) {
        ensureStyleNotScrapped(id);
        return styleStageCompletionHelper.startSizePrice(id);
    }

    public boolean completeSizePrice(Long id) {
        ensureStyleNotScrapped(id);
        return styleStageCompletionHelper.completeSizePrice(id);
    }

    public boolean resetSizePrice(Long id, Map<String, Object> body) {
        ensureStyleNotScrapped(id);
        return styleStageCompletionHelper.resetSizePrice(id, body);
    }

    public boolean startSecondary(Long id) {
        ensureStyleNotScrapped(id);
        return styleStageCompletionHelper.startSecondary(id);
    }

    public boolean completeSecondary(Long id) {
        ensureStyleNotScrapped(id);
        return styleStageCompletionHelper.completeSecondary(id);
    }

    public boolean skipSecondary(Long id) {
        ensureStyleNotScrapped(id);
        return styleStageCompletionHelper.skipSecondary(id);
    }

    public boolean resetSecondary(Long id, Map<String, Object> body) {
        ensureStyleNotScrapped(id);
        return styleStageCompletionHelper.resetSecondary(id, body);
    }

    private void ensureStyleNotScrapped(Long id) {
        ensureNotScrapped(styleInfoService.getById(id));
    }

    private void ensureNotScrapped(StyleInfo style) {
        if (style == null) {
            throw new NoSuchElementException("款式不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(style.getTenantId(), "款式");
        if (STYLE_STATUS_SCRAPPED.equalsIgnoreCase(String.valueOf(style.getStatus()))) {
            throw new IllegalStateException("该开发样已报废，无法继续流转");
        }
    }

    public Map<String, Object> getDevelopmentStats(String rangeType) {
        return styleCostCalculator.getDevelopmentStats(rangeType);
    }

    @Transactional(rollbackFor = Exception.class)
    public StyleInfo saveSampleReview(Long id, String reviewStatus, String reviewComment) {
        StyleInfo style = styleInfoService.getById(id);
        if (style == null) {
            throw new RuntimeException("款式不存在：" + id);
        }
        TenantAssert.assertBelongsToCurrentTenant(style.getTenantId(), "款式");
        style.setSampleReviewStatus(reviewStatus);
        style.setSampleReviewComment(reviewComment);
        style.setSampleReviewer(UserContext.username());
        style.setSampleReviewTime(LocalDateTime.now());
        styleInfoService.updateById(style);

        syncPatternProductionReviewFields(id, reviewStatus, reviewComment);

        return styleInfoService.getById(id);
    }

    private void syncPatternProductionReviewFields(Long styleId, String reviewStatus, String reviewComment) {
        try {
            PatternProduction pattern = patternProductionService.lambdaQuery()
                    .eq(PatternProduction::getStyleId, String.valueOf(styleId))
                    .eq(PatternProduction::getDeleteFlag, 0)
                    .last("LIMIT 1")
                    .one();
            if (pattern == null) {
                return;
            }
            String mappedResult;
            if ("PASS".equalsIgnoreCase(reviewStatus)) {
                mappedResult = "APPROVED";
            } else if ("REJECT".equalsIgnoreCase(reviewStatus) || "REWORK".equalsIgnoreCase(reviewStatus)) {
                mappedResult = "REJECTED";
            } else {
                mappedResult = reviewStatus;
            }
            pattern.setReviewStatus(mappedResult);
            pattern.setReviewResult(mappedResult);
            pattern.setReviewRemark(reviewComment);
            pattern.setReviewBy(UserContext.username());
            pattern.setReviewById(UserContext.userId());
            pattern.setReviewTime(LocalDateTime.now());
            patternProductionService.updateById(pattern);
        } catch (Exception e) {
            log.error("PC审核同步到PatternProduction失败: styleId={}", styleId, e);
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public StyleInfo copyStyle(Long sourceStyleId, String newStyleNo, String newColor, String newStyleName) {
        if (sourceStyleId == null) {
            throw new IllegalArgumentException("源款式ID不能为空");
        }
        if (!StringUtils.hasText(newStyleNo)) {
            throw new IllegalArgumentException("新款号不能为空");
        }
        if (!StringUtils.hasText(newColor)) {
            throw new IllegalArgumentException("颜色不能为空");
        }

        StyleInfo source = styleInfoService.getById(sourceStyleId);
        if (source == null) {
            throw new NoSuchElementException("源款式不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(source.getTenantId(), "款式");

        boolean exists = styleInfoService.lambdaQuery()
                .eq(StyleInfo::getStyleNo, newStyleNo.trim())
                .exists();
        if (exists) {
            throw new IllegalArgumentException("款号 " + newStyleNo.trim() + " 已存在，请换一个款号");
        }

        StyleInfo newStyle = buildNewStyleFromSource(source, newStyleNo, newColor, newStyleName);
        boolean saved = styleInfoService.saveOrUpdateStyle(newStyle);
        if (!saved) {
            throw new IllegalStateException("款式保存失败");
        }

        StyleInfo savedStyle = styleInfoService.lambdaQuery()
                .eq(StyleInfo::getStyleNo, newStyle.getStyleNo())
                .orderByDesc(StyleInfo::getCreateTime)
                .last("LIMIT 1")
                .one();
        if (savedStyle == null) {
            throw new IllegalStateException("款式保存后查询失败");
        }

        copyBomToNewStyle(sourceStyleId, savedStyle);

        log.info("一键复制款式成功: sourceStyleId={}, newStyleId={}, newStyleNo={}, newColor={}",
                sourceStyleId, savedStyle.getId(), newStyle.getStyleNo(), newColor);
        return savedStyle;
    }

    private StyleInfo buildNewStyleFromSource(StyleInfo source, String newStyleNo, String newColor, String newStyleName) {
        StyleInfo newStyle = new StyleInfo();
        newStyle.setStyleNo(newStyleNo.trim());
        newStyle.setColor(newColor.trim());
        newStyle.setStyleName(StringUtils.hasText(newStyleName) ? newStyleName.trim() : source.getStyleName());
        newStyle.setCategory(source.getCategory());
        newStyle.setSeason(source.getSeason());
        newStyle.setYear(source.getYear());
        newStyle.setMonth(source.getMonth());
        newStyle.setDescription(source.getDescription());
        newStyle.setCover(source.getCover());
        return newStyle;
    }

    private void copyBomToNewStyle(Long sourceStyleId, StyleInfo savedStyle) {
        List<StyleBom> sourceBoms = styleBomService.listByStyleId(sourceStyleId);
        if (sourceBoms == null || sourceBoms.isEmpty()) {
            return;
        }
        List<StyleBom> newBoms = new java.util.ArrayList<>();
        for (StyleBom bom : sourceBoms) {
            StyleBom nb = new StyleBom();
            nb.setStyleId(savedStyle.getId());
            nb.setMaterialCode(bom.getMaterialCode());
            nb.setMaterialName(bom.getMaterialName());
            nb.setFabricComposition(bom.getFabricComposition());
            nb.setFabricWeight(bom.getFabricWeight());
            nb.setMaterialType(bom.getMaterialType());
            nb.setGroupName(null);
            nb.setColor(bom.getColor());
            nb.setSpecification(bom.getSpecification());
            nb.setSize(bom.getSize());
            nb.setUnit(bom.getUnit());
            nb.setUsageAmount(bom.getUsageAmount());
            nb.setDevUsageAmount(bom.getDevUsageAmount());
            nb.setLossRate(bom.getLossRate());
            nb.setUnitPrice(bom.getUnitPrice());
            nb.setSizeUsageMap(bom.getSizeUsageMap());
            nb.setPatternSizeUsageMap(bom.getPatternSizeUsageMap());
            nb.setSizeSpecMap(bom.getSizeSpecMap());
            nb.setPatternUnit(bom.getPatternUnit());
            nb.setCreateTime(LocalDateTime.now());
            nb.setUpdateTime(LocalDateTime.now());
            newBoms.add(nb);
        }
        styleBomService.saveBatch(newBoms);
    }
}
