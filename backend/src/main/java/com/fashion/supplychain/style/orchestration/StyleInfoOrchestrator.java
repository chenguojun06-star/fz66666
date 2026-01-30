package com.fashion.supplychain.style.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.PatternProduction;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.PatternProductionService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleAttachment;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleOperationLog;
import com.fashion.supplychain.style.entity.StyleQuotation;
import com.fashion.supplychain.style.service.StyleAttachmentService;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleOperationLogService;
import com.fashion.supplychain.style.service.StyleQuotationService;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import java.time.LocalDateTime;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.NoSuchElementException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
@Slf4j
public class StyleInfoOrchestrator {

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleOperationLogService styleOperationLogService;

    @Autowired
    private StyleAttachmentService styleAttachmentService;

    @Autowired
    private TemplateLibraryService templateLibraryService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private PatternProductionService patternProductionService;

    @Autowired
    private StyleBomService styleBomService;

    @Autowired
    private StyleQuotationService styleQuotationService;

    public IPage<StyleInfo> list(Map<String, Object> params) {
        return styleInfoService.queryPage(params);
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
            saveStyleLog(id, "PRODUCTION_REQUIREMENTS_SAVE", null);
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
        saveMaintenanceLog(id, "PRODUCTION_REQUIREMENTS_ROLLBACK", remark);
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

    public boolean startPattern(Long id) {
        StyleInfo current = styleInfoService.getById(id);
        if (current == null) {
            throw new NoSuchElementException("款号不存在");
        }
        if (isCompleted(current.getPatternStatus())) {
            throw new IllegalStateException("纸样已完成，无法修改，请联系管理员回退");
        }

        String currentUser = UserContext.username();
        boolean ok = styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .set(StyleInfo::getPatternStatus, "IN_PROGRESS")
                .set(StyleInfo::getPatternCompletedTime, null)
                // 纸样开始时同步更新尺寸表开始时间（尺寸被纸样控制）
                .set(StyleInfo::getSizeAssignee, currentUser)
                .set(StyleInfo::getSizeStartTime, LocalDateTime.now())
                // 纸样开始时同步更新生产制单开始时间（生产制单跟随纸样）
                .set(StyleInfo::getProductionAssignee, currentUser)
                .set(StyleInfo::getProductionStartTime, LocalDateTime.now())
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();
        if (ok) {
            savePatternLog(id, "PATTERN_START", null);
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

        List<StyleAttachment> files = styleAttachmentService.listByStyleId(String.valueOf(id), "pattern");
        boolean hasValid = files != null && files.stream().anyMatch((f) -> {
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
            savePatternLog(id, "PATTERN_COMPLETED", null);
            saveSampleLog(id, "SAMPLE_COMPLETED", "关联纸样完成自动同步");
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
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();
        if (ok) {
            saveMaintenanceLog(id, "PATTERN_RESET", remark);
            saveMaintenanceLog(id, "SAMPLE_RESET", "关联纸样回退自动同步: " + remark);
        }
        if (!ok) {
            throw new IllegalStateException("操作失败");
        }
        return true;
    }

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
            saveSampleLog(id, "RECEIVE_START", null);
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
            saveSampleLog(id, "SAMPLE_COMPLETED", "点击样衣完成（含兜底逻辑）");
            log.info("样衣完成成功：styleId={}, 已自动补全所有未完成步骤", id);
            
            // 自动推送到单价维护（模板库）
            try {
                StyleInfo updated = styleInfoService.getById(id);
                if (updated != null && StringUtils.hasText(updated.getStyleNo())) {
                    // 推送所有类型：BOM、工序、工序单价、进度节点
                    List<String> templateTypes = List.of("bom", "process", "process_price", "progress");
                    templateLibraryService.createFromStyle(updated.getStyleNo(), templateTypes);
                    log.info("样衣完成后自动推送到单价维护成功：styleNo={}", updated.getStyleNo());
                }
            } catch (Exception e) {
                log.warn("样衣完成后自动推送到单价维护失败，但不影响样衣完成操作：{}", e.getMessage());
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
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();
        if (ok) {
            saveMaintenanceLog(id, "SAMPLE_RESET", remark);
        }
        if (!ok) {
            throw new IllegalStateException("操作失败");
        }
        return true;
    }

    public boolean delete(Long id) {
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
                templateLibraryService.createFromStyle(styleNoTrimmed, List.of());
            }
        } catch (Exception e) {
            log.warn("Failed to create templates from style: styleNo={}", styleNo, e);
        }
    }

    private void saveStyleLog(Long styleId, String action, String remark) {
        try {
            StyleOperationLog log = new StyleOperationLog();
            log.setStyleId(styleId);
            log.setBizType("style");
            log.setAction(action);
            UserContext ctx = UserContext.get();
            log.setOperator(ctx != null ? ctx.getUsername() : null);
            log.setRemark(remark);
            log.setCreateTime(LocalDateTime.now());
            styleOperationLogService.save(log);
        } catch (Exception e) {
            log.warn("Failed to save style log: styleId={}, action={}", styleId, action, e);
        }
    }

    private void savePatternLog(Long styleId, String action, String remark) {
        try {
            StyleOperationLog log = new StyleOperationLog();
            log.setStyleId(styleId);
            log.setBizType("pattern");
            log.setAction(action);
            UserContext ctx = UserContext.get();
            log.setOperator(ctx != null ? ctx.getUsername() : null);
            log.setRemark(remark);
            log.setCreateTime(LocalDateTime.now());
            styleOperationLogService.save(log);
        } catch (Exception e) {
            log.warn("Failed to save pattern log: styleId={}, action={}", styleId, action, e);
        }
    }

    private void saveSampleLog(Long styleId, String action, String remark) {
        try {
            StyleOperationLog log = new StyleOperationLog();
            log.setStyleId(styleId);
            log.setBizType("sample");
            log.setAction(action);
            UserContext ctx = UserContext.get();
            log.setOperator(ctx != null ? ctx.getUsername() : null);
            log.setRemark(remark);
            log.setCreateTime(LocalDateTime.now());
            styleOperationLogService.save(log);
        } catch (Exception e) {
            log.warn("Failed to save sample log: styleId={}, action={}", styleId, action, e);
        }
    }

    private void saveMaintenanceLog(Long styleId, String action, String remark) {
        try {
            StyleOperationLog log = new StyleOperationLog();
            log.setStyleId(styleId);
            log.setBizType("maintenance");
            log.setAction(action);
            UserContext ctx = UserContext.get();
            log.setOperator(ctx != null ? ctx.getUsername() : null);
            String r = remark == null ? null : remark.trim();
            log.setRemark(r != null && !r.isEmpty() ? r : null);
            log.setCreateTime(LocalDateTime.now());
            styleOperationLogService.save(log);
        } catch (Exception e) {
            log.warn("Failed to save maintenance log: styleId={}, action={}", styleId, action, e);
        }
    }

    private boolean isCompleted(String status) {
        String s = String.valueOf(status == null ? "" : status).trim();
        return "COMPLETED".equalsIgnoreCase(s);
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
            // 查询该样衣的报价单
            StyleQuotation quotation = styleQuotationService.lambdaQuery()
                    .eq(StyleQuotation::getStyleId, style.getId())
                    .one();

            if (quotation != null) {
                totalMaterialCost += (quotation.getMaterialCost() != null ? quotation.getMaterialCost().doubleValue() : 0.0);
                totalProcessCost += (quotation.getProcessCost() != null ? quotation.getProcessCost().doubleValue() : 0.0);
                totalOtherCost += (quotation.getOtherCost() != null ? quotation.getOtherCost().doubleValue() : 0.0);
            }
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
}
