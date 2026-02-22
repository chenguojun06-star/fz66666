package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.common.util.TextUtils;
import com.fashion.supplychain.finance.entity.PayrollSettlement;
import com.fashion.supplychain.finance.entity.PayrollSettlementItem;
import com.fashion.supplychain.finance.service.PayrollSettlementItemService;
import com.fashion.supplychain.finance.service.PayrollSettlementService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.production.service.ProductionOrderService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
@Slf4j
public class PayrollSettlementOrchestrator {

    private static final DateTimeFormatter DAY_FMT = DateTimeFormatter.ofPattern("yyyyMMdd");

    @Autowired
    private PayrollSettlementService payrollSettlementService;

    @Autowired
    private PayrollSettlementItemService payrollSettlementItemService;

    @Autowired
    private ScanRecordMapper scanRecordMapper;

    @Autowired
    private ProductionOrderService productionOrderService;

    private static final class PayrollQuery {
        private String orderId;
        private String orderNo;
        private String styleNo;
        private String operatorId;
        private String operatorName;
        private String scanType;
        private String processName;
        private boolean includeSettled;
        private LocalDateTime startTime;
        private LocalDateTime endTime;
    }

    public IPage<PayrollSettlement> list(Map<String, Object> params) {
        return payrollSettlementService.queryPage(params);
    }

    public PayrollSettlement detail(String id) {
        String sid = TextUtils.safeText(id);
        if (!StringUtils.hasText(sid)) {
            throw new IllegalArgumentException("参数错误");
        }
        PayrollSettlement settlement = payrollSettlementService.getDetailById(sid);
        if (settlement == null) {
            throw new NoSuchElementException("工资结算单不存在");
        }
        return settlement;
    }

    public List<PayrollSettlementItem> items(String settlementId) {
        String sid = TextUtils.safeText(settlementId);
        if (!StringUtils.hasText(sid)) {
            throw new IllegalArgumentException("参数错误");
        }
        return payrollSettlementItemService.lambdaQuery()
                .eq(PayrollSettlementItem::getSettlementId, sid)
                .orderByAsc(PayrollSettlementItem::getOperatorName)
                .orderByAsc(PayrollSettlementItem::getProcessName)
                .list();
    }

    public List<Map<String, Object>> operatorSummary(Map<String, Object> params) {
        PayrollQuery q = parseQuery(params, true, true);

        // 权限控制：普通员工只能查看自己的工资数据，管理员/主管可查看全部
        if (UserContext.isWorker()) {
            String currentUserId = UserContext.userId();
            if (org.springframework.util.StringUtils.hasText(currentUserId)) {
                q.operatorId = currentUserId;
                log.debug("[工资查询] 员工权限限制: userId={} 只能查看自己的工资记录", currentUserId);
            }
        }

        List<Map<String, Object>> rows = scanRecordMapper.selectPayrollAggregation(
                q.orderId,
                q.orderNo,
                q.styleNo,
                q.operatorId,
                q.operatorName,
                q.scanType,
                q.processName,
                q.startTime,
                q.endTime,
                q.includeSettled);

        if (rows == null) {
            return List.of();
        }

        for (Map<String, Object> row : rows) {
            if (row == null) {
                continue;
            }
            Integer qty = toInt(row.get("quantity"));
            BigDecimal amount = toBigDecimal(row.get("totalAmount"));
            if (qty == null) {
                qty = 0;
            }
            if (amount == null) {
                amount = BigDecimal.ZERO;
            }
            BigDecimal up = qty > 0
                    ? amount.divide(BigDecimal.valueOf(qty), 2, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;
            row.put("unitPrice", up);
        }

        return rows;
    }

    @Transactional(rollbackFor = Exception.class)
    public PayrollSettlement generate(Map<String, Object> params) {
        TenantAssert.assertTenantContext(); // 工资结算必须有租户上下文
        PayrollQuery q = parseQuery(params, false, false);
        if (!StringUtils.hasText(q.orderId) && !StringUtils.hasText(q.orderNo)
                && q.startTime == null && q.endTime == null) {
            throw new IllegalArgumentException("参数错误");
        }

        List<Map<String, Object>> rows = scanRecordMapper.selectPayrollAggregation(
                q.orderId,
                q.orderNo,
                q.styleNo,
                q.operatorId,
                q.operatorName,
                q.scanType,
                null,
                q.startTime,
                q.endTime,
                q.includeSettled);

        if (rows == null || rows.isEmpty()) {
            throw new IllegalStateException("无可结算扫码记录");
        }

        LocalDateTime now = LocalDateTime.now();
        PayrollSettlement settlement = new PayrollSettlement();
        settlement.setSettlementNo(nextSettlementNo());
        settlement.setOrderId(q.orderId);
        settlement.setOrderNo(q.orderNo);
        settlement.setStyleNo(q.styleNo);
        settlement.setStartTime(q.startTime);
        settlement.setEndTime(q.endTime);
        settlement.setStatus("pending");
        settlement.setCreateTime(now);
        settlement.setUpdateTime(now);

        String uid = null;
        UserContext ctx = UserContext.get();
        if (ctx != null && StringUtils.hasText(ctx.getUserId())) {
            uid = ctx.getUserId().trim();
        }
        if (StringUtils.hasText(uid)) {
            settlement.setCreateBy(uid);
            settlement.setUpdateBy(uid);
        }

        int totalQty = 0;
        BigDecimal totalAmount = BigDecimal.ZERO;
        List<PayrollSettlementItem> items = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            if (row == null) {
                continue;
            }
            PayrollSettlementItem item = new PayrollSettlementItem();
            String opId = TextUtils.safeText(row.get("operatorId"));
            String opName = TextUtils.safeText(row.get("operatorName"));
            String processName = TextUtils.safeText(row.get("processName"));
            item.setOperatorId(StringUtils.hasText(opId) ? opId : "unknown");
            item.setOperatorName(StringUtils.hasText(opName) ? opName : "未知人员");
            item.setProcessName(StringUtils.hasText(processName) ? processName : "未知环节");
            Integer qty = toInt(row.get("quantity"));
            BigDecimal amount = toBigDecimal(row.get("totalAmount"));
            if (qty == null) {
                qty = 0;
            }
            if (amount == null) {
                amount = BigDecimal.ZERO;
            }
            item.setQuantity(qty);
            item.setTotalAmount(amount.setScale(2, RoundingMode.HALF_UP));
            BigDecimal up = qty > 0
                    ? amount.divide(BigDecimal.valueOf(qty), 2, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;
            item.setUnitPrice(up);
            item.setOrderId(TextUtils.safeText(row.get("orderId")));
            item.setOrderNo(TextUtils.safeText(row.get("orderNo")));
            item.setStyleNo(TextUtils.safeText(row.get("styleNo")));
            item.setScanType(TextUtils.safeText(row.get("scanType")));
            item.setCreateTime(now);
            item.setUpdateTime(now);
            items.add(item);
            totalQty += Math.max(0, qty);
            totalAmount = totalAmount.add(item.getTotalAmount());
        }

        settlement.setTotalQuantity(totalQty);
        settlement.setTotalAmount(totalAmount.setScale(2, RoundingMode.HALF_UP));

        payrollSettlementService.save(settlement);

        for (PayrollSettlementItem item : items) {
            item.setSettlementId(settlement.getId());
        }
        payrollSettlementItemService.saveBatch(items);

        LambdaUpdateWrapper<ScanRecord> uw = new LambdaUpdateWrapper<ScanRecord>()
                .set(ScanRecord::getSettlementStatus, "payroll_settled")
                .set(ScanRecord::getPayrollSettlementId, settlement.getId())
                .set(ScanRecord::getUpdateTime, now)
                .eq(ScanRecord::getScanResult, "success")
                .gt(ScanRecord::getQuantity, 0);

        if (!q.includeSettled) {
            uw.and(w -> w.isNull(ScanRecord::getPayrollSettlementId)
                    .or()
                    .eq(ScanRecord::getPayrollSettlementId, ""))
                    .and(w -> w.isNull(ScanRecord::getSettlementStatus)
                            .or()
                            .ne(ScanRecord::getSettlementStatus, "payroll_settled"));
        }
        if (StringUtils.hasText(q.orderId)) {
            uw.eq(ScanRecord::getOrderId, q.orderId);
        }
        if (StringUtils.hasText(q.orderNo)) {
            uw.eq(ScanRecord::getOrderNo, q.orderNo);
        }
        if (StringUtils.hasText(q.styleNo)) {
            uw.eq(ScanRecord::getStyleNo, q.styleNo);
        }
        if (StringUtils.hasText(q.operatorId)) {
            uw.eq(ScanRecord::getOperatorId, q.operatorId);
        }
        if (StringUtils.hasText(q.operatorName)) {
            uw.eq(ScanRecord::getOperatorName, q.operatorName);
        }
        if (StringUtils.hasText(q.scanType)) {
            uw.eq(ScanRecord::getScanType, q.scanType);
        } else {
            uw.in(ScanRecord::getScanType, java.util.Arrays.asList("production", "cutting"));
        }
        if (q.startTime != null) {
            uw.ge(ScanRecord::getScanTime, q.startTime);
        }
        if (q.endTime != null) {
            uw.le(ScanRecord::getScanTime, q.endTime);
        }
        scanRecordMapper.update(null, uw);

        return settlement;
    }

    private String nextSettlementNo() {
        String day = LocalDate.now().format(DAY_FMT);
        String prefix = "PS" + day;
        PayrollSettlement latest = payrollSettlementService
                .lambdaQuery()
                .likeRight(PayrollSettlement::getSettlementNo, prefix)
                .orderByDesc(PayrollSettlement::getSettlementNo)
                .last("limit 1")
                .one();
        int seq = resolveNextSeq(prefix, latest == null ? null : latest.getSettlementNo());
        for (int i = 0; i < 200; i++) {
            String candidate = prefix + "%03d".formatted(seq);
            Long cnt = payrollSettlementService.count(
                    new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<PayrollSettlement>()
                            .eq(PayrollSettlement::getSettlementNo, candidate));
            if (cnt == null || cnt == 0) {
                return candidate;
            }
            seq += 1;
        }
        String fallback = String.valueOf(System.nanoTime());
        String suffix = fallback.length() > 6 ? fallback.substring(fallback.length() - 6) : fallback;
        return prefix + suffix;
    }

    private int resolveNextSeq(String prefix, String latestValue) {
        if (!StringUtils.hasText(prefix) || !StringUtils.hasText(latestValue)) {
            return 1;
        }
        String v = latestValue.trim();
        if (!v.startsWith(prefix) || v.length() < prefix.length() + 3) {
            return 1;
        }
        String tail = v.substring(v.length() - 3);
        try {
            int n = Integer.parseInt(tail);
            return Math.max(1, n + 1);
        } catch (Exception e) {
            log.warn("Failed to parse payroll settlement sequence: prefix={}, latestValue={}", prefix, latestValue, e);
            return 1;
        }
    }

    private ProductionOrder resolveOrder(String orderId, String orderNo) {
        String id = TextUtils.safeText(orderId);
        if (StringUtils.hasText(id)) {
            ProductionOrder order = productionOrderService.getById(id);
            if (order != null && (order.getDeleteFlag() == null || order.getDeleteFlag() == 0)) {
                return order;
            }
        }
        String on = TextUtils.safeText(orderNo);
        if (!StringUtils.hasText(on)) {
            return null;
        }
        ProductionOrder order = productionOrderService
                .getOne(new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<ProductionOrder>()
                        .eq(ProductionOrder::getOrderNo, on)
                        .last("limit 1"));
        if (order != null && (order.getDeleteFlag() == null || order.getDeleteFlag() == 0)) {
            return order;
        }
        return null;
    }

    private PayrollQuery parseQuery(Map<String, Object> params, boolean includeProcessName, boolean includeSettledDefault) {
        Map<String, Object> safeParams = params == null ? new HashMap<>() : new HashMap<>(params);
        PayrollQuery q = new PayrollQuery();
        q.orderId = TextUtils.safeText(safeParams.get("orderId"));
        q.orderNo = TextUtils.safeText(safeParams.get("orderNo"));
        q.styleNo = TextUtils.safeText(safeParams.get("styleNo"));
        q.operatorId = TextUtils.safeText(safeParams.get("operatorId"));
        q.operatorName = TextUtils.safeText(safeParams.get("operatorName"));
        q.scanType = TextUtils.safeText(safeParams.get("scanType"));
        q.processName = includeProcessName ? TextUtils.safeText(safeParams.get("processName")) : null;
        q.includeSettled = safeParams.containsKey("includeSettled")
                ? isTruthy(safeParams.get("includeSettled"))
                : includeSettledDefault;

        q.startTime = parseDateTime(safeParams.get("startTime"));
        q.endTime = parseDateTime(safeParams.get("endTime"));
        if (q.startTime != null && q.endTime != null && q.endTime.isBefore(q.startTime)) {
            LocalDateTime tmp = q.startTime;
            q.startTime = q.endTime;
            q.endTime = tmp;
        }

        if (!StringUtils.hasText(q.orderId) && StringUtils.hasText(q.orderNo)) {
            ProductionOrder order = resolveOrder(q.orderId, q.orderNo);
            if (order != null) {
                q.orderId = TextUtils.safeText(order.getId());
                if (!StringUtils.hasText(q.styleNo)) {
                    q.styleNo = TextUtils.safeText(order.getStyleNo());
                }
            }
        }

        return q;
    }

    private LocalDateTime parseDateTime(Object raw) {
        if (raw == null) {
            return null;
        }
        String v = TextUtils.safeText(String.valueOf(raw));
        if (!StringUtils.hasText(v)) {
            return null;
        }
        try {
            if (v.length() == 10) {
                LocalDate d = LocalDate.parse(v);
                return d.atTime(LocalTime.of(0, 0));
            }
        } catch (Exception e) {
            log.warn("Failed to parse date: value={}", v, e);
        }
        List<DateTimeFormatter> fmts = List.of(
                DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"),
                DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"),
                DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        for (DateTimeFormatter f : fmts) {
            try {
                return LocalDateTime.parse(v, f);
            } catch (Exception e) {
                log.warn("Failed to parse date with formatter: value={}, formatter={}", v, f, e);
            }
        }
        try {
            return LocalDateTime.parse(v);
        } catch (Exception e) {
            log.warn("Failed to parse date: value={}", v, e);
        }
        return null;
    }

    private Integer toInt(Object raw) {
        if (raw == null) {
            return null;
        }
        if (raw instanceof Number number) {
            return number.intValue();
        }
        String v = TextUtils.safeText(String.valueOf(raw));
        if (!StringUtils.hasText(v)) {
            return null;
        }
        try {
            return Integer.parseInt(v);
        } catch (Exception e) {
            return null;
        }
    }

    private BigDecimal toBigDecimal(Object raw) {
        if (raw == null) {
            return null;
        }
        if (raw instanceof BigDecimal decimal) {
            return decimal;
        }
        if (raw instanceof Number number) {
            return BigDecimal.valueOf(number.doubleValue());
        }
        String v = TextUtils.safeText(String.valueOf(raw));
        if (!StringUtils.hasText(v)) {
            return null;
        }
        try {
            return new BigDecimal(v);
        } catch (Exception e) {
            return null;
        }
    }

    // 使用TextUtils.safeText()替代

    private static boolean isTruthy(Object value) {
        String v = TextUtils.safeText(value);
        if (!StringUtils.hasText(v)) {
            return false;
        }
        String n = v.trim().toLowerCase();
        return "1".equals(n) || "true".equals(n) || "yes".equals(n) || "y".equals(n) || "on".equals(n);
    }

    /**
     * 取消工资结算单
     * 只允许取消 pending 状态的结算单，取消后释放已关联的扫码记录
     *
     * @param settlementId 结算单ID
     * @param remark       取消原因
     */
    @Transactional(rollbackFor = Exception.class)
    public void cancel(String settlementId, String remark) {
        TenantAssert.assertTenantContext();
        if (!StringUtils.hasText(settlementId)) {
            throw new IllegalArgumentException("结算单ID不能为空");
        }
        PayrollSettlement settlement = payrollSettlementService.getById(settlementId.trim());
        if (settlement == null) {
            throw new NoSuchElementException("结算单不存在");
        }
        if (!"pending".equalsIgnoreCase(settlement.getStatus())) {
            throw new IllegalStateException("当前状态不允许取消，只有待审核(pending)状态可以取消");
        }

        // 更新结算单状态为 cancelled
        LambdaUpdateWrapper<PayrollSettlement> settlementUw = new LambdaUpdateWrapper<PayrollSettlement>()
                .set(PayrollSettlement::getStatus, "cancelled")
                .set(PayrollSettlement::getUpdateTime, LocalDateTime.now())
                .eq(PayrollSettlement::getId, settlementId.trim());
        payrollSettlementService.update(settlementUw);

        // 释放已关联的扫码记录（清除 payrollSettlementId 和 settlementStatus）
        ScanRecord release = new ScanRecord();
        release.setPayrollSettlementId("");
        release.setSettlementStatus("");
        release.setUpdateTime(LocalDateTime.now());
        LambdaUpdateWrapper<ScanRecord> scanUw = new LambdaUpdateWrapper<ScanRecord>()
                .set(ScanRecord::getPayrollSettlementId, null)
                .set(ScanRecord::getSettlementStatus, null)
                .set(ScanRecord::getUpdateTime, LocalDateTime.now())
                .eq(ScanRecord::getPayrollSettlementId, settlementId.trim());
        scanRecordMapper.update(new ScanRecord(), scanUw);
    }

    /**
     * 删除工资结算单
     * 只允许删除 cancelled 状态的结算单，同时删除明细
     *
     * @param settlementId 结算单ID
     */
    @Transactional(rollbackFor = Exception.class)
    public void delete(String settlementId) {
        TenantAssert.assertTenantContext();
        if (!StringUtils.hasText(settlementId)) {
            throw new IllegalArgumentException("结算单ID不能为空");
        }
        PayrollSettlement settlement = payrollSettlementService.getById(settlementId.trim());
        if (settlement == null) {
            throw new NoSuchElementException("结算单不存在");
        }
        if (!"cancelled".equalsIgnoreCase(settlement.getStatus())) {
            throw new IllegalStateException("只允许删除已取消(cancelled)的结算单，请先取消");
        }

        // 先删明细，再删主记录
        payrollSettlementItemService.deleteByOrderId(settlement.getOrderId());
        payrollSettlementService.removeById(settlementId.trim());
    }
}
