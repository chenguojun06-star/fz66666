package com.fashion.supplychain.style.helper;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleAttachmentService;
import com.fashion.supplychain.style.service.StyleInfoService;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.NoSuchElementException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * 款式前段阶段流转辅助类（生产要求/生产/纸样/样衣）
 * 后段阶段（尺寸表/BOM/工序/码数单价/二次工艺）已拆分到 StyleStageCompletionHelper
 */
@Component
@Slf4j
public class StyleStageHelper {

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleLogHelper styleLogHelper;

    @Autowired
    private StyleAttachmentService styleAttachmentService;


    public StyleInfo updateProductionRequirements(Long id, Map<String, Object> body) {
        StyleInfo current = getStyleWithTenant(id);
        if (current == null) {
            throw new NoSuchElementException("款号不存在");
        }

        String desc = body == null ? null
                : (body.get("description") == null ? null : String.valueOf(body.get("description")));
        LocalDateTime now = LocalDateTime.now();
        String currentUser = UserContext.username();
        boolean ok = styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .set(StyleInfo::getDescription, desc)
            .set(StyleInfo::getDescriptionLocked, 1)
                .set(StyleInfo::getDescriptionReturnComment, null)
                .set(StyleInfo::getDescriptionReturnBy, null)
                .set(StyleInfo::getDescriptionReturnTime, null)
                .set(StyleInfo::getUpdateTime, now)
                .set(StyleInfo::getUpdateBy, currentUser)
                .update();

        if (ok) {
            styleLogHelper.saveStyleLog(id, "PRODUCTION_REQUIREMENTS_SAVE", null);
        }

        if (!ok) {
            throw new IllegalStateException("保存失败");
        }

        StyleInfo saved = styleInfoService.lambdaQuery()
                .select(StyleInfo::getId,
                        StyleInfo::getStyleNo,
                        StyleInfo::getDescription,
                        StyleInfo::getDescriptionLocked,
                        StyleInfo::getDescriptionReturnComment,
                        StyleInfo::getUpdateBy,
                        StyleInfo::getUpdateTime)
                .eq(StyleInfo::getId, id)
                .one();
        if (saved == null || !Integer.valueOf(1).equals(saved.getDescriptionLocked())) {
            throw new IllegalStateException("保存后状态校验失败");
        }
        return saved;
    }

    public boolean rollbackProductionRequirements(Long id, Map<String, Object> body) {
        if (!UserContext.isSupervisorOrAbove()) {
            throw new AccessDeniedException("无权限操作");
        }

        StyleInfo current = getStyleWithTenant(id);
        if (current == null) {
            throw new NoSuchElementException("款号不存在");
        }

        Object reasonValue = body == null ? null : body.get("reason");
        String reason = reasonValue == null ? "" : String.valueOf(reasonValue).trim();
        if (!StringUtils.hasText(reason)) {
            throw new IllegalArgumentException("退回原因不能为空");
        }

        // 写入解锁状态和退回信息
        boolean ok = styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .set(StyleInfo::getDescriptionLocked, 0)
                .set(StyleInfo::getDescriptionReturnComment, reason)
                .set(StyleInfo::getDescriptionReturnBy, UserContext.username())
                .set(StyleInfo::getDescriptionReturnTime, LocalDateTime.now())
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .set(StyleInfo::getUpdateBy, UserContext.username())
                .update();
        if (!ok) {
            throw new IllegalStateException("退回操作失败");
        }

        styleLogHelper.saveMaintenanceLog(id, "PRODUCTION_REQUIREMENTS_ROLLBACK", reason);
        return true;
    }

    // ==================== Production Stage ====================

    /** 管理员退回纸样修改，允许用户提交新记录 */
    public boolean rollbackPatternRevision(Long id, Map<String, Object> body) {
        if (!UserContext.isSupervisorOrAbove()) {
            throw new AccessDeniedException("无权限操作");
        }
        StyleInfo current = getStyleWithTenant(id);
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
                .set(StyleInfo::getPatternRevLocked, 0)
                .set(StyleInfo::getPatternRevReturnComment, reason)
                .set(StyleInfo::getPatternRevReturnBy, UserContext.username())
                .set(StyleInfo::getPatternRevReturnTime, LocalDateTime.now())
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .set(StyleInfo::getUpdateBy, UserContext.username())
                .update();
        if (!ok) {
            throw new IllegalStateException("退回操作失败");
        }
        styleLogHelper.saveMaintenanceLog(id, "PATTERN_REVISION_ROLLBACK", reason);
        return true;
    }

    /** 纸样修改提交后自动锁定，防止重复提交 */
    public void lockPatternRevision(Long id) {
        styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .set(StyleInfo::getPatternRevLocked, 1)
                .set(StyleInfo::getPatternRevReturnComment, null)
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();
    }

    /** 生产要求取消修改后重新锁定 */
    public void lockProductionRequirements(Long id) {
        styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .set(StyleInfo::getDescriptionLocked, 1)
                .set(StyleInfo::getDescriptionReturnComment, null)
                .set(StyleInfo::getDescriptionReturnBy, null)
                .set(StyleInfo::getDescriptionReturnTime, null)
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();
    }

    public boolean startProductionStage(Long id) {
        StyleInfo current = getStyleWithTenant(id);
        if (current == null) {
            throw new NoSuchElementException("款号不存在");
        }
        if (current.getProductionStartTime() != null) {
            return true; // 已开始，幂等
        }
        String currentUser = UserContext.username();
        boolean ok = styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .set(StyleInfo::getProductionAssignee, currentUser)
                .set(StyleInfo::getProductionStartTime, LocalDateTime.now())
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();
        if (!ok) throw new IllegalStateException("操作失败");
        styleLogHelper.saveStyleLog(id, "PRODUCTION_START", null);
        return true;
    }

    public boolean completeProductionStage(Long id) {
        StyleInfo current = getStyleWithTenant(id);
        if (current == null) {
            throw new NoSuchElementException("款号不存在");
        }
        boolean ok = styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .set(StyleInfo::getProductionAssignee,
                        current.getProductionAssignee() != null ? current.getProductionAssignee() : UserContext.username())
                .set(StyleInfo::getProductionStartTime,
                        current.getProductionStartTime() != null ? current.getProductionStartTime() : LocalDateTime.now())
                .set(StyleInfo::getProductionCompletedTime, LocalDateTime.now())
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();
        if (!ok) throw new IllegalStateException("操作失败");
        styleLogHelper.saveStyleLog(id, "PRODUCTION_COMPLETED", null);
        return true;
    }

    public boolean resetProductionStage(Long id, Map<String, Object> body) {
        if (!UserContext.isSupervisorOrAbove()) {
            throw new AccessDeniedException("无权限操作");
        }
        StyleInfo current = getStyleWithTenant(id);
        if (current == null) {
            throw new NoSuchElementException("款号不存在");
        }
        Object reasonValue = body == null ? null : body.get("reason");
        String reason = reasonValue == null ? "" : String.valueOf(reasonValue).trim();
        if (!StringUtils.hasText(reason)) {
            throw new IllegalArgumentException("维护原因不能为空");
        }
        boolean ok = styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .set(StyleInfo::getProductionCompletedTime, null)
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();
        if (!ok) throw new IllegalStateException("操作失败");
        styleLogHelper.saveMaintenanceLog(id, "PRODUCTION_RESET", reason);
        log.info("生产制单已退回维护: styleId={}, reason={}", id, reason);
        return true;
    }

    // ==================== Pattern Stage ====================

    public boolean startPattern(Long id) {
        StyleInfo current = getStyleWithTenant(id);
        if (current == null) {
            throw new NoSuchElementException("款号不存在");
        }
        if (isCompleted(current.getPatternStatus())) {
            log.info("纸样已完成，跳过重复开始: styleId={}", id);
            return true;
        }

        String currentUser = UserContext.username();
        LocalDateTime now = LocalDateTime.now();

        // 构建更新链
        var updateChain = styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .set(StyleInfo::getPatternStatus, "IN_PROGRESS")
                .set(StyleInfo::getPatternAssignee, currentUser)
                .set(StyleInfo::getPatternStartTime, now)
                .set(StyleInfo::getPatternCompletedTime, null)
                // 纸样开始时同步更新尺寸表开始时间（尺寸被纸样控制）
                .set(StyleInfo::getSizeAssignee, currentUser)
                .set(StyleInfo::getSizeStartTime, now)
                // 纸样开始时同步更新生产制单开始时间（生产制单跟随纸样）
                .set(StyleInfo::getProductionAssignee, currentUser)
                .set(StyleInfo::getProductionStartTime, now)
                .set(StyleInfo::getUpdateTime, now);

        // 纸样师 = 领取纸样开发的人（如果还没有设置）
        if (!StringUtils.hasText(current.getSampleSupplier())) {
            updateChain.set(StyleInfo::getSampleSupplier, currentUser);
            log.info("Synced pattern developer to style info: styleId={}, patternDeveloper={}", id, currentUser);
        }

        boolean ok = updateChain.update();
        if (ok) {
            styleLogHelper.savePatternLog(id, "PATTERN_START", null);
            log.info("纸样开始，已同步更新尺寸表和生产制单开始时间: styleId={}", id);
        }
        if (!ok) {
            throw new IllegalStateException("操作失败");
        }
        return true;
    }

    public boolean completePattern(Long id) {
        StyleInfo current = getStyleWithTenant(id);
        if (current == null) {
            throw new NoSuchElementException("款号不存在");
        }
        if (isCompleted(current.getPatternStatus())) {
            log.info("纸样已完成，跳过重复操作: styleId={}", id);
            return true;
        }

        LocalDateTime now = LocalDateTime.now();
        boolean ok = styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .set(StyleInfo::getPatternStatus, "COMPLETED")
                .set(StyleInfo::getPatternCompletedTime, now)
                // 纸样完成时同步标记尺寸表完成（尺寸由纸样控制，纸样done则尺寸done）
                .set(StyleInfo::getSizeCompletedTime, now)
                .set(StyleInfo::getUpdateTime, now)
                .update();
        if (ok) {
            styleLogHelper.savePatternLog(id, "PATTERN_COMPLETED", null);
            log.info("纸样完成，已同步完成尺寸表: styleId={}", id);
        }
        if (!ok) {
            throw new IllegalStateException("操作失败");
        }
        return true;
    }

    public boolean resetPattern(Long id, Map<String, Object> body) {
        if (!UserContext.isSupervisorOrAbove()) {
            throw new AccessDeniedException("无权限操作");
        }
        StyleInfo current = getStyleWithTenant(id);
        if (current == null) {
            throw new NoSuchElementException("款号不存在");
        }
        // ✅ 移除过度限制：用户在开发阶段应该能自由退回修改
        // ensureStyleFullyCompletedBeforeMaintenance(current);
        Object reasonValue = body == null ? null : body.get("reason");
        String reason = reasonValue == null ? "" : String.valueOf(reasonValue).trim();
        String remark = StringUtils.hasText(reason) ? reason : "";
        if (!StringUtils.hasText(remark)) {
            throw new IllegalArgumentException("退回原因不能为空");
        }
        boolean ok = styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .set(StyleInfo::getPatternStatus, null)
                .set(StyleInfo::getPatternCompletedTime, null)
                // 退回纸样时同步清除尺寸完成时间（纸样控制尺寸，退回则尺寸也退回）
                .set(StyleInfo::getSizeCompletedTime, null)
                // 关联回退样衣状态
                .set(StyleInfo::getSampleStatus, "IN_PROGRESS")
                .set(StyleInfo::getSampleProgress, 0)
                .set(StyleInfo::getSampleCompletedTime, null)
                // 维护后允许再次推送：清除推送标志
                .set(StyleInfo::getOrderType, null)
                .set(StyleInfo::getPushedToOrder, 0)
                .set(StyleInfo::getPushedToOrderTime, null)
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();
        if (ok) {
            styleLogHelper.saveMaintenanceLog(id, "PATTERN_RESET", remark);
            styleLogHelper.saveMaintenanceLog(id, "SAMPLE_RESET", "关联纸样回退自动同步: " + remark);
        }
        if (!ok) {
            throw new IllegalStateException("操作失败");
        }
        return true;
    }

    // ==================== Sample Stage ====================

    public boolean startSample(Long id) {
        StyleInfo current = getStyleWithTenant(id);
        if (current == null) {
            throw new NoSuchElementException("款号不存在");
        }
        if (isCompleted(current.getSampleStatus())) {
            throw new IllegalStateException("样衣已完成，无法修改，请联系管理员回退");
        }
        boolean ok = styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .set(StyleInfo::getSampleStatus, "IN_PROGRESS")
                .set(StyleInfo::getSampleProgress, 0)
                .set(StyleInfo::getSampleCompletedTime, null)
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();
        if (ok) {
            styleLogHelper.saveSampleLog(id, "RECEIVE_START", null);
        }
        if (!ok) {
            throw new IllegalStateException("操作失败");
        }
        return true;
    }

    public boolean updateSampleProgress(Long id, Map<String, Object> body) {
        StyleInfo current = getStyleWithTenant(id);
        if (current == null) {
            throw new NoSuchElementException("款号不存在");
        }
        if (isCompleted(current.getSampleStatus())) {
            throw new IllegalStateException("样衣已完成，无法修改，请联系管理员回退");
        }
        Object v = body != null ? body.get("progress") : null;
        int p;
        try {
            p = v == null ? 0 : Integer.parseInt(String.valueOf(v));
        } catch (Exception e) {
            throw new IllegalArgumentException("progress参数不合法");
        }
        if (p < 0) {
            p = 0;
        }
        if (p > 100) {
            p = 100;
        }

        boolean ok = styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .set(StyleInfo::getSampleStatus, "IN_PROGRESS")
                .set(StyleInfo::getSampleProgress, p)
                .set(StyleInfo::getSampleCompletedTime, null)
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();
        if (!ok) {
            throw new IllegalStateException("操作失败");
        }
        return true;
    }

    public boolean completeSample(Long id) {
        StyleInfo current = getStyleWithTenant(id);
        if (current == null) {
            throw new NoSuchElementException("款号不存在");
        }
        if (isCompleted(current.getSampleStatus())) {
            throw new IllegalStateException("样衣已完成，无需重复操作");
        }

        // 兜底逻辑：自动补全所有未完成的步骤
        LocalDateTime now = LocalDateTime.now();
        String currentUser = UserContext.username();

        // 构建更新条件
        var updateChain = styleInfoService.lambdaUpdate().eq(StyleInfo::getId, id);

        // 1. BOM配置
        if (current.getBomCompletedTime() == null) {
            updateChain.set(StyleInfo::getBomAssignee, currentUser)
                      .set(StyleInfo::getBomStartTime, current.getBomStartTime() != null ? current.getBomStartTime() : now)
                      .set(StyleInfo::getBomCompletedTime, now);
            log.info("样衣完成兜底：自动完成BOM配置");
        }

        // 4. 工序配置
        if (current.getProcessCompletedTime() == null) {
            updateChain.set(StyleInfo::getProcessAssignee, currentUser)
                      .set(StyleInfo::getProcessStartTime, current.getProcessStartTime() != null ? current.getProcessStartTime() : now)
                      .set(StyleInfo::getProcessCompletedTime, now);
            log.info("样衣完成兜底：自动完成工序配置");
        }

        // 6. 二次工艺
        if (current.getSecondaryCompletedTime() == null) {
            updateChain.set(StyleInfo::getSecondaryAssignee, currentUser)
                      .set(StyleInfo::getSecondaryStartTime, current.getSecondaryStartTime() != null ? current.getSecondaryStartTime() : now)
                      .set(StyleInfo::getSecondaryCompletedTime, now);
            log.info("样衣完成兜底：自动完成二次工艺");
        }

        // 7. 标记样衣完成
        updateChain.set(StyleInfo::getSampleStatus, "COMPLETED")
                  .set(StyleInfo::getSampleProgress, 100)
                  .set(StyleInfo::getSampleCompletedTime, now)
                  .set(StyleInfo::getUpdateTime, now);

        boolean ok = updateChain.update();

        if (ok) {
            styleLogHelper.saveSampleLog(id, "SAMPLE_COMPLETED", "点击样衣完成");
            log.info("样衣完成成功：styleId={}, 保持纸样开发/尺寸表/生产制单独立状态", id);

            // [修改于2026-03-09]: 根据最新业务逻辑，不再在这里自动推送到单价维护或资料中心
            // 这些流转操作已移动到 "推送到下单" (OrderManagementOrchestrator.createFromStyle) 时手动触发
            log.info("样衣完成成功：只改变状态，不自动流转资料。等待手动点击【推送到下单】");
        }
        return ok;
    }

    public boolean resetSample(Long id, Map<String, Object> body) {
        if (!UserContext.isSupervisorOrAbove()) {
            throw new AccessDeniedException("无权限操作");
        }
        StyleInfo current = getStyleWithTenant(id);
        if (current == null) {
            throw new NoSuchElementException("款号不存在");
        }
        // ✅ 移除过度限制：用户在开发阶段应该能自由退回修改
        // ensureStyleFullyCompletedBeforeMaintenance(current);
        Object reasonValue = body == null ? null : body.get("reason");
        String reason = reasonValue == null ? "" : String.valueOf(reasonValue).trim();
        String remark = StringUtils.hasText(reason) ? reason : "";
        if (!StringUtils.hasText(remark)) {
            throw new IllegalArgumentException("退回原因不能为空");
        }
        boolean ok = styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .set(StyleInfo::getSampleStatus, null)
                .set(StyleInfo::getSampleProgress, 0)
                .set(StyleInfo::getSampleCompletedTime, null)
                // 维护后允许再次推送：清除推送标志（orderType存储跨单员和已推送展示）
                .set(StyleInfo::getOrderType, null)
                .set(StyleInfo::getPushedToOrder, 0)
                .set(StyleInfo::getPushedToOrderTime, null)
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();
        if (ok) {
            styleLogHelper.saveMaintenanceLog(id, "SAMPLE_RESET", remark);
        }
        if (!ok) {
            throw new IllegalStateException("操作失败");
        }
        return true;
    }

    // ==================== Size Stage ====================

    private boolean isCompleted(String status) {
        String s = String.valueOf(status == null ? "" : status).trim();
        return "COMPLETED".equalsIgnoreCase(s);
    }

    private StyleInfo getStyleWithTenant(Long id) {
        return styleInfoService.lambdaQuery()
                .eq(StyleInfo::getId, id)
                .eq(StyleInfo::getTenantId, UserContext.tenantId())
                .one();
    }
}
