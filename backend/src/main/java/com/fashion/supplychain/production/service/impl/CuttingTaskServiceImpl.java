package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.CuttingTask;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.CuttingBundleMapper;
import com.fashion.supplychain.production.mapper.CuttingTaskMapper;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.production.orchestration.ProductionProcessTrackingOrchestrator;
import com.fashion.supplychain.production.service.CuttingTaskService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.helper.CuttingTaskQueryHelper;
import com.fashion.supplychain.production.helper.CuttingBundleCompletionHelper;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
@Slf4j
public class CuttingTaskServiceImpl extends ServiceImpl<CuttingTaskMapper, CuttingTask> implements CuttingTaskService {

    @Autowired private CuttingBundleMapper cuttingBundleMapper;
    @Autowired private ScanRecordMapper scanRecordMapper;
    @Autowired private ProductionOrderService productionOrderService;
    @Autowired private ProductionProcessTrackingOrchestrator processTrackingOrchestrator;
    @Autowired private CuttingTaskQueryHelper queryHelper;
    @Autowired private CuttingBundleCompletionHelper completionHelper;

    @Override
    public IPage<CuttingTask> queryPage(Map<String, Object> params) {
        return queryHelper.queryPage(params, baseMapper);
    }

    @Override
    public CuttingTask createTaskIfAbsent(ProductionOrder order) {
        if (order == null || !StringUtils.hasText(order.getId())) {
            return null;
        }
        List<CuttingTask> existing = this.list(
                new LambdaQueryWrapper<CuttingTask>()
                        .eq(CuttingTask::getProductionOrderId, order.getId())
                        .orderByAsc(CuttingTask::getCreateTime));
        if (existing != null && !existing.isEmpty()) {
            return existing.get(0);
        }
        LocalDateTime now = LocalDateTime.now();
        CuttingTask task = new CuttingTask();
        task.setProductionOrderId(order.getId());
        task.setProductionOrderNo(order.getOrderNo());
        task.setOrderQrCode(order.getQrCode());
        task.setStyleId(order.getStyleId());
        task.setStyleNo(order.getStyleNo());
        task.setStyleName(order.getStyleName());
        task.setColor(order.getColor());
        task.setSize(order.getSize());
        task.setOrderQuantity(order.getOrderQuantity());
        task.setFactoryType(order.getFactoryType());
        task.setStatus("pending");
        task.setCreateTime(now);
        task.setUpdateTime(now);
        this.save(task);
        log.info("创建裁剪任务: orderNo={}, color={}, size={}, quantity={}",
                order.getOrderNo(), order.getColor(), order.getSize(), order.getOrderQuantity());
        return task;
    }

    @Override
    public boolean receiveTask(String taskId, String receiverId, String receiverName) {
        if (!StringUtils.hasText(taskId)) return false;
        String taskIdTrim = taskId.trim();
        if (!StringUtils.hasText(taskIdTrim)) return false;

        CuttingTask task = this.getById(taskIdTrim);
        if (task == null) return false;

        String status = task.getStatus() == null ? "" : task.getStatus().trim();
        String normalizedStatus = status.toLowerCase();
        String rid = StringUtils.hasText(receiverId) ? receiverId.trim() : null;
        String rname = StringUtils.hasText(receiverName) ? receiverName.trim() : null;
        if (!StringUtils.hasText(rid) && !StringUtils.hasText(rname)) return false;

        if ("completed".equals(normalizedStatus) || "done".equals(normalizedStatus) || "cancelled".equals(normalizedStatus)) {
            return false;
        }

        if (!"pending".equals(normalizedStatus)) {
            if (isSameReceiver(task, rid, rname)) {
                LocalDateTime now = LocalDateTime.now();
                this.update(new LambdaUpdateWrapper<CuttingTask>()
                        .eq(CuttingTask::getId, taskIdTrim)
                        .set(CuttingTask::getReceivedTime, now)
                        .set(CuttingTask::getUpdateTime, now));
                return true;
            }
            return false;
        }

        LocalDateTime now = LocalDateTime.now();
        boolean updated = this.update(new LambdaUpdateWrapper<CuttingTask>()
                .eq(CuttingTask::getId, taskIdTrim)
                .eq(CuttingTask::getStatus, "pending")
                .set(CuttingTask::getStatus, "received")
                .set(CuttingTask::getReceiverId, rid)
                .set(CuttingTask::getReceiverName, rname)
                .set(CuttingTask::getReceivedTime, now)
                .set(CuttingTask::getUpdateTime, now));

        if (updated) return true;
        CuttingTask latest = this.getById(taskIdTrim);
        if (latest == null) return false;
        return isSameReceiver(latest, rid, rname);
    }

    private boolean isSameReceiver(CuttingTask task, String receiverId, String receiverName) {
        if (task == null) return false;
        String existingId = task.getReceiverId() == null ? null : task.getReceiverId().trim();
        String existingName = task.getReceiverName() == null ? null : task.getReceiverName().trim();
        if (StringUtils.hasText(receiverId) && StringUtils.hasText(existingId)) {
            if (receiverId.trim().equals(existingId)) return true;
        }
        if (StringUtils.hasText(receiverName) && StringUtils.hasText(existingName)) {
            return receiverName.trim().equals(existingName);
        }
        return false;
    }

    @Override
    @org.springframework.transaction.annotation.Transactional(rollbackFor = Exception.class)
    public boolean markBundledByOrderId(String productionOrderId) {
        if (!StringUtils.hasText(productionOrderId)) return false;
        String oid = productionOrderId.trim();
        if (!StringUtils.hasText(oid)) return false;

        CuttingTask task = this.getOne(new LambdaQueryWrapper<CuttingTask>()
                .eq(CuttingTask::getProductionOrderId, oid).last("limit 1"), false);
        if (task == null) return false;

        LocalDateTime now = LocalDateTime.now();
        task.setStatus("bundled");
        task.setBundledTime(now);
        task.setUpdateTime(now);
        boolean ok = this.updateById(task);
        if (!ok) return false;

        return completionHelper.markBundled(task);
    }

    @Override
    public boolean rollbackTask(String taskId) {
        if (!StringUtils.hasText(taskId)) return false;
        CuttingTask task = this.getById(taskId);
        if (task == null) return false;

        String orderId = task.getProductionOrderId();
        String orderNo = task.getProductionOrderNo();
        if (StringUtils.hasText(orderId)) {
            try {
                processTrackingOrchestrator.clearTrackingForRollback(orderNo);
            } catch (Exception e) {
                log.warn("Failed to delete process tracking on rollback: orderId={}, orderNo={}", orderId, orderNo, e);
            }
            cuttingBundleMapper.delete(new LambdaQueryWrapper<CuttingBundle>()
                    .eq(CuttingBundle::getProductionOrderId, orderId));
            try {
                String reqId = "CUTTING_BUNDLED:" + orderId.trim();
                scanRecordMapper.delete(new LambdaQueryWrapper<ScanRecord>().eq(ScanRecord::getRequestId, reqId));
            } catch (Exception e) {
                log.warn("Failed to delete cutting bundled scan record on rollback: orderId={}", orderId, e);
            }
            try {
                scanRecordMapper.delete(new LambdaQueryWrapper<ScanRecord>()
                        .eq(ScanRecord::getOrderId, orderId)
                        .eq(ScanRecord::getScanType, "cutting")
                        .and(w -> w.isNull(ScanRecord::getSettlementStatus).or().ne(ScanRecord::getSettlementStatus, "payroll_settled")));
            } catch (Exception e) {
                log.warn("Failed to delete cutting scan records on rollback: orderId={}", orderId, e);
            }
        }

        LocalDateTime now = LocalDateTime.now();
        LambdaUpdateWrapper<CuttingTask> cuttingUw = new LambdaUpdateWrapper<>();
        cuttingUw.eq(CuttingTask::getId, task.getId())
                 .set(CuttingTask::getStatus, "pending")
                 .set(CuttingTask::getReceiverId, null)
                 .set(CuttingTask::getReceiverName, null)
                 .set(CuttingTask::getReceivedTime, null)
                 .set(CuttingTask::getBundledTime, null)
                 .set(CuttingTask::getUpdateTime, now);
        return this.update(cuttingUw);
    }

    @Override
    public void insertRollbackLog(CuttingTask task, String operatorId, String operatorName, String remark) {
        if (task == null || !StringUtils.hasText(task.getId())) return;
        if (!StringUtils.hasText(remark)) return;

        String finalOperatorId = operatorId;
        String finalOperatorName = operatorName;
        if (!StringUtils.hasText(finalOperatorName)) {
            UserContext ctx = UserContext.get();
            if (ctx != null && StringUtils.hasText(ctx.getUsername())) {
                finalOperatorId = ctx.getUserId();
                finalOperatorName = ctx.getUsername();
                log.warn("裁剪退回缺少操作人信息，使用当前登录用户：taskId={}, user={}", task.getId(), finalOperatorName);
            } else {
                log.error("裁剪退回无法获取操作人信息：taskId={}", task.getId());
                throw new IllegalStateException("裁剪退回无法获取操作人信息，请确保已登录：taskId=" + task.getId());
            }
        }

        LocalDateTime now = LocalDateTime.now();
        ScanRecord sr = new ScanRecord();
        sr.setRequestId("CUTTING_TASK_ROLLBACK:" + task.getId().trim() + ":" + UUID.randomUUID().toString().replace("-", ""));
        sr.setOrderId(task.getProductionOrderId());
        sr.setOrderNo(task.getProductionOrderNo());
        sr.setStyleId(task.getStyleId());
        sr.setStyleNo(task.getStyleNo());
        sr.setTenantId(task.getTenantId());
        sr.setColor(task.getColor());
        sr.setSize(task.getSize());
        sr.setQuantity(0);
        sr.setProgressStage("裁剪退回");
        sr.setProcessName("裁剪退回");
        sr.setOperatorId(finalOperatorId);
        sr.setOperatorName(finalOperatorName.trim());
        sr.setScanType("cutting");
        sr.setScanResult("success");
        sr.setRemark("退回：" + remark.trim());
        sr.setScanTime(now);
        sr.setCreateTime(now);
        sr.setUpdateTime(now);
        try {
            scanRecordMapper.insert(sr);
        } catch (Exception e) {
            log.warn("Failed to insert cutting rollback log: taskId={}", task.getId(), e);
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteByOrderId(String orderId) {
        String oid = StringUtils.hasText(orderId) ? orderId.trim() : null;
        if (!StringUtils.hasText(oid)) return;
        try {
            cuttingBundleMapper.delete(new LambdaQueryWrapper<CuttingBundle>().eq(CuttingBundle::getProductionOrderId, oid));
            log.info("Deleted cutting bundles for order: {}", oid);
            this.remove(new LambdaQueryWrapper<CuttingTask>().eq(CuttingTask::getProductionOrderId, oid));
            log.info("Deleted cutting tasks for order: {}", oid);
        } catch (Exception e) {
            log.warn("Failed to delete cutting data for order: {}", oid, e);
        }
    }
}
