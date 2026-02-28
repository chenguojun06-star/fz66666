package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.List;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
@Slf4j
public class ProductionOrderScanRecordDomainService {

    public static final String STAGE_ORDER_CREATED = "下单";
    public static final String STAGE_PROCUREMENT = "采购";
    public static final String REQUEST_PREFIX_ORDER_CREATED = "ORDER_CREATED:";
    public static final String REQUEST_PREFIX_PROCUREMENT = "ORDER_PROCUREMENT:";

    private static final String PACKAGING_PROCESS_NAME = "包装";
    private static final String UNKNOWN_OPERATOR = "未知操作人";

    @Autowired
    private ScanRecordMapper scanRecordMapper;

    @Autowired
    private TemplateLibraryService templateLibraryService;

    private String trimToNull(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        String trimmed = value.trim();
        return StringUtils.hasText(trimmed) ? trimmed : null;
    }

    private String resolveOperatorName(String operatorName, String operatorId, String existingOperatorName) {
        String direct = trimToNull(operatorName);
        if (direct != null) {
            return direct;
        }

        UserContext ctx = UserContext.get();
        if (ctx != null) {
            String ctxName = trimToNull(ctx.getUsername());
            if (ctxName != null) {
                return ctxName;
            }
        }

        String existing = trimToNull(existingOperatorName);
        if (existing != null) {
            return existing;
        }

        String idFallback = trimToNull(operatorId);
        if (idFallback != null) {
            return idFallback;
        }

        return UNKNOWN_OPERATOR;
    }

    public int clampPercent(int progress) {
        if (progress < 0) {
            return 0;
        }
        if (progress > 100) {
            return 100;
        }
        return progress;
    }

    public int getNodeIndexFromProgress(int nodeCount, int progress) {
        return templateLibraryService.resolveProgressNodeIndexFromPercent(nodeCount, progress);
    }

    public List<String> resolveProgressNodes(String styleNo) {
        return templateLibraryService.resolveProgressNodes(styleNo);
    }

    public String resolveNodeNameFromProgress(String styleNo, int progress) {
        return templateLibraryService.resolveProgressNodeNameFromPercent(styleNo, progress);
    }

    public long computePackagingDoneQuantity(String orderId) {
        String oid = StringUtils.hasText(orderId) ? orderId.trim() : null;
        if (!StringUtils.hasText(oid)) {
            return 0L;
        }

        try {
            List<ScanRecord> records = scanRecordMapper
                    .selectList(new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<ScanRecord>()
                            .select(ScanRecord::getProgressStage, ScanRecord::getProcessName, ScanRecord::getQuantity)
                            .eq(ScanRecord::getOrderId, oid)
                            .eq(ScanRecord::getScanType, "production")
                            .eq(ScanRecord::getScanResult, "success")
                            .gt(ScanRecord::getQuantity, 0));

            long exact = 0;
            long contains = 0;
            long synonyms = 0;
            if (records != null) {
                for (ScanRecord r : records) {
                    if (r == null) {
                        continue;
                    }
                    String pn = r.getProgressStage() == null ? "" : r.getProgressStage().trim();
                    if (!StringUtils.hasText(pn)) {
                        pn = r.getProcessName() == null ? "" : r.getProcessName().trim();
                    }
                    if (!StringUtils.hasText(pn)) {
                        continue;
                    }
                    long q = r.getQuantity() == null ? 0L : r.getQuantity().longValue();
                    if (q <= 0) {
                        continue;
                    }
                    if (PACKAGING_PROCESS_NAME.equals(pn)) {
                        exact += q;
                    }
                    if (pn.contains(PACKAGING_PROCESS_NAME)) {
                        contains += q;
                    }
                    if (templateLibraryService.isProgressPackagingStageName(pn)) {
                        synonyms += q;
                    }
                }
            }

            long sum = exact > 0 ? exact : (contains > 0 ? contains : synonyms);
            return Math.max(0L, sum);
        } catch (Exception e) {
            log.warn("Failed to compute packaging done quantity: orderId={}", oid, e);
            return 0L;
        }
    }

    public void insertOrchestrationFailure(
            String orderId,
            String orderNo,
            String styleId,
            String styleNo,
            String action,
            String message,
            LocalDateTime now) {
        String oid = StringUtils.hasText(orderId) ? orderId.trim() : null;
        String act = StringUtils.hasText(action) ? action.trim() : null;
        if (!StringUtils.hasText(oid) || !StringUtils.hasText(act)) {
            return;
        }

        UserContext ctx = UserContext.get();
        String operatorId = ctx == null ? null : ctx.getUserId();
        String operatorName = ctx == null ? null : ctx.getUsername();
        String operatorNameTrimmed = trimToNull(operatorName);

        String remark = act;
        if (StringUtils.hasText(message)) {
            remark = message.trim();
        }
        if (remark != null && remark.length() > 900) {
            remark = remark.substring(0, 900);
        }

        LocalDateTime t = now == null ? LocalDateTime.now() : now;
        ScanRecord sr = new ScanRecord();
        sr.setRequestId("ORCH_FAIL:" + oid + ":" + act + ":" + UUID.randomUUID().toString().replace("-", ""));
        sr.setOrderId(oid);
        sr.setOrderNo(StringUtils.hasText(orderNo) ? orderNo.trim() : null);
        sr.setStyleId(StringUtils.hasText(styleId) ? styleId.trim() : null);
        sr.setStyleNo(StringUtils.hasText(styleNo) ? styleNo.trim() : null);
        sr.setQuantity(0);
        sr.setProgressStage(act);
        sr.setProcessName(act);
        String opId = operatorId == null ? null : operatorId.trim();
        sr.setOperatorId(StringUtils.hasText(opId) ? opId : null);
        sr.setOperatorName(resolveOperatorName(operatorNameTrimmed, opId, null));
        sr.setScanTime(t);
        sr.setScanType("orchestration");
        sr.setScanResult("failure");
        sr.setRemark(remark);
        sr.setCreateTime(t);
        sr.setUpdateTime(t);
        try {
            scanRecordMapper.insert(sr);
        } catch (Exception e) {
            log.warn("Failed to insert orchestration failure scan record: orderId={}, action={}", oid, act, e);
        }
    }

    public void insertOrchestrationFailure(ProductionOrder order, String action, String message, LocalDateTime now) {
        if (order == null) {
            return;
        }
        insertOrchestrationFailure(
                order.getId(),
                order.getOrderNo(),
                order.getStyleId(),
                order.getStyleNo(),
                action,
                message,
                now);
    }

    public int computePackagingDoneQuantityFromDoneByProcess(Map<String, Long> doneByProcess) {
        if (doneByProcess == null || doneByProcess.isEmpty()) {
            return 0;
        }

        long exact = 0;
        long contains = 0;
        long synonyms = 0;
        for (Map.Entry<String, Long> e : doneByProcess.entrySet()) {
            if (e == null) {
                continue;
            }
            String pnTrimmed = e.getKey() == null ? null : e.getKey().trim();
            if (pnTrimmed == null || pnTrimmed.isEmpty()) {
                continue;
            }
            long v = e.getValue() == null ? 0L : e.getValue();
            if (v <= 0) {
                continue;
            }
            if (PACKAGING_PROCESS_NAME.equals(pnTrimmed)) {
                exact += v;
            }
            if (pnTrimmed.contains(PACKAGING_PROCESS_NAME)) {
                contains += v;
            }
            if (templateLibraryService.isProgressPackagingStageName(pnTrimmed)) {
                synonyms += v;
            }
        }

        long sum = exact > 0 ? exact : (contains > 0 ? contains : synonyms);
        return (int) Math.min((long) Integer.MAX_VALUE, Math.max(0L, sum));
    }

    public boolean existsRealProductionScanForOrder(String orderId) {
        String oid = StringUtils.hasText(orderId) ? orderId.trim() : null;
        if (!StringUtils.hasText(oid)) {
            return false;
        }
        try {
            java.util.List<String> base = java.util.Arrays.asList(
                    STAGE_ORDER_CREATED,
                    STAGE_PROCUREMENT,
                    "订单创建",
                    "创建订单",
                    "开单",
                    "制单",
                    "物料采购",
                    "面辅料采购",
                    "备料",
                    "到料");
            Long c = scanRecordMapper.selectCount(
                    new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<ScanRecord>()
                            .eq(ScanRecord::getOrderId, oid)
                            .in(ScanRecord::getScanType, java.util.Arrays.asList("production", "cutting"))
                            .eq(ScanRecord::getScanResult, "success")
                            .gt(ScanRecord::getQuantity, 0)
                            .and(w -> w
                                    .and(w2 -> w2.isNotNull(ScanRecord::getProgressStage)
                                            .ne(ScanRecord::getProgressStage, "")
                                            .notIn(ScanRecord::getProgressStage, base))
                                    .or(w2 -> w2
                                            .and(w3 -> w3.isNull(ScanRecord::getProgressStage)
                                                    .or()
                                                    .eq(ScanRecord::getProgressStage, ""))
                                            .notIn(ScanRecord::getProcessName, base))));
            return c != null && c > 0;
        } catch (Exception e) {
            log.warn("Failed to check real production scans for order: orderId={}", oid, e);
            return false;
        }
    }

    public void upsertStageScanRecord(
            String requestId,
            String orderId,
            String orderNo,
            String styleId,
            String styleNo,
            String color,
            String size,
            int quantity,
            String processName,
            LocalDateTime scanTime,
            String operatorId,
            String operatorName) {
        if (!StringUtils.hasText(requestId) || !StringUtils.hasText(orderId) || !StringUtils.hasText(processName)) {
            return;
        }

        ScanRecord existing = scanRecordMapper
                .selectOne(new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<ScanRecord>()
                        .eq(ScanRecord::getRequestId, requestId)
                        .last("limit 1"));

        LocalDateTime now = LocalDateTime.now();
        if (existing == null) {
            ScanRecord sr = new ScanRecord();
            sr.setRequestId(requestId);
            sr.setOrderId(orderId);
            sr.setOrderNo(orderNo);
            sr.setStyleId(styleId);
            sr.setStyleNo(styleNo);
            sr.setColor(color);
            sr.setSize(size);
            sr.setQuantity(Math.max(0, quantity));
            sr.setProgressStage(processName);
            sr.setProcessName(processName);
            String opId = trimToNull(operatorId);
            sr.setOperatorId(opId);
            sr.setOperatorName(resolveOperatorName(operatorName, opId, null));
            sr.setScanType("production");
            sr.setScanResult("success");
            sr.setRemark(processName);
            sr.setScanTime(scanTime == null ? now : scanTime);
            sr.setCreateTime(now);
            sr.setUpdateTime(now);
            scanRecordMapper.insert(sr);
            return;
        }

        ScanRecord patch = new ScanRecord();
        patch.setId(existing.getId());
        patch.setQuantity(Math.max(0, quantity));
        String opId = trimToNull(operatorId);
        patch.setOperatorId(opId);
        patch.setOperatorName(resolveOperatorName(operatorName, opId, existing.getOperatorName()));
        if (scanTime != null) {
            patch.setScanTime(scanTime);
        }
        patch.setUpdateTime(now);
        scanRecordMapper.updateById(patch);
    }

    public void ensureBaseStageScanRecordsOnCreate(ProductionOrder order) {
        if (order == null || !StringUtils.hasText(order.getId())) {
            return;
        }
        String oid = order.getId().trim();
        int orderQty = order.getOrderQuantity() == null ? 0 : order.getOrderQuantity();
        if (orderQty <= 0) {
            return;
        }

        LocalDateTime scanTime = order.getCreateTime();
        if (scanTime == null) {
            scanTime = LocalDateTime.now();
        }

        // 【下单】扫码记录代表"谁创建了订单"，必须优先使用订单已存储的创建人
        // 不能优先用 ctx.getUsername()：超管账号 username 可能是 "system"，而 name 为空，
        // 会导致 JWT uname="system" → operator_name="system"，覆盖真实创建人姓名
        String operatorId = null;
        String operatorName = null;
        if (StringUtils.hasText(order.getCreatedByName())) {
            operatorName = order.getCreatedByName().trim();
            operatorId = order.getCreatedById() != null ? String.valueOf(order.getCreatedById()) : null;
        }
        // 仅当订单无创建人时，才从 ctx 中获取（极端兜底）
        if (operatorName == null) {
            UserContext ctx = UserContext.get();
            if (ctx != null && StringUtils.hasText(ctx.getUserId())) {
                operatorId = ctx.getUserId();
                operatorName = StringUtils.hasText(ctx.getUsername()) ? ctx.getUsername().trim() : null;
            }
        }
        operatorName = resolveOperatorName(operatorName, operatorId, order.getCreatedByName());

        upsertStageScanRecord(
                REQUEST_PREFIX_ORDER_CREATED + oid,
                oid,
                order.getOrderNo(),
                order.getStyleId(),
                order.getStyleNo(),
                order.getColor(),
                order.getSize(),
                orderQty,
                STAGE_ORDER_CREATED,
                scanTime,
                operatorId,
                operatorName);
    }

    public void insertAdvanceRecord(ProductionOrder order, int toProgress, LocalDateTime now) {
        if (order == null || !StringUtils.hasText(order.getId())) {
            return;
        }

        String pn = resolveNodeNameFromProgress(order.getStyleNo(), toProgress);
        if (!StringUtils.hasText(pn)) {
            pn = "推进";
        }

        UserContext ctx = UserContext.get();
        String operatorId = ctx == null ? null : ctx.getUserId();
        String operatorName = ctx == null ? null : ctx.getUsername();
        String operatorNameTrimmed = trimToNull(operatorName);

        ScanRecord sr = new ScanRecord();
        sr.setRequestId("ORDER_ADVANCE:" + order.getId() + ":" + UUID.randomUUID().toString().replace("-", ""));
        sr.setOrderId(order.getId());
        sr.setOrderNo(order.getOrderNo());
        sr.setStyleId(order.getStyleId());
        sr.setStyleNo(order.getStyleNo());
        sr.setColor(order.getColor());
        sr.setSize(order.getSize());
        sr.setQuantity(0);
        sr.setProgressStage(pn);
        sr.setProcessName(pn);
        sr.setOperatorId(operatorId);
        sr.setOperatorName(resolveOperatorName(operatorNameTrimmed, operatorId, null));
        sr.setScanType("production");
        sr.setScanResult("success");
        sr.setRemark("推进：手动调整进度到" + pn + "（" + clampPercent(toProgress) + "%）");
        LocalDateTime t = now == null ? LocalDateTime.now() : now;
        sr.setScanTime(t);
        sr.setCreateTime(t);
        sr.setUpdateTime(t);

        scanRecordMapper.insert(sr);
    }

    public void insertOrderOperationRecord(ProductionOrder order, String action, String remark, LocalDateTime now) {
        if (order == null || !StringUtils.hasText(order.getId())) {
            return;
        }

        String act = StringUtils.hasText(action) ? action.trim() : null;
        if (!StringUtils.hasText(act)) {
            return;
        }

        UserContext ctx = UserContext.get();
        String operatorId = ctx == null ? null : ctx.getUserId();
        String operatorName = ctx == null ? null : ctx.getUsername();
        String operatorNameTrimmed = trimToNull(operatorName);

        String r = StringUtils.hasText(remark) ? remark.trim() : "";
        String finalRemark = StringUtils.hasText(r) ? (act + "：" + r) : act;
        finalRemark = finalRemark == null ? "" : finalRemark;
        if (finalRemark.length() > 900) {
            finalRemark = finalRemark.substring(0, 900);
        }

        LocalDateTime t = now == null ? LocalDateTime.now() : now;
        ScanRecord sr = new ScanRecord();
        sr.setRequestId("ORDER_OP:" + act + ":" + order.getId() + ":" + UUID.randomUUID().toString().replace("-", ""));
        sr.setOrderId(order.getId());
        sr.setOrderNo(order.getOrderNo());
        sr.setStyleId(order.getStyleId());
        sr.setStyleNo(order.getStyleNo());
        sr.setColor(order.getColor());
        sr.setSize(order.getSize());
        sr.setQuantity(0);
        sr.setProgressStage(act);
        sr.setProcessName(act);
        String opId = operatorId == null ? null : operatorId.trim();
        sr.setOperatorId(StringUtils.hasText(opId) ? opId : null);
        sr.setOperatorName(resolveOperatorName(operatorNameTrimmed, opId, null));
        sr.setScanType("production");
        sr.setScanResult("success");
        sr.setRemark(finalRemark);
        sr.setScanTime(t);
        sr.setCreateTime(t);
        sr.setUpdateTime(t);

        try {
            scanRecordMapper.insert(sr);
        } catch (Exception e) {
            log.warn("Failed to insert order operation record: orderId={}, action={}", order.getId(), act, e);
        }
    }

    public void insertRollbackRecord(ProductionOrder order, String toProcessName, String remark, LocalDateTime now) {
        if (order == null || !StringUtils.hasText(order.getId())) {
            return;
        }

        String pn = StringUtils.hasText(toProcessName) ? toProcessName.trim() : null;
        if (!StringUtils.hasText(pn)) {
            pn = "退回";
        }

        UserContext ctx = UserContext.get();
        String operatorId = ctx == null ? null : ctx.getUserId();
        String operatorName = ctx == null ? null : ctx.getUsername();
        String operatorNameTrimmed = trimToNull(operatorName);

        ScanRecord sr = new ScanRecord();
        sr.setRequestId("ORDER_ROLLBACK:" + order.getId() + ":" + UUID.randomUUID().toString().replace("-", ""));
        sr.setOrderId(order.getId());
        sr.setOrderNo(order.getOrderNo());
        sr.setStyleId(order.getStyleId());
        sr.setStyleNo(order.getStyleNo());
        sr.setColor(order.getColor());
        sr.setSize(order.getSize());
        sr.setQuantity(0);
        sr.setProgressStage(pn);
        sr.setProcessName(pn);
        sr.setOperatorId(operatorId);
        sr.setOperatorName(resolveOperatorName(operatorNameTrimmed, operatorId, null));
        sr.setScanType("production");
        sr.setScanResult("success");
        sr.setRemark("退回：" + (remark == null ? "" : remark.trim()));
        LocalDateTime t = now == null ? LocalDateTime.now() : now;
        sr.setScanTime(t);
        sr.setCreateTime(t);
        sr.setUpdateTime(t);

        try {
            scanRecordMapper.insert(sr);
        } catch (Exception e) {
            log.warn("Failed to insert rollback scan record: orderId={}, requestId={}", order.getId(),
                    sr.getRequestId(),
                    e);
        }
    }

    public void invalidateFlowAfterRollback(ProductionOrder order, int progress, String rollbackToProcessName,
            LocalDateTime now) {
        if (order == null || !StringUtils.hasText(order.getId())) {
            return;
        }
        String oid = order.getId().trim();
        LocalDateTime t = now == null ? LocalDateTime.now() : now;

        String pn = StringUtils.hasText(rollbackToProcessName) ? rollbackToProcessName.trim() : null;
        List<String> nodes = resolveProgressNodes(order.getStyleNo());
        if (nodes != null && !nodes.isEmpty()) {
            int idx = -1;
            if (StringUtils.hasText(pn)) {
                idx = nodes.indexOf(pn);
            }
            if (idx < 0) {
                idx = getNodeIndexFromProgress(nodes.size(), progress);
                if (idx >= 0 && idx < nodes.size()) {
                    pn = nodes.get(idx);
                }
            }
            if (idx >= 0 && idx < nodes.size() - 1) {
                List<String> later = nodes.subList(idx + 1, nodes.size());
                scanRecordMapper.update(null, new LambdaUpdateWrapper<ScanRecord>()
                        .eq(ScanRecord::getOrderId, oid)
                        .eq(ScanRecord::getScanType, "production")
                        .eq(ScanRecord::getScanResult, "success")
                        .gt(ScanRecord::getQuantity, 0)
                        .and(w -> w
                                .in(ScanRecord::getProgressStage, later)
                                .or(w2 -> w2
                                        .and(w3 -> w3.isNull(ScanRecord::getProgressStage)
                                                .or()
                                                .eq(ScanRecord::getProgressStage, ""))
                                        .in(ScanRecord::getProcessName, later)))
                        .set(ScanRecord::getScanResult, "failure")
                        .set(ScanRecord::getRemark, "已退回至" + (pn == null ? "上一环节" : pn) + "，后续记录作废")
                        .set(ScanRecord::getUpdateTime, t));
            }
        }

        scanRecordMapper.update(null, new LambdaUpdateWrapper<ScanRecord>()
                .eq(ScanRecord::getOrderId, oid)
                .in(ScanRecord::getScanType, java.util.Arrays.asList("quality", "warehouse"))
                .eq(ScanRecord::getScanResult, "success")
                .set(ScanRecord::getScanResult, "failure")
                .set(ScanRecord::getRemark, "生产已退回，后续记录作废")
                .set(ScanRecord::getUpdateTime, t));
    }
}
