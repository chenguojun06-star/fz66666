package com.fashion.supplychain.style.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.constant.OrderStatusConstants;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.system.orchestration.ChangeApprovalOrchestrator;
import com.fashion.supplychain.production.dto.PatternDevelopmentStatsDTO;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.PatternProduction;
import com.fashion.supplychain.production.service.PatternProductionService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.SecondaryProcess;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.entity.StyleQuotation;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.helper.StyleCostCalculator;
import com.fashion.supplychain.style.helper.StyleListEnrichmentHelper;
import com.fashion.supplychain.style.helper.StyleLogHelper;
import com.fashion.supplychain.style.helper.StyleOperationAppendHelper;
import com.fashion.supplychain.style.helper.StyleStageHelper;
import com.fashion.supplychain.style.helper.StyleStageCompletionHelper;
import com.fashion.supplychain.style.service.SecondaryProcessService;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleProcessService;
import com.fashion.supplychain.style.service.StyleQuotationService;
import com.fashion.supplychain.finance.orchestration.BillAggregationOrchestrator;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
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
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.context.annotation.Lazy;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
@Slf4j
public class StyleInfoOrchestrator {

    private static final String STYLE_STATUS_SCRAPPED = "SCRAPPED";
    private static final String STYLE_STATUS_ENABLED = "ENABLED";

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleStageHelper styleStageHelper;

    @Autowired
    private StyleStageCompletionHelper styleStageCompletionHelper;

    @Autowired
    private StyleLogHelper styleLogHelper;

    @Autowired
    private StyleOperationAppendHelper styleOperationAppendHelper;

    @Autowired
    private StyleSelectionSourceHelper styleSelectionSourceHelper;

    @Autowired
    private StylePatternProductionHelper stylePatternProductionHelper;

    @Autowired
    private StyleCostCalculator styleCostCalculator;

    @Autowired
    private StyleListEnrichmentHelper styleListEnrichmentHelper;

    @Autowired
    private com.fashion.supplychain.style.helper.StyleCustomerSyncHelper styleCustomerSyncHelper;

    @Autowired
    private com.fashion.supplychain.style.helper.StyleNoChangeSyncHelper styleNoChangeSyncHelper;

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

    @Autowired
    private StyleQuotationService styleQuotationService;

    @Lazy
    @Autowired(required = false)
    private ChangeApprovalOrchestrator changeApprovalOrchestrator;

    @Autowired
    private com.fashion.supplychain.style.service.ProductSkuService productSkuService;

    @Autowired
    private StringRedisTemplate redisTemplate;

    /**
     * 账单聚合编排器（可选注入，避免循环依赖）
     * <p>
     * Phase 3-3 修复（数据链路闭环）：
     * 样衣开发费用（BOM 物料 + 工序成本）统一接入 BillAggregation，
     * 与 SecondaryProcessOrchestrator（二次工艺）的 SECONDARY_PROCESS sourceType 并行。
     */
    @Lazy
    @Autowired(required = false)
    private BillAggregationOrchestrator billAggregationOrchestrator;

    /** 样衣开发费用 sourceType（与 SecondaryProcessOrchestrator.SECONDARY_PROCESS 并列） */
    private static final String STYLE_DEV_SOURCE_TYPE = "STYLE_DEVELOPMENT";

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

        Long tenantId = UserContext.tenantId();
        Map<Long, List<StyleBom>> bomByStyleId = styleBomService.lambdaQuery()
                .in(StyleBom::getStyleId, styleIds)
                .eq(StyleBom::getTenantId, tenantId)
                .list()
                .stream()
                .collect(Collectors.groupingBy(StyleBom::getStyleId));

        Map<Long, List<StyleProcess>> processByStyleId = styleProcessService.lambdaQuery()
                .in(StyleProcess::getStyleId, styleIds)
                .eq(StyleProcess::getTenantId, tenantId)
                .list()
                .stream()
                .collect(Collectors.groupingBy(StyleProcess::getStyleId));

        Map<Long, List<SecondaryProcess>> secondaryByStyleId = secondaryProcessService.lambdaQuery()
                .in(SecondaryProcess::getStyleId, styleIds)
                .eq(SecondaryProcess::getTenantId, tenantId)
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
        styleListEnrichmentHelper.fillStockFields(records);
        styleListEnrichmentHelper.fillProcurementProgressFields(records);

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
                // P0铁律4：数字ID查询需校验租户归属，防止IDOR跨租户访问
                if (tenantScopedRead && styleInfo.getTenantId() != null
                        && !styleInfo.getTenantId().equals(readableTenantId)) {
                    throw new NoSuchElementException("款号不存在");
                }
                return enrichDetail(styleInfo);
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
        return enrichDetail(styleInfo);
    }

    /**
     * 详情页字段补充：与列表接口保持一致，填充采购进度和时间等聚合字段。
     * 解决样衣详情页 stages 视图"物料采购 已完成"但未显示时间的问题。
     */
    private StyleInfo enrichDetail(StyleInfo styleInfo) {
        if (styleInfo == null) return null;
        try {
            java.util.List<StyleInfo> wrapper = new java.util.ArrayList<>();
            wrapper.add(styleInfo);
            styleListEnrichmentHelper.fillProcurementProgressFields(wrapper);
        } catch (Exception e) {
            org.slf4j.LoggerFactory.getLogger(StyleInfoOrchestrator.class)
                .warn("enrichDetail 填充采购进度字段异常: styleId={}, msg={}",
                    styleInfo.getId(), e.getMessage());
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
        // 同步客户信息到款号冗余字段
        styleCustomerSyncHelper.syncCustomerInfo(styleInfo);
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
                                .eq(StyleInfo::getTenantId, currentTenantId)
                                .orderByDesc(StyleInfo::getCreateTime)
                                .last("LIMIT 1")
                                .one();
                        if (savedStyle != null) {
                            stylePatternProductionHelper.createPatternProductionRecord(savedStyle);
                            styleOperationAppendHelper.appendCreate(savedStyle.getId());
                        }
                    } else {
                        stylePatternProductionHelper.createPatternProductionRecord(styleInfo);
                        styleOperationAppendHelper.appendUpdate(styleInfo, "基础信息");
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
        } finally {
            evictCurrentTenantCache();
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean update(StyleInfo styleInfo) {
        styleSelectionSourceHelper.normalizeManualSourceFields(styleInfo);
        // 同步客户信息到款号冗余字段
        styleCustomerSyncHelper.syncCustomerInfo(styleInfo);
        validateStyleInfo(styleInfo);
        StyleInfo existing = null;
        try {
            if (styleInfo.getId() != null) {
                existing = styleInfoService.lambdaQuery()
                        .eq(StyleInfo::getId, styleInfo.getId())
                        .eq(StyleInfo::getTenantId, UserContext.tenantId())
                        .one();
                ensureNotScrapped(existing);
                // D-215：款式编码放开编辑后，编辑保存撞号必须明确拦截提示
                // （此前仅靠 DB 唯一约束兜底，报错对用户不友好）
                if (existing != null && StringUtils.hasText(styleInfo.getStyleNo())
                        && !styleInfo.getStyleNo().trim().equals(existing.getStyleNo())
                        && styleNoExistsExcluding(styleInfo.getStyleNo().trim(), styleInfo.getId())) {
                    throw new IllegalArgumentException("款号「" + styleInfo.getStyleNo().trim() + "」已被其他款式使用，请修改款号");
                }
            }
            boolean result = styleInfoService.saveOrUpdateStyle(styleInfo);
            if (result) {
                // D-215：款号变更后联动重算该款式所有商品编码（款号-颜色-尺码）
                if (existing != null && StringUtils.hasText(styleInfo.getStyleNo())
                        && !styleInfo.getStyleNo().trim().equals(existing.getStyleNo())
                        && styleInfo.getId() != null) {
                    try {
                        productSkuService.resyncSkuCodesForStyleNoChange(styleInfo.getId(), styleInfo.getStyleNo().trim());
                        log.info("款号变更联动重算商品编码: styleId={}, {} -> {}",
                                styleInfo.getId(), existing.getStyleNo(), styleInfo.getStyleNo().trim());
                    } catch (Exception e) {
                        log.warn("款号变更联动重算商品编码失败: styleId={}, error={}", styleInfo.getId(), e.getMessage());
                    }
                    // D-217：款号变更同步所有快照单据（样衣生产单/扫码记录/扫码镜像/生产订单/菲号），
                    // 否则扫码端和各详情页永远显示老款号
                    try {
                        styleNoChangeSyncHelper.syncStyleNoEverywhere(
                                styleInfo.getId(), existing.getStyleNo(), styleInfo.getStyleNo().trim());
                    } catch (Exception e) {
                        log.warn("款号变更快照同步失败: styleId={}, error={}", styleInfo.getId(), e.getMessage());
                    }
                }
                try {
                    // D-218：维护/编辑保存只同步已有生产记录，不再隐式补建/新建样衣生产任务
                    stylePatternProductionHelper.syncPatternProductionInfo(styleInfo, false);
                    styleOperationAppendHelper.appendUpdate(styleInfo, "基础信息");
                    // 同步颜色图片到SKU表
                    if (styleInfo.getId() != null && styleInfo.getSizeColorConfig() != null) {
                        try {
                            ObjectMapper om = new ObjectMapper();
                            @SuppressWarnings("unchecked")
                            Map<String, Object> config = om.readValue(styleInfo.getSizeColorConfig(), Map.class);
                            if (config != null && config.containsKey("matrixRows")) {
                                syncColorImagesFromMatrixRows(styleInfo.getId(), config.get("matrixRows"));
                            }
                        } catch (Exception e) {
                            log.warn("同步颜色图片到SKU表失败: styleId={}, error={}", styleInfo.getId(), e.getMessage());
                        }
                    }
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
            log.error("保存款号资料违反数据库约束: styleId={}, styleNo={}", styleInfo.getId(), styleInfo.getStyleNo(), e);
            throw new IllegalStateException("保存失败: " + msg);
        } catch (IllegalStateException | IllegalArgumentException e) {
            // 业务校验异常（如"该开发样已报废，无法继续流转"）原样透出，
            // 之前被吞成统一"保存失败"，用户连续重试也无法知道真实原因（P0 根因透出原则）
            throw e;
        } catch (Exception e) {
            log.error("保存款号资料失败: styleId={}, styleNo={}", styleInfo.getId(), styleInfo.getStyleNo(), e);
            throw new IllegalStateException("保存失败: " + e.getMessage());
        } finally {
            evictCurrentTenantCache();
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void updateSizeColorConfig(Long id, Map<String, Object> body) {
        ensureStyleNotScrapped(id);
        Long tenantId = UserContext.tenantId();
        StyleInfo style = styleInfoService.lambdaQuery()
                .eq(StyleInfo::getId, id)
                .eq(StyleInfo::getTenantId, tenantId)
                .one();
        if (style == null) {
            throw new IllegalArgumentException("款式不存在: " + id);
        }
        ObjectMapper mapper = new ObjectMapper();
        try {
            Map<String, Object> config = new java.util.HashMap<>();
            config.put("colors", body.get("colors"));
            config.put("sizes", body.get("sizes"));
            config.put("quantities", body.get("quantities"));
            config.put("matrixRows", body.get("matrixRows"));
            String configJson = mapper.writeValueAsString(config);
            styleInfoService.updateSizeColorConfigOnly(id, configJson);
            productSkuService.generateSkusForStyle(id);
            syncColorImagesFromMatrixRows(id, body.get("matrixRows"));
        } catch (Exception e) {
            log.error("更新颜色尺码配置失败: styleId={}", id, e);
            throw new RuntimeException("更新颜色尺码配置失败: " + e.getMessage(), e);
        }
    }

    /**
     * 款式停用/启用（委托 StyleInfoService，带租户校验与状态校验）
     * status 仅支持 ENABLED / DISABLED；已报废款式不可启停
     */
    public void updateStyleStatus(Long id, String status) {
        styleInfoService.updateStyleStatus(id, status);
    }

    private void syncColorImagesFromMatrixRows(Long styleId, Object matrixRowsObj) {
        if (styleId == null || matrixRowsObj == null) {
            return;
        }
        if (!(matrixRowsObj instanceof List)) {
            return;
        }
        List<?> matrixRows = (List<?>) matrixRowsObj;
        if (matrixRows.isEmpty()) {
            return;
        }
        Map<String, String> colorImageMap = new HashMap<>();
        for (Object rowObj : matrixRows) {
            if (!(rowObj instanceof Map)) {
                continue;
            }
            Map<?, ?> row = (Map<?, ?>) rowObj;
            Object colorObj = row.get("color");
            Object imageUrlObj = row.get("imageUrl");
            if (colorObj == null) {
                continue;
            }
            String color = String.valueOf(colorObj).trim();
            if (color.isEmpty()) {
                continue;
            }
            String imageUrl = imageUrlObj != null ? String.valueOf(imageUrlObj).trim() : "";
            if (!imageUrl.isEmpty() && !imageUrl.startsWith("data:")) {
                colorImageMap.put(color, imageUrl);
            }
        }
        if (colorImageMap.isEmpty()) {
            return;
        }
        Long tenantId = UserContext.tenantId();
        int updatedCount = 0;
        for (Map.Entry<String, String> entry : colorImageMap.entrySet()) {
            String color = entry.getKey();
            String imageUrl = entry.getValue();
            LambdaUpdateWrapper<ProductSku> wrapper = new LambdaUpdateWrapper<>();
            wrapper.eq(ProductSku::getStyleId, styleId)
                    .eq(tenantId != null, ProductSku::getTenantId, tenantId)
                    .eq(ProductSku::getColor, color)
                    .set(ProductSku::getSkuColorImage, imageUrl);
            updatedCount += productSkuService.getBaseMapper().update(null, wrapper);
        }
        if (updatedCount > 0) {
            log.info("同步颜色图片到SKU表: styleId={}, 颜色数={}, 更新SKU数={}", styleId, colorImageMap.size(), updatedCount);
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
        boolean result = styleStageHelper.completeProductionStage(id);
        tryAutoGenerateSkus(id);
        return result;
    }

    public boolean resetProductionStage(Long id, Map<String, Object> body) {
        ensureStyleNotScrapped(id);
        return styleStageHelper.resetProductionStage(id, body);
    }

    public boolean startPattern(Long id, String assignee) {
        ensureStyleNotScrapped(id);
        return styleStageHelper.startPattern(id, assignee);
    }

    public boolean startPattern(Long id) {
        return startPattern(id, null);
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
    public boolean delete(Long id) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        long activeOrders = productionOrderService.count(
                new LambdaQueryWrapper<ProductionOrder>()
                        .eq(ProductionOrder::getStyleId, String.valueOf(id))
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .notIn(ProductionOrder::getStatus, OrderStatusConstants.TERMINAL_STATUSES));
        if (activeOrders > 0) {
            throw new IllegalStateException("该款式下存在 " + activeOrders + " 个进行中的生产订单，无法删除");
        }
        if (patternProductionService != null) {
            patternProductionService.lambdaUpdate()
                    .eq(PatternProduction::getStyleId, id)
                    .eq(PatternProduction::getTenantId, tenantId)
                    .remove();
        }
        evictCurrentTenantCache();
        return styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .eq(StyleInfo::getTenantId, tenantId)
                .set(StyleInfo::getDeleteFlag, 1)
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();
    }

    @Transactional(rollbackFor = Exception.class)
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
        evictCurrentTenantCache();
        return scrap(id, reason);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean scrap(Long id, String reason) {
        Long tenantId = UserContext.tenantId();
        StyleInfo style = styleInfoService.lambdaQuery()
                .eq(StyleInfo::getId, id)
                .eq(StyleInfo::getTenantId, tenantId)
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
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .notIn(ProductionOrder::getStatus, OrderStatusConstants.TERMINAL_STATUSES));
        if (activeOrders > 0) {
            throw new IllegalStateException("该款式下存在 " + activeOrders + " 个进行中的生产订单，无法报废");
        }

        boolean result = styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .eq(StyleInfo::getTenantId, tenantId)
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
                        .eq(PatternProduction::getTenantId, tenantId)
                        .eq(PatternProduction::getDeleteFlag, 0)
                        .set(PatternProduction::getStatus, "SCRAPPED")
                        .update();
            } catch (Exception e) {
                log.warn("同步样板生产报废状态失败: styleId={}", id, e);
            }
        }

        styleLogHelper.saveMaintenanceLog(id, "款式报废", remark);
        styleOperationAppendHelper.appendScrap(id, remark);
        log.info("开发样已报废留档: styleId={}, styleNo={}, reason={}", id, style.getStyleNo(), reason);
        return true;
    }

    /**
     * 取消报废：恢复已报废的开发样为启用状态，允许继续编辑/下单。
     * 场景：用户误报废或报废后想重做该单子——之前款式一旦报废就永久锁定，
     * 编辑保存全部返回 400，没有任何恢复入口（P0 死路）。
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean unscrap(Long id) {
        Long tenantId = UserContext.tenantId();
        StyleInfo style = styleInfoService.lambdaQuery()
                .eq(StyleInfo::getId, id)
                .eq(StyleInfo::getTenantId, tenantId)
                .one();
        if (style == null) {
            throw new NoSuchElementException("款式不存在");
        }
        if (!STYLE_STATUS_SCRAPPED.equalsIgnoreCase(String.valueOf(style.getStatus()))) {
            throw new IllegalStateException("该款式未报废，无需恢复");
        }

        // 条件更新带 status=SCRAPPED：并发场景下只有一方能恢复成功
        boolean result = styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .eq(StyleInfo::getTenantId, tenantId)
                .eq(StyleInfo::getStatus, STYLE_STATUS_SCRAPPED)
                .set(StyleInfo::getStatus, STYLE_STATUS_ENABLED)
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();
        if (!result) {
            throw new IllegalStateException("恢复失败，款式状态可能已变更，请刷新后重试");
        }

        // 恢复报废时被置为 SCRAPPED 的样衣生产记录（只还原当前仍为 SCRAPPED 的，
        // 不碰因其他流转产生的状态）
        if (patternProductionService != null) {
            try {
                patternProductionService.lambdaUpdate()
                        .eq(PatternProduction::getStyleId, String.valueOf(id))
                        .eq(PatternProduction::getTenantId, tenantId)
                        .eq(PatternProduction::getDeleteFlag, 0)
                        .eq(PatternProduction::getStatus, "SCRAPPED")
                        .set(PatternProduction::getStatus, "PENDING")
                        .update();
            } catch (Exception e) {
                log.warn("同步样板生产恢复状态失败: styleId={}", id, e);
            }
        }

        styleLogHelper.saveMaintenanceLog(id, "取消报废", "款式由报废恢复为启用状态");
        styleOperationAppendHelper.appendUnscrap(id);
        log.info("开发样取消报废: styleId={}, styleNo={}", id, style.getStyleNo());
        return true;
    }

    public boolean isProductionReqLocked(Long styleId) {
        if (styleId == null) {
            return false;
        }

        Long tenantId = UserContext.tenantId();
        StyleInfo styleInfo = styleInfoService.lambdaQuery()
                .eq(StyleInfo::getId, styleId)
                .eq(StyleInfo::getTenantId, tenantId)
                .one();
        if (styleInfo == null || !StringUtils.hasText(styleInfo.getStyleNo())) {
            return false;
        }

        QueryWrapper<ProductionOrder> queryWrapper = new QueryWrapper<>();
        queryWrapper.eq("style_no", styleInfo.getStyleNo());
        if (tenantId != null) {
            queryWrapper.eq("tenant_id", tenantId);
        }
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
        Long tenantId = UserContext.tenantId();
        return styleInfoService.lambdaQuery()
                .select(StyleInfo::getId)
                .eq(StyleInfo::getStyleNo, styleNo)
                .eq(tenantId != null, StyleInfo::getTenantId, tenantId)
                .last("LIMIT 1")
                .one() != null;
    }

    /** D-215：编辑保存时的款号查重，排除自身 id */
    private boolean styleNoExistsExcluding(String styleNo, Long excludeId) {
        Long tenantId = UserContext.tenantId();
        return styleInfoService.lambdaQuery()
                .select(StyleInfo::getId)
                .eq(StyleInfo::getStyleNo, styleNo)
                .eq(tenantId != null, StyleInfo::getTenantId, tenantId)
                .ne(excludeId != null, StyleInfo::getId, excludeId)
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
        Long tenantId = UserContext.tenantId();
        StyleInfo style = styleInfoService.lambdaQuery()
                .eq(StyleInfo::getId, id)
                .eq(tenantId != null, StyleInfo::getTenantId, tenantId)
                .one();
        ensureNotScrapped(style);
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

    public PatternDevelopmentStatsDTO getDevelopmentStats(String rangeType) {
        return styleCostCalculator.getDevelopmentStats(rangeType);
    }

    public PatternDevelopmentStatsDTO getDevelopmentStatsByDateRange(LocalDateTime startTime, LocalDateTime endTime) {
        return styleCostCalculator.getDevelopmentStatsByDateRange(startTime, endTime);
    }

    /**
     * 顶部统计卡片数据（总数/进行中/已完成/已延期）
     * 支持两种模式：
     * - 默认（mode 为空或 "sample"）：所有启用状态款式，用于样衣开发列表页
     * - mode=order：仅已下单款式（pushedToOrder=1），用于下单管理页
     * 多租户隔离：非超级管理员仅查询当前租户数据（P0铁律4）
     * <p>
     * mode=order 时额外返回件数字段（关联订单 orderQuantity 之和）：
     *   - totalQuantity: 所有匹配款式关联订单 orderQuantity 之和
     *   - developingQuantity: 进行中（未完成）款式关联订单 orderQuantity 之和
     *   - completedQuantity: 已完成款式关联订单 orderQuantity 之和
     *   - delayedQuantity: 已延期款式关联订单 orderQuantity 之和
     * sample 模式统计所有启用款式（不一定有订单），件数字段固定为 0。
     */
    public java.util.Map<String, Object> getStyleStats(String mode) {
        java.util.Map<String, Object> stats = new java.util.HashMap<>();
        boolean orderMode = "order".equalsIgnoreCase(mode);
        Long readableTenantId = resolveReadableTenantId();
        boolean tenantScopedRead = isTenantScopedRead();
        Long currentTenantId = UserContext.tenantId();
        long totalStyles = 0L;
        long completedStyles = 0L;
        long delayedStyles = 0L;
        // 件数（orderQuantity 之和）：仅 order 模式计算
        long totalQuantity = 0L;
        long completedQuantity = 0L;
        long developingQuantity = 0L;
        long delayedQuantity = 0L;
        try {
            // 一次性查询所有匹配的启用款式，用于 count + 分类 + 件数汇总
            List<StyleInfo> matchedStyles = styleInfoService.lambdaQuery()
                    .select(StyleInfo::getId, StyleInfo::getStyleNo,
                            StyleInfo::getSampleStatus, StyleInfo::getDeliveryDate)
                    .eq(tenantScopedRead, StyleInfo::getTenantId, readableTenantId)
                    .eq(StyleInfo::getStatus, "ENABLED")
                    .eq(orderMode, StyleInfo::getPushedToOrder, 1)
                    .list();

            totalStyles = matchedStyles == null ? 0L : matchedStyles.size();

            LocalDateTime now = LocalDateTime.now();
            List<String> allStyleNos = new java.util.ArrayList<>();
            List<String> completedStyleNos = new java.util.ArrayList<>();
            List<String> delayedStyleNos = new java.util.ArrayList<>();
            if (matchedStyles != null) {
                for (StyleInfo style : matchedStyles) {
                    if (style == null) {
                        continue;
                    }
                    String styleNo = style.getStyleNo();
                    if (!StringUtils.hasText(styleNo)) {
                        continue;
                    }
                    allStyleNos.add(styleNo);

                    String sampleStatus = style.getSampleStatus();
                    boolean isCompleted = "COMPLETED".equals(sampleStatus)
                            || "Completed".equals(sampleStatus);
                    if (isCompleted) {
                        completedStyleNos.add(styleNo);
                    } else if (style.getDeliveryDate() != null
                            && style.getDeliveryDate().isBefore(now)) {
                        // 与原 SQL 一致：未完成（含 null）+ deliveryDate < now 才算延期
                        delayedStyleNos.add(styleNo);
                    }
                }
            }

            completedStyles = completedStyleNos.size();
            delayedStyles = delayedStyleNos.size();

            // 件数仅在 order 模式下计算（sample 模式统计所有启用款式，不一定都有订单）
            if (orderMode) {
                totalQuantity = sumOrderQuantity(allStyleNos, currentTenantId);
                completedQuantity = sumOrderQuantity(completedStyleNos, currentTenantId);
                delayedQuantity = sumOrderQuantity(delayedStyleNos, currentTenantId);
                // 进行中件数 = 总件数 - 已完成件数（与 developingStyles 计算方式一致）
                developingQuantity = Math.max(0L, totalQuantity - completedQuantity);
            }
        } catch (Exception e) {
            log.warn("[StyleInfo] getStyleStats 查询失败 mode={}, err={}", mode, e.getMessage());
        }
        long inProgressStyles = Math.max(0L, totalStyles - completedStyles);
        stats.put("totalStyles", totalStyles);
        stats.put("developingStyles", inProgressStyles);
        stats.put("completedStyles", completedStyles);
        stats.put("delayedStyles", delayedStyles);
        // 件数字段：order 模式有值；sample 模式固定为 0
        stats.put("totalQuantity", totalQuantity);
        stats.put("developingQuantity", developingQuantity);
        stats.put("completedQuantity", completedQuantity);
        stats.put("delayedQuantity", delayedQuantity);
        return stats;
    }

    /**
     * 按款号汇总关联订单的 orderQuantity 之和
     * 通过 style_no 关联 t_production_order 表（与 isProductionReqLocked 一致）
     * 多租户隔离：非超级管理员仅汇总当前租户订单（P0铁律4）
     */
    private long sumOrderQuantity(List<String> styleNos, Long tenantId) {
        if (styleNos == null || styleNos.isEmpty()) {
            return 0L;
        }
        try {
            List<ProductionOrder> orders = productionOrderService.lambdaQuery()
                    .select(ProductionOrder::getOrderQuantity)
                    .in(ProductionOrder::getStyleNo, styleNos)
                    .eq(ProductionOrder::getDeleteFlag, 0)
                    .eq(tenantId != null, ProductionOrder::getTenantId, tenantId)
                    .list();
            if (orders == null || orders.isEmpty()) {
                return 0L;
            }
            return orders.stream()
                    .mapToLong(o -> o.getOrderQuantity() != null
                            ? o.getOrderQuantity().longValue() : 0L)
                    .sum();
        } catch (Exception e) {
            log.warn("[StyleInfo] sumOrderQuantity 查询失败 styleNos.size={}, err={}",
                    styleNos.size(), e.getMessage());
            return 0L;
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public StyleInfo saveSampleReview(Long id, String reviewStatus, String reviewComment, Object reviewImages) {
        Long tenantId = UserContext.tenantId();
        StyleInfo style = styleInfoService.lambdaQuery()
                .eq(StyleInfo::getId, id)
                .eq(tenantId != null, StyleInfo::getTenantId, tenantId)
                .one();
        if (style == null) {
            throw new RuntimeException("款式不存在：" + id);
        }
        TenantAssert.assertBelongsToCurrentTenant(style.getTenantId(), "款式");
        style.setSampleReviewStatus(reviewStatus);
        style.setSampleReviewComment(reviewComment);
        style.setSampleReviewer(UserContext.username());
        style.setSampleReviewTime(LocalDateTime.now());
        if (reviewImages != null) {
            try {
                com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
                style.setSampleReviewImages(mapper.writeValueAsString(reviewImages));
            } catch (Exception e) {
                log.warn("Failed to serialize reviewImages: {}", e.getMessage());
            }
        }
        styleInfoService.updateById(style);
        styleOperationAppendHelper.appendSampleReview(id, reviewStatus, UserContext.username(), reviewComment);

        syncPatternProductionReviewFields(id, reviewStatus, reviewComment, reviewImages);

        if ("PASS".equalsIgnoreCase(reviewStatus)) {
            autoGenerateSkusIfNeeded(id);
            // Phase 3-3: 样衣审核通过 → 推送开发费用账单（BOM 物料 + 工序成本）
            // 与 SecondaryProcessOrchestrator.SECONDARY_PROCESS sourceType 并行，互不重叠
            pushStyleDevelopmentBill(style);
        } else if ("REJECT".equalsIgnoreCase(reviewStatus)
                || "REWORK".equalsIgnoreCase(reviewStatus)) {
            // Phase 3-3: 审核驳回/返工 → 反向已推送的账单（如存在），避免悬挂数据
            reverseStyleDevelopmentBill(String.valueOf(id),
                    "样衣审核" + ("REJECT".equalsIgnoreCase(reviewStatus) ? "驳回" : "返工"));
        }

        return styleInfoService.lambdaQuery()
                .eq(StyleInfo::getId, id)
                .eq(tenantId != null, StyleInfo::getTenantId, tenantId)
                .one();
    }

    /**
     * Phase 3-3: 推送样衣开发费用账单（数据链路闭环）
     * <p>
     * 费用构成（与 StyleCostCalculator 对齐，但去除 secondaryProcessCost 避免与
     * SecondaryProcessOrchestrator.SECONDARY_PROCESS sourceType 重复推送）：
     *   amount = materialCost + processCost
     * <p>
     * 账单维度：
     *   - billType = PAYABLE（应付给开发人员/外协工厂）
     *   - billCategory = EXPENSE（样衣开发费用）
     *   - sourceType = STYLE_DEVELOPMENT
     *   - sourceId = StyleInfo.id
     *   - counterpartyType = EMPLOYEE（开发人员）
     * <p>
     * 幂等性：BillAggregation uk_source (sourceType + sourceId + tenantId) 保证不重复推送。
     * 已存在账单时，pushBill 会同步金额（materialCost + processCost 变化时自动更新）。
     * <p>
     * P1 修复（Spring 事务 rollback-only 陷阱）：
     * BillAggregationOrchestrator.pushBill 内部 @Transactional(REQUIRED) 会加入外层
     * saveSampleReview 事务。若 pushBill 抛异常，即使外层 try-catch 捕获，Spring 仍会
     * 标记事务为 rollback-only，导致审核事务回滚。
     * <p>
     * 修复策略：fail-safe — 账单推送失败时让审核事务回滚，保证账单与审核状态强一致。
     * 不再 try-catch 吞异常，避免"审核 PASS 但账单未推送"的数据悬挂。
     */
    private void pushStyleDevelopmentBill(StyleInfo style) {
        if (billAggregationOrchestrator == null) {
            log.warn("[StyleDevBill] BillAggregationOrchestrator 未注入，跳过样衣开发费用推送: styleId={}", style.getId());
            return;
        }
        if (style == null || style.getId() == null) {
            return;
        }
        BigDecimal materialCost = computeMaterialCost(style.getId());
        BigDecimal processCost = computeProcessCost(style.getId());
        BigDecimal totalCost = materialCost.add(processCost)
                .setScale(2, RoundingMode.HALF_UP);

        if (totalCost.compareTo(BigDecimal.ZERO) <= 0) {
            log.info("[StyleDevBill] 样衣开发费用为0，跳过账单推送: styleId={}", style.getId());
            return;
        }

        BillAggregationOrchestrator.BillPushRequest req = new BillAggregationOrchestrator.BillPushRequest();
        req.setBillType("PAYABLE");
        req.setBillCategory("EXPENSE");
        req.setSourceType(STYLE_DEV_SOURCE_TYPE);
        req.setSourceId(String.valueOf(style.getId()));
        req.setSourceNo("SD-" + style.getId());
        req.setCounterpartyType("EMPLOYEE");
        // P1-4 修复：counterpartyId 优先级：制版师(plateWorker) > 审核人
        // plateWorker 当前存储的是姓名（非 userId），暂以姓名作为 counterpartyId 占位
        // 后续接入 UserService.resolveUserIdByName 将姓名转换为 userId（暂以姓名占位）
        String plateWorker = style.getPlateWorker();
        String counterpartyId = null;
        String counterpartyName = null;
        if (org.springframework.util.StringUtils.hasText(plateWorker)) {
            // 制版师优先：若 plateWorker 恰好是 userId 格式（纯数字）则直接用，否则用姓名占位
            counterpartyId = plateWorker.trim();
            counterpartyName = plateWorker.trim();
        }
        if (!org.springframework.util.StringUtils.hasText(counterpartyId)) {
            counterpartyId = UserContext.userId();
        }
        if (!org.springframework.util.StringUtils.hasText(counterpartyName)) {
            counterpartyName = style.getSampleReviewer() != null
                    ? style.getSampleReviewer() : UserContext.username();
        }
        req.setCounterpartyId(counterpartyId);
        req.setCounterpartyName(counterpartyName);
        req.setOrderId(String.valueOf(style.getId()));
        req.setOrderNo(style.getStyleNo());
        req.setStyleNo(style.getStyleNo());
        req.setAmount(totalCost);
        req.setSettlementMonth(LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM")));
        req.setRemark("样衣开发费用: 款号=" + style.getStyleNo()
                + " 物料=" + materialCost + " 工序=" + processCost);

        // P1 修复：fail-safe — pushBill 异常时让审核事务回滚，保证账单与审核状态强一致
        billAggregationOrchestrator.pushBill(req);
        log.info("[StyleDevBill] 样衣开发费用账单已推送: styleId={}, styleNo={}, amount={}",
                style.getId(), style.getStyleNo(), totalCost);
    }

    /**
     * Phase 3-3: 反向样衣开发费用账单（数据链路闭环）
     * <p>
     * 触发场景：样衣审核驳回 / 返工 / 后续可能的删除
     * 行为：调用 reverseBySource 联动取消 Bill → Payable 全链路
     *  - 未结清账单：直接 CANCELLED + 联动 Payable CANCELLED
     *  - 已结清账单：抛异常（fail-safe，让审核事务回滚，避免数据悬挂）
     * <p>
     * P1 修复（Spring 事务 rollback-only 陷阱）：
     * 调用 reverseBySource 前先用 billExists 预检：
     *  - 账单不存在（未推送过或已反向）：直接跳过，不调用 reverseBySource
     *  - 账单存在：调用 reverseBySource，异常时让审核事务回滚（fail-safe）
     * 这样既避免了无谓的 @Transactional 调用，又保证了已结清账单场景下审核操作失败而非数据悬挂。
     */
    private void reverseStyleDevelopmentBill(String sourceId, String reason) {
        if (billAggregationOrchestrator == null) {
            log.warn("[StyleDevBill] BillAggregationOrchestrator 未注入，跳过反向: sourceId={}", sourceId);
            return;
        }
        if (!StringUtils.hasText(sourceId)) {
            return;
        }
        // P1 修复：预检账单是否存在，不存在直接跳过（避免无谓的 @Transactional 调用）
        if (!billAggregationOrchestrator.billExists(STYLE_DEV_SOURCE_TYPE, sourceId)) {
            log.info("[StyleDevBill] 样衣开发费用账单不存在，跳过反向: sourceId={}", sourceId);
            return;
        }
        // P1 修复：fail-safe — 已结清账单反向会抛异常，让审核事务回滚，避免数据悬挂
        // 用户会看到错误提示"账单已结算 X 元，需先在付款中心冲账后再反向操作"，由人工介入冲账
        billAggregationOrchestrator.reverseBySource(STYLE_DEV_SOURCE_TYPE, sourceId, reason);
        log.info("[StyleDevBill] 样衣开发费用账单已反向: sourceId={}, reason={}", sourceId, reason);
    }

    /**
     * Phase 3-3: 实时聚合款式 BOM 物料成本
     * 与 StyleCostCalculator.computeLiveDevCostFromBatch 的 materialTotal 逻辑一致，
     * 但单款查询（非批量），用于账单推送时实时计算。
     */
    private BigDecimal computeMaterialCost(Long styleId) {
        if (styleId == null) {
            return BigDecimal.ZERO;
        }
        List<StyleBom> bomItems = styleBomService.listByStyleId(styleId);
        if (bomItems == null || bomItems.isEmpty()) {
            return BigDecimal.ZERO;
        }
        double total = bomItems.stream().mapToDouble(bom -> {
            BigDecimal tp = bom.getTotalPrice();
            if (tp != null) return tp.doubleValue();
            double usage = bom.getUsageAmount() != null ? bom.getUsageAmount().doubleValue() : 0.0;
            double loss  = bom.getLossRate()    != null ? bom.getLossRate().doubleValue()    : 0.0;
            double up    = bom.getUnitPrice()   != null ? bom.getUnitPrice().doubleValue()   : 0.0;
            return usage * (1.0 + loss / 100.0) * up;
        }).sum();
        return BigDecimal.valueOf(total).setScale(2, RoundingMode.HALF_UP);
    }

    /**
     * Phase 3-3: 实时聚合款式工序成本
     * 与 StyleCostCalculator.computeLiveDevCostFromBatch 的 processTotal 逻辑一致。
     */
    private BigDecimal computeProcessCost(Long styleId) {
        if (styleId == null) {
            return BigDecimal.ZERO;
        }
        List<StyleProcess> processes = styleProcessService.listByStyleId(styleId);
        if (processes == null || processes.isEmpty()) {
            return BigDecimal.ZERO;
        }
        double total = processes.stream()
                .mapToDouble(p -> p.getPrice() != null ? p.getPrice().doubleValue() : 0.0)
                .sum();
        return BigDecimal.valueOf(total).setScale(2, RoundingMode.HALF_UP);
    }

    private void autoGenerateSkusIfNeeded(Long styleId) {
        try {
            List<ProductSku> existingSkus = productSkuService.listByStyleId(styleId);
            if (existingSkus != null && !existingSkus.isEmpty()) {
                log.info("SKUs already exist for styleId={}, skip auto-generate", styleId);
                return;
            }
            Long tenantId = UserContext.tenantId();
            StyleInfo style = styleInfoService.lambdaQuery()
                    .eq(StyleInfo::getId, styleId)
                    .eq(tenantId != null, StyleInfo::getTenantId, tenantId)
                    .one();
            if (style == null || !StringUtils.hasText(style.getSizeColorConfig())) {
                log.info("No sizeColorConfig for styleId={}, skip auto-generate", styleId);
                return;
            }
            String skuMode = style.getSkuMode();
            if (skuMode == null) {
                skuMode = "AUTO";
            }
            if (!"AUTO".equals(skuMode)) {
                log.info("SKU mode is {} for styleId={}, skip auto-generate", skuMode, styleId);
                return;
            }
            productSkuService.generateSkusForStyle(styleId);
            log.info("Auto-generated SKUs after sample review PASS: styleId={}", styleId);
        } catch (Exception e) {
            log.error("Failed to auto-generate SKUs after sample review: styleId={}", styleId, e);
        }
    }

    private void syncPatternProductionReviewFields(Long styleId, String reviewStatus, String reviewComment, Object reviewImages) {
        try {
            Long tenantId = UserContext.tenantId();
            PatternProduction pattern = patternProductionService.lambdaQuery()
                    .eq(PatternProduction::getStyleId, String.valueOf(styleId))
                    .eq(PatternProduction::getDeleteFlag, 0)
                    .eq(tenantId != null, PatternProduction::getTenantId, tenantId)
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
            if (reviewImages != null) {
                try {
                    com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
                    pattern.setReviewImages(mapper.writeValueAsString(reviewImages));
                } catch (Exception e) {
                    log.warn("Failed to serialize reviewImages for PatternProduction: {}", e.getMessage());
                }
            }
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

        Long tenantId = UserContext.tenantId();
        StyleInfo source = styleInfoService.lambdaQuery()
                .eq(StyleInfo::getId, sourceStyleId)
                .eq(tenantId != null, StyleInfo::getTenantId, tenantId)
                .one();
        if (source == null) {
            throw new NoSuchElementException("源款式不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(source.getTenantId(), "款式");

        boolean exists = styleInfoService.lambdaQuery()
                .eq(StyleInfo::getStyleNo, newStyleNo.trim())
                .eq(tenantId != null, StyleInfo::getTenantId, tenantId)
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
                .eq(tenantId != null, StyleInfo::getTenantId, tenantId)
                .orderByDesc(StyleInfo::getCreateTime)
                .last("LIMIT 1")
                .one();
        if (savedStyle == null) {
            throw new IllegalStateException("款式保存后查询失败");
        }

        copyBomToNewStyle(sourceStyleId, savedStyle);
        copyProcessToNewStyle(sourceStyleId, savedStyle.getId());
        copySecondaryProcessToNewStyle(sourceStyleId, savedStyle.getId());
        copyQuotationToNewStyle(sourceStyleId, savedStyle.getId());
        styleOperationAppendHelper.appendCopy(sourceStyleId, newStyle.getStyleNo());

        // 复制完成后，如果尺码颜色配置存在，自动生成SKU
        try {
            tryAutoGenerateSkus(savedStyle.getId());
        } catch (Exception e) {
            log.warn("复制款式后自动生成SKU失败: styleId={}, error={}", savedStyle.getId(), e.getMessage());
        }

        log.info("一键复制款式成功: sourceStyleId={}, newStyleId={}, newStyleNo={}, newColor={}",
                sourceStyleId, savedStyle.getId(), newStyle.getStyleNo(), newColor);
        return savedStyle;
    }

    private StyleInfo buildNewStyleFromSource(StyleInfo source, String newStyleNo, String newColor, String newStyleName) {
        StyleInfo newStyle = new StyleInfo();
        newStyle.setStyleNo(newStyleNo.trim());
        newStyle.setColor(newColor.trim());
        newStyle.setStyleName(StringUtils.hasText(newStyleName) ? newStyleName.trim() : source.getStyleName());
        // 复制基本信息字段
        newStyle.setCategory(source.getCategory());
        newStyle.setSeason(source.getSeason());
        newStyle.setYear(source.getYear());
        newStyle.setMonth(source.getMonth());
        newStyle.setDescription(source.getDescription());
        newStyle.setCover(source.getCover());
        // 复制扩展字段
        newStyle.setSkc(source.getSkc());
        newStyle.setSkuMode(source.getSkuMode());
        newStyle.setUseSkuPrefix(source.getUseSkuPrefix());
        newStyle.setPrice(source.getPrice());
        newStyle.setTagPrice(source.getTagPrice());
        newStyle.setSalesPrice(source.getSalesPrice());
        newStyle.setCycle(source.getCycle());
        newStyle.setSize(source.getSize());
        newStyle.setSampleQuantity(source.getSampleQuantity());
        newStyle.setDevelopmentSourceType(source.getDevelopmentSourceType());
        newStyle.setDevelopmentSourceDetail(source.getDevelopmentSourceDetail());
        newStyle.setSalesChannel(source.getSalesChannel());
        newStyle.setCustomerId(source.getCustomerId());
        newStyle.setCustomerName(source.getCustomerName());
        newStyle.setCustomerContact(source.getCustomerContact());
        newStyle.setCustomerPhone(source.getCustomerPhone());
        newStyle.setCustomerAddress(source.getCustomerAddress());
        // 复制洗水唛标签字段
        newStyle.setFabricComposition(source.getFabricComposition());
        newStyle.setWashInstructions(source.getWashInstructions());
        newStyle.setUCode(source.getUCode());
        newStyle.setWashTempCode(source.getWashTempCode());
        newStyle.setBleachCode(source.getBleachCode());
        newStyle.setTumbleDryCode(source.getTumbleDryCode());
        newStyle.setIronCode(source.getIronCode());
        newStyle.setDryCleanCode(source.getDryCleanCode());
        newStyle.setFabricCompositionParts(source.getFabricCompositionParts());
        newStyle.setCareIconCodes(source.getCareIconCodes());
        newStyle.setQualityGrade(source.getQualityGrade());
        newStyle.setExecuteStandard(source.getExecuteStandard());
        newStyle.setSafetyCategory(source.getSafetyCategory());
        newStyle.setInspector(source.getInspector());
        newStyle.setInspectionDate(source.getInspectionDate());
        // 复制尺码颜色配置
        newStyle.setSizeColorConfig(source.getSizeColorConfig());
        // 复制设计师/纸样师等信息
        newStyle.setSampleNo(source.getSampleNo());
        newStyle.setVehicleSupplier(source.getVehicleSupplier());
        newStyle.setSampleSupplier(source.getSampleSupplier());
        newStyle.setPatternNo(source.getPatternNo());
        newStyle.setPlateWorker(source.getPlateWorker());
        newStyle.setPlateType(source.getPlateType());
        newStyle.setOrderType(source.getOrderType());
        newStyle.setCustomer(source.getCustomer());
        // 租户隔离
        newStyle.setTenantId(UserContext.tenantId());
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
            nb.setTenantId(savedStyle.getTenantId());
            nb.setCreateTime(LocalDateTime.now());
            nb.setUpdateTime(LocalDateTime.now());
            newBoms.add(nb);
        }
        styleBomService.saveBatch(newBoms);
    }

    private void copyProcessToNewStyle(Long sourceStyleId, Long newStyleId) {
        Long tenantId = UserContext.tenantId();
        List<StyleProcess> sourceProcesses = styleProcessService.lambdaQuery()
                .eq(StyleProcess::getStyleId, sourceStyleId)
                .eq(tenantId != null, StyleProcess::getTenantId, tenantId)
                .list();
        if (sourceProcesses == null || sourceProcesses.isEmpty()) {
            return;
        }
        List<StyleProcess> newProcesses = new java.util.ArrayList<>();
        for (StyleProcess proc : sourceProcesses) {
            StyleProcess np = new StyleProcess();
            np.setStyleId(newStyleId);
            np.setProcessCode(proc.getProcessCode());
            np.setProcessName(proc.getProcessName());
            np.setProgressStage(proc.getProgressStage());
            np.setMachineType(proc.getMachineType());
            np.setDifficulty(proc.getDifficulty());
            np.setDescription(proc.getDescription());
            np.setStandardTime(proc.getStandardTime());
            np.setPrice(proc.getPrice());
            np.setRateMultiplier(proc.getRateMultiplier());
            np.setSortOrder(proc.getSortOrder());
            np.setTenantId(UserContext.tenantId());
            np.setCreateTime(LocalDateTime.now());
            np.setUpdateTime(LocalDateTime.now());
            newProcesses.add(np);
        }
        styleProcessService.saveBatch(newProcesses);
    }

    private void copySecondaryProcessToNewStyle(Long sourceStyleId, Long newStyleId) {
        Long tenantId = UserContext.tenantId();
        List<SecondaryProcess> sourceSecondaries = secondaryProcessService.lambdaQuery()
                .eq(SecondaryProcess::getStyleId, sourceStyleId)
                .eq(tenantId != null, SecondaryProcess::getTenantId, tenantId)
                .list();
        if (sourceSecondaries == null || sourceSecondaries.isEmpty()) {
            return;
        }
        List<SecondaryProcess> newSecondaries = new java.util.ArrayList<>();
        for (SecondaryProcess sec : sourceSecondaries) {
            SecondaryProcess ns = new SecondaryProcess();
            ns.setStyleId(newStyleId);
            ns.setProcessType(sec.getProcessType());
            ns.setProcessName(sec.getProcessName());
            ns.setDescription(sec.getDescription());
            ns.setQuantity(sec.getQuantity());
            ns.setUnitPrice(sec.getUnitPrice());
            ns.setTotalPrice(sec.getTotalPrice());
            ns.setFactoryId(sec.getFactoryId());
            ns.setFactoryName(sec.getFactoryName());
            ns.setFactoryContactPerson(sec.getFactoryContactPerson());
            ns.setFactoryContactPhone(sec.getFactoryContactPhone());
            ns.setImages(sec.getImages());
            ns.setAttachments(sec.getAttachments());
            ns.setTenantId(UserContext.tenantId());
            ns.setCreatedAt(LocalDateTime.now());
            ns.setUpdatedAt(LocalDateTime.now());
            newSecondaries.add(ns);
        }
        secondaryProcessService.saveBatch(newSecondaries);
    }

    private void copyQuotationToNewStyle(Long sourceStyleId, Long newStyleId) {
        Long tenantId = UserContext.tenantId();
        StyleQuotation sourceQuotation = styleQuotationService.lambdaQuery()
                .eq(StyleQuotation::getStyleId, sourceStyleId)
                .eq(tenantId != null, StyleQuotation::getTenantId, tenantId)
                .orderByDesc(StyleQuotation::getCreateTime)
                .last("LIMIT 1")
                .one();
        if (sourceQuotation == null) {
            return;
        }
        StyleQuotation nq = new StyleQuotation();
        nq.setStyleId(newStyleId);
        nq.setMaterialCost(sourceQuotation.getMaterialCost());
        nq.setProcessCost(sourceQuotation.getProcessCost());
        nq.setOtherCost(sourceQuotation.getOtherCost());
        nq.setProfitRate(sourceQuotation.getProfitRate());
        nq.setTotalCost(sourceQuotation.getTotalCost());
        nq.setTotalPrice(sourceQuotation.getTotalPrice());
        nq.setCurrency(sourceQuotation.getCurrency());
        nq.setVersion(sourceQuotation.getVersion());
        nq.setStandardMaterialCost(sourceQuotation.getStandardMaterialCost());
        nq.setStandardProcessCost(sourceQuotation.getStandardProcessCost());
        nq.setStandardOtherCost(sourceQuotation.getStandardOtherCost());
        nq.setOverheadAllocationRate(sourceQuotation.getOverheadAllocationRate());
        nq.setTenantId(UserContext.tenantId());
        nq.setCreateTime(LocalDateTime.now());
        nq.setUpdateTime(LocalDateTime.now());
        styleQuotationService.save(nq);
    }

    private void evictCurrentTenantCache() {
        Long tid = UserContext.tenantId();
        if (tid == null) return;
        try {
            java.util.Set<String> styleKeys = redisTemplate.keys("style::*" + tid + "*");
            java.util.Set<String> dcKeys = redisTemplate.keys("dataCenter::*" + tid + "*");
            java.util.List<String> all = new java.util.ArrayList<>();
            if (styleKeys != null) all.addAll(styleKeys);
            if (dcKeys != null) all.addAll(dcKeys);
            if (!all.isEmpty()) {
                redisTemplate.delete(all);
                log.info("[缓存淘汰] 已清除租户 {} 的 style/dataCenter 缓存共 {} 条", tid, all.size());
            }
        } catch (Exception e) {
            log.warn("[缓存淘汰] 清除租户 {} 缓存失败: {}", tid, e.getMessage());
        }
    }

    private void tryAutoGenerateSkus(Long styleId) {
        try {
            Long tenantId = UserContext.tenantId();
            StyleInfo style = styleInfoService.lambdaQuery()
                    .eq(StyleInfo::getId, styleId)
                    .eq(tenantId != null, StyleInfo::getTenantId, tenantId)
                    .one();
            if (style == null) {
                return;
            }
            String mode = style.getSkuMode();
            if (mode == null) {
                mode = "AUTO";
            }
            if (!"AUTO".equals(mode)) {
                return;
            }
            if (!StringUtils.hasText(style.getSizeColorConfig())) {
                log.info("SKU auto-generation skipped: no sizeColorConfig for styleId={}", styleId);
                return;
            }
            productSkuService.generateSkusForStyle(styleId);
            log.info("Auto-generated SKUs after production stage completion: styleId={}", styleId);
        } catch (Exception e) {
            log.warn("Failed to auto-generate SKUs after production completion: styleId={}", styleId, e);
        }
    }
}
