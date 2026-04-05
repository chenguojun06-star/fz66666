package com.fashion.supplychain.style.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.PatternProduction;
import com.fashion.supplychain.system.orchestration.ChangeApprovalOrchestrator;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.PatternProductionService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.selection.entity.SelectionCandidate;
import com.fashion.supplychain.selection.service.SelectionCandidateService;
import com.fashion.supplychain.style.entity.SecondaryProcess;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.helper.StyleLogHelper;
import com.fashion.supplychain.style.helper.StyleStageHelper;
import com.fashion.supplychain.style.service.SecondaryProcessService;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleProcessService;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.NoSuchElementException;
import java.util.Objects;
import java.util.Set;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.context.annotation.Lazy;

@Service
@Slf4j
public class StyleInfoOrchestrator {

    private static final String SOURCE_TYPE_SELF = "SELF_DEVELOPED";
    private static final String SOURCE_TYPE_SELECTION = "SELECTION_CENTER";
    private static final String STYLE_STATUS_SCRAPPED = "SCRAPPED";
    private static final Set<String> SELECTION_SOURCE_DETAILS = Set.of("外部市场", "供应商", "客户定制", "内部选品", "选品中心");

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleStageHelper styleStageHelper;

    @Autowired
    private StyleLogHelper styleLogHelper;

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

    @Autowired(required = false)
    private SelectionCandidateService selectionCandidateService;

    @Lazy
    @Autowired(required = false)
    private ChangeApprovalOrchestrator changeApprovalOrchestrator;

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
        fillSelectionSourceAndCoverFallback(page.getRecords());
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

    public StyleInfo detail(String idOrStyleNo) {
        String key = idOrStyleNo == null ? null : idOrStyleNo.trim();
        if (!StringUtils.hasText(key)) {
            throw new NoSuchElementException("款号不存在");
        }

        if (isNumericKey(key)) {
            StyleInfo styleInfo = styleInfoService.getDetailById(Long.parseLong(key));
            if (styleInfo != null) {
                return styleInfo;
            }
        }

        StyleInfo matched = styleInfoService.getOne(new LambdaQueryWrapper<StyleInfo>()
            .select(StyleInfo::getId)
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

    @Transactional(rollbackFor = Exception.class)
    public boolean save(StyleInfo styleInfo) {
        // [2026-07-20 修复] 防御性校验：非超管用户必须有 tenantId，否则拒绝保存
        Long currentTenantId = UserContext.tenantId();
        if (currentTenantId == null && !UserContext.isSuperAdmin()) {
            log.error("[TenantGuard] 租户信息缺失，拒绝创建款式。userId={}, username={}",
                    UserContext.userId(), UserContext.username());
            throw new IllegalStateException("租户信息异常，请退出重新登录后再试");
        }
        // 显式设置 tenantId，不完全依赖 MetaObjectHandler 自动填充
        if (currentTenantId != null && styleInfo.getTenantId() == null) {
            styleInfo.setTenantId(currentTenantId);
        }
        normalizeManualSourceFields(styleInfo);
        validateStyleInfo(styleInfo);
        // 新建款式时：若款号已存在则自动追加 -1/-2/... 后缀，保证不冲突
        if (styleInfo.getId() == null && StringUtils.hasText(styleInfo.getStyleNo())) {
            styleInfo.setStyleNo(generateUniqueStyleNo(styleInfo.getStyleNo()));
        }
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
    public boolean update(StyleInfo styleInfo) {
        normalizeManualSourceFields(styleInfo);
        validateStyleInfo(styleInfo);
        try {
            if (styleInfo.getId() != null) {
                StyleInfo existing = styleInfoService.getById(styleInfo.getId());
                ensureNotScrapped(existing);
            }
            boolean result = styleInfoService.saveOrUpdateStyle(styleInfo);
            if (result) {
                // 同步更新样板生产记录的颜色和数量
                try {
                    syncPatternProductionInfo(styleInfo);
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

    /**
     * 直接删除款式（级联删除关联样板生产记录）。
     * 若存在未删除的生产订单则拒绝删除。
     */
    @Transactional(rollbackFor = Exception.class)
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
    public Object deleteWithApproval(Long id, String reason) {
        StyleInfo style = styleInfoService.getById(id);
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
        StyleInfo style = styleInfoService.getById(id);
        if (style == null) {
            throw new NoSuchElementException("款式不存在");
        }
        if (STYLE_STATUS_SCRAPPED.equalsIgnoreCase(String.valueOf(style.getStatus()))) {
            throw new IllegalStateException("该开发样已报废，无需重复操作");
        }

        String remark = StringUtils.hasText(reason) ? reason.trim() : "未填写报废原因";

        // 检查是否存在关联的未删除生产订单
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
        // 默认有二次工艺，PC端可按需切换
        patternProduction.setHasSecondaryProcess(1);

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

    private void fillSelectionSourceAndCoverFallback(List<StyleInfo> records) {
        if (records == null || records.isEmpty() || selectionCandidateService == null) {
            return;
        }

        List<Long> styleIds = records.stream()
                .map(StyleInfo::getId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        List<String> styleNos = records.stream()
                .map(StyleInfo::getStyleNo)
                .filter(StringUtils::hasText)
                .map(String::trim)
                .distinct()
                .toList();

        if (styleIds.isEmpty() && styleNos.isEmpty()) {
            return;
        }

        LambdaQueryWrapper<SelectionCandidate> wrapper = new LambdaQueryWrapper<SelectionCandidate>()
                .eq(SelectionCandidate::getDeleteFlag, 0)
                .orderByDesc(SelectionCandidate::getUpdateTime)
                .orderByDesc(SelectionCandidate::getId);
        wrapper.and(w -> {
            boolean appended = false;
            if (!styleIds.isEmpty()) {
                w.in(SelectionCandidate::getCreatedStyleId, styleIds);
                appended = true;
            }
            if (!styleNos.isEmpty()) {
                if (appended) {
                    w.or();
                }
                w.in(SelectionCandidate::getCreatedStyleNo, styleNos);
            }
        });

        List<SelectionCandidate> candidates = selectionCandidateService.list(wrapper);
        Map<Long, SelectionCandidate> candidateByStyleId = new HashMap<>();
        Map<String, SelectionCandidate> candidateByStyleNo = new HashMap<>();
        for (SelectionCandidate candidate : candidates) {
            if (candidate.getCreatedStyleId() != null) {
                candidateByStyleId.putIfAbsent(candidate.getCreatedStyleId(), candidate);
            }
            if (StringUtils.hasText(candidate.getCreatedStyleNo())) {
                candidateByStyleNo.putIfAbsent(candidate.getCreatedStyleNo().trim(), candidate);
            }
        }

        for (StyleInfo style : records) {
            SelectionCandidate candidate = style.getId() != null ? candidateByStyleId.get(style.getId()) : null;
            if (candidate == null && StringUtils.hasText(style.getStyleNo())) {
                candidate = candidateByStyleNo.get(style.getStyleNo().trim());
            }

            boolean looksLikeSelection = candidate != null || isSelectionDescription(style.getDescription());

            String normalizedType = normalizeSourceType(style.getDevelopmentSourceType(), looksLikeSelection);
            style.setDevelopmentSourceType(normalizedType);
            style.setDevelopmentSourceDetail(normalizeResolvedSourceDetail(style, candidate, normalizedType));
            if (!StringUtils.hasText(style.getCover()) && candidate != null) {
                String fallbackCover = extractFirstReferenceImage(candidate.getReferenceImages());
                if (StringUtils.hasText(fallbackCover)) {
                    style.setCover(fallbackCover);
                }
            }
        }
    }

    private boolean isSelectionDescription(String description) {
        return StringUtils.hasText(description) && description.contains("选品中心");
    }

    private void normalizeManualSourceFields(StyleInfo styleInfo) {
        if (styleInfo == null) {
            return;
        }
        String normalizedType = normalizeSourceType(styleInfo.getDevelopmentSourceType(), false);
        styleInfo.setDevelopmentSourceType(normalizedType);
        styleInfo.setDevelopmentSourceDetail(normalizeResolvedSourceDetail(styleInfo, null, normalizedType));
    }

    private String normalizeSourceType(String sourceType, boolean looksLikeSelection) {
        String normalized = sourceType == null ? "" : sourceType.trim().toUpperCase();
        if (SOURCE_TYPE_SELECTION.equals(normalized) || looksLikeSelection) {
            return SOURCE_TYPE_SELECTION;
        }
        return SOURCE_TYPE_SELF;
    }

    private String normalizeResolvedSourceDetail(StyleInfo style, SelectionCandidate candidate, String sourceType) {
        String current = style == null ? "" : safeText(style.getDevelopmentSourceDetail());
        if (isValidSourceDetail(sourceType, current)) {
            return current;
        }
        return resolveSourceDetailFallback(style, candidate, sourceType);
    }

    private boolean isValidSourceDetail(String sourceType, String detail) {
        if (!StringUtils.hasText(detail) || looksLikeMojibake(detail)) {
            return false;
        }
        if (SOURCE_TYPE_SELECTION.equals(sourceType)) {
            return SELECTION_SOURCE_DETAILS.contains(detail);
        }
        return "自主开发".equals(detail);
    }

    private boolean looksLikeMojibake(String value) {
        String text = safeText(value);
        if (!StringUtils.hasText(text)) {
            return false;
        }
        if (text.length() > 12 || text.indexOf('�') >= 0) {
            return true;
        }
        return text.codePoints().anyMatch(codePoint -> codePoint >= 0x00C0 && codePoint <= 0x024F);
    }

    private String resolveSourceDetailFallback(StyleInfo style, SelectionCandidate candidate, String sourceType) {
        if (!SOURCE_TYPE_SELECTION.equals(sourceType)) {
            return "自主开发";
        }
        if (candidate != null) {
            String candidateSourceType = candidate.getSourceType() == null ? "" : candidate.getSourceType().trim().toUpperCase();
            return switch (candidateSourceType) {
                case "EXTERNAL" -> "外部市场";
                case "SUPPLIER" -> "供应商";
                case "CLIENT" -> "客户定制";
                case "INTERNAL" -> "内部选品";
                default -> "选品中心";
            };
        }
        String description = style.getDescription() == null ? "" : style.getDescription();
        if (description.contains("外部市场")) {
            return "外部市场";
        }
        if (description.contains("供应商")) {
            return "供应商";
        }
        if (description.contains("客户定制")) {
            return "客户定制";
        }
        if (description.contains("选品中心")) {
            return "选品中心";
        }
        return "选品中心";
    }

    private String safeText(String value) {
        return value == null ? "" : value.trim();
    }

    private String extractFirstReferenceImage(String referenceImages) {
        if (!StringUtils.hasText(referenceImages)) {
            return null;
        }
        String raw = referenceImages.trim();
        if (!raw.startsWith("[")) {
            return raw;
        }
        try {
            List<String> images = new com.fasterxml.jackson.databind.ObjectMapper().readValue(raw, new com.fasterxml.jackson.core.type.TypeReference<List<String>>() {});
            return images == null || images.isEmpty() ? null : images.get(0);
        } catch (Exception e) {
            log.warn("解析候选款参考图失败 referenceImages={}", raw, e);
            return null;
        }
    }

    /** 为新款式生成一个当前不存在的款号，冲突时加 -1/-2/... 后缀 */
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
        // 品类不再必填，允许创建空记录
    }

    /**
     * 开始配置尺寸表
     */
    public boolean startSize(Long id) {
        ensureStyleNotScrapped(id);
        return styleStageHelper.startSize(id);
    }

    /**
     * 完成尺寸表配置
     */
    public boolean completeSize(Long id) {
        ensureStyleNotScrapped(id);
        return styleStageHelper.completeSize(id);
    }

    public boolean resetSize(Long id, Map<String, Object> body) {
        ensureStyleNotScrapped(id);
        return styleStageHelper.resetSize(id, body);
    }

    public boolean startBom(Long id) {
        ensureStyleNotScrapped(id);
        return styleStageHelper.startBom(id);
    }

    public boolean completeBom(Long id) {
        ensureStyleNotScrapped(id);
        return styleStageHelper.completeBom(id);
    }

    public boolean resetBom(Long id, Map<String, Object> body) {
        ensureStyleNotScrapped(id);
        return styleStageHelper.resetBom(id, body);
    }

    public boolean startProcess(Long id) {
        ensureStyleNotScrapped(id);
        return styleStageHelper.startProcess(id);
    }

    public boolean completeProcess(Long id) {
        ensureStyleNotScrapped(id);
        return styleStageHelper.completeProcess(id);
    }

    public boolean resetProcess(Long id, Map<String, Object> body) {
        ensureStyleNotScrapped(id);
        return styleStageHelper.resetProcess(id, body);
    }

    public boolean startSizePrice(Long id) {
        ensureStyleNotScrapped(id);
        return styleStageHelper.startSizePrice(id);
    }

    public boolean completeSizePrice(Long id) {
        ensureStyleNotScrapped(id);
        return styleStageHelper.completeSizePrice(id);
    }

    public boolean resetSizePrice(Long id, Map<String, Object> body) {
        ensureStyleNotScrapped(id);
        return styleStageHelper.resetSizePrice(id, body);
    }

    public boolean startSecondary(Long id) {
        ensureStyleNotScrapped(id);
        return styleStageHelper.startSecondary(id);
    }

    public boolean completeSecondary(Long id) {
        ensureStyleNotScrapped(id);
        return styleStageHelper.completeSecondary(id);
    }

    public boolean skipSecondary(Long id) {
        ensureStyleNotScrapped(id);
        return styleStageHelper.skipSecondary(id);
    }

    public boolean resetSecondary(Long id, Map<String, Object> body) {
        ensureStyleNotScrapped(id);
        return styleStageHelper.resetSecondary(id, body);
    }

    private void ensureStyleNotScrapped(Long id) {
        ensureNotScrapped(styleInfoService.getById(id));
    }

    private void ensureNotScrapped(StyleInfo style) {
        if (style == null) {
            throw new NoSuchElementException("款式不存在");
        }
        if (STYLE_STATUS_SCRAPPED.equalsIgnoreCase(String.valueOf(style.getStatus()))) {
            throw new IllegalStateException("该开发样已报废，无法继续流转");
        }
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

        int totalSampleQuantity = 0;

        // 统计费用：遍历所有已完成的样衣，汇总其报价单费用
        double totalMaterialCost = 0.0;
        double totalProcessCost = 0.0;
        double totalOtherCost = 0.0;

        for (StyleInfo style : completedStyles) {
            int sampleQty = style.getSampleQuantity() == null || style.getSampleQuantity() <= 0
                    ? 1
                    : style.getSampleQuantity();
            totalSampleQuantity += sampleQty;

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
            totalMaterialCost += materialCost * sampleQty;

            // 用实时工序成本
            List<StyleProcess> processes = styleProcessService.listByStyleId(style.getId());
            double processCost = processes.stream()
                    .mapToDouble(p -> p.getPrice() != null ? p.getPrice().doubleValue() : 0.0)
                    .sum();
                totalProcessCost += processCost * sampleQty;

            // 二次工艺成本：从 t_secondary_process 实时计算
            List<SecondaryProcess> secondaryItems = secondaryProcessService.listByStyleId(style.getId());
            double secondaryCost = secondaryItems.stream()
                    .mapToDouble(sp -> sp.getTotalPrice() != null ? sp.getTotalPrice().doubleValue() : 0.0)
                    .sum();
                totalOtherCost += secondaryCost * sampleQty;
        }

        double totalCost = totalMaterialCost + totalProcessCost + totalOtherCost;

        Map<String, Object> stats = new HashMap<>();
        stats.put("patternCount", totalSampleQuantity);
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
            case "year":
                return today.withDayOfYear(1).atStartOfDay();
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

    /**
     * 一键复制款式：将源款式的基础信息和BOM全量复制到新款色。
     *
     * @param sourceStyleId 源款式ID
     * @param newStyleNo    新款号（必填）
     * @param newColor      新颜色（必填）
     * @param newStyleName  新款式名称（可选，null 时沿用原款名）
     * @return 新创建的款式信息
     */
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

        // 1. 查询源款式
        StyleInfo source = styleInfoService.getById(sourceStyleId);
        if (source == null) {
            throw new NoSuchElementException("源款式不存在");
        }

        // 2. 检查目标款号是否已存在（交给数据库唯一索引兜底，这里提前给友好提示）
        boolean exists = styleInfoService.lambdaQuery()
                .eq(StyleInfo::getStyleNo, newStyleNo.trim())
                .exists();
        if (exists) {
            throw new IllegalArgumentException("款号 " + newStyleNo.trim() + " 已存在，请换一个款号");
        }

        // 3. 构建新款式（清空 id 走新增路径）
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
        // id 不设置 → saveOrUpdateStyle 走新增路径，自动生成时间戳/租户/状态等

        boolean saved = styleInfoService.saveOrUpdateStyle(newStyle);
        if (!saved) {
            throw new IllegalStateException("款式保存失败");
        }

        // saveOrUpdateStyle 在新增后不保证 newStyle.id 已填充，需重新查询
        StyleInfo savedStyle = styleInfoService.lambdaQuery()
                .eq(StyleInfo::getStyleNo, newStyle.getStyleNo())
                .orderByDesc(StyleInfo::getCreateTime)
                .last("LIMIT 1")
                .one();
        if (savedStyle == null) {
            throw new IllegalStateException("款式保存后查询失败");
        }

        // 4. 复制 BOM 明细
        List<StyleBom> sourceBoms = styleBomService.listByStyleId(sourceStyleId);
        if (sourceBoms != null && !sourceBoms.isEmpty()) {
            List<StyleBom> newBoms = new java.util.ArrayList<>();
            for (StyleBom bom : sourceBoms) {
                StyleBom nb = new StyleBom();
                // id 不设置 → MyBatis-Plus ASSIGN_UUID 自动生成
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

        log.info("一键复制款式成功: sourceStyleId={}, newStyleId={}, newStyleNo={}, newColor={}",
                sourceStyleId, savedStyle.getId(), newStyle.getStyleNo(), newColor);
        return savedStyle;
    }
}
