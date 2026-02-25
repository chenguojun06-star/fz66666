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
import com.fashion.supplychain.production.orchestration.ProductionProcessTrackingOrchestrator;
import com.fashion.supplychain.production.service.CuttingTaskService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.SKUService;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import java.math.BigDecimal;
import java.math.RoundingMode;
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

    @Autowired
    private ProductionOrderService productionOrderService;

    // NOTE [架构债务] TemplateLibraryService 是跨模块依赖（template→production）
    // 应迁移 resolveCuttingUnitPrice() 到 CuttingBundleOrchestrator，
    // 通过参数传递价格给 markBundledByOrderId()，需同时修改2个接口+3个实现
    @Autowired
    private TemplateLibraryService templateLibraryService;

    @Autowired
    private SKUService skuService;

    @Autowired
    private ProductionProcessTrackingOrchestrator processTrackingOrchestrator;

    @Override
    public IPage<CuttingTask> queryPage(Map<String, Object> params) {
        Integer page = ParamUtils.getPage(params);
        Integer pageSize = ParamUtils.getPageSize(params);

        Page<CuttingTask> pageInfo = new Page<>(page, pageSize);

        String orderNo = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(params, "orderNo"));
        String styleNo = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(params, "styleNo"));
        String status = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(params, "status"));

        // 先查询未删除的生产订单ID列表（用于过滤裁剪任务）
        List<ProductionOrder> allOrders = productionOrderService.list(
                new LambdaQueryWrapper<ProductionOrder>()
                        .select(ProductionOrder::getId)
                        .and(w -> w.isNull(ProductionOrder::getDeleteFlag).or().eq(ProductionOrder::getDeleteFlag, 0))
        );
        List<String> validOrderIds = allOrders.stream()
                .map(ProductionOrder::getId)
                .filter(StringUtils::hasText)
                .collect(Collectors.toList());

        // 在查询时就过滤掉已删除订单的任务，确保 total 准确
        LambdaQueryWrapper<CuttingTask> queryWrapper = new LambdaQueryWrapper<CuttingTask>()
                .like(StringUtils.hasText(orderNo), CuttingTask::getProductionOrderNo, orderNo)
                .like(StringUtils.hasText(styleNo), CuttingTask::getStyleNo, styleNo)
                .eq(StringUtils.hasText(status), CuttingTask::getStatus, status)
                .orderByDesc(CuttingTask::getCreateTime);

        // 只查询有效订单的任务（或者没有关联订单的任务）
        if (!validOrderIds.isEmpty()) {
            queryWrapper.and(w -> w.in(CuttingTask::getProductionOrderId, validOrderIds)
                    .or().isNull(CuttingTask::getProductionOrderId));
        } else {
            queryWrapper.isNull(CuttingTask::getProductionOrderId);
        }

        IPage<CuttingTask> pageResult = baseMapper.selectPage(pageInfo, queryWrapper);

        List<CuttingTask> records = pageResult.getRecords();
        if (records == null || records.isEmpty()) {
            return pageResult;
        }

        // 收集订单ID和订单号用于后续查询
        List<String> orderIdsFiltered = records.stream()
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
        if (orderIdsFiltered.isEmpty() && orderNos.isEmpty()) {
            return pageResult;
        }

        Map<String, int[]> aggByOrderId = new HashMap<>();
        Map<String, int[]> aggByOrderNo = new HashMap<>();
        {
            LambdaQueryWrapper<CuttingBundle> qw = new LambdaQueryWrapper<CuttingBundle>()
                    .select(CuttingBundle::getProductionOrderId, CuttingBundle::getProductionOrderNo,
                            CuttingBundle::getQuantity);
            if (!orderIdsFiltered.isEmpty() && !orderNos.isEmpty()) {
                qw.and(w -> w.in(CuttingBundle::getProductionOrderId, orderIdsFiltered)
                        .or()
                        .in(CuttingBundle::getProductionOrderNo, orderNos));
            } else if (!orderIdsFiltered.isEmpty()) {
                qw.in(CuttingBundle::getProductionOrderId, orderIdsFiltered);
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

        // 关联查询订单信息，填充下单人和下单时间
        if (!orderIdsFiltered.isEmpty()) {
            List<ProductionOrder> orders = productionOrderService.list(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .in(ProductionOrder::getId, orderIdsFiltered)
                            .select(ProductionOrder::getId, ProductionOrder::getCreatedByName, ProductionOrder::getCreateTime)
            );
            Map<String, ProductionOrder> orderMap = orders.stream()
                    .filter(o -> o != null && StringUtils.hasText(o.getId()))
                    .collect(Collectors.toMap(ProductionOrder::getId, o -> o, (a1, b) -> a1));

            for (CuttingTask t : records) {
                String orderId = t.getProductionOrderId();
                if (StringUtils.hasText(orderId) && orderMap.containsKey(orderId.trim())) {
                    ProductionOrder order = orderMap.get(orderId.trim());
                    t.setOrderCreatorName(order.getCreatedByName());
                    t.setOrderTime(order.getCreateTime());
                }
            }
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
        String taskIdTrim = taskId.trim();
        if (!StringUtils.hasText(taskIdTrim)) {
            return false;
        }

        CuttingTask task = this.getById(taskIdTrim);
        if (task == null) {
            return false;
        }

        String status = task.getStatus() == null ? "" : task.getStatus().trim();
        String rid = StringUtils.hasText(receiverId) ? receiverId.trim() : null;
        String rname = StringUtils.hasText(receiverName) ? receiverName.trim() : null;
        if (!StringUtils.hasText(rid) && !StringUtils.hasText(rname)) {
            return false;
        }

        // 如果不是 pending 状态，检查是否是同一个人重复领取
        if (!"pending".equals(status)) {
            // 如果是同一个人，也需要更新领取时间（用于退回后再次领取的场景）
            if (isSameReceiver(task, rid, rname)) {
                LocalDateTime now = LocalDateTime.now();
                LambdaUpdateWrapper<CuttingTask> uw = new LambdaUpdateWrapper<CuttingTask>()
                        .eq(CuttingTask::getId, taskIdTrim)
                        .set(CuttingTask::getReceivedTime, now)
                        .set(CuttingTask::getUpdateTime, now);
                this.update(uw);
                return true;
            }
            return false;
        }

        LocalDateTime now = LocalDateTime.now();
        LambdaUpdateWrapper<CuttingTask> uw = new LambdaUpdateWrapper<CuttingTask>()
                .eq(CuttingTask::getId, taskIdTrim)
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

        CuttingTask latest = this.getById(taskIdTrim);
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

        String oid = productionOrderId.trim();
        if (!StringUtils.hasText(oid)) {
            return false;
        }

        CuttingTask task = this.getOne(
                new LambdaQueryWrapper<CuttingTask>()
                        .eq(CuttingTask::getProductionOrderId, oid)
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

            // 解析裁剪工序单价（从模板库获取）
            BigDecimal cuttingUnitPrice = resolveCuttingUnitPrice(task.getStyleNo());

            // 获取操作人信息（优先使用任务接收人，回退到当前登录用户）
            String operatorId = task.getReceiverId();
            String operatorName = task.getReceiverName();
            if (!StringUtils.hasText(operatorName)) {
                UserContext ctx = UserContext.get();
                if (ctx != null && StringUtils.hasText(ctx.getUsername())) {
                    operatorId = ctx.getUserId();
                    operatorName = ctx.getUsername();
                    log.warn("裁剪任务缺少接收人信息，使用当前登录用户：taskId={}, user={}", task.getId(), operatorName);
                } else {
                    throw new IllegalStateException("裁剪任务缺少接收人信息且无法获取当前登录用户，无法生成扫码记录：taskId=" + task.getId());
                }
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
                sr.setOperatorId(operatorId);
                sr.setOperatorName(operatorName);
                sr.setScanType("cutting");
                sr.setScanResult("success");
                sr.setRemark("裁剪完成");
                sr.setScanTime(now);
                sr.setCreateTime(now);
                sr.setUpdateTime(now);
                // 设置单价和金额
                sr.setUnitPrice(cuttingUnitPrice);
                sr.setProcessUnitPrice(cuttingUnitPrice);
                sr.setScanCost(cuttingUnitPrice);
                sr.setTotalAmount(computeCuttingTotalAmount(cuttingUnitPrice, finalQty));
                if (skuService != null) {
                    skuService.attachProcessUnitPrice(sr);
                }
                scanRecordMapper.insert(sr);

                // 更新工序跟踪表（修复PC端工序明细弹窗数据缺失问题）
                updateProcessTracking(task, operatorId, operatorName, sr.getId());
            } else {
                ScanRecord patch = new ScanRecord();
                patch.setId(existing.getId());
                patch.setQuantity(finalQty);
                patch.setProgressStage(CUTTING_PROCESS_NAME);
                patch.setOperatorId(operatorId);
                patch.setOperatorName(operatorName);
                patch.setScanType("cutting");
                patch.setScanTime(now);
                patch.setUpdateTime(now);
                // 更新单价和金额（如果之前缺失）
                if (existing.getUnitPrice() == null || existing.getUnitPrice().compareTo(BigDecimal.ZERO) <= 0) {
                    patch.setUnitPrice(cuttingUnitPrice);
                    patch.setProcessUnitPrice(cuttingUnitPrice);
                    patch.setScanCost(cuttingUnitPrice);
                }
                patch.setTotalAmount(computeCuttingTotalAmount(
                        cuttingUnitPrice != null ? cuttingUnitPrice : BigDecimal.ZERO, finalQty));
                scanRecordMapper.updateById(patch);

                // 更新工序跟踪表（修复PC端工序明细弹窗数据缺失问题）
                updateProcessTracking(task, operatorId, operatorName, existing.getId());
            }
        } catch (Exception e) {
            log.warn("Failed to upsert cutting bundled scan record: taskId={}, orderId={}",
                    task == null ? null : task.getId(),
                    task == null ? null : task.getProductionOrderId(),
                    e);
        }
        return true;
    }

    /**
     * 更新工序跟踪表（裁剪完成时同步更新tracking表的扫码时间和操作人）
     * 修复PC端工序明细弹窗显示空白问题
     */
    private void updateProcessTracking(CuttingTask task, String operatorId, String operatorName, String scanRecordId) {
        try {
            if (processTrackingOrchestrator == null) {
                log.warn("processTrackingOrchestrator未注入，跳过工序跟踪更新：taskId={}", task.getId());
                return;
            }

            // 查询该订单的所有裁剪菲号
            List<CuttingBundle> bundles = cuttingBundleMapper.selectList(
                new LambdaQueryWrapper<CuttingBundle>()
                    .eq(CuttingBundle::getProductionOrderId, task.getProductionOrderId())
                    .eq(CuttingBundle::getColor, task.getColor())
                    .eq(CuttingBundle::getSize, task.getSize())
            );

            if (bundles == null || bundles.isEmpty()) {
                log.warn("未找到裁剪菲号，无法更新工序跟踪：taskId={}, orderId={}, color={}, size={}",
                    task.getId(), task.getProductionOrderId(), task.getColor(), task.getSize());
                return;
            }

            // 为每个菲号更新工序跟踪记录（强制更新，覆盖初始化时的默认值）
            for (CuttingBundle bundle : bundles) {
                try {
                    boolean updated = processTrackingOrchestrator.forcedUpdateCuttingScan(
                        bundle.getId(),
                        operatorId,
                        operatorName,
                        scanRecordId
                    );
                    if (!updated) {
                        log.warn("裁剪工序跟踪更新失败：bundleId={}, operator={}",
                            bundle.getId(), operatorName);
                    }
                } catch (Exception e) {
                    log.warn("更新工序跟踪失败：bundleId={}, processName={}",
                        bundle.getId(), CUTTING_PROCESS_NAME, e);
                }
            }

            log.info("裁剪完成工序跟踪更新成功：taskId={}, bundleCount={}, operator={}",
                task.getId(), bundles.size(), operatorName);
        } catch (Exception e) {
            log.error("更新工序跟踪失败：taskId={}", task.getId(), e);
        }
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
        // ⚠️ 用 LambdaUpdateWrapper 显式 SET NULL（updateById 默认跳过 null 字段）
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
        if (task == null || !StringUtils.hasText(task.getId())) {
            return;
        }
        if (!StringUtils.hasText(remark)) {
            return;
        }

        // 确保操作人信息完整（优先使用传入参数，回退到当前登录用户）
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
        sr.setRequestId(
                "CUTTING_TASK_ROLLBACK:" + task.getId().trim() + ":" + UUID.randomUUID().toString().replace("-", ""));
        sr.setOrderId(task.getProductionOrderId());
        sr.setOrderNo(task.getProductionOrderNo());
        sr.setStyleId(task.getStyleId());
        sr.setStyleNo(task.getStyleNo());
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
    public void deleteByOrderId(String orderId) {
        String oid = StringUtils.hasText(orderId) ? orderId.trim() : null;
        if (!StringUtils.hasText(oid)) {
            return;
        }

        try {
            // 删除裁剪单
            LambdaQueryWrapper<CuttingBundle> bundleQuery = new LambdaQueryWrapper<>();
            bundleQuery.eq(CuttingBundle::getProductionOrderId, oid);
            cuttingBundleMapper.delete(bundleQuery);
            log.info("Deleted cutting bundles for order: {}", oid);

            // 删除裁剪任务
            LambdaQueryWrapper<CuttingTask> taskQuery = new LambdaQueryWrapper<>();
            taskQuery.eq(CuttingTask::getProductionOrderId, oid);
            this.remove(taskQuery);
            log.info("Deleted cutting tasks for order: {}", oid);
        } catch (Exception e) {
            log.warn("Failed to delete cutting data for order: {}", oid, e);
        }
    }

    /**
     * 从模板库解析裁剪工序单价
     */
    private BigDecimal resolveCuttingUnitPrice(String styleNo) {
        if (!StringUtils.hasText(styleNo)) {
            return BigDecimal.ZERO;
        }
        try {
            Map<String, BigDecimal> prices = templateLibraryService.resolveProcessUnitPrices(styleNo.trim());
            if (prices == null || prices.isEmpty()) {
                return BigDecimal.ZERO;
            }
            // 精确匹配"裁剪"
            BigDecimal price = prices.get(CUTTING_PROCESS_NAME);
            if (price != null && price.compareTo(BigDecimal.ZERO) > 0) {
                return price;
            }
            // 模糊匹配裁剪相关
            for (Map.Entry<String, BigDecimal> entry : prices.entrySet()) {
                String key = entry.getKey();
                if (key != null && (key.contains("裁剪") || key.contains("裁床") || key.contains("开裁"))) {
                    BigDecimal v = entry.getValue();
                    if (v != null && v.compareTo(BigDecimal.ZERO) > 0) {
                        return v;
                    }
                }
            }
        } catch (Exception e) {
            log.warn("解析裁剪单价失败: styleNo={}", styleNo, e);
        }
        return BigDecimal.ZERO;
    }

    /**
     * 计算裁剪总金额
     */
    private BigDecimal computeCuttingTotalAmount(BigDecimal unitPrice, int quantity) {
        BigDecimal up = unitPrice == null ? BigDecimal.ZERO : unitPrice;
        int q = Math.max(0, quantity);
        return up.multiply(BigDecimal.valueOf(q)).setScale(2, RoundingMode.HALF_UP);
    }
}
