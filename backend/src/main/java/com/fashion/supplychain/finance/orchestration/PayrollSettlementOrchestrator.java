package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.common.util.TextUtils;
import com.fashion.supplychain.finance.entity.PayrollSettlement;
import com.fashion.supplychain.finance.entity.PayrollSettlementItem;
import com.fashion.supplychain.finance.entity.DeductionItem;
import com.fashion.supplychain.finance.mapper.DeductionItemMapper;
import com.fashion.supplychain.finance.service.PayrollSettlementItemService;
import com.fashion.supplychain.finance.service.PayrollSettlementService;
import com.fashion.supplychain.finance.orchestration.BillAggregationOrchestrator.BillPushRequest;
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

    @Autowired
    private BillAggregationOrchestrator billAggregationOrchestrator;

    @Autowired
    private DeductionItemMapper deductionItemMapper;

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
        // 工厂账号隔离：只能查看本工厂订单的工资结算
        java.util.List<String> factoryOrderIds = com.fashion.supplychain.common.DataPermissionHelper
                .getFactoryOrderIds(productionOrderService);
        if (factoryOrderIds != null && factoryOrderIds.isEmpty()) {
            return new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>();
        }
        if (factoryOrderIds != null) {
            java.util.Map<String, Object> mutable = new java.util.HashMap<>(params != null ? params : new java.util.HashMap<>());
            mutable.put("_factoryOrderIds", factoryOrderIds);
            return payrollSettlementService.queryPage(mutable);
        }
        return payrollSettlementService.queryPage(params);
    }

    public PayrollSettlement detail(String id) {
        TenantAssert.assertTenantContext();
        String sid = TextUtils.safeText(id);
        if (!StringUtils.hasText(sid)) {
            throw new IllegalArgumentException("参数错误");
        }
        Long tenantId = UserContext.tenantId();
        PayrollSettlement settlement = payrollSettlementService.lambdaQuery()
                .eq(PayrollSettlement::getId, sid)
                .eq(PayrollSettlement::getTenantId, tenantId)
                .one();
        if (settlement == null) {
            throw new NoSuchElementException("工资结算单不存在");
        }
        return settlement;
    }

    public List<PayrollSettlementItem> items(String settlementId) {
        TenantAssert.assertTenantContext();
        String sid = TextUtils.safeText(settlementId);
        if (!StringUtils.hasText(sid)) {
            throw new IllegalArgumentException("参数错误");
        }
        PayrollSettlement settlement = payrollSettlementService.lambdaQuery()
                .eq(PayrollSettlement::getId, sid)
                .eq(PayrollSettlement::getTenantId, UserContext.tenantId())
                .one();
        if (settlement == null) {
            throw new NoSuchElementException("工资结算单不存在");
        }
        return payrollSettlementItemService.lambdaQuery()
                .eq(PayrollSettlementItem::getSettlementId, sid)
                .orderByAsc(PayrollSettlementItem::getOperatorName)
                .orderByAsc(PayrollSettlementItem::getProcessName)
                .list();
    }

    private static final List<String> PAYROLL_SCAN_TYPES = List.of("production", "cutting", "pattern");

    public List<Map<String, Object>> operatorSummary(Map<String, Object> params) {
        TenantAssert.assertTenantContext();
        PayrollQuery q = parseQuery(params, true, true);

        if (UserContext.isWorker()) {
            String currentUserId = UserContext.userId();
            if (org.springframework.util.StringUtils.hasText(currentUserId)) {
                q.operatorId = currentUserId;
                log.debug("[工资查询] 员工权限限制: userId={} 只能查看自己的工资记录", currentUserId);
            }
        }

        List<String> effectiveScanTypes = StringUtils.hasText(q.scanType) ? null : PAYROLL_SCAN_TYPES;

        List<Map<String, Object>> rows = scanRecordMapper.selectPayrollAggregation(
                q.orderId,
                q.orderNo,
                q.styleNo,
                q.operatorId,
                q.operatorName,
                q.scanType,
                effectiveScanTypes,
                q.processName,
                q.startTime,
                q.endTime,
                q.includeSettled,
                com.fashion.supplychain.common.UserContext.tenantId());

        if (rows == null) {
            return List.of();
        }

        Map<String, Map<String, String>> orderNoToProcessCodeMap = buildProcessCodeMapFromRows(rows);

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

            String processCode = TextUtils.safeText(row.get("processCode"));
            String processName = TextUtils.safeText(row.get("processName"));
            if ((processCode.isEmpty() || processCode.equals(processName)) && !processName.isEmpty()) {
                String orderNo = TextUtils.safeText(row.get("orderNo"));
                Map<String, String> nameToCode = orderNoToProcessCodeMap.get(orderNo);
                if (nameToCode != null) {
                    String resolved = nameToCode.get(processName.trim());
                    if (resolved != null) row.put("processCode", resolved);
                }
            }
        }

        return rows;
    }

    @Transactional(rollbackFor = Exception.class)
    public PayrollSettlement generate(Map<String, Object> params) {
        TenantAssert.assertTenantContext();
        if (!UserContext.isSupervisorOrAbove()) {
            throw new org.springframework.security.access.AccessDeniedException("仅主管及以上可生成工资结算单");
        }
        PayrollQuery q = parseQuery(params, false, false);
        if (!StringUtils.hasText(q.orderId) && !StringUtils.hasText(q.orderNo)
                && q.startTime == null && q.endTime == null) {
            throw new IllegalArgumentException("参数错误");
        }

        List<Map<String, Object>> rows = scanRecordMapper.selectPayrollAggregation(
                q.orderId, q.orderNo, q.styleNo, q.operatorId, q.operatorName,
                q.scanType, PAYROLL_SCAN_TYPES, q.processName,
                q.startTime, q.endTime, q.includeSettled,
                com.fashion.supplychain.common.UserContext.tenantId());

        if (rows == null || rows.isEmpty()) {
            throw new IllegalStateException("无可结算扫码记录");
        }

        PayrollSettlement settlement = buildSettlement(q);
        List<PayrollSettlementItem> items = buildSettlementItems(rows, settlement);
        settlement.setTotalQuantity(items.stream().mapToInt(i -> Math.max(0, i.getQuantity() == null ? 0 : i.getQuantity())).sum());
        settlement.setTotalAmount(items.stream().map(PayrollSettlementItem::getTotalAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, RoundingMode.HALF_UP));
        settlement.setPaidAmount(BigDecimal.ZERO);
        settlement.setRemainingAmount(settlement.getTotalAmount());
        settlement.setDeductionAmount(BigDecimal.ZERO);
        settlement.setAdvanceAmount(BigDecimal.ZERO);
        settlement.setPaymentStatus("unpaid");

        payrollSettlementService.save(settlement);
        for (PayrollSettlementItem item : items) {
            item.setSettlementId(settlement.getId());
        }
        payrollSettlementItemService.saveBatch(items);
        markScanRecordsAsSettled(q, settlement.getId());

        return settlement;
    }

    private PayrollSettlement buildSettlement(PayrollQuery q) {
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
        return settlement;
    }

    private List<PayrollSettlementItem> buildSettlementItems(List<Map<String, Object>> rows, PayrollSettlement settlement) {
        Map<String, Map<String, String>> orderNoToProcessCodeMap = buildProcessCodeMapFromRows(rows);

        LocalDateTime now = LocalDateTime.now();
        List<PayrollSettlementItem> items = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            if (row == null) continue;
            PayrollSettlementItem item = new PayrollSettlementItem();
            String opId = TextUtils.safeText(row.get("operatorId"));
            String opName = TextUtils.safeText(row.get("operatorName"));
            String processName = TextUtils.safeText(row.get("processName"));
            item.setOperatorId(StringUtils.hasText(opId) ? opId : "unknown");
            item.setOperatorName(StringUtils.hasText(opName) ? opName : "未知人员");
            item.setProcessName(StringUtils.hasText(processName) ? processName : "未知环节");
            Integer qty = toInt(row.get("quantity"));
            BigDecimal amount = toBigDecimal(row.get("totalAmount"));
            if (qty == null) qty = 0;
            if (amount == null) amount = BigDecimal.ZERO;
            item.setQuantity(qty);
            item.setTotalAmount(amount.setScale(2, RoundingMode.HALF_UP));
            BigDecimal up = qty > 0
                    ? amount.divide(BigDecimal.valueOf(qty), 2, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;
            item.setUnitPrice(up);
            item.setOrderId(TextUtils.safeText(row.get("orderId")));
            item.setOrderNo(TextUtils.safeText(row.get("orderNo")));
            item.setStyleNo(TextUtils.safeText(row.get("styleNo")));
            item.setColor(TextUtils.safeText(row.get("color")));
            item.setSize(TextUtils.safeText(row.get("size")));

            String processCode = TextUtils.safeText(row.get("processCode"));
            if ((processCode.isEmpty() || processCode.equals(processName)) && !processName.isEmpty()) {
                String orderNo = TextUtils.safeText(row.get("orderNo"));
                Map<String, String> nameToCode = orderNoToProcessCodeMap.get(orderNo);
                if (nameToCode != null) {
                    String resolved = nameToCode.get(processName.trim());
                    if (resolved != null) processCode = resolved;
                }
            }
            item.setProcessCode(processCode);

            Object bundleNoRaw = row.get("cuttingBundleNo");
            if (bundleNoRaw instanceof Number num) {
                item.setCuttingBundleNo(num.intValue());
            }
            item.setScanType(TextUtils.safeText(row.get("scanType")));
            item.setCreateTime(now);
            item.setUpdateTime(now);
            items.add(item);
        }
        return items;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Map<String, String>> buildProcessCodeMapFromRows(List<Map<String, Object>> rows) {
        Map<String, Map<String, String>> result = new HashMap<>();
        java.util.Set<String> orderNos = new java.util.HashSet<>();
        for (Map<String, Object> row : rows) {
            String on = TextUtils.safeText(row.get("orderNo"));
            if (!on.isEmpty()) orderNos.add(on);
        }
        if (orderNos.isEmpty()) return result;
        try {
            List<ProductionOrder> orders = productionOrderService.list(
                    new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<ProductionOrder>()
                            .in("order_no", orderNos)
                            .eq("tenant_id", com.fashion.supplychain.common.UserContext.tenantId())
                            .last("LIMIT 5000"));
            for (ProductionOrder order : orders) {
                String wf = order.getProgressWorkflowJson();
                if (wf == null || wf.trim().isEmpty()) continue;
                try {
                    com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
                    Map<String, Object> workflow = mapper.readValue(wf, Map.class);
                    Object nodesObj = workflow.get("nodes");
                    if (!(nodesObj instanceof List)) continue;
                    List<Map<String, Object>> nodeList = (List<Map<String, Object>>) nodesObj;
                    Map<String, String> nameToCode = new HashMap<>();
                    for (Map<String, Object> node : nodeList) {
                        String name = node.get("name") != null ? node.get("name").toString().trim() : "";
                        String id = node.get("id") != null ? node.get("id").toString().trim() : "";
                        if (!name.isEmpty() && !id.isEmpty() && !id.equals(name)) {
                            nameToCode.put(name, id);
                        }
                    }
                    if (!nameToCode.isEmpty()) result.put(order.getOrderNo(), nameToCode);
                } catch (Exception e) {
                    // ignore
                }
            }
        } catch (Exception e) {
            // ignore
        }
        return result;
    }

    private void markScanRecordsAsSettled(PayrollQuery q, String settlementId) {
        LocalDateTime now = LocalDateTime.now();
        LambdaUpdateWrapper<ScanRecord> uw = new LambdaUpdateWrapper<ScanRecord>()
                .set(ScanRecord::getSettlementStatus, "payroll_settled")
                .set(ScanRecord::getPayrollSettlementId, settlementId)
                .set(ScanRecord::getUpdateTime, now)
                .eq(ScanRecord::getScanResult, "success")
                .gt(ScanRecord::getQuantity, 0)
                .eq(ScanRecord::getTenantId, UserContext.tenantId());
        if (!q.includeSettled) {
            uw.and(w -> w.isNull(ScanRecord::getPayrollSettlementId)
                    .or()
                    .eq(ScanRecord::getPayrollSettlementId, ""))
                    .and(w -> w.isNull(ScanRecord::getSettlementStatus)
                            .or()
                            .ne(ScanRecord::getSettlementStatus, "payroll_settled"));
        }
        if (StringUtils.hasText(q.orderId)) uw.eq(ScanRecord::getOrderId, q.orderId);
        if (StringUtils.hasText(q.orderNo)) uw.eq(ScanRecord::getOrderNo, q.orderNo);
        if (StringUtils.hasText(q.styleNo)) uw.eq(ScanRecord::getStyleNo, q.styleNo);
        if (StringUtils.hasText(q.operatorId)) uw.eq(ScanRecord::getOperatorId, q.operatorId);
        if (StringUtils.hasText(q.operatorName)) uw.eq(ScanRecord::getOperatorName, q.operatorName);
        if (StringUtils.hasText(q.scanType)) {
            uw.eq(ScanRecord::getScanType, q.scanType);
        } else {
            uw.in(ScanRecord::getScanType, java.util.Arrays.asList("production", "cutting", "pattern"));
        }
        if (q.startTime != null) uw.ge(ScanRecord::getScanTime, q.startTime);
        if (q.endTime != null) uw.le(ScanRecord::getScanTime, q.endTime);
        scanRecordMapper.update(null, uw);
    }


    private String nextSettlementNo() {
        String day = LocalDate.now().format(DAY_FMT);
        String prefix = "PS" + day;
        PayrollSettlement latest = payrollSettlementService
                .lambdaQuery()
                .eq(PayrollSettlement::getTenantId, UserContext.tenantId())
                .likeRight(PayrollSettlement::getSettlementNo, prefix)
                .orderByDesc(PayrollSettlement::getSettlementNo)
                .last("limit 1")
                .one();
        int seq = resolveNextSeq(prefix, latest == null ? null : latest.getSettlementNo());
        for (int i = 0; i < 200; i++) {
            String candidate = prefix + "%03d".formatted(seq);
            Long cnt = payrollSettlementService.count(
                    new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<PayrollSettlement>()
                            .eq(PayrollSettlement::getSettlementNo, candidate)
                            .eq(PayrollSettlement::getTenantId, UserContext.tenantId()));
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
            ProductionOrder order = productionOrderService.lambdaQuery()
                    .eq(ProductionOrder::getId, id)
                    .eq(ProductionOrder::getDeleteFlag, 0)
                    .one();
            if (order != null) {
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
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .last("limit 1"));
        if (order != null) {
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
            log.debug("[PayrollSettlement] parseInt failed: {}", v);
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
            return new BigDecimal(number.toString());
        }
        String v = TextUtils.safeText(String.valueOf(raw));
        if (!StringUtils.hasText(v)) {
            return null;
        }
        try {
            return new BigDecimal(v);
        } catch (Exception e) {
            log.debug("[PayrollSettlement] parseBigDecimal failed: {}", v);
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
     * 审核通过工资结算单
     * 只允许审核 pending 状态的结算单，标记已扫码记录 payrollSettled=true
     *
     * @param settlementId 结算单ID
     * @param remark       审核备注（可选）
     */
    @Transactional(rollbackFor = Exception.class)
    public void approve(String settlementId, String remark) {
        TenantAssert.assertTenantContext();
        if (!StringUtils.hasText(settlementId)) {
            throw new IllegalArgumentException("结算单ID不能为空");
        }
        PayrollSettlement settlement = payrollSettlementService.getById(settlementId.trim());
        if (settlement == null) {
            throw new NoSuchElementException("结算单不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(settlement.getTenantId(), "工资结算单");
        if (!"pending".equalsIgnoreCase(settlement.getStatus())) {
            throw new IllegalStateException("当前状态不允许审核，只有待审核(pending)状态可以审核通过");
        }

        LocalDateTime now = LocalDateTime.now();
        String confirmerId = null;
        String confirmerName = null;
        UserContext ctx = UserContext.get();
        if (ctx != null) {
            confirmerId = StringUtils.hasText(ctx.getUserId()) ? ctx.getUserId().trim() : null;
            confirmerName = ctx.getUsername();
        }

        LambdaUpdateWrapper<PayrollSettlement> uw = new LambdaUpdateWrapper<PayrollSettlement>()
                .set(PayrollSettlement::getStatus, "approved")
                .set(PayrollSettlement::getConfirmerId, confirmerId)
                .set(PayrollSettlement::getConfirmerName, confirmerName)
                .set(PayrollSettlement::getConfirmTime, now)
                .set(PayrollSettlement::getUpdateTime, now)
                .eq(PayrollSettlement::getId, settlementId.trim());
        if (StringUtils.hasText(remark)) {
            uw.set(PayrollSettlement::getRemark, remark.trim());
        }
        payrollSettlementService.update(uw);

        // 确认关联扫码记录的结算状态（payrollSettlementId 已在 generate() 时绑定）
        // 审核通过后 payrollSettlementId 保持不变，undo 操作会据此阻止撤回
        Long tenantId = UserContext.tenantId();
        LambdaUpdateWrapper<ScanRecord> scanUw = new LambdaUpdateWrapper<ScanRecord>()
                .set(ScanRecord::getSettlementStatus, "payroll_approved")
                .set(ScanRecord::getUpdateTime, now)
                .eq(ScanRecord::getPayrollSettlementId, settlementId.trim())
                .eq(ScanRecord::getTenantId, tenantId);
        scanRecordMapper.update(new ScanRecord(), scanUw);

        log.info("[PayrollApprove] 工资结算单审核通过: id={}, confirmerId={}", settlementId, confirmerId);

        if (billAggregationOrchestrator != null) {
            BillPushRequest pushReq = new BillPushRequest();
            pushReq.setBillType("PAYABLE");
            pushReq.setBillCategory("PAYROLL");
            pushReq.setSourceType("PAYROLL_SETTLEMENT");
            pushReq.setSourceId(settlementId.trim());
            pushReq.setSourceNo(settlement.getSettlementNo());
            pushReq.setCounterpartyType("WORKER");
            pushReq.setOrderId(settlement.getOrderId());
            pushReq.setOrderNo(settlement.getOrderNo());
            pushReq.setStyleNo(settlement.getStyleNo());
            pushReq.setAmount(settlement.getTotalAmount());
            pushReq.setSettlementMonth(now.format(DateTimeFormatter.ofPattern("yyyy-MM")));
            billAggregationOrchestrator.pushBill(pushReq);
        }
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
        TenantAssert.assertBelongsToCurrentTenant(settlement.getTenantId(), "工资结算单");
        if (!"pending".equalsIgnoreCase(settlement.getStatus())) {
            throw new IllegalStateException("当前状态不允许取消，只有待审核(pending)状态可以取消");
        }

        // 更新结算单状态为 cancelled
        LambdaUpdateWrapper<PayrollSettlement> settlementUw = new LambdaUpdateWrapper<PayrollSettlement>()
                .set(PayrollSettlement::getStatus, "cancelled")
                .set(PayrollSettlement::getUpdateTime, LocalDateTime.now())
                .eq(PayrollSettlement::getId, settlementId.trim());
        payrollSettlementService.update(settlementUw);

        LambdaUpdateWrapper<ScanRecord> scanUw = new LambdaUpdateWrapper<ScanRecord>()
                .set(ScanRecord::getPayrollSettlementId, null)
                .set(ScanRecord::getSettlementStatus, null)
                .set(ScanRecord::getUpdateTime, LocalDateTime.now())
                .eq(ScanRecord::getPayrollSettlementId, settlementId.trim())
                .eq(ScanRecord::getTenantId, settlement.getTenantId());
        scanRecordMapper.update(new ScanRecord(), scanUw);

        try {
            if (billAggregationOrchestrator != null) {
                billAggregationOrchestrator.cancelBySource("PAYROLL_SETTLEMENT", settlementId.trim());
            }
        } catch (Exception e) {
            log.warn("工资结算取消联动账单取消失败（不影响主流程）: settlementId={}, err={}", settlementId, e.getMessage());
        }
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
        TenantAssert.assertBelongsToCurrentTenant(settlement.getTenantId(), "工资结算单");
        if (!"cancelled".equalsIgnoreCase(settlement.getStatus())) {
            throw new IllegalStateException("只允许删除已取消(cancelled)的结算单，请先取消");
        }

        // 先删明细，再删主记录
        payrollSettlementItemService.deleteBySettlementId(settlementId.trim());
        payrollSettlementService.removeById(settlementId.trim());
    }

    @Transactional(rollbackFor = Exception.class)
    public void recordPayment(String settlementId, BigDecimal paymentAmount) {
        TenantAssert.assertTenantContext();
        if (!StringUtils.hasText(settlementId)) {
            throw new IllegalArgumentException("结算单ID不能为空");
        }
        if (paymentAmount == null || paymentAmount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("打款金额必须大于0");
        }
        PayrollSettlement settlement = payrollSettlementService.getById(settlementId.trim());
        if (settlement == null) {
            throw new NoSuchElementException("结算单不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(settlement.getTenantId(), "工资结算单");
        if (!"approved".equalsIgnoreCase(settlement.getStatus())) {
            throw new IllegalStateException("只有已审核(approved)的结算单可打款");
        }

        BigDecimal currentPaid = settlement.getPaidAmount() != null ? settlement.getPaidAmount() : BigDecimal.ZERO;
        BigDecimal currentRemaining = settlement.getRemainingAmount() != null ? settlement.getRemainingAmount() : settlement.getTotalAmount();
        if (paymentAmount.compareTo(currentRemaining) > 0) {
            throw new IllegalArgumentException("打款金额不能超过剩余未付金额: " + currentRemaining);
        }

        BigDecimal newPaid = currentPaid.add(paymentAmount);
        BigDecimal newRemaining = settlement.getTotalAmount().subtract(newPaid);
        String newPaymentStatus;
        if (newRemaining.compareTo(BigDecimal.ZERO) == 0) {
            newPaymentStatus = "fully_paid";
        } else {
            newPaymentStatus = "partially_paid";
        }

        LambdaUpdateWrapper<PayrollSettlement> uw = new LambdaUpdateWrapper<PayrollSettlement>()
                .set(PayrollSettlement::getPaidAmount, newPaid)
                .set(PayrollSettlement::getRemainingAmount, newRemaining)
                .set(PayrollSettlement::getPaymentStatus, newPaymentStatus)
                .set(PayrollSettlement::getUpdateTime, LocalDateTime.now())
                .eq(PayrollSettlement::getId, settlementId.trim());
        payrollSettlementService.update(uw);

        log.info("[PayrollPayment] 工资打款记录: settlementId={}, paymentAmount={}, totalPaid={}, remaining={}",
                settlementId, paymentAmount, newPaid, newRemaining);
    }

    @Transactional(rollbackFor = Exception.class)
    public void applyDeduction(String settlementId, BigDecimal deductionAmount, String deductionType, String description) {
        TenantAssert.assertTenantContext();
        if (!StringUtils.hasText(settlementId)) {
            throw new IllegalArgumentException("结算单ID不能为空");
        }
        if (deductionAmount == null || deductionAmount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("扣款金额必须大于0");
        }
        PayrollSettlement settlement = payrollSettlementService.getById(settlementId.trim());
        if (settlement == null) {
            throw new NoSuchElementException("结算单不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(settlement.getTenantId(), "工资结算单");

        BigDecimal currentDeduction = settlement.getDeductionAmount() != null ? settlement.getDeductionAmount() : BigDecimal.ZERO;
        BigDecimal newDeduction = currentDeduction.add(deductionAmount);
        BigDecimal newRemaining = settlement.getTotalAmount().subtract(newDeduction)
                .subtract(settlement.getPaidAmount() != null ? settlement.getPaidAmount() : BigDecimal.ZERO)
                .subtract(settlement.getAdvanceAmount() != null ? settlement.getAdvanceAmount() : BigDecimal.ZERO);
        if (newRemaining.compareTo(BigDecimal.ZERO) < 0) {
            newRemaining = BigDecimal.ZERO;
        }

        DeductionItem deduction = new DeductionItem();
        deduction.setSettlementId(settlementId.trim());
        deduction.setDeductionType(deductionType);
        deduction.setDeductionAmount(deductionAmount);
        deduction.setDescription(description);
        deduction.setSourceType("PAYROLL_SETTLEMENT");
        deduction.setSourceId(settlementId.trim());
        com.fashion.supplychain.common.UserContext ctx = com.fashion.supplychain.common.UserContext.get();
        if (ctx != null) {
            deduction.setTenantId(ctx.tenantId());
        }
        deductionItemMapper.insert(deduction);

        LambdaUpdateWrapper<PayrollSettlement> uw = new LambdaUpdateWrapper<PayrollSettlement>()
                .set(PayrollSettlement::getDeductionAmount, newDeduction)
                .set(PayrollSettlement::getRemainingAmount, newRemaining)
                .set(PayrollSettlement::getUpdateTime, LocalDateTime.now())
                .eq(PayrollSettlement::getId, settlementId.trim());
        payrollSettlementService.update(uw);

        log.info("[PayrollDeduction] 工资扣款: settlementId={}, type={}, amount={}, totalDeduction={}",
                settlementId, deductionType, deductionAmount, newDeduction);
    }
}
