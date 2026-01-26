package com.fashion.supplychain.style.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleAttachment;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleOperationLog;
import com.fashion.supplychain.style.service.StyleAttachmentService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleOperationLogService;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
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
                tryCreateTemplateFromStyle(styleInfo == null ? null : styleInfo.getStyleNo());
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

    public boolean update(StyleInfo styleInfo) {
        validateStyleInfo(styleInfo);
        try {
            boolean result = styleInfoService.saveOrUpdateStyle(styleInfo);
            if (result) {
                try {
                    String styleNo = styleInfo == null ? null : styleInfo.getStyleNo();
                    if (!StringUtils.hasText(styleNo) && styleInfo != null && styleInfo.getId() != null) {
                        StyleInfo current = styleInfoService.getById(styleInfo.getId());
                        styleNo = current == null ? null : current.getStyleNo();
                    }
                    tryCreateTemplateFromStyle(styleNo);
                } catch (Exception e) {
                    log.warn("Failed to sync templates after style update: styleId={}, styleNo={}",
                            styleInfo == null ? null : styleInfo.getId(),
                            styleInfo == null ? null : styleInfo.getStyleNo(), e);
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

    public boolean updateProductionRequirements(Long id, Map<String, Object> body) {
        StyleInfo current = styleInfoService.getById(id);
        if (current == null) {
            throw new NoSuchElementException("款号不存在");
        }

        if (isProductionRequirementsLocked(id)) {
            throw new IllegalStateException("生产要求已保存，无法修改，请联系管理员退回");
        }

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
        boolean ok = styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .set(StyleInfo::getPatternStatus, "IN_PROGRESS")
                .set(StyleInfo::getPatternCompletedTime, null)
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();
        if (ok) {
            savePatternLog(id, "PATTERN_START", null);
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
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();
        if (ok) {
            savePatternLog(id, "PATTERN_COMPLETED", null);
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
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();
        if (ok) {
            saveMaintenanceLog(id, "PATTERN_RESET", remark);
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
            throw new IllegalStateException("样衣已完成，无法修改，请联系管理员回退");
        }
        boolean ok = styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .set(StyleInfo::getSampleStatus, "COMPLETED")
                .set(StyleInfo::getSampleProgress, 100)
                .set(StyleInfo::getSampleCompletedTime, LocalDateTime.now())
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();
        if (ok) {
            saveSampleLog(id, "SAMPLE_COMPLETED", null);
        }
        if (!ok) {
            throw new IllegalStateException("操作失败");
        }
        return true;
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
        if (!StringUtils.hasText(styleInfo.getCategory())) {
            throw new IllegalArgumentException("请选择品类");
        }
    }
}
