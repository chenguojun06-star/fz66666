package com.fashion.supplychain.style.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.PatternProduction;
import com.fashion.supplychain.production.service.PatternProductionService;
import com.fashion.supplychain.stock.entity.SampleStock;
import com.fashion.supplychain.stock.mapper.SampleStockMapper;
import com.fashion.supplychain.style.entity.SecondaryProcess;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.SecondaryProcessService;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.style.service.StyleInfoService;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * 款式后段阶段流转辅助类（尺寸表/BOM/工序/码数单价/二次工艺 + 完成度判断）
 * 从 StyleStageHelper 拆分而来
 */
@Component
@Slf4j
public class StyleStageCompletionHelper {

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleBomService styleBomService;

    @Autowired
    private SecondaryProcessService secondaryProcessService;

    @Autowired
    private PatternProductionService patternProductionService;

    @Autowired
    private SampleStockMapper sampleStockMapper;

    // ==================== Size Stage ====================

    public boolean startSize(Long id) {
        StyleInfo current = getStyleWithTenantCheck(id);
        if (current == null) {
            throw new NoSuchElementException("款号不存在");
        }
        if (current.getSizeCompletedTime() != null) {
            log.info("尺寸表已完成，跳过重新开始: styleId={}", id);
            return true;
        }

        String currentUser = UserContext.username();
        boolean ok = styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .set(StyleInfo::getSizeAssignee, currentUser)
                .set(StyleInfo::getSizeStartTime, LocalDateTime.now())
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();

        if (!ok) {
            throw new IllegalStateException("操作失败");
        }
        log.info("尺寸表配置已开始: styleId={}, assignee={}", id, currentUser);
        return true;
    }

    /**
     * 完成尺寸表配置
     */
    public boolean completeSize(Long id) {
        StyleInfo current = getStyleWithTenantCheck(id);
        if (current == null) {
            throw new NoSuchElementException("款号不存在");
        }
        if (current.getSizeCompletedTime() != null) {
            log.info("尺寸表已完成，跳过重复操作: styleId={}", id);
            return true;
        }
        if (current.getSizeStartTime() == null) {
            throw new IllegalStateException("请先点击'开始尺寸表配置'");
        }

        boolean ok = styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .set(StyleInfo::getSizeCompletedTime, LocalDateTime.now())
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();

        if (!ok) {
            throw new IllegalStateException("操作失败");
        }
        log.info("尺寸表配置已完成: styleId={}", id);
        return true;
    }

    /**
     * 退回尺寸表配置（只清空完成时间，保留开始时间和负责人）
     */
    public boolean resetSize(Long id, Map<String, Object> body) {
        if (!UserContext.isSupervisorOrAbove()) {
            throw new AccessDeniedException("无权限操作");
        }
        StyleInfo current = getStyleWithTenantCheck(id);
        if (current == null) {
            throw new NoSuchElementException("款号不存在");
        }
        Object reasonValue = body == null ? null : body.get("reason");
        String reason = reasonValue == null ? "" : String.valueOf(reasonValue).trim();
        if (!StringUtils.hasText(reason)) {
            throw new IllegalArgumentException("退回原因不能为空");
        }
        boolean ok = styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .set(StyleInfo::getSizeCompletedTime, null)
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();
        if (!ok) {
            throw new IllegalStateException("操作失败");
        }
        log.info("尺寸表配置已退回维护: styleId={}, reason={}", id, reason);
        return true;
    }

    // ==================== BOM Stage ====================

    public boolean startBom(Long id) {
        StyleInfo current = getStyleWithTenantCheck(id);
        if (current == null) {
            throw new NoSuchElementException("款号不存在");
        }
        if (current.getBomCompletedTime() != null) {
            log.info("BOM配置已完成，跳过重新开始: styleId={}", id);
            return true;
        }

        String currentUser = UserContext.username();
        boolean ok = styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .set(StyleInfo::getBomAssignee, currentUser)
                .set(StyleInfo::getBomStartTime, LocalDateTime.now())
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();

        if (!ok) {
            throw new IllegalStateException("操作失败");
        }
        log.info("BOM配置已开始: styleId={}, assignee={}", id, currentUser);
        return true;
    }

    public boolean completeBom(Long id) {
        StyleInfo current = getStyleWithTenantCheck(id);
        if (current == null) {
            throw new NoSuchElementException("款号不存在");
        }
        if (current.getBomCompletedTime() != null) {
            log.info("BOM配置已完成，跳过重复操作: styleId={}", id);
            return true;
        }
        if (current.getBomStartTime() == null) {
            throw new IllegalStateException("请先点击'开始BOM配置'");
        }

        // 检查是否有BOM数据
        List<StyleBom> bomList = styleBomService.list(
            new LambdaQueryWrapper<StyleBom>()
                .eq(StyleBom::getStyleId, id)
        );
        if (bomList == null || bomList.isEmpty()) {
            throw new IllegalStateException("请先配置BOM物料数据");
        }

        boolean ok = styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .set(StyleInfo::getBomCompletedTime, LocalDateTime.now())
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();

        if (!ok) {
            throw new IllegalStateException("操作失败");
        }
        log.info("BOM配置已完成: styleId={}", id);
        return true;
    }

    public boolean resetBom(Long id, Map<String, Object> body) {
        if (!UserContext.isSupervisorOrAbove()) {
            throw new AccessDeniedException("无权限操作");
        }
        StyleInfo current = getStyleWithTenantCheck(id);
        if (current == null) {
            throw new NoSuchElementException("款号不存在");
        }
        Object reasonValue = body == null ? null : body.get("reason");
        String reason = reasonValue == null ? "" : String.valueOf(reasonValue).trim();
        if (!StringUtils.hasText(reason)) {
            throw new IllegalArgumentException("退回原因不能为空");
        }
        boolean ok = styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .set(StyleInfo::getBomCompletedTime, null)
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();
        if (!ok) {
            throw new IllegalStateException("操作失败");
        }
        log.info("BOM配置已退回维护: styleId={}, reason={}", id, reason);
        return true;
    }

    // ==================== Process Stage ====================

    public boolean startProcess(Long id) {
        StyleInfo current = getStyleWithTenantCheck(id);
        if (current == null) {
            throw new NoSuchElementException("款号不存在");
        }
        if (current.getProcessStartTime() != null) {
            log.info("工序配置已开始过，跳过重复操作: styleId={}", id);
            return true;
        }

        String currentUser = UserContext.username();
        boolean ok = styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .set(StyleInfo::getProcessAssignee, currentUser)
                .set(StyleInfo::getProcessStartTime, LocalDateTime.now())
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();

        if (!ok) {
            throw new IllegalStateException("操作失败");
        }
        log.info("工序配置已开始: styleId={}, assignee={}", id, currentUser);
        return true;
    }

    public boolean completeProcess(Long id) {
        StyleInfo current = getStyleWithTenantCheck(id);
        if (current == null) {
            throw new NoSuchElementException("款号不存在");
        }
        if (current.getProcessCompletedTime() != null) {
            log.info("工序配置已完成，跳过重复操作: styleId={}", id);
            return true;
        }

        boolean ok = styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .set(StyleInfo::getProcessCompletedTime, LocalDateTime.now())
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();

        if (!ok) {
            throw new IllegalStateException("操作失败");
        }
        log.info("工序配置已完成: styleId={}", id);
        return true;
    }

    public boolean resetProcess(Long id, Map<String, Object> body) {
        if (!UserContext.isSupervisorOrAbove()) {
            throw new AccessDeniedException("无权限操作");
        }
        StyleInfo current = getStyleWithTenantCheck(id);
        if (current == null) {
            throw new NoSuchElementException("款号不存在");
        }
        Object reasonValue = body == null ? null : body.get("reason");
        String reason = reasonValue == null ? "" : String.valueOf(reasonValue).trim();
        if (!StringUtils.hasText(reason)) {
            throw new IllegalArgumentException("退回原因不能为空");
        }
        boolean ok = styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .set(StyleInfo::getProcessCompletedTime, null)
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();
        if (!ok) {
            throw new IllegalStateException("操作失败");
        }
        log.info("工序配置已退回维护: styleId={}, reason={}", id, reason);
        return true;
    }

    // ==================== SizePrice Stage ====================

    public boolean startSizePrice(Long id) {
        StyleInfo current = getStyleWithTenantCheck(id);
        if (current == null) {
            throw new NoSuchElementException("款号不存在");
        }
        if (current.getSizePriceStartTime() != null) {
            log.info("码数单价已开始过，跳过重复操作: styleId={}", id);
            return true;
        }
        String currentUser = UserContext.username();
        boolean ok = styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .set(StyleInfo::getSizePriceAssignee, currentUser)
                .set(StyleInfo::getSizePriceStartTime, LocalDateTime.now())
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();
        if (!ok) {
            throw new IllegalStateException("操作失败");
        }
        log.info("码数单价配置已开始: styleId={}, assignee={}", id, currentUser);
        return true;
    }

    public boolean completeSizePrice(Long id) {
        StyleInfo current = getStyleWithTenantCheck(id);
        if (current == null) {
            throw new NoSuchElementException("款号不存在");
        }
        if (current.getSizePriceCompletedTime() != null) {
            log.info("码数单价已完成，跳过重复操作: styleId={}", id);
            return true;
        }
        boolean ok = styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .set(StyleInfo::getSizePriceCompletedTime, LocalDateTime.now())
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();
        if (!ok) {
            throw new IllegalStateException("操作失败");
        }
        log.info("码数单价配置已完成: styleId={}", id);
        return true;
    }

    public boolean resetSizePrice(Long id, Map<String, Object> body) {
        if (!UserContext.isSupervisorOrAbove()) {
            throw new AccessDeniedException("无权限操作");
        }
        StyleInfo current = getStyleWithTenantCheck(id);
        if (current == null) {
            throw new NoSuchElementException("款号不存在");
        }
        Object reasonValue = body == null ? null : body.get("reason");
        String reason = reasonValue == null ? "" : String.valueOf(reasonValue).trim();
        if (!StringUtils.hasText(reason)) {
            throw new IllegalArgumentException("退回原因不能为空");
        }
        boolean ok = styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .set(StyleInfo::getSizePriceCompletedTime, null)
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();
        if (!ok) {
            throw new IllegalStateException("操作失败");
        }
        log.info("码数单价已退回维护: styleId={}, reason={}", id, reason);
        return true;
    }

    // ==================== Secondary Stage ====================

    public boolean startSecondary(Long id) {
        StyleInfo current = getStyleWithTenantCheck(id);
        if (current == null) {
            throw new NoSuchElementException("款号不存在");
        }
        if (current.getSecondaryStartTime() != null) {
            log.info("二次工艺已开始过，跳过重复操作: styleId={}", id);
            return true;
        }

        String currentUser = UserContext.username();
        boolean ok = styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .set(StyleInfo::getSecondaryAssignee, currentUser)
                .set(StyleInfo::getSecondaryStartTime, LocalDateTime.now())
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();

        if (!ok) {
            throw new IllegalStateException("操作失败");
        }
        log.info("二次工艺已开始: styleId={}, assignee={}", id, currentUser);
        return true;
    }

    public boolean completeSecondary(Long id) {
        StyleInfo current = getStyleWithTenantCheck(id);
        if (current == null) {
            throw new NoSuchElementException("款号不存在");
        }
        if (current.getSecondaryCompletedTime() != null) {
            log.info("二次工艺已完成，跳过重复操作: styleId={}", id);
            return true;
        }

        LocalDateTime now = LocalDateTime.now();
        String currentUser = UserContext.username();

        boolean ok = styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .set(StyleInfo::getSecondaryCompletedTime, now)
                .set(StyleInfo::getUpdateTime, now)
                .update();

        if (!ok) {
            throw new IllegalStateException("操作失败");
        }

        // 联动更新：将所有 pending/processing 状态的子记录标记为已完成，补充领取人和完成时间
        List<SecondaryProcess> pendingItems = secondaryProcessService.listByStyleId(id)
                .stream()
                .filter(p -> !"completed".equals(p.getStatus()) && !"cancelled".equals(p.getStatus()))
                .collect(Collectors.toList());
        for (SecondaryProcess item : pendingItems) {
            secondaryProcessService.lambdaUpdate()
                    .eq(SecondaryProcess::getId, item.getId())
                    .set(SecondaryProcess::getStatus, "completed")
                    .set(SecondaryProcess::getAssignee, currentUser)
                    .set(SecondaryProcess::getCompletedTime, now)
                    .update();
        }
        log.info("二次工艺已完成: styleId={}, 联动更新子记录{}条", id, pendingItems.size());
        return true;
    }

    public boolean resetSecondary(Long id, Map<String, Object> body) {
        if (!UserContext.isSupervisorOrAbove()) {
            throw new AccessDeniedException("无权限操作");
        }
        StyleInfo current = getStyleWithTenantCheck(id);
        if (current == null) {
            throw new NoSuchElementException("款号不存在");
        }
        Object reasonValue = body == null ? null : body.get("reason");
        String reason = reasonValue == null ? "" : String.valueOf(reasonValue).trim();
        if (!StringUtils.hasText(reason)) {
            throw new IllegalArgumentException("退回原因不能为空");
        }
        boolean ok = styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .set(StyleInfo::getSecondaryCompletedTime, null)
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();
        if (!ok) {
            throw new IllegalStateException("操作失败");
        }
        log.info("二次工艺已退回维护: styleId={}, reason={}", id, reason);
        return true;
    }

    public boolean skipSecondary(Long id) {
        StyleInfo current = getStyleWithTenantCheck(id);
        if (current == null) {
            throw new NoSuchElementException("款号不存在");
        }
        if (current.getSecondaryCompletedTime() != null) {
            log.info("二次工艺已完成，跳过重复操作: styleId={}", id);
            return true;
        }

        String currentUser = UserContext.username();
        boolean ok = styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .set(StyleInfo::getSecondaryAssignee, currentUser)
                .set(StyleInfo::getSecondaryStartTime, LocalDateTime.now())
                .set(StyleInfo::getSecondaryCompletedTime, LocalDateTime.now())
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();

        if (!ok) {
            throw new IllegalStateException("操作失败");
        }
        log.info("二次工艺已跳过（无二次工艺）: styleId={}, operator={}", id, currentUser);
        return true;
    }

    // ==================== Utility ====================

    private void ensureStyleFullyCompletedBeforeMaintenance(StyleInfo current) {
        if (!isStyleFullyCompleted(current)) {
            throw new IllegalStateException("只有款式全部完成后，再次修改才算维护");
        }
    }

    private boolean isStyleFullyCompleted(StyleInfo current) {
        if (current == null) {
            return false;
        }

        boolean developmentCompleted = current.getBomCompletedTime() != null
                && current.getSizeCompletedTime() != null
                && current.getProcessCompletedTime() != null
                && current.getProductionCompletedTime() != null;
        boolean patternCompleted = current.getPatternCompletedTime() != null || isCompleted(current.getPatternStatus());
        boolean sampleCompleted = current.getSampleCompletedTime() != null || isCompleted(current.getSampleStatus());

        boolean hasSizePriceStage = current.getSizePriceStartTime() != null
                || current.getSizePriceCompletedTime() != null
                || StringUtils.hasText(current.getSizePriceAssignee());
        boolean sizePriceCompleted = !hasSizePriceStage || current.getSizePriceCompletedTime() != null;

        boolean hasSecondaryStage = current.getSecondaryStartTime() != null
                || current.getSecondaryCompletedTime() != null
                || StringUtils.hasText(current.getSecondaryAssignee())
                || String.valueOf(current.getProgressNode() == null ? "" : current.getProgressNode()).contains("二次工艺");
        boolean secondaryCompleted = !hasSecondaryStage || current.getSecondaryCompletedTime() != null;

        boolean reviewPassed = isPassedReview(current.getSampleReviewStatus());
        boolean inboundCompleted = isInboundCompleted(current);

        return developmentCompleted
                && patternCompleted
                && sizePriceCompleted
                && secondaryCompleted
                && sampleCompleted
                && reviewPassed
                && inboundCompleted;
    }

    private boolean isPassedReview(String reviewStatus) {
        String normalized = String.valueOf(reviewStatus == null ? "" : reviewStatus).trim().toUpperCase();
        return "PASS".equals(normalized) || "APPROVED".equals(normalized);
    }

    private boolean isInboundCompleted(StyleInfo current) {
        if (current == null || current.getId() == null) {
            return false;
        }

        String styleId = String.valueOf(current.getId());
        String color = current.getColor();
        PatternProduction latestPattern = patternProductionService.lambdaQuery()
                .eq(PatternProduction::getStyleId, styleId)
                .eq(StringUtils.hasText(color), PatternProduction::getColor, color)
                .eq(PatternProduction::getDeleteFlag, 0)
                .orderByDesc(PatternProduction::getUpdateTime)
                .orderByDesc(PatternProduction::getCreateTime)
                .last("limit 1")
                .one();
        if (latestPattern != null && "COMPLETED".equalsIgnoreCase(String.valueOf(latestPattern.getStatus()).trim())) {
            return true;
        }

        QueryWrapper<SampleStock> stockQuery = new QueryWrapper<SampleStock>()
                .eq("sample_type", "development")
                .eq("delete_flag", 0)
                .and(wrapper -> wrapper.eq("style_id", styleId)
                        .or()
                        .eq(StringUtils.hasText(current.getStyleNo()), "style_no", current.getStyleNo()));
        if (StringUtils.hasText(color)) {
            stockQuery.eq("color", color);
        }
        return sampleStockMapper.selectCount(stockQuery) > 0;
    }

    private boolean isCompleted(String status) {
        String s = String.valueOf(status == null ? "" : status).trim();
        return "COMPLETED".equalsIgnoreCase(s);
    }

    private StyleInfo getStyleWithTenantCheck(Long id) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        return styleInfoService.lambdaQuery()
                .eq(StyleInfo::getId, id)
                .eq(StyleInfo::getTenantId, tenantId)
                .one();
    }
}
