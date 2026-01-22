package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.CuttingTask;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.CuttingBundleMapper;
import com.fashion.supplychain.production.mapper.CuttingTaskMapper;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.production.service.CuttingTaskService;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
@Slf4j
public class CuttingTaskServiceImpl extends ServiceImpl<CuttingTaskMapper, CuttingTask> implements CuttingTaskService {

    private static final String CUTTING_PROCESS_NAME = "裁剪";

    @Autowired
    private CuttingBundleMapper cuttingBundleMapper;

    @Autowired
    private ScanRecordMapper scanRecordMapper;

    @Override
    public IPage<CuttingTask> queryPage(Map<String, Object> params) {
        Integer page = ParamUtils.getPage(params);
        Integer pageSize = ParamUtils.getPageSize(params);

        Page<CuttingTask> pageInfo = new Page<>(page, pageSize);

        String orderNo = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(params, "orderNo"));
        String styleNo = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(params, "styleNo"));
        String status = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(params, "status"));

        IPage<CuttingTask> pageResult = baseMapper.selectPage(pageInfo,
                new LambdaQueryWrapper<CuttingTask>()
                        .like(StringUtils.hasText(orderNo), CuttingTask::getProductionOrderNo, orderNo)
                        .like(StringUtils.hasText(styleNo), CuttingTask::getStyleNo, styleNo)
                        .eq(StringUtils.hasText(status), CuttingTask::getStatus, status)
                        .orderByDesc(CuttingTask::getCreateTime));

        List<CuttingTask> records = pageResult.getRecords();
        if (records == null || records.isEmpty()) {
            return pageResult;
        }

        List<String> orderIds = records.stream()
                .map(CuttingTask::getProductionOrderId)
                .filter(StringUtils::hasText)
                .map(String::trim)
                .filter(StringUtils::hasText)
                .distinct()
                .collect(Collectors.toList());
        List<String> orderNos = records.stream()
                .map(CuttingTask::getProductionOrderNo)
                .filter(StringUtils::hasText)
                .map(String::trim)
                .filter(StringUtils::hasText)
                .distinct()
                .collect(Collectors.toList());
        if (orderIds.isEmpty() && orderNos.isEmpty()) {
            return pageResult;
        }

        Map<String, int[]> aggByOrderId = new HashMap<>();
        Map<String, int[]> aggByOrderNo = new HashMap<>();
        {
            LambdaQueryWrapper<CuttingBundle> qw = new LambdaQueryWrapper<CuttingBundle>()
                    .select(CuttingBundle::getProductionOrderId, CuttingBundle::getProductionOrderNo,
                            CuttingBundle::getQuantity);
            if (!orderIds.isEmpty() && !orderNos.isEmpty()) {
                qw.and(w -> w.in(CuttingBundle::getProductionOrderId, orderIds)
                        .or()
                        .in(CuttingBundle::getProductionOrderNo, orderNos));
            } else if (!orderIds.isEmpty()) {
                qw.in(CuttingBundle::getProductionOrderId, orderIds);
            } else {
                qw.in(CuttingBundle::getProductionOrderNo, orderNos);
            }

            List<CuttingBundle> bundles = cuttingBundleMapper.selectList(qw);
            if (bundles != null) {
                for (CuttingBundle b : bundles) {
                    if (b == null) {
                        continue;
                    }
                    String oid = StringUtils.hasText(b.getProductionOrderId()) ? b.getProductionOrderId().trim() : null;
                    String ono = StringUtils.hasText(b.getProductionOrderNo()) ? b.getProductionOrderNo().trim() : null;
                    int q = b.getQuantity() == null ? 0 : b.getQuantity();

                    if (StringUtils.hasText(oid)) {
                        int[] v = aggByOrderId.computeIfAbsent(oid, k -> new int[] { 0, 0 });
                        v[0] += Math.max(q, 0);
                        v[1] += 1;
                    }
                    if (StringUtils.hasText(ono)) {
                        int[] v = aggByOrderNo.computeIfAbsent(ono, k -> new int[] { 0, 0 });
                        v[0] += Math.max(q, 0);
                        v[1] += 1;
                    }
                }
            }
        }

        for (CuttingTask t : records) {
            String oid = StringUtils.hasText(t.getProductionOrderId()) ? t.getProductionOrderId().trim() : null;
            int[] a = StringUtils.hasText(oid) ? aggByOrderId.get(oid) : null;
            if (a == null) {
                String on = StringUtils.hasText(t.getProductionOrderNo()) ? t.getProductionOrderNo().trim() : null;
                a = StringUtils.hasText(on) ? aggByOrderNo.get(on) : null;
            }
            int qty = 0;
            int cnt = 0;
            if (a != null) {
                qty = a[0];
                cnt = a[1];
            }
            t.setCuttingQuantity(qty);
            t.setCuttingBundleCount(cnt);
        }

        return pageResult;
    }

    @Override
    public CuttingTask createTaskIfAbsent(ProductionOrder order) {
        if (order == null || !StringUtils.hasText(order.getId())) {
            return null;
        }

        CuttingTask existing = this.getOne(
                new LambdaQueryWrapper<CuttingTask>()
                        .eq(CuttingTask::getProductionOrderId, order.getId())
                        .last("limit 1"));
        if (existing != null) {
            return existing;
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
        task.setStatus("pending");
        task.setCreateTime(now);
        task.setUpdateTime(now);
        this.save(task);
        return task;
    }

    @Override
    public boolean receiveTask(String taskId, String receiverId, String receiverName) {
        if (!StringUtils.hasText(taskId)) {
            return false;
        }

        CuttingTask task = this.getById(taskId);
        if (task == null) {
            return false;
        }

        String status = task.getStatus() == null ? "" : task.getStatus().trim();
        String rid = StringUtils.hasText(receiverId) ? receiverId.trim() : null;
        String rname = StringUtils.hasText(receiverName) ? receiverName.trim() : null;

        if (!"pending".equals(status)) {
            return isSameReceiver(task, rid, rname);
        }

        LocalDateTime now = LocalDateTime.now();
        LambdaUpdateWrapper<CuttingTask> uw = new LambdaUpdateWrapper<CuttingTask>()
                .eq(CuttingTask::getId, taskId)
                .eq(CuttingTask::getStatus, "pending")
                .set(CuttingTask::getStatus, "received")
                .set(CuttingTask::getReceiverId, rid)
                .set(CuttingTask::getReceiverName, rname)
                .set(CuttingTask::getReceivedTime, now)
                .set(CuttingTask::getUpdateTime, now);

        boolean updated = this.update(uw);
        if (updated) {
            return true;
        }

        CuttingTask latest = this.getById(taskId);
        if (latest == null) {
            return false;
        }
        return isSameReceiver(latest, rid, rname);
    }

    private boolean isSameReceiver(CuttingTask task, String receiverId, String receiverName) {
        if (task == null) {
            return false;
        }
        String existingId = task.getReceiverId() == null ? null : task.getReceiverId().trim();
        String existingName = task.getReceiverName() == null ? null : task.getReceiverName().trim();
        if (StringUtils.hasText(receiverId) && StringUtils.hasText(existingId)) {
            if (receiverId.trim().equals(existingId)) {
                return true;
            }
        }
        if (StringUtils.hasText(receiverName) && StringUtils.hasText(existingName)) {
            return receiverName.trim().equals(existingName);
        }
        return false;
    }

    @Override
    public boolean markBundledByOrderId(String productionOrderId) {
        if (!StringUtils.hasText(productionOrderId)) {
            return false;
        }

        CuttingTask task = this.getOne(
                new LambdaQueryWrapper<CuttingTask>()
                        .eq(CuttingTask::getProductionOrderId, productionOrderId)
                        .last("limit 1"));
        if (task == null) {
            return false;
        }

        LocalDateTime now = LocalDateTime.now();
        task.setStatus("bundled");
        task.setBundledTime(now);
        task.setUpdateTime(now);
        boolean ok = this.updateById(task);
        if (!ok) {
            return false;
        }

        String oid = productionOrderId.trim();
        String requestId = "CUTTING_BUNDLED:" + oid;
        try {
            ScanRecord existing = scanRecordMapper.selectOne(new LambdaQueryWrapper<ScanRecord>()
                    .eq(ScanRecord::getRequestId, requestId)
                    .last("limit 1"));

            long cuttingQty = 0;
            List<CuttingBundle> bundles = cuttingBundleMapper.selectList(new LambdaQueryWrapper<CuttingBundle>()
                    .select(CuttingBundle::getQuantity)
                    .eq(CuttingBundle::getProductionOrderId, oid));
            if (bundles != null) {
                for (CuttingBundle b : bundles) {
                    if (b == null) {
                        continue;
                    }
                    int q = b.getQuantity() == null ? 0 : b.getQuantity();
                    if (q > 0) {
                        cuttingQty += q;
                    }
                }
            }
            if (cuttingQty <= 0) {
                int oq = task.getOrderQuantity() == null ? 0 : task.getOrderQuantity();
                if (oq > 0) {
                    cuttingQty = oq;
                }
            }

            long already = 0;
            List<ScanRecord> otherCutting = scanRecordMapper.selectList(new LambdaQueryWrapper<ScanRecord>()
                    .select(ScanRecord::getRequestId, ScanRecord::getQuantity)
                    .eq(ScanRecord::getOrderId, oid)
                    .in(ScanRecord::getScanType, java.util.Arrays.asList("production", "cutting"))
                    .eq(ScanRecord::getScanResult, "success")
                    .eq(ScanRecord::getProcessName, CUTTING_PROCESS_NAME));
            if (otherCutting != null) {
                for (ScanRecord r : otherCutting) {
                    if (r == null) {
                        continue;
                    }
                    String rid = r.getRequestId() == null ? null : r.getRequestId().trim();
                    if (StringUtils.hasText(rid) && requestId.equals(rid)) {
                        continue;
                    }
                    int q = r.getQuantity() == null ? 0 : r.getQuantity();
                    if (q > 0) {
                        already += q;
                    }
                }
            }

            long qtyToWrite = cuttingQty - already;
            if (qtyToWrite < 0) {
                qtyToWrite = 0;
            }
            int finalQty = (int) Math.min((long) Integer.MAX_VALUE, qtyToWrite);
            if (finalQty <= 0 && existing == null) {
                return true;
            }

            if (existing == null) {
                ScanRecord sr = new ScanRecord();
                sr.setRequestId(requestId);
                sr.setOrderId(oid);
                sr.setOrderNo(task.getProductionOrderNo());
                sr.setStyleId(task.getStyleId());
                sr.setStyleNo(task.getStyleNo());
                sr.setColor(task.getColor());
                sr.setSize(task.getSize());
                sr.setQuantity(finalQty);
                sr.setProgressStage(CUTTING_PROCESS_NAME);
                sr.setProcessName(CUTTING_PROCESS_NAME);
                sr.setOperatorId(task.getReceiverId());
                sr.setOperatorName(StringUtils.hasText(task.getReceiverName()) ? task.getReceiverName() : "system");
                sr.setScanType("cutting");
                sr.setScanResult("success");
                sr.setRemark("裁剪完成");
                sr.setScanTime(now);
                sr.setCreateTime(now);
                sr.setUpdateTime(now);
                scanRecordMapper.insert(sr);
            } else {
                ScanRecord patch = new ScanRecord();
                patch.setId(existing.getId());
                patch.setQuantity(finalQty);
                patch.setProgressStage(CUTTING_PROCESS_NAME);
                patch.setOperatorId(task.getReceiverId());
                patch.setOperatorName(StringUtils.hasText(task.getReceiverName()) ? task.getReceiverName() : "system");
                patch.setScanType("cutting");
                patch.setScanTime(now);
                patch.setUpdateTime(now);
                scanRecordMapper.updateById(patch);
            }
        } catch (Exception e) {
            log.warn("Failed to upsert cutting bundled scan record: taskId={}, orderId={}",
                    task == null ? null : task.getId(),
                    task == null ? null : task.getProductionOrderId(),
                    e);
        }
        return true;
    }

    @Override
    public boolean rollbackTask(String taskId) {
        if (!StringUtils.hasText(taskId)) {
            return false;
        }

        CuttingTask task = this.getById(taskId);
        if (task == null) {
            return false;
        }

        String orderId = task.getProductionOrderId();
        if (StringUtils.hasText(orderId)) {
            cuttingBundleMapper.delete(new LambdaQueryWrapper<CuttingBundle>()
                    .eq(CuttingBundle::getProductionOrderId, orderId));

            try {
                String requestId = "CUTTING_BUNDLED:" + orderId.trim();
                scanRecordMapper.delete(new LambdaQueryWrapper<ScanRecord>()
                        .eq(ScanRecord::getRequestId, requestId));
            } catch (Exception e) {
                log.warn("Failed to delete cutting bundled scan record on rollback: orderId={}", orderId, e);
            }
        }

        LocalDateTime now = LocalDateTime.now();
        task.setStatus("pending");
        task.setReceiverId(null);
        task.setReceiverName(null);
        task.setReceivedTime(null);
        task.setBundledTime(null);
        task.setUpdateTime(now);
        return this.updateById(task);
    }

    @Override
    public void insertRollbackLog(CuttingTask task, String operatorId, String operatorName, String remark) {
        if (task == null || !StringUtils.hasText(task.getId())) {
            return;
        }
        if (!StringUtils.hasText(remark)) {
            return;
        }
        LocalDateTime now = LocalDateTime.now();
        ScanRecord sr = new ScanRecord();
        sr.setRequestId("CUTTING_TASK_ROLLBACK:" + task.getId().trim() + ":" + UUID.randomUUID().toString().replace("-", ""));
        sr.setOrderId(task.getProductionOrderId());
        sr.setOrderNo(task.getProductionOrderNo());
        sr.setStyleId(task.getStyleId());
        sr.setStyleNo(task.getStyleNo());
        sr.setColor(task.getColor());
        sr.setSize(task.getSize());
        sr.setQuantity(0);
        sr.setProgressStage("裁剪退回");
        sr.setProcessName("裁剪退回");
        sr.setOperatorId(operatorId);
        sr.setOperatorName(StringUtils.hasText(operatorName) ? operatorName.trim() : "system");
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
}
