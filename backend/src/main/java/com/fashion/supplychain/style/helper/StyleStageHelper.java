package com.fashion.supplychain.style.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.style.entity.StyleAttachment;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleOperationLog;
import com.fashion.supplychain.style.service.StyleAttachmentService;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleOperationLogService;
import com.fashion.supplychain.template.orchestration.TemplateLibraryOrchestrator;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
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
    private StyleOperationLogService styleOperationLogService;

    @Autowired
    private TemplateLibraryOrchestrator templateLibraryOrchestrator;

    // ==================== Production Requirements ====================

    public boolean updateProductionRequirements(Long id, Map<String, Object> body) {
        StyleInfo current = styleInfoService.getById(id);
        if (current == null) {
            throw new NoSuchElementException("款号不存在");
        }

        // 取消锁定检查，允许随时修改
        // if (isProductionRequirementsLocked(id)) {
        // throw new IllegalStateException("生产要求已保存，无法修改，请联系管理员退回");
        // }

        String desc = body == null ? null
                : (body.get("description") == null ? null : String.valueOf(body.get("description")));
        boolean ok = styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .set(StyleInfo::getDescription, desc)
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
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
        String remark = StringUtils.hasText(reason) ? reason : "";
        if (!StringUtils.hasText(remark)) {
            throw new IllegalArgumentException("退回原因不能为空");
        }
        styleLogHelper.saveMaintenanceLog(id, "PRODUCTION_REQUIREMENTS_ROLLBACK", remark);
        return true;
    }

    // ==================== Production Stage ====================

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

    private boolean isProductionRequirementsLocked(Long styleId) {
        if (styleId == null) {
            return false;
        }

        StyleOperationLog saved = styleOperationLogService.lambdaQuery()
                .eq(StyleOperationLog::getStyleId, styleId)
                .eq(StyleOperationLog::getAction, "PRODUCTION_REQUIREMENTS_SAVE")
                .orderByDesc(StyleOperationLog::getCreateTime)
                .last("limit 1")
                .one();
        if (saved == null || saved.getCreateTime() == null) {
            return false;
        }

        StyleOperationLog rollback = styleOperationLogService.lambdaQuery()
                .eq(StyleOperationLog::getStyleId, styleId)
                .eq(StyleOperationLog::getAction, "PRODUCTION_REQUIREMENTS_ROLLBACK")
                .orderByDesc(StyleOperationLog::getCreateTime)
                .last("limit 1")
                .one();

        return rollback == null || rollback.getCreateTime() == null
                || rollback.getCreateTime().isBefore(saved.getCreateTime());
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
                // 自动同步样衣状态为完成，代表纸样、尺寸表、工序表、生产制单流程结束
                .set(StyleInfo::getSampleStatus, "COMPLETED")
                .set(StyleInfo::getSampleProgress, 100)
                .set(StyleInfo::getSampleCompletedTime, LocalDateTime.now())
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();
        if (ok) {
            styleLogHelper.savePatternLog(id, "PATTERN_COMPLETED", null);
            styleLogHelper.saveSampleLog(id, "SAMPLE_COMPLETED", "关联纸样完成自动同步");
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
        Object reasonValue = body == null ? null : body.get("reason");
        String reason = reasonValue == null ? "" : String.valueOf(reasonValue).trim();
        String remark = StringUtils.hasText(reason) ? reason : "";
        if (!StringUtils.hasText(remark)) {
            throw new IllegalArgumentException("维护原因不能为空");
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

        // 2. 纸样开发
        if (current.getPatternCompletedTime() == null) {
            updateChain.set(StyleInfo::getPatternStatus, "COMPLETED")
                      .set(StyleInfo::getPatternAssignee, currentUser)
                      .set(StyleInfo::getPatternCompletedTime, now);
            log.info("样衣完成兜底：自动完成纸样开发");
        }

        // 3. 尺寸表
        if (current.getSizeCompletedTime() == null) {
            updateChain.set(StyleInfo::getSizeAssignee, currentUser)
                      .set(StyleInfo::getSizeStartTime, current.getSizeStartTime() != null ? current.getSizeStartTime() : now)
                      .set(StyleInfo::getSizeCompletedTime, now);
            log.info("样衣完成兜底：自动完成尺寸表");
        }

        // 4. 工序配置
        if (current.getProcessCompletedTime() == null) {
            updateChain.set(StyleInfo::getProcessAssignee, currentUser)
                      .set(StyleInfo::getProcessStartTime, current.getProcessStartTime() != null ? current.getProcessStartTime() : now)
                      .set(StyleInfo::getProcessCompletedTime, now);
            log.info("样衣完成兜底：自动完成工序配置");
        }

        // 5. 生产制单（样板生产）
        if (current.getProductionCompletedTime() == null) {
            updateChain.set(StyleInfo::getProductionAssignee, currentUser)
                      .set(StyleInfo::getProductionStartTime, current.getProductionStartTime() != null ? current.getProductionStartTime() : now)
                      .set(StyleInfo::getProductionCompletedTime, now);
            log.info("样衣完成兜底：自动完成生产制单");
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
            styleLogHelper.saveSampleLog(id, "SAMPLE_COMPLETED", "点击样衣完成（含兜底逻辑）");
            log.info("样衣完成成功：styleId={}, 已自动补全所有未完成步骤", id);

            // 自动推送到单价维护（模板库）
            try {
                StyleInfo updated = styleInfoService.getById(id);
                if (updated != null && StringUtils.hasText(updated.getStyleNo())) {
                    // 推送所有类型：BOM、工序、工序单价、进度节点
                    List<String> templateTypes = List.of("bom", "process", "process_price", "progress");
                    Map<String, Object> body = new HashMap<>();
                    body.put("sourceStyleNo", updated.getStyleNo());
                    body.put("templateTypes", templateTypes);
                    templateLibraryOrchestrator.createFromStyle(body);
                    log.info("样衣完成后自动推送到单价维护成功：styleNo={}", updated.getStyleNo());
                }
            } catch (Exception e) {
                log.warn("样衣完成后自动推送到单价维护失败，但不影响样衣完成操作：{}", e.getMessage());
            }

            // 自动流转附件到数据中心（开发纸样，放码纸样如果存在也一起流转）
            try {
                List<StyleAttachment> attachments = styleAttachmentService.lambdaQuery()
                        .eq(StyleAttachment::getStyleId, id)
                        .in(StyleAttachment::getBizType, "pattern", "pattern_grading")
                        .list();
                if (!attachments.isEmpty()) {
                    for (StyleAttachment attachment : attachments) {
                        String finalType = "pattern".equals(attachment.getBizType()) ? "pattern_final" : "pattern_grading_final";
                        styleAttachmentService.lambdaUpdate()
                                .eq(StyleAttachment::getId, attachment.getId())
                                .set(StyleAttachment::getBizType, finalType)
                                .update();
                    }
                    log.info("样衣完成后自动流转附件到数据中心成功：styleId={}, count={}", id, attachments.size());
                } else {
                    log.warn("样衣完成时未找到开发纸样附件：styleId={}", id);
                }
            } catch (Exception e) {
                log.warn("样衣完成后自动流转附件失败，但不影响样衣完成操作：{}", e.getMessage());
            }
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
        Object reasonValue = body == null ? null : body.get("reason");
        String reason = reasonValue == null ? "" : String.valueOf(reasonValue).trim();
        String remark = StringUtils.hasText(reason) ? reason : "";
        if (!StringUtils.hasText(remark)) {
            throw new IllegalArgumentException("维护原因不能为空");
        }
        boolean ok = styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .set(StyleInfo::getSampleStatus, null)
                .set(StyleInfo::getSampleProgress, 0)
                .set(StyleInfo::getSampleCompletedTime, null)
                // 维护后允许再次推送：清除推送标志（orderType存储跨单员和已推送展示）
                .set(StyleInfo::getOrderType, null)
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

        boolean ok = styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .set(StyleInfo::getSecondaryCompletedTime, LocalDateTime.now())
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();

        if (!ok) {
            throw new IllegalStateException("操作失败");
        }
        log.info("二次工艺已完成: styleId={}", id);
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

    private boolean isCompleted(String status) {
        String s = String.valueOf(status == null ? "" : status).trim();
        return "COMPLETED".equalsIgnoreCase(s);
    }
}
