package com.fashion.supplychain.style.helper;

import com.fashion.supplychain.common.BusinessException;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleAttachmentService;
import com.fashion.supplychain.style.service.StyleInfoService;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.NoSuchElementException;
import lombok.extern.slf4j.Slf4j;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@Slf4j
public class StyleStageHelper {

    @Autowired
    private com.fashion.supplychain.production.service.ProductionOrderService productionOrderService;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleOperationAppendHelper styleOperationAppendHelper;

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
            styleOperationAppendHelper.appendSaveProductionRequirements(id);
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

        styleOperationAppendHelper.appendRollbackProductionRequirements(id, reason);
        return true;
    }

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
        styleOperationAppendHelper.appendOperation(id, "退回纸样修改", "原因：" + reason);
        return true;
    }

    public void lockPatternRevision(Long id) {
        styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .set(StyleInfo::getPatternRevLocked, 1)
                .set(StyleInfo::getPatternRevReturnComment, null)
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();
    }

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
            return true;
        }
        String currentUser = UserContext.username();
        boolean ok = styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .set(StyleInfo::getProductionAssignee, currentUser)
                .set(StyleInfo::getProductionStartTime, LocalDateTime.now())
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();
        if (!ok) throw new IllegalStateException("操作失败");
        styleOperationAppendHelper.appendStart(id, "生产制单");
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
        styleOperationAppendHelper.appendComplete(id, "生产制单");
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
        styleOperationAppendHelper.appendOperation(id, "退回生产制单", "原因：" + reason);
        log.info("生产制单已退回维护: styleId={}, reason={}", id, reason);
        return true;
    }

    public boolean startPattern(Long id, String assignee) {
        StyleInfo current = getStyleWithTenant(id);
        if (current == null) {
            throw new NoSuchElementException("款号不存在");
        }
        if (isCompleted(current.getPatternStatus())) {
            log.info("纸样已完成，跳过重复开始: styleId={}", id);
            return true;
        }

        String currentUser = UserContext.username();
        // 如果前端指定了纸样师则使用指定值，否则默认当前操作人
        String patternAssignee = StringUtils.hasText(assignee) ? assignee : currentUser;
        LocalDateTime now = LocalDateTime.now();

        var updateChain = styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .set(StyleInfo::getPatternStatus, "IN_PROGRESS")
                .set(StyleInfo::getPatternAssignee, patternAssignee)
                .set(StyleInfo::getPatternStartTime, now)
                .set(StyleInfo::getPatternCompletedTime, null)
                .set(StyleInfo::getSizeAssignee, patternAssignee)
                .set(StyleInfo::getSizeStartTime, now)
                .set(StyleInfo::getProductionAssignee, patternAssignee)
                .set(StyleInfo::getProductionStartTime, now)
                .set(StyleInfo::getUpdateTime, now);

        // 同步纸样师到基础信息 sampleSupplier 字段（原基础信息板型区已移除，此处保证数据不丢）
        if (!StringUtils.hasText(current.getSampleSupplier()) || !current.getSampleSupplier().equals(patternAssignee)) {
            updateChain.set(StyleInfo::getSampleSupplier, patternAssignee);
            log.info("Synced pattern developer to style info: styleId={}, patternDeveloper={}", id, patternAssignee);
        }

        boolean ok = updateChain.update();
        if (ok) {
            styleOperationAppendHelper.appendStart(id, "纸样开发");
            log.info("纸样开始，已同步更新尺寸表和生产制单开始时间: styleId={}, assignee={}", id, patternAssignee);
        }
        if (!ok) {
            throw new IllegalStateException("操作失败");
        }
        return true;
    }

    public boolean startPattern(Long id) {
        return startPattern(id, null);
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
                .set(StyleInfo::getSizeCompletedTime, now)
                .set(StyleInfo::getUpdateTime, now)
                .update();
        if (ok) {
            styleOperationAppendHelper.appendComplete(id, "纸样开发");
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
                .set(StyleInfo::getSizeCompletedTime, null)
                .set(StyleInfo::getSampleStatus, "IN_PROGRESS")
                .set(StyleInfo::getSampleProgress, 0)
                .set(StyleInfo::getSampleCompletedTime, null)
                .set(StyleInfo::getOrderType, null)
                .set(StyleInfo::getPushedToOrder, 0)
                .set(StyleInfo::getPushedToOrderTime, null)
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();
        if (ok) {
            styleOperationAppendHelper.appendOperation(id, "退回纸样开发", "原因：" + remark);
        }
        if (!ok) {
            throw new IllegalStateException("操作失败");
        }
        return true;
    }

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
            styleOperationAppendHelper.appendStart(id, "样衣制作");
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

        java.util.List<String> pendingStages = new java.util.ArrayList<>();
        if (current.getPatternCompletedTime() == null) {
            pendingStages.add("纸样开发");
        }
        if (current.getBomCompletedTime() == null) {
            pendingStages.add("BOM配置");
        }
        if (current.getSizeCompletedTime() == null) {
            pendingStages.add("尺码表");
        }
        if (current.getProcessCompletedTime() == null) {
            pendingStages.add("工序配置");
        }
        if (current.getSecondaryCompletedTime() == null) {
            pendingStages.add("二次工艺");
        }
        if (current.getProductionCompletedTime() == null) {
            pendingStages.add("生产制单");
        }
        if (!pendingStages.isEmpty()) {
            throw new BusinessException("请先完成以下环节再标记样衣完成：" + String.join("、", pendingStages));
        }

        LocalDateTime now = LocalDateTime.now();

        boolean ok = styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .set(StyleInfo::getSampleStatus, "COMPLETED")
                .set(StyleInfo::getSampleProgress, 100)
                .set(StyleInfo::getSampleCompletedTime, now)
                .set(StyleInfo::getUpdateTime, now)
                .update();

        if (ok) {
            styleOperationAppendHelper.appendComplete(id, "样衣制作");
            log.info("样衣完成成功：styleId={}, 所有开发资料环节已闭环", id);
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
        Object reasonValue = body == null ? null : body.get("reason");
        String reason = reasonValue == null ? "" : String.valueOf(reasonValue).trim();
        String remark = StringUtils.hasText(reason) ? reason : "";
        if (!StringUtils.hasText(remark)) {
            throw new IllegalArgumentException("退回原因不能为空");
        }

        // 该款已有进行中的生产订单时禁止退回：退回重改工序/物料清单后再推送下单，
        // 新旧订单资料快照脱钩（报废环节已有同类守卫）
        try {
            Long tid = com.fashion.supplychain.common.UserContext.tenantId();
            String styleIdStr = String.valueOf(id);
            long activeOrders = productionOrderService.count(
                    new LambdaQueryWrapper<com.fashion.supplychain.production.entity.ProductionOrder>()
                            .eq(com.fashion.supplychain.production.entity.ProductionOrder::getStyleId, styleIdStr)
                            .eq(com.fashion.supplychain.production.entity.ProductionOrder::getTenantId, tid)
                            .eq(com.fashion.supplychain.production.entity.ProductionOrder::getDeleteFlag, 0)
                            .notIn(com.fashion.supplychain.production.entity.ProductionOrder::getStatus,
                                    "completed", "cancelled", "scrapped", "archived", "closed"));
            if (activeOrders > 0) {
                throw new IllegalStateException("该款存在 " + activeOrders + " 个进行中的生产订单，请先处理完订单再退回样衣");
            }
        } catch (IllegalStateException rethrow) {
            throw rethrow;
        } catch (Exception e) {
            org.slf4j.LoggerFactory.getLogger(StyleStageHelper.class)
                    .warn("样衣退回前的在途订单校验失败: styleId={}, error={}", id, e.getMessage());
        }

        boolean ok = styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, id)
                .set(StyleInfo::getSampleStatus, null)
                .set(StyleInfo::getSampleProgress, 0)
                .set(StyleInfo::getSampleCompletedTime, null)
                .set(StyleInfo::getOrderType, null)
                .set(StyleInfo::getPushedToOrder, 0)
                .set(StyleInfo::getPushedToOrderTime, null)
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();
        if (!ok) {
            throw new IllegalStateException("操作失败");
        }
        return true;
    }

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
