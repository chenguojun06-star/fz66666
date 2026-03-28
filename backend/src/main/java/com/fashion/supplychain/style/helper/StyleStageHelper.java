package com.fashion.supplychain.style.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.PatternProduction;
import com.fashion.supplychain.production.service.PatternProductionService;
import com.fashion.supplychain.stock.entity.SampleStock;
import com.fashion.supplychain.stock.mapper.SampleStockMapper;
import com.fashion.supplychain.style.entity.SecondaryProcess;
import com.fashion.supplychain.style.entity.StyleAttachment;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.SecondaryProcessService;
import com.fashion.supplychain.style.service.StyleAttachmentService;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.template.orchestration.TemplateLibraryOrchestrator;
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
 * 款式阶段流转辅助类
 * 从 StyleInfoOrchestrator 提取的所有 stage transition 方法
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

    @Autowired
    private StyleBomService styleBomService;

    @Autowired
    private SecondaryProcessService secondaryProcessService;

    @Autowired
    private TemplateLibraryOrchestrator templateLibraryOrchestrator;

    @Autowired
    private PatternProductionService patternProductionService;

    @Autowired
    private SampleStockMapper sampleStockMapper;

    // ==================== Production Requirements ====================

    public boolean updateProductionRequirements(Long id, Map<String, Object> body) {
        StyleInfo current = styleInfoService.getById(id);
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
                .set(StyleInfo::getDescriptionLocked, 0)
                .set(StyleInfo::getDescriptionReturnComment, null)
                .set(StyleInfo::getDescriptionReturnBy, null)
                .set(StyleInfo::getDescriptionReturnTime, null)
                .set(current.getProductionStartTime() == null, StyleInfo::getProductionStartTime, now)
                .set(!StringUtils.hasText(current.getProductionAssignee()), StyleInfo::getProductionAssignee, currentUser)
                .set(current.getProductionCompletedTime() != null, StyleInfo::getProductionCompletedTime, null)
                .set(StyleInfo::getUpdateTime, now)
                .set(StyleInfo::getUpdateBy, currentUser)
                .update();

        if (ok) {
            styleLogHelper.saveStyleLog(id, "PRODUCTION_REQUIREMENTS_SAVE", null);
        }

        if (!ok) {
            throw new IllegalStateException("保存失败");
        }
        return true;
    }

    public boolean rollbackProductionRequirements(Long id, Map<String, Object> body) {
        if (!UserContext.isSupervisorOrAbove()) {
            throw new AccessDeniedException("无权限操作");
        }

        StyleInfo current = styleInfoService.getById(id);
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
        StyleInfo current = styleInfoService.getById(id);
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

    public boolean startProductionStage(Long id) {
        StyleInfo current = styleInfoService.getById(id);
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
        StyleInfo current = styleInfoService.getById(id);
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
        StyleInfo current = styleInfoService.getById(id);
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
        StyleInfo current = styleInfoService.getById(id);
        if (current == null) {
            throw new NoSuchElementException("款号不存在");
        }
        if (isCompleted(current.getPatternStatus())) {
            throw new IllegalStateException("纸样已完成，无法修改，请联系管理员回退");
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
        StyleInfo current = styleInfoService.getById(id);
        if (current == null) {
            throw new NoSuchElementException("款号不存在");
        }
        if (isCompleted(current.getPatternStatus())) {
            throw new IllegalStateException("纸样已完成，无法修改，请联系管理员回退");
        }

        // 同时检查 pattern 和 pattern_final（样衣完成后文件会被改名为 pattern_final）
        List<StyleAttachment> files = new java.util.ArrayList<>(
                styleAttachmentService.listByStyleId(String.valueOf(id), "pattern"));
        files.addAll(styleAttachmentService.listByStyleId(String.valueOf(id), "pattern_final"));
        boolean hasValid = files.stream().anyMatch((f) -> {
            String name = f == null ? null : f.getFileName();
            String n = name == null ? "" : name.trim().toLowerCase();
            String url = f == null ? null : f.getFileUrl();
            String u = url == null ? "" : url.trim().toLowerCase();
            return n.endsWith(".dxf") || n.endsWith(".plt") || n.endsWith(".ets") || u.contains(".dxf")
                    || u.contains(".plt")
                    || u.contains(".ets");
        });
        if (!hasValid) {
            throw new IllegalStateException("请先上传纸样文件(dxf/plt/ets)后再标记完成");
        }

        boolean ok = styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .set(StyleInfo::getPatternStatus, "COMPLETED")
                .set(StyleInfo::getPatternCompletedTime, LocalDateTime.now())
                // 纸样完成时同步更新尺寸表时间（尺寸被纸样控制）
                .set(StyleInfo::getSizeAssignee, current.getSizeAssignee() != null ? current.getSizeAssignee() : UserContext.username())
                .set(StyleInfo::getSizeStartTime, current.getSizeStartTime() != null ? current.getSizeStartTime() : LocalDateTime.now())
                .set(StyleInfo::getSizeCompletedTime, LocalDateTime.now())
                // 纸样完成时同步更新生产制单时间（生产制单跟随纸样）
                .set(StyleInfo::getProductionAssignee, current.getProductionAssignee() != null ? current.getProductionAssignee() : UserContext.username())
                .set(StyleInfo::getProductionStartTime, current.getProductionStartTime() != null ? current.getProductionStartTime() : LocalDateTime.now())
                .set(StyleInfo::getProductionCompletedTime, LocalDateTime.now())
                // ⚠️ 2026-05-03 修复：样衣生产应由用户手动点击"完成"按钮，不应在纸样完成时自动标记完成
                // 已删除的自动完成逻辑：.set(StyleInfo::getSampleStatus, "COMPLETED") / .set(StyleInfo::getSampleProgress, 100) 等
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();
        if (ok) {
            styleLogHelper.savePatternLog(id, "PATTERN_COMPLETED", null);
            log.info("纸样完成，已同步更新尺寸表和生产制单时间: styleId={}", id);
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
        StyleInfo current = styleInfoService.getById(id);
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
        StyleInfo current = styleInfoService.getById(id);
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
        StyleInfo current = styleInfoService.getById(id);
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
        StyleInfo current = styleInfoService.getById(id);
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
        StyleInfo current = styleInfoService.getById(id);
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

    /**
     * 开始配置尺寸表
     */
    public boolean startSize(Long id) {
        StyleInfo current = styleInfoService.getById(id);
        if (current == null) {
            throw new NoSuchElementException("款号不存在");
        }
        if (current.getSizeCompletedTime() != null) {
            throw new IllegalStateException("尺寸表已完成，无法重新开始");
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
        StyleInfo current = styleInfoService.getById(id);
        if (current == null) {
            throw new NoSuchElementException("款号不存在");
        }
        if (current.getSizeCompletedTime() != null) {
            throw new IllegalStateException("尺寸表已完成，无法重复操作");
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
        StyleInfo current = styleInfoService.getById(id);
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
        StyleInfo current = styleInfoService.getById(id);
        if (current == null) {
            throw new NoSuchElementException("款号不存在");
        }
        if (current.getBomCompletedTime() != null) {
            throw new IllegalStateException("BOM配置已完成，无法重新开始");
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
        StyleInfo current = styleInfoService.getById(id);
        if (current == null) {
            throw new NoSuchElementException("款号不存在");
        }
        if (current.getBomCompletedTime() != null) {
            throw new IllegalStateException("BOM配置已完成，无法重复操作");
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
        StyleInfo current = styleInfoService.getById(id);
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
        StyleInfo current = styleInfoService.getById(id);
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
        StyleInfo current = styleInfoService.getById(id);
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
        StyleInfo current = styleInfoService.getById(id);
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
        StyleInfo current = styleInfoService.getById(id);
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
        StyleInfo current = styleInfoService.getById(id);
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
        StyleInfo current = styleInfoService.getById(id);
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
        StyleInfo current = styleInfoService.getById(id);
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
        StyleInfo current = styleInfoService.getById(id);
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
        StyleInfo current = styleInfoService.getById(id);
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
        StyleInfo current = styleInfoService.getById(id);
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
}
