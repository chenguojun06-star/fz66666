package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.DataPermissionHelper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.crm.orchestration.ReceivableOrchestrator;
import com.fashion.supplychain.finance.constant.BillConstants;
import com.fashion.supplychain.finance.entity.BillAggregation;
import com.fashion.supplychain.finance.entity.ExpenseReimbursement;
import com.fashion.supplychain.finance.entity.MaterialReconciliation;
import com.fashion.supplychain.finance.entity.Payable;
import com.fashion.supplychain.finance.entity.ShipmentReconciliation;
import com.fashion.supplychain.finance.entity.WagePayment;
import com.fashion.supplychain.finance.service.WagePaymentService;
import com.fashion.supplychain.finance.service.BillAggregationService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.TimeUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 账单汇总编排器 — 统一收付款账单聚合
 * <p>
 * 核心职责：
 * 1. pushBill() — 各模块审批通过后推送账单（幂等，uk_source去重）
 * 2. listBills() — 分页查询账单列表
 * 3. confirmBill() / batchConfirm() — 账单确认
 * 4. settleBill() — 账单结清
 * 5. cancelBill() — 取消账单
 * 6. getStats() — 统计数据（各状态金额汇总）
 */
@Slf4j
@Service
public class BillAggregationOrchestrator {

    /**
     * D-474：历史数据里的占位往来对象 ID（上游推送时拿不到真实供应商 ID 写死的）。
     * 这些值不能作为分组依据，否则不同对象会被合并成一行。
     */
    private static final java.util.Set<String> PLACEHOLDER_COUNTERPARTY_IDS =
            java.util.Collections.unmodifiableSet(new java.util.HashSet<>(java.util.Arrays.asList(
                    "UNKNOWN_SUPPLIER", "UNKNOWN", "UNKNOWN_FACTORY", "UNKNOWN_CUSTOMER", "UNKNOWN_WORKER")));

    @Autowired
    private BillAggregationService billAggregationService;

    @Autowired(required = false)
    private PayableOrchestrator payableOrchestrator;

    @Autowired(required = false)
    private ReceivableOrchestrator receivableOrchestrator;

    @Autowired(required = false)
    private ProductionOrderService productionOrderService;

    @Autowired(required = false)
    private AccountingVoucherOrchestrator accountingVoucherOrchestrator;

    // D-473：结清时补记付款记录（可选注入，避免循环依赖与单元测试困扰）
    @Autowired(required = false)
    private WagePaymentOrchestrator wagePaymentOrchestrator;

    @Autowired(required = false)
    private WagePaymentService wagePaymentService;

    // D-474：重复付款幂等（30 秒内同账单+同用户+同金额只执行一次，防止网络重试导致的重复记账）
    @Autowired(required = false)
    private org.springframework.data.redis.core.StringRedisTemplate stringRedisTemplate;

    // D-474：付清后回写上游单据（可选注入，避免循环依赖与单元测试困扰）
    @Autowired(required = false)
    private com.fashion.supplychain.finance.service.MaterialReconciliationService materialReconciliationService;

    @Autowired(required = false)
    private com.fashion.supplychain.finance.service.ShipmentReconciliationService shipmentReconciliationService;

    @Autowired(required = false)
    private com.fashion.supplychain.finance.service.ExpenseReimbursementService expenseReimbursementService;

    @Autowired(required = false)
    private com.fashion.supplychain.style.service.SecondaryProcessService secondaryProcessService;

    /**
     * 获取当前工厂账号的订单ID列表（用于工厂账号数据隔离）
     * 非工厂账号返回 null（表示不限制）
     */
    private List<String> getFactoryOrderIdsOrNull() {
        if (!DataPermissionHelper.isFactoryAccount()) {
            return null;
        }
        if (productionOrderService == null) {
            return Collections.emptyList();
        }
        List<String> ids = productionOrderService.list(
                new LambdaQueryWrapper<ProductionOrder>()
                        .select(ProductionOrder::getId)
                        .eq(ProductionOrder::getFactoryId, UserContext.factoryId())
                        .and(w -> w.isNull(ProductionOrder::getDeleteFlag)
                                .or().eq(ProductionOrder::getDeleteFlag, 0))
        ).stream().map(ProductionOrder::getId).collect(Collectors.toList());
        return ids;
    }

    // ==================== 1. 账单推送（各模块调用） ====================

    /**
     * 推送账单到汇总表（幂等 — 基于 source_type + source_id + tenant_id 唯一索引）
     */
    public boolean billExists(String sourceType, String sourceId) {
        Long tenantId = TenantAssert.requireTenantId();
        return billAggregationService.lambdaQuery()
                .eq(BillAggregation::getSourceType, sourceType)
                .eq(BillAggregation::getSourceId, sourceId)
                .eq(BillAggregation::getTenantId, tenantId)
                .eq(BillAggregation::getDeleteFlag, 0)
                .exists();
    }

    public boolean billExistsByOrderId(String sourceType, String orderId) {
        Long tenantId = TenantAssert.requireTenantId();
        return billAggregationService.lambdaQuery()
                .eq(BillAggregation::getSourceType, sourceType)
                .eq(BillAggregation::getOrderId, orderId)
                .eq(BillAggregation::getTenantId, tenantId)
                .eq(BillAggregation::getDeleteFlag, 0)
                .exists();
    }

    public void syncAmountBySource(String sourceType, String sourceId, BigDecimal newAmount) {
        if (!StringUtils.hasText(sourceType) || !StringUtils.hasText(sourceId) || newAmount == null) {
            return;
        }
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        BillAggregation bill = billAggregationService.lambdaQuery()
                .eq(BillAggregation::getSourceType, sourceType)
                .eq(BillAggregation::getSourceId, sourceId)
                .eq(BillAggregation::getTenantId, tenantId)
                .eq(BillAggregation::getDeleteFlag, 0)
                .last("LIMIT 1")
                .one();
        if (bill != null && !BillConstants.isTerminalStatus(bill.getStatus())) {
            bill.setAmount(newAmount);
            billAggregationService.updateById(bill);
            log.info("[BillAggregation] 同步金额: sourceType={}, sourceId={}, newAmount={}, billStatus={}", sourceType, sourceId, newAmount, bill.getStatus());
        }
    }

    /**
     * 同步账单已结算金额（用于部分还款/部分付款场景）
     * <p>
     * P0-2 修复：员工借支还款、工资结算部分付款等场景需要联动更新 BillAggregation.settledAmount
     * - 仅更新 settledAmount，不改变 status
     * - 若 newSettledAmount >= amount 且状态为 CONFIRMED/SETTLING，自动流转为 SETTLED
     * - 终态（SETTLED/CANCELLED）账单不更新
     *
     * @param sourceType       来源类型
     * @param sourceId         来源ID
     * @param newSettledAmount 新的已结算金额
     */
    @Transactional(rollbackFor = Exception.class)
    public void syncSettledAmountBySource(String sourceType, String sourceId, BigDecimal newSettledAmount) {
        if (!StringUtils.hasText(sourceType) || !StringUtils.hasText(sourceId) || newSettledAmount == null) {
            return;
        }
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        BillAggregation bill = billAggregationService.lambdaQuery()
                .eq(BillAggregation::getSourceType, sourceType)
                .eq(BillAggregation::getSourceId, sourceId)
                .eq(BillAggregation::getTenantId, tenantId)
                .eq(BillAggregation::getDeleteFlag, 0)
                .last("LIMIT 1")
                .one();
        if (bill == null || BillConstants.isTerminalStatus(bill.getStatus())) {
            return;
        }
        bill.setSettledAmount(newSettledAmount);
        // 已结算金额 ≥ 账单金额 → 自动结清
        BigDecimal amount = bill.getAmount() != null ? bill.getAmount() : BigDecimal.ZERO;
        if (newSettledAmount.compareTo(amount) >= 0
                && BillConstants.isConfirmedGroup(bill.getStatus())) {
            bill.setStatus(BillConstants.STATUS_SETTLED);
            bill.setSettledById(UserContext.userId());
            bill.setSettledByName(UserContext.username());
            bill.setSettledAt(LocalDateTime.now());
            log.info("[BillAggregation] 部分还款累计达到账单金额，自动结清: billNo={}, amount={}, settled={}",
                    bill.getBillNo(), amount, newSettledAmount);
        }
        billAggregationService.updateById(bill);
        log.info("[BillAggregation] 同步已结算金额: sourceType={}, sourceId={}, newSettled={}, billStatus={}",
                sourceType, sourceId, newSettledAmount, bill.getStatus());
    }

    @Transactional(rollbackFor = Exception.class)
    public BillAggregation pushBill(BillPushRequest request) {
        Long tenantId = TenantAssert.requireTenantId();

        // 幂等检查：同来源不重复推送
        BillAggregation existing = billAggregationService.lambdaQuery()
                .eq(BillAggregation::getSourceType, request.getSourceType())
                .eq(BillAggregation::getSourceId, request.getSourceId())
                .eq(BillAggregation::getTenantId, tenantId)
                .eq(BillAggregation::getDeleteFlag, 0)
                .one();
        if (existing != null) {
            if (request.getAmount() != null && existing.getAmount() != null
                    && request.getAmount().compareTo(existing.getAmount()) != 0
                    && !BillConstants.isTerminalStatus(existing.getStatus())) {
                existing.setAmount(request.getAmount());
                existing.setRemark((existing.getRemark() != null ? existing.getRemark() + " | " : "")
                        + "金额同步更新: " + existing.getAmount() + "→" + request.getAmount());
                billAggregationService.updateById(existing);
                log.info("[BillAggregation] 账单金额同步: billNo={}, old={}, new={}",
                        existing.getBillNo(), existing.getAmount(), request.getAmount());
            }
            log.info("[BillAggregation] 账单已存在: sourceType={}, sourceId={}, billNo={}",
                    request.getSourceType(), request.getSourceId(), existing.getBillNo());
            return existing;
        }

        BillAggregation bill = new BillAggregation();
        bill.setBillNo(generateBillNo());
        bill.setBillType(request.getBillType());
        bill.setBillCategory(request.getBillCategory());
        bill.setSourceType(request.getSourceType());
        bill.setSourceId(request.getSourceId());
        bill.setSourceNo(request.getSourceNo());
        // D-473：类型归一化（EMPLOYEE 等同 WORKER），避免同一员工在总账里拆成两行
        bill.setCounterpartyType(normalizeCounterpartyType(request.getCounterpartyType()));
        bill.setCounterpartyId(request.getCounterpartyId());
        bill.setCounterpartyName(request.getCounterpartyName());
        bill.setOrderId(request.getOrderId());
        bill.setOrderNo(request.getOrderNo());
        bill.setStyleNo(request.getStyleNo());
        bill.setAmount(request.getAmount());
        bill.setSettledAmount(BigDecimal.ZERO);
        bill.setStatus(BillConstants.STATUS_PENDING);
        bill.setSettlementMonth(request.getSettlementMonth());
        bill.setRemark(request.getRemark());
        bill.setCreatorId(UserContext.userId());
        bill.setCreatorName(UserContext.username());
        bill.setTenantId(tenantId);
        bill.setDeleteFlag(0);

        billAggregationService.save(bill);
        log.info("[BillAggregation] 推送账单: billNo={}, type={}, category={}, amount={}, source={}:{}",
                bill.getBillNo(), bill.getBillType(), bill.getBillCategory(),
                bill.getAmount(), bill.getSourceType(), bill.getSourceId());
        return bill;
    }

    // ==================== 2. 查询 ====================

    /**
     * 分页查询账单列表
     * 支持按创建时间范围过滤(new: createTimeStart / createTimeEnd)
     * 同时保持向后兼容 settlementMonth 单月筛选
     */
    public Page<BillAggregation> listBills(BillQueryRequest query) {
        Long tenantId = TenantAssert.requireTenantId();
        Page<BillAggregation> page = new Page<>(query.getPageNum(), query.getPageSize());

        // P0 修复：工厂账号只能看到本工厂订单关联的账单
        List<String> factoryOrderIds = getFactoryOrderIdsOrNull();
        if (factoryOrderIds != null && factoryOrderIds.isEmpty()) {
            return new Page<>(query.getPageNum(), query.getPageSize());
        }

        LambdaQueryWrapper<BillAggregation> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(BillAggregation::getTenantId, tenantId)
                .eq(BillAggregation::getDeleteFlag, 0)
                .eq(StringUtils.hasText(query.getBillType()), BillAggregation::getBillType, query.getBillType())
                .eq(StringUtils.hasText(query.getBillCategory()), BillAggregation::getBillCategory, query.getBillCategory())
                // 状态分组必须与 getStats 的 switch 分组保持一致，否则会出现"统计数≠列表数"的 P0 bug
                // CONFIRMED 分类包含 SETTLING（结算中）；SETTLED 分类独立；PENDING/CANCELLED 各自独立
                .and(StringUtils.hasText(query.getStatus()), w -> {
                    String s = query.getStatus();
                    if (BillConstants.STATUS_CONFIRMED.equals(s)) {
                        w.in(BillAggregation::getStatus, BillConstants.STATUS_CONFIRMED, BillConstants.STATUS_SETTLING);
                    } else {
                        w.eq(BillAggregation::getStatus, s);
                    }
                })
                .eq(StringUtils.hasText(query.getSettlementMonth()), BillAggregation::getSettlementMonth, query.getSettlementMonth())
                .eq(StringUtils.hasText(query.getCounterpartyId()), BillAggregation::getCounterpartyId, query.getCounterpartyId())
                .like(StringUtils.hasText(query.getCounterpartyName()), BillAggregation::getCounterpartyName, query.getCounterpartyName())
                .like(StringUtils.hasText(query.getOrderNo()), BillAggregation::getOrderNo, query.getOrderNo())
                // 日期范围过滤：若传入创建时间范围，则过滤 createTime 在该范围内的账单
                .ge(StringUtils.hasText(query.getCreateTimeStart()), BillAggregation::getCreateTime, query.getCreateTimeStart())
                .le(StringUtils.hasText(query.getCreateTimeEnd()), BillAggregation::getCreateTime, query.getCreateTimeEnd())
                // P0 修复：工厂账号通过 orderId 列表过滤，与 stats 数据范围对齐
                .in(factoryOrderIds != null, BillAggregation::getOrderId, factoryOrderIds)
                .orderByDesc(BillAggregation::getCreateTime);

        return billAggregationService.page(page, wrapper);
    }

    /**
     * 统计各状态汇总
     */
    public Map<String, Object> getStats(String billType) {
        Long tenantId = TenantAssert.requireTenantId();

        // P0 修复：工厂账号 stats 与 list 数据范围对齐（通过 orderId 列表过滤）
        List<String> factoryOrderIds = getFactoryOrderIdsOrNull();
        if (factoryOrderIds != null && factoryOrderIds.isEmpty()) {
            Map<String, Object> empty = new HashMap<>();
            empty.put("pendingAmount", BigDecimal.ZERO);
            empty.put("pendingCount", 0);
            empty.put("confirmedAmount", BigDecimal.ZERO);
            empty.put("confirmedCount", 0);
            empty.put("settledAmount", BigDecimal.ZERO);
            empty.put("settledCount", 0);
            empty.put("totalCount", 0);
            return empty;
        }

        List<BillAggregation> all = billAggregationService.lambdaQuery()
                .eq(BillAggregation::getTenantId, tenantId)
                .eq(BillAggregation::getDeleteFlag, 0)
                .eq(StringUtils.hasText(billType), BillAggregation::getBillType, billType)
                .in(factoryOrderIds != null, BillAggregation::getOrderId, factoryOrderIds)
                .select(BillAggregation::getStatus, BillAggregation::getAmount, BillAggregation::getSettledAmount)
                .last("LIMIT 5000")
                .list();

        BigDecimal pendingAmount = BigDecimal.ZERO;
        BigDecimal confirmedAmount = BigDecimal.ZERO;
        BigDecimal settledAmount = BigDecimal.ZERO;
        int pendingCount = 0, confirmedCount = 0, settledCount = 0, totalCount = all.size();

        for (BillAggregation b : all) {
            BigDecimal amt = b.getAmount() != null ? b.getAmount() : BigDecimal.ZERO;
            if (b.getStatus() == null) continue;
            switch (b.getStatus()) {
                case BillConstants.STATUS_PENDING:
                    pendingAmount = pendingAmount.add(amt);
                    pendingCount++;
                    break;
                case BillConstants.STATUS_CONFIRMED:
                case BillConstants.STATUS_SETTLING:
                    confirmedAmount = confirmedAmount.add(amt);
                    confirmedCount++;
                    break;
                case BillConstants.STATUS_SETTLED:
                    settledAmount = settledAmount.add(b.getSettledAmount() != null ? b.getSettledAmount() : amt);
                    settledCount++;
                    break;
                default:
                    break;
            }
        }

        Map<String, Object> stats = new HashMap<>();
        stats.put("pendingAmount", pendingAmount);
        stats.put("pendingCount", pendingCount);
        stats.put("confirmedAmount", confirmedAmount);
        stats.put("confirmedCount", confirmedCount);
        stats.put("settledAmount", settledAmount);
        stats.put("settledCount", settledCount);
        stats.put("totalCount", totalCount);
        return stats;
    }

    // ==================== 2.5 往来总账：按对象聚合（D-472） ====================

    /**
     * D-472 往来总账：按往来对象（员工/工厂/供应商/客户）聚合账单。
     * 付款中心主列表"一行=一个对象"——不管上游推送多少笔，都累计到该对象名下；
     * 点击对象进详情看全部流水（listBills + counterpartyId）。
     * 口径：排除已取消；累计=SUM(amount)，已结=SUM(settled_amount)，未结=累计-已结。
     */
    /**
     * D-473 往来对象类型归一化：历史数据里员工有 EMPLOYEE / WORKER 两种写法，
     * 统一成 WORKER，保证"一个员工一行"不被拆成两行。
     */
    private String normalizeCounterpartyType(String type) {
        if (!StringUtils.hasText(type)) {
            return type;
        }
        String upper = type.trim().toUpperCase();
        return "EMPLOYEE".equals(upper) ? "WORKER" : upper;
    }

    public List<CounterpartyGroupDTO> listCounterpartyGroups(String billType, String settlementMonth, String keyword) {
        Long tenantId = TenantAssert.requireTenantId();

        // 工厂账号数据范围与 listBills/getStats 对齐（P0）
        List<String> factoryOrderIds = getFactoryOrderIdsOrNull();
        if (factoryOrderIds != null && factoryOrderIds.isEmpty()) {
            return Collections.emptyList();
        }

        List<BillAggregation> all = billAggregationService.lambdaQuery()
                .eq(BillAggregation::getTenantId, tenantId)
                .eq(BillAggregation::getDeleteFlag, 0)
                .eq(StringUtils.hasText(billType), BillAggregation::getBillType, billType)
                .eq(StringUtils.hasText(settlementMonth), BillAggregation::getSettlementMonth, settlementMonth)
                .ne(BillAggregation::getStatus, BillConstants.STATUS_CANCELLED)
                .in(factoryOrderIds != null, BillAggregation::getOrderId, factoryOrderIds)
                // D-474：多选 status，用于在汇总行上展示"结算中/待确认"笔数
                .select(BillAggregation::getCounterpartyType, BillAggregation::getCounterpartyId,
                        BillAggregation::getCounterpartyName, BillAggregation::getAmount,
                        BillAggregation::getSettledAmount, BillAggregation::getStatus)
                .last("LIMIT 5000")
                .list();

        // 分组键：type + id（id 为空的历史数据用名字兜底），keyword 作用于对象名（整组显示）
        Map<String, CounterpartyGroupDTO> grouped = new LinkedHashMap<>();
        for (BillAggregation b : all) {
            String name = b.getCounterpartyName();
            if (StringUtils.hasText(keyword) && (name == null || !name.contains(keyword))) {
                continue;
            }
            // D-473：分组键与展示类型统一走归一化（EMPLOYEE→WORKER）
            String normalizedType = normalizeCounterpartyType(b.getCounterpartyType());
            // D-474：占位符 ID（UNKNOWN_SUPPLIER）会让不同供应商被合并成同一个对象
            // （例如"最美服装工厂"与"测试工厂_7C6RMQ"的 ID 都是 UNKNOWN_SUPPLIER）。
            // 这里识别占位符/空 ID，改用名称分组，保证不同对象不会被错误合并。
            String cid = b.getCounterpartyId();
            boolean hasRealId = StringUtils.hasText(cid) && !PLACEHOLDER_COUNTERPARTY_IDS.contains(cid.trim().toUpperCase());
            String key = normalizedType + "|" + (hasRealId ? cid : name);
            CounterpartyGroupDTO g = grouped.computeIfAbsent(key, k -> {
                CounterpartyGroupDTO dto = new CounterpartyGroupDTO();
                dto.setCounterpartyType(normalizedType);
                dto.setCounterpartyId(b.getCounterpartyId());
                dto.setCounterpartyName(name);
                dto.setBillCount(0);
                dto.setTotalAmount(BigDecimal.ZERO);
                dto.setSettledAmount(BigDecimal.ZERO);
                return dto;
            });
            g.setBillCount(g.getBillCount() + 1);
            // D-474：挂账（部分付款未付满）与待确认分别计数
            if (BillConstants.STATUS_SETTLING.equals(b.getStatus())) {
                g.setSettlingCount(g.getSettlingCount() + 1);
            } else if (BillConstants.STATUS_PENDING.equals(b.getStatus())) {
                g.setPendingCount(g.getPendingCount() + 1);
            }
            BigDecimal amt = b.getAmount() != null ? b.getAmount() : BigDecimal.ZERO;
            g.setTotalAmount(g.getTotalAmount().add(amt));
            g.setSettledAmount(g.getSettledAmount()
                    .add(b.getSettledAmount() != null ? b.getSettledAmount() : BigDecimal.ZERO));
        }

        List<CounterpartyGroupDTO> result = new ArrayList<>(grouped.values());
        for (CounterpartyGroupDTO g : result) {
            g.setUnsettledAmount(g.getTotalAmount().subtract(g.getSettledAmount()));
        }
        result.sort(Comparator.comparing(CounterpartyGroupDTO::getTotalAmount).reversed());
        return result;
    }

    /**
     * D-472 批量结清（详情页"批量付款 / 整月合并付款"）：事务内逐笔按全额结清，
     * 不可结清（待确认/已结清/已取消）的账单跳过并记日志，与 batchConfirm 容错模式一致。
     */
    @Transactional(rollbackFor = Exception.class)
    public int batchSettle(List<String> billIds) {
        int count = 0;
        for (String id : billIds) {
            try {
                settleBill(id, null);
                count++;
            } catch (Exception e) {
                log.warn("[BillAggregation] 批量结清跳过: id={}, reason={}", id, e.getMessage());
            }
        }
        return count;
    }

    /**
     * D-472 批量驳回（取消账单）：已结清的账单不可取消，跳过并记日志。
     */
    @Transactional(rollbackFor = Exception.class)
    public int batchCancel(List<String> billIds, String reason) {
        String safeReason = StringUtils.hasText(reason) ? reason : "批量驳回";
        int count = 0;
        for (String id : billIds) {
            try {
                cancelBill(id, safeReason);
                count++;
            } catch (Exception e) {
                log.warn("[BillAggregation] 批量取消跳过: id={}, reason={}", id, e.getMessage());
            }
        }
        return count;
    }

    // ==================== 3. 状态流转 ====================

    /**
     * 确认账单（PENDING → CONFIRMED）
     */
    @Transactional(rollbackFor = Exception.class)
    public void confirmBill(String billId) {
        BillAggregation bill = getBillOrThrow(billId);
        if (!BillConstants.STATUS_PENDING.equals(bill.getStatus())) {
            throw new RuntimeException("只有待确认状态的账单可以确认");
        }
        bill.setStatus(BillConstants.STATUS_CONFIRMED);
        bill.setConfirmedById(UserContext.userId());
        bill.setConfirmedByName(UserContext.username());
        bill.setConfirmedAt(LocalDateTime.now());
        billAggregationService.updateById(bill);
        ensureSettlementTaskFromBill(bill);
        ensureAccountingVoucherFromBill(bill);
        log.info("[BillAggregation] 确认账单: billNo={}", bill.getBillNo());
    }

    /**
     * 批量确认
     */
    @Transactional(rollbackFor = Exception.class)
    public int batchConfirm(List<String> billIds) {
        int count = 0;
        for (String id : billIds) {
            try {
                confirmBill(id);
                count++;
            } catch (Exception e) {
                log.warn("[BillAggregation] 批量确认跳过: id={}, reason={}", id, e.getMessage());
            }
        }
        return count;
    }

    /**
     * 结清账单（CONFIRMED → SETTLED）
     */
    @Transactional(rollbackFor = Exception.class)
    public void settleBill(String billId, BigDecimal settledAmount) {
        BillAggregation bill = getBillOrThrow(billId);
        // D-473：待确认账单允许直接付款——内部先自动确认（会同步生成结算任务与凭证），
        // 避免财务必须"先点确认、再点付款"两步走，也避免直接付款被拒。
        if (BillConstants.STATUS_PENDING.equals(bill.getStatus())) {
            confirmBill(billId);
            bill = getBillOrThrow(billId);
        }
        if (!BillConstants.isConfirmedGroup(bill.getStatus())) {
            throw new RuntimeException("只有已确认/结算中的账单可以结清");
        }
        // D-473：支持部分付款（本月钱不够付一半、品质问题留一部分尾款）。
        // 传入金额 = 本次付款额，在已结清基础上累加；未付满则保持"结算中"挂账，
        // 剩余金额继续留在该对象账上，下个月可继续扣。付满才置已结清。
        BigDecimal total = bill.getAmount() != null ? bill.getAmount() : BigDecimal.ZERO;
        BigDecimal already = bill.getSettledAmount() != null ? bill.getSettledAmount() : BigDecimal.ZERO;
        BigDecimal thisTime = settledAmount != null ? settledAmount : total.subtract(already);
        if (thisTime.compareTo(BigDecimal.ZERO) <= 0) {
            throw new RuntimeException("本次付款金额必须大于 0");
        }
        // D-474：重复提交幂等——同一笔账单同一用户同一金额，30 秒内只处理一次。
        // Redis 不可用时降级为无幂等（照付，但日志告警），避免阻塞付款主流程。
        if (stringRedisTemplate != null) {
            String idempotencyKey = "finance:settle:" + billId + ":"
                    + UserContext.userId() + ":" + thisTime.toPlainString();
            try {
                Boolean firstTime = stringRedisTemplate.opsForValue()
                        .setIfAbsent("idempotency:" + idempotencyKey, "1", 30, TimeUnit.SECONDS);
                if (Boolean.FALSE.equals(firstTime)) {
                    throw new RuntimeException("该付款请求刚刚已处理过（30 秒内不重复），请稍后再试");
                }
            } catch (RuntimeException re) {
                throw re;
            } catch (Exception e) {
                log.warn("[BillAggregation] 幂等检查失败（降级放行，可能重复提交）: err={}", e.getMessage());
            }
        }
        SettlementResult result = resolveSettlement(total, already, thisTime);
        boolean fullyPaid = result.isFullyPaid();

        bill.setSettledAmount(result.getNewSettled());
        bill.setStatus(fullyPaid ? BillConstants.STATUS_SETTLED : BillConstants.STATUS_SETTLING);
        bill.setSettledById(UserContext.userId());
        bill.setSettledByName(UserContext.username());
        bill.setSettledAt(LocalDateTime.now());
        // D-474：账单表开了 @Version 乐观锁，并发付款（两个人同时付同一笔）时
        // 后一个请求会更新 0 行。MP 不会自动抛异常，若不判断就会"提示成功但实际没入账"，
        // 这里显式拦截，让前端提示刷新重试，保证账实一致。
        boolean updated = billAggregationService.updateById(bill);
        if (!updated) {
            throw new RuntimeException("该账单已被其他操作更新（可能存在并发付款），请刷新后重试");
        }
        log.info("[BillAggregation] 付款: billNo={}, 本次={}, 累计={}/{}, 状态={}",
                bill.getBillNo(), thisTime, result.getNewSettled(), total, bill.getStatus());
        // D-473：同步补记付款记录（记本次实付金额），打通总账与"付款记录"两套账
        String paymentId = ensurePaymentRecordFromBill(bill, thisTime);
        // D-474：按本次实付金额记一张付款凭证（借应付账款、贷银行存款）。
        // 分次付款就分次记，剩下未付的自然留在应付账款余额里，与账单"未结清"一致。
        generatePaymentVoucherSafely(bill, paymentId, thisTime, "OFFLINE");
        // D-474：付清后回写上游单据状态，避免"付款中心已付清、对账单还显示未付款"
        if (fullyPaid) {
            syncUpstreamPaid(bill);
        }
    }

    /**
     * D-474 补推缺失的物料对账账单（供定时任务调用）。
     *
     * 背景：线上 27 张已审批的对账单里，有 3 张有金额（22/5/16 元）却从来没有账单——
     * 多为推送功能上线前审批的历史单据，或当时推送失败。这里做幂等补推：
     * 已审批 + 金额大于 0 + 还没有 MATERIAL_RECONCILIATION 账单 → 补推一条（待确认）。
     *
     * @return 本次补推的笔数
     */
    public int repairMissingReconciliationBills() {
        if (materialReconciliationService == null) {
            return 0;
        }
        Long tenantId = TenantAssert.requireTenantId();
        List<MaterialReconciliation> list = materialReconciliationService.lambdaQuery()
                .eq(MaterialReconciliation::getTenantId, tenantId)
                .eq(MaterialReconciliation::getDeleteFlag, 0)
                .in(MaterialReconciliation::getStatus, "approved", "paid", "confirmed")
                .list();
        if (list == null || list.isEmpty()) {
            return 0;
        }
        int fixed = 0;
        for (MaterialReconciliation r : list) {
            try {
                if (r.getFinalAmount() == null || r.getFinalAmount().compareTo(BigDecimal.ZERO) <= 0) {
                    continue; // 金额为 0 的对账单不推
                }
                boolean hasBill = billAggregationService.lambdaQuery()
                        .eq(BillAggregation::getTenantId, tenantId)
                        .eq(BillAggregation::getSourceType, "MATERIAL_RECONCILIATION")
                        .eq(BillAggregation::getSourceId, r.getId())
                        .eq(BillAggregation::getDeleteFlag, 0)
                        .last("LIMIT 1")
                        .one() != null;
                // pushBill 幂等：不存在则补推；已存在且非终态（未结清/未取消）则同步金额，
                // 这样对账单后续改过金额时，账单金额也会跟着纠正
                BillPushRequest req = new BillPushRequest();
                req.setBillType("PAYABLE");
                req.setBillCategory("MATERIAL");
                req.setSourceType("MATERIAL_RECONCILIATION");
                req.setSourceId(r.getId());
                req.setSourceNo(r.getReconciliationNo());
                req.setCounterpartyType("SUPPLIER");
                req.setCounterpartyId(r.getSupplierId());
                req.setCounterpartyName(r.getSupplierName());
                req.setOrderId(r.getOrderId());
                req.setOrderNo(r.getOrderNo());
                req.setStyleNo(r.getStyleNo());
                req.setAmount(r.getFinalAmount());
                req.setSettlementMonth(LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM")));
                req.setRemark(hasBill ? "巡检同步：对账单金额变更" : "巡检补推：对账单已审批但缺失账单");
                pushBill(req);
                if (!hasBill) {
                    fixed++;
                    log.warn("[BillAggregation] 巡检补推对账账单: reconNo={}, amount={}",
                            r.getReconciliationNo(), r.getFinalAmount());
                }
            } catch (Exception e) {
                log.warn("[BillAggregation] 巡检补推对账账单失败: reconId={}, err={}", r.getId(), e.getMessage());
            }
        }
        return fixed;
    }

    /**
     * D-474 补推缺失的外发工艺账单（供定时任务调用）。
     *
     * 外发加工审批通过时应推送 FACTORY 账单；若当时推送失败（异常、服务重启），
     * 这笔钱就永远不出现在总账里，财务也无从察觉。这里做幂等补推：
     * 已审批 + 总价大于 0 + 还没有 SECONDARY_PROCESS 账单 → 补推一条（待确认）。
     *
     * @return 本次补推的笔数
     */
    public int repairMissingSecondaryProcessBills() {
        if (secondaryProcessService == null) {
            return 0;
        }
        Long tenantId = TenantAssert.requireTenantId();
        List<com.fashion.supplychain.style.entity.SecondaryProcess> list =
                secondaryProcessService.lambdaQuery()
                        .eq(com.fashion.supplychain.style.entity.SecondaryProcess::getTenantId, tenantId)
                        .eq(com.fashion.supplychain.style.entity.SecondaryProcess::getApprovalStatus, "approved")
                        .list();
        if (list == null || list.isEmpty()) {
            return 0;
        }
        int fixed = 0;
        for (com.fashion.supplychain.style.entity.SecondaryProcess sp : list) {
            try {
                if (sp.getTotalPrice() == null || sp.getTotalPrice().compareTo(BigDecimal.ZERO) <= 0) {
                    continue;
                }
                String sid = String.valueOf(sp.getId());
                boolean hasBill = billAggregationService.lambdaQuery()
                        .eq(BillAggregation::getTenantId, tenantId)
                        .eq(BillAggregation::getSourceType, "SECONDARY_PROCESS")
                        .eq(BillAggregation::getSourceId, sid)
                        .eq(BillAggregation::getDeleteFlag, 0)
                        .last("LIMIT 1")
                        .one() != null;
                if (hasBill) {
                    continue;
                }
                BillPushRequest req = new BillPushRequest();
                req.setBillType("PAYABLE");
                req.setBillCategory("EXTERNAL_FACTORY");
                req.setSourceType("SECONDARY_PROCESS");
                req.setSourceId(sid);
                req.setSourceNo("SP-" + sid);
                req.setCounterpartyType("FACTORY");
                req.setCounterpartyId(sp.getFactoryId());
                req.setCounterpartyName(sp.getFactoryName());
                req.setAmount(sp.getTotalPrice());
                req.setSettlementMonth(LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM")));
                req.setRemark("巡检补推：外发工艺已审批但缺失账单");
                pushBill(req);
                fixed++;
                log.warn("[BillAggregation] 巡检补推外发工艺账单: processId={}, factory={}, amount={}",
                        sid, sp.getFactoryName(), sp.getTotalPrice());
            } catch (Exception e) {
                log.warn("[BillAggregation] 巡检补推外发工艺账单失败: processId={}, err={}", sp.getId(), e.getMessage());
            }
        }
        return fixed;
    }

    /**
     * D-474 收付款一致性自检与自愈（供定时任务 FinanceDataConsistencyJob 调用）。
     *
     * 背景：付款时会做两件跨表的事——补记付款记录、回写上游单据为已付款。
     * 任一步失败（网络抖动、上游状态异常）都会造成"账单已结清但付款记录没有"
     * 或"付清了但上游仍显示未付款"，而原巡检不覆盖这些，问题会一直藏着。
     *
     * 这里对已结清账单做幂等补偿：缺付款记录就补记，上游未置已付款就补回写。
     *
     * @return 本次修复的账单笔数
     */
    public int repairSettledBillsConsistency() {
        Long tenantId = TenantAssert.requireTenantId();
        List<BillAggregation> settled = billAggregationService.lambdaQuery()
                .eq(BillAggregation::getTenantId, tenantId)
                .eq(BillAggregation::getDeleteFlag, 0)
                .eq(BillAggregation::getStatus, BillConstants.STATUS_SETTLED)
                .last("LIMIT 500")
                .list();
        if (settled == null || settled.isEmpty()) {
            return 0;
        }
        int fixed = 0;
        for (BillAggregation bill : settled) {
            try {
                // 1) 缺付款记录 → 补记（内部按 bizId 幂等，已存在会累加/跳过）
                if (wagePaymentService != null && StringUtils.hasText(bill.getCounterpartyId())) {
                    boolean hasPayment = wagePaymentService.lambdaQuery()
                            .eq(WagePayment::getTenantId, tenantId)
                            .eq(WagePayment::getBizId, bill.getId())
                            .ne(WagePayment::getStatus, "cancelled")
                            .last("LIMIT 1")
                            .one() != null;
                    if (!hasPayment) {
                        ensurePaymentRecordFromBill(bill,
                                bill.getSettledAmount() != null ? bill.getSettledAmount() : bill.getAmount());
                        fixed++;
                        log.warn("[BillAggregation] 巡检补记付款记录: billNo={}", bill.getBillNo());
                    }
                }
                // 2) 上游未置已付款 → 补回写（内部幂等，已 paid 会跳过）
                syncUpstreamPaid(bill);
                // 3) 金额对账：付款记录合计 vs 账单已结清金额，对不上要暴露出来
                checkPaymentAmountMatch(bill, tenantId);
            } catch (Exception e) {
                log.warn("[BillAggregation] 巡检修复账单失败: billNo={}, err={}", bill.getBillNo(), e.getMessage());
            }
        }
        return fixed;
    }

    /**
     * D-474 金额对账：一笔账单对应一条付款记录，两者金额必须一致。
     * 不一致说明补记链路某一步丢了（并发、异常中断），这里只告警不改数——
     * 金额的修正要人确认，自动改容易掩盖真实问题。
     */
    private void checkPaymentAmountMatch(BillAggregation bill, Long tenantId) {
        if (wagePaymentService == null) {
            return;
        }
        try {
            List<WagePayment> payments = wagePaymentService.lambdaQuery()
                    .eq(WagePayment::getTenantId, tenantId)
                    .eq(WagePayment::getBizId, bill.getId())
                    .ne(WagePayment::getStatus, "cancelled")
                    .list();
            if (payments == null || payments.isEmpty()) {
                return;
            }
            BigDecimal sum = BigDecimal.ZERO;
            for (WagePayment p : payments) {
                sum = sum.add(p.getAmount() != null ? p.getAmount() : BigDecimal.ZERO);
            }
            BigDecimal settled = bill.getSettledAmount() != null ? bill.getSettledAmount() : BigDecimal.ZERO;
            if (sum.compareTo(settled) != 0) {
                log.warn("[BillAggregation] ⚠ 账单与付款记录金额不一致: billNo={}, 账单已结={}, 付款记录合计={}, 付款记录数={}",
                        bill.getBillNo(), settled, sum, payments.size());
            }
        } catch (Exception e) {
            log.warn("[BillAggregation] 金额对账检查失败: billNo={}, err={}", bill.getBillNo(), e.getMessage());
        }
    }

    /** 部分付款结算结果（D-474，纯函数输出，便于单测） */
    @Data
    public static class SettlementResult {
        /** 本次付款后的累计已付（付满时封顶到账单金额） */
        private BigDecimal newSettled;
        /** 是否已付满 */
        private boolean fullyPaid;
    }

    /**
     * D-474：计算本次付款后的累计已付与是否付满。
     * 规则：累计 = 已付 + 本次；达到账单金额即付满并封顶（避免超额付款）；
     * 未付满则该账单继续挂账（结算中），剩余下月可继续扣。
     */
    SettlementResult resolveSettlement(BigDecimal total, BigDecimal already, BigDecimal thisTime) {
        BigDecimal t = total != null ? total : BigDecimal.ZERO;
        BigDecimal a = already != null ? already : BigDecimal.ZERO;
        BigDecimal sum = a.add(thisTime);
        boolean fullyPaid = sum.compareTo(t) >= 0;
        SettlementResult r = new SettlementResult();
        r.setNewSettled(fullyPaid ? t : sum);
        r.setFullyPaid(fullyPaid);
        return r;
    }

    /**
     * D-474：账单付清后回写上游单据为已付款。
     * 原先只有"上游置 PAID → 同步账单"一个方向，反向缺失，导致付款中心付完钱
     * 回到对账页那张单仍显示未付款，两边对不上。
     * 覆盖三类：面料对账 / 出货对账 / 费用报销（状态机与付款字段明确）。
     * 工资结算不回写——它的付款状态由付款记录动态聚合，结清补记付款记录后自动联动。
     * 外发二次工艺没有付款状态字段，暂不回写。
     * 部分付款不回写（上游没有"部分付款"状态，保持原状由财务在上游自行确认）。
     * 状态值统一小写 paid，与上游状态流转（to=="paid"）保持一致。
     */
    private void syncUpstreamPaid(BillAggregation bill) {
        String sourceType = bill.getSourceType();
        if (sourceType == null) {
            return;
        }
        if ("MATERIAL_RECONCILIATION".equals(sourceType)) {
            markMaterialPaid(bill);
        } else if ("SHIPMENT_RECONCILIATION".equals(sourceType)) {
            markShipmentPaid(bill);
        } else if ("EXPENSE_REIMBURSEMENT".equals(sourceType)) {
            markExpensePaid(bill);
        } else if ("SECONDARY_PROCESS".equals(sourceType)) {
            markSecondaryProcessPaid(bill);
        }
    }

    private void markSecondaryProcessPaid(BillAggregation bill) {
        if (secondaryProcessService == null) {
            return;
        }
        try {
            com.fashion.supplychain.style.entity.SecondaryProcess sp =
                    secondaryProcessService.getById(bill.getSourceId());
            if (sp == null || "paid".equalsIgnoreCase(sp.getPaymentStatus())) {
                return;
            }
            com.fashion.supplychain.style.entity.SecondaryProcess patch =
                    new com.fashion.supplychain.style.entity.SecondaryProcess();
            patch.setId(sp.getId());
            patch.setPaymentStatus("paid");
            patch.setPaidAt(LocalDateTime.now());
            patch.setPaidAmount(bill.getSettledAmount() != null ? bill.getSettledAmount() : bill.getAmount());
            secondaryProcessService.updateById(patch);
            log.info("[BillAggregation] 付清回写外发工艺单: billNo={}, processId={}", bill.getBillNo(), sp.getId());
        } catch (Exception e) {
            log.warn("[BillAggregation] 回写外发工艺单失败（不影响结清）: billNo={}, err={}",
                    bill.getBillNo(), e.getMessage());
        }
    }

    private void markMaterialPaid(BillAggregation bill) {
        if (materialReconciliationService == null) {
            return;
        }
        try {
            MaterialReconciliation mr = materialReconciliationService.getById(bill.getSourceId());
            if (mr == null || "paid".equalsIgnoreCase(mr.getStatus())) {
                return;
            }
            MaterialReconciliation patch = new MaterialReconciliation();
            patch.setId(mr.getId());
            patch.setStatus("paid");
            patch.setPaidAt(LocalDateTime.now());
            patch.setPaidAmount(bill.getSettledAmount() != null ? bill.getSettledAmount() : bill.getAmount());
            materialReconciliationService.updateById(patch);
            log.info("[BillAggregation] 付清回写面料对账单: billNo={}, reconId={}", bill.getBillNo(), mr.getId());
        } catch (Exception e) {
            log.warn("[BillAggregation] 回写面料对账单失败（不影响结清）: billNo={}, err={}",
                    bill.getBillNo(), e.getMessage());
        }
    }

    private void markShipmentPaid(BillAggregation bill) {
        if (shipmentReconciliationService == null) {
            return;
        }
        try {
            ShipmentReconciliation sr = shipmentReconciliationService.getById(bill.getSourceId());
            if (sr == null || "paid".equalsIgnoreCase(sr.getStatus())) {
                return;
            }
            ShipmentReconciliation patch = new ShipmentReconciliation();
            patch.setId(sr.getId());
            patch.setStatus("paid");
            patch.setPaidAt(LocalDateTime.now());
            shipmentReconciliationService.updateById(patch);
            log.info("[BillAggregation] 付清回写出货对账单: billNo={}, reconId={}", bill.getBillNo(), sr.getId());
        } catch (Exception e) {
            log.warn("[BillAggregation] 回写出货对账单失败（不影响结清）: billNo={}, err={}",
                    bill.getBillNo(), e.getMessage());
        }
    }

    private void markExpensePaid(BillAggregation bill) {
        if (expenseReimbursementService == null) {
            return;
        }
        try {
            ExpenseReimbursement er = expenseReimbursementService.getById(bill.getSourceId());
            if (er == null || "paid".equalsIgnoreCase(er.getStatus())) {
                return;
            }
            ExpenseReimbursement patch = new ExpenseReimbursement();
            patch.setId(er.getId());
            patch.setStatus("paid");
            patch.setPaymentTime(LocalDateTime.now());
            patch.setPaymentBy(UserContext.username());
            patch.setUpdateBy(UserContext.username());
            patch.setUpdateTime(LocalDateTime.now());
            expenseReimbursementService.updateById(patch);
            log.info("[BillAggregation] 付清回写报销单: billNo={}, expenseId={}", bill.getBillNo(), er.getId());
        } catch (Exception e) {
            log.warn("[BillAggregation] 回写报销单失败（不影响结清）: billNo={}, err={}",
                    bill.getBillNo(), e.getMessage());
        }
    }

    /**
     * D-473：总账结清后补记一条付款记录（线下付款，直接 success），
     * 避免财务在「付款记录」Tab 查不到已付出去的钱（原来两套账完全割裂）。
     * 幂等：initiatePayment 按 bizType+bizId+paymentMethod 去重；
     * 补记失败只告警，不回滚结清主流程。
     */
    /**
     * D-474：作废某账单关联的所有付款记录（账单取消时用，保证账实一致）。
     *
     * @return 作废的条数
     */
    private int cancelPaymentRecordsByBill(BillAggregation bill) {
        if (wagePaymentService == null) {
            return 0;
        }
        try {
            List<WagePayment> payments = wagePaymentService.lambdaQuery()
                    .eq(WagePayment::getTenantId, TenantAssert.requireTenantId())
                    .eq(WagePayment::getBizId, bill.getId())
                    .ne(WagePayment::getStatus, "cancelled")
                    .list();
            if (payments == null || payments.isEmpty()) {
                return 0;
            }
            for (WagePayment p : payments) {
                p.setStatus("cancelled");
                p.setPaymentRemark((p.getPaymentRemark() != null ? p.getPaymentRemark() + " | " : "")
                        + "账单已取消，同步作废: " + bill.getBillNo());
                p.setUpdateTime(LocalDateTime.now());
                wagePaymentService.updateById(p);
            }
            return payments.size();
        } catch (Exception e) {
            log.warn("[BillAggregation] 作废付款记录失败: billNo={}, err={}", bill.getBillNo(), e.getMessage());
            return 0;
        }
    }

    /**
     * D-474：付款后按实付金额生成付款凭证（失败不影响付款本身）。
     * 确认时已按全额挂"借成本/费用、贷应付"，这里再记"借应付、贷银行存款"。
     */
    private void generatePaymentVoucherSafely(BillAggregation bill, String paymentId,
                                              BigDecimal thisAmount, String paymentMethod) {
        if (accountingVoucherOrchestrator == null || !StringUtils.hasText(paymentId)) {
            return;
        }
        try {
            accountingVoucherOrchestrator.generatePaymentVoucher(bill.getId(), paymentId, thisAmount, paymentMethod);
        } catch (Exception e) {
            log.warn("[BillAggregation] 生成付款凭证失败（不影响付款）: billNo={}, err={}",
                    bill.getBillNo(), e.getMessage());
        }
    }

    /**
     * 付款成功时补记一条付款记录（一笔账单对应一条流水，分次付款累加金额）。
     *
     * @return 付款记录 ID（用于生成付款凭证时做幂等键）；未补记则返回 null
     */
    private String ensurePaymentRecordFromBill(BillAggregation bill, BigDecimal thisAmount) {
        if (wagePaymentOrchestrator == null || !StringUtils.hasText(bill.getCounterpartyId())) {
            return null;
        }
        try {
            // 该账单已补记过付款记录（部分付款第二次起）：累加金额，
            // 保持"一笔账单 = 一条付款流水"，备注里记录每次付款。
            WagePayment exist = wagePaymentService != null
                    ? wagePaymentService.lambdaQuery()
                            .eq(WagePayment::getTenantId, TenantAssert.requireTenantId())
                            .eq(WagePayment::getBizId, bill.getId())
                            .ne(WagePayment::getStatus, "cancelled")
                            .last("LIMIT 1")
                            .one()
                    : null;
            if (exist != null) {
                BigDecimal oldAmount = exist.getAmount() != null ? exist.getAmount() : BigDecimal.ZERO;
                exist.setAmount(oldAmount.add(thisAmount != null ? thisAmount : BigDecimal.ZERO));
                exist.setPaymentRemark((exist.getPaymentRemark() != null ? exist.getPaymentRemark() + " | " : "")
                        + "追加付款 +" + thisAmount + "，累计 " + exist.getAmount());
                exist.setUpdateTime(LocalDateTime.now());
                wagePaymentService.updateById(exist);
                log.info("[BillAggregation] 付款记录累计: billNo={}, 本次={}, 累计={}",
                        bill.getBillNo(), thisAmount, exist.getAmount());
                return exist.getId();
            }

            WagePayment created = wagePaymentOrchestrator.initiatePayment(WagePaymentOrchestrator.WagePaymentRequest.builder()
                    .payeeType(mapPayeeType(bill.getCounterpartyType()))
                    .payeeId(bill.getCounterpartyId())
                    .payeeName(bill.getCounterpartyName())
                    .paymentMethod("OFFLINE")
                    .amount(thisAmount != null ? thisAmount : bill.getSettledAmount())
                    .bizType(mapBizType(bill.getSourceType()))
                    .bizId(bill.getId())
                    .bizNo(bill.getBillNo())
                    .remark("往来总账结清自动补记: " + bill.getBillNo())
                    .build());
            log.info("[BillAggregation] 结清补记付款记录: billNo={}, payee={}",
                    bill.getBillNo(), bill.getCounterpartyName());
            return created != null ? created.getId() : null;
        } catch (Exception e) {
            log.warn("[BillAggregation] 结清补记付款记录失败（不影响结清）: billNo={}, err={}",
                    bill.getBillNo(), e.getMessage());
            return null;
        }
    }

    /** 账单往来对象类型 → 付款记录 payee_type（沿用库中既有取值习惯） */
    private String mapPayeeType(String counterpartyType) {
        String u = normalizeCounterpartyType(counterpartyType);
        if ("WORKER".equals(u)) {
            return "employee";
        }
        if ("FACTORY".equals(u)) {
            return "FACTORY";
        }
        if ("SUPPLIER".equals(u)) {
            return "supplier";
        }
        if ("CUSTOMER".equals(u)) {
            return "customer";
        }
        return u != null ? u.toLowerCase() : "supplier";
    }

    /** 账单来源类型 → 付款记录 biz_type（沿用库中既有取值习惯） */
    private String mapBizType(String sourceType) {
        if (!StringUtils.hasText(sourceType)) {
            return "BILL_PAYABLE";
        }
        String s = sourceType.toUpperCase();
        if ("PAYROLL_SETTLEMENT".equals(s)) {
            return "PAYROLL_SETTLEMENT";
        }
        if (s.endsWith("RECONCILIATION")) {
            return "material_reconciliation";
        }
        if ("EXPENSE_REIMBURSEMENT".equals(s)) {
            return "expense_reimbursement";
        }
        if ("SECONDARY_PROCESS".equals(s)) {
            return "ORDER_SETTLEMENT";
        }
        return "BILL_PAYABLE";
    }

    /**
     * 取消账单（PENDING/CONFIRMED → CANCELLED）
     */
    @Transactional(rollbackFor = Exception.class)
    public void cancelBill(String billId, String reason) {
        BillAggregation bill = getBillOrThrow(billId);
        if (BillConstants.STATUS_SETTLED.equals(bill.getStatus())) {
            throw new RuntimeException("已结清的账单不可取消");
        }
        bill.setStatus(BillConstants.STATUS_CANCELLED);
        // D-474：账单付过一部分（结算中）也能取消，此时必须把已付的付款记录一并作废，
        // 否则会出现"账单取消了、付款记录还显示已支付"的账实不符。
        BigDecimal settled = bill.getSettledAmount() != null ? bill.getSettledAmount() : BigDecimal.ZERO;
        if (settled.compareTo(BigDecimal.ZERO) > 0) {
            int cancelled = cancelPaymentRecordsByBill(bill);
            bill.setRemark((reason != null ? reason : "")
                    + String.format(" | 取消时已付 %s 元，已同步作废 %d 条付款记录，请线下处理退款", settled, cancelled));
        } else {
            bill.setRemark(reason);
        }
        billAggregationService.updateById(bill);
        log.info("[BillAggregation] 取消账单: billNo={}, reason={}, 已付={}", bill.getBillNo(), reason, settled);

        // D-474：账单取消后冲销相关凭证（含已生成的付款凭证，避免账上留着已付记录）
        try {
            if (accountingVoucherOrchestrator != null) {
                accountingVoucherOrchestrator.reverseByBillAggregationId(bill.getId());
            }
        } catch (Exception e) {
            log.warn("[BillAggregation] 取消账单后冲销凭证失败（不影响取消）: billNo={}, err={}",
                    bill.getBillNo(), e.getMessage());
        }
    }

    @Transactional(rollbackFor = Exception.class)
    /**
     * 按来源类型批量取消账单（跳过已结清），用于"先删后插重建"类幂等场景：
     * 明细每次重保存都会生成新 ID，按单条 sourceId 无法取消旧账单，必须整类型清理。
     */
    public void cancelBySourceType(String sourceType) {
        Long tenantId = TenantAssert.requireTenantId();
        List<BillAggregation> existing = billAggregationService.lambdaQuery()
                .eq(BillAggregation::getSourceType, sourceType)
                .eq(BillAggregation::getTenantId, tenantId)
                .eq(BillAggregation::getDeleteFlag, 0)
                .ne(BillAggregation::getStatus, BillConstants.STATUS_CANCELLED)
                .list();
        for (BillAggregation bill : existing) {
            if (BillConstants.STATUS_SETTLED.equals(bill.getStatus())) {
                log.warn("[BillAggregation] 已结清账单不可取消: billNo={}, source={}:{}",
                        bill.getBillNo(), sourceType, bill.getSourceId());
                continue;
            }
            bill.setStatus(BillConstants.STATUS_CANCELLED);
            bill.setRemark("上游单据操作自动取消(按类型): sourceType=" + sourceType);
            billAggregationService.updateById(bill);
            log.info("[BillAggregation] 联动取消账单(按类型): billNo={}", bill.getBillNo());
        }
    }

    public void cancelBySource(String sourceType, String sourceId) {
        Long tenantId = TenantAssert.requireTenantId();
        BillAggregation existing = billAggregationService.lambdaQuery()
                .eq(BillAggregation::getSourceType, sourceType)
                .eq(BillAggregation::getSourceId, sourceId)
                .eq(BillAggregation::getTenantId, tenantId)
                .eq(BillAggregation::getDeleteFlag, 0)
                .one();
        if (existing == null) {
            return;
        }
        if (BillConstants.STATUS_SETTLED.equals(existing.getStatus())) {
            log.warn("[BillAggregation] 已结清账单不可取消: billNo={}, source={}:{}",
                    existing.getBillNo(), sourceType, sourceId);
            return;
        }
        existing.setStatus(BillConstants.STATUS_CANCELLED);
        existing.setRemark("上游单据操作自动取消: sourceType=" + sourceType);
        billAggregationService.updateById(existing);
        log.info("[BillAggregation] 联动取消账单: billNo={}, source={}:{}", existing.getBillNo(), sourceType, sourceId);
    }

    /**
     * 反向账单机制（P0-10 阻塞根因修复）
     * <p>
     * 用于退货/撤回/反转/删除场景，按来源单据反推账单：
     * 1. 未结清账单：直接置为 CANCELLED，同步联动 Payable/Receivable 状态
     * 2. 已结清账单：抛异常提示需先冲账（防止财务数据丢失）
     * 3. 未支付 Payable/未收款 Receivable：同步删除/取消
     * 4. 已支付 Payable/已收款 Receivable：仅回写 remark，不删除（保留财务痕迹）
     * <p>
     * 与 cancelBySource 的区别：
     * - cancelBySource 仅取消未结清账单，不联动 Payable/Receivable
     * - reverseBySource 联动全链路（Bill → Payable/Receivable），用于反向操作
     *
     * @param sourceType 来源类型
     * @param sourceId   来源ID
     * @param reason     反向原因（退货/撤回/反转/删除等）
     */
    @Transactional(rollbackFor = Exception.class)
    public void reverseBySource(String sourceType, String sourceId, String reason) {
        Long tenantId = TenantAssert.requireTenantId();
        if (!StringUtils.hasText(sourceType) || !StringUtils.hasText(sourceId)) {
            return;
        }
        BillAggregation bill = billAggregationService.lambdaQuery()
                .eq(BillAggregation::getSourceType, sourceType)
                .eq(BillAggregation::getSourceId, sourceId)
                .eq(BillAggregation::getTenantId, tenantId)
                .eq(BillAggregation::getDeleteFlag, 0)
                .last("LIMIT 1")
                .one();
        if (bill == null) {
            log.info("[BillAggregation] 反向账单未找到匹配: sourceType={}, sourceId={}", sourceType, sourceId);
            return;
        }
        reverseBillInternal(bill, reason);
    }

    /**
     * 按订单号反向所有关联账单（用于订单全链路删除/反转）
     */
    @Transactional(rollbackFor = Exception.class)
    public int reverseByOrder(String orderId, String reason) {
        Long tenantId = TenantAssert.requireTenantId();
        if (!StringUtils.hasText(orderId)) {
            return 0;
        }
        List<BillAggregation> bills = billAggregationService.lambdaQuery()
                .eq(BillAggregation::getOrderId, orderId)
                .eq(BillAggregation::getTenantId, tenantId)
                .eq(BillAggregation::getDeleteFlag, 0)
                .ne(BillAggregation::getStatus, BillConstants.STATUS_CANCELLED)
                .list();
        int count = 0;
        for (BillAggregation bill : bills) {
            try {
                reverseBillInternal(bill, reason);
                count++;
            } catch (Exception e) {
                log.warn("[BillAggregation] 反向账单失败（继续处理其他账单）: billNo={}, err={}",
                        bill.getBillNo(), e.getMessage());
            }
        }
        log.info("[BillAggregation] 订单级反向账单完成: orderId={}, reversed={}", orderId, count);
        return count;
    }

    /**
     * 反向账单内部实现（单个账单 + 联动 Payable/Receivable）
     */
    private void reverseBillInternal(BillAggregation bill, String reason) {
        // 已结清账单：禁止反向（需先冲账）
        if (BillConstants.STATUS_SETTLED.equals(bill.getStatus())) {
            BigDecimal settled = bill.getSettledAmount() != null ? bill.getSettledAmount() : BigDecimal.ZERO;
            if (settled.compareTo(BigDecimal.ZERO) > 0) {
                throw new RuntimeException("账单 " + bill.getBillNo()
                        + " 已结算 " + settled + " 元，需先在付款中心冲账后再反向操作");
            }
        }
        String originalStatus = bill.getStatus();
        String reverseRemark = "【反向操作】" + (reason != null ? reason : "上游单据操作")
                + " | 原状态: " + originalStatus + " | 操作人: " + UserContext.username()
                + " | 时间: " + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        // 1. 账单置为 CANCELLED
        bill.setStatus(BillConstants.STATUS_CANCELLED);
        bill.setRemark(StringUtils.hasText(bill.getRemark())
                ? bill.getRemark() + "\n" + reverseRemark : reverseRemark);
        billAggregationService.updateById(bill);

        // 1.1 联动冲销会计凭证（D-022 财务闭环：账单反向 → 凭证冲销）
        if (accountingVoucherOrchestrator != null) {
            try {
                accountingVoucherOrchestrator.reverseByBillAggregationId(bill.getId());
                log.info("[BillAggregation] 反向联动会计凭证冲销: billNo={}", bill.getBillNo());
            } catch (Exception e) {
                log.warn("[BillAggregation] 反向联动会计凭证冲销失败（账单已取消，继续处理）: billNo={}, err={}",
                        bill.getBillNo(), e.getMessage());
            }
        }

        // 2. 联动 Payable（仅未付款的可直接取消；已付款的保留痕迹）
        if (BillConstants.isPayable(bill.getBillType()) && payableOrchestrator != null) {
            try {
                Payable payable = payableOrchestrator.findByBillAggregationId(bill.getId());
                if (payable != null) {
                    BigDecimal paidAmount = payable.getPaidAmount() != null ? payable.getPaidAmount() : BigDecimal.ZERO;
                    if (paidAmount.compareTo(BigDecimal.ZERO) == 0) {
                        // 未付款：直接标记 CANCELLED（保留 deleteFlag=0 以便查询历史）
                        payable.setStatus(BillConstants.STATUS_CANCELLED);
                        payable.setDescription((payable.getDescription() != null ? payable.getDescription() + " | " : "")
                                + reverseRemark);
                        payable.setUpdateTime(LocalDateTime.now());
                        payableOrchestrator.updatePayableStatus(payable);
                        log.info("[BillAggregation] 反向联动 Payable 取消: payableNo={}, billNo={}",
                                payable.getPayableNo(), bill.getBillNo());
                    } else {
                        log.warn("[BillAggregation] 反向联动 Payable 已付款保留痕迹: payableNo={}, paidAmount={}",
                                payable.getPayableNo(), paidAmount);
                    }
                }
            } catch (Exception e) {
                log.error("[BillAggregation] 反向联动 Payable 失败（账单已取消，继续处理）: billNo={}, err={}",
                        bill.getBillNo(), e.getMessage());
            }
            // 合并应付不携带 billAggregationId，findByBillAggregationId 找不到时
            // 必须按合并分组特征扣减金额，否则该笔金额继续挂在应付里被重复付款
            try {
                payableOrchestrator.reduceMergedPayableForReversedBill(bill, reverseRemark);
            } catch (Exception e) {
                log.warn("[BillAggregation] 反向扣减合并应付失败(继续): billNo={}", bill.getBillNo(), e);
            }
        }

        // 3. 联动 Receivable（仅未收款的可直接取消；已收款的保留痕迹）
        if (BillConstants.isReceivable(bill.getBillType()) && receivableOrchestrator != null) {
            try {
                com.fashion.supplychain.crm.entity.Receivable receivable = receivableOrchestrator.findByBillAggregationId(bill.getId());
                if (receivable != null) {
                    BigDecimal received = receivable.getReceivedAmount() != null ? receivable.getReceivedAmount() : BigDecimal.ZERO;
                    if (received.compareTo(BigDecimal.ZERO) == 0) {
                        // 未收款：直接标记 CANCELLED
                        receivable.setStatus(BillConstants.STATUS_CANCELLED);
                        receivable.setDescription((receivable.getDescription() != null ? receivable.getDescription() + " | " : "")
                                + reverseRemark);
                        receivable.setUpdateTime(LocalDateTime.now());
                        receivableOrchestrator.updateReceivableStatus(receivable);
                        log.info("[BillAggregation] 反向联动 Receivable 取消: receivableNo={}, billNo={}",
                                receivable.getReceivableNo(), bill.getBillNo());
                    } else {
                        log.warn("[BillAggregation] 反向联动 Receivable 已收款保留痕迹: receivableNo={}, receivedAmount={}",
                                receivable.getReceivableNo(), received);
                    }
                }
            } catch (Exception e) {
                log.error("[BillAggregation] 反向联动 Receivable 失败（账单已取消，继续处理）: billNo={}, err={}",
                        bill.getBillNo(), e.getMessage());
            }
        }

        log.info("[BillAggregation] 反向账单完成: billNo={}, originalStatus={}, reason={}",
                bill.getBillNo(), originalStatus, reason);
    }

    // ==================== 内部方法 ====================

    private BillAggregation getBillOrThrow(String billId) {
        Long tenantId = UserContext.tenantId();
        BillAggregation bill = billAggregationService.lambdaQuery()
                .eq(BillAggregation::getId, billId)
                .eq(BillAggregation::getTenantId, tenantId)
                .eq(BillAggregation::getDeleteFlag, 0)
                .one();
        if (bill == null) {
            throw new RuntimeException("账单不存在: " + billId);
        }
        return bill;
    }

    private static final java.util.concurrent.atomic.AtomicInteger BILL_NO_SEQ = new java.util.concurrent.atomic.AtomicInteger(0);

    private String generateBillNo() {
        return "BA" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS")) + String.format("%03d", BILL_NO_SEQ.incrementAndGet() % 1000);
    }

    /**
     * 方案A：BillAggregation 作为唯一财务出口。
     * 在 CONFIRM 阶段按账单类型派生待收付任务（幂等）。
     */
    private void ensureSettlementTaskFromBill(BillAggregation bill) {
        if (bill == null) {
            return;
        }
        try {
            if (BillConstants.isPayable(bill.getBillType())) {
                if (payableOrchestrator == null) {
                    log.warn("[BillAggregation] PayableOrchestrator 不可用，跳过应付派生: billNo={}", bill.getBillNo());
                    return;
                }
                Payable merged = payableOrchestrator.findOrCreateMergedPayable(bill);
                bill.setPayableId(merged.getId());
                billAggregationService.updateById(bill);
                log.info("[BillAggregation] 已合并到应付任务: billNo={}, payableNo={}, mergedAmount={}",
                        bill.getBillNo(), merged.getPayableNo(), merged.getAmount());
                return;
            }
            if (BillConstants.isReceivable(bill.getBillType())) {
                if (receivableOrchestrator == null) {
                    log.warn("[BillAggregation] ReceivableOrchestrator 不可用，跳过应收派生: billNo={}", bill.getBillNo());
                    return;
                }
                if (receivableOrchestrator.findByBillAggregationId(bill.getId()) == null) {
                    receivableOrchestrator.createFromBill(bill);
                    log.info("[BillAggregation] 已派生应收任务: billNo={}", bill.getBillNo());
                }
            }
        } catch (Exception e) {
            throw new RuntimeException("派生待收付任务失败: " + e.getMessage(), e);
        }
    }

    /**
     * 账单确认后自动生成会计凭证（D-022 财务闭环：账单 → 凭证，借贷平衡）
     * <p>
     * 数据流转：confirmBill → ensureAccountingVoucherFromBill → generateVoucherFromBill
     * <ul>
     *   <li>幂等：generateVoucherFromBill 内部已做幂等（同一 billAggregationId 不重复生成 JOURNAL 凭证）</li>
     *   <li>fail-safe：科目映射缺失时只记日志不阻塞业务（凭证可在会计模块手动补录）</li>
     *   <li>事务：generateVoucherFromBill 为 REQUIRES_NEW 独立事务——失败只回滚凭证本身，
     *       不会把本确认事务标记 rollback-only（否则外层 catch 无效，提交时炸 UnexpectedRollbackException）</li>
     * </ul>
     * </p>
     */
    private void ensureAccountingVoucherFromBill(BillAggregation bill) {
        if (bill == null || accountingVoucherOrchestrator == null) {
            return;
        }
        try {
            accountingVoucherOrchestrator.generateVoucherFromBill(bill.getId());
            log.info("[BillAggregation] 已生成会计凭证: billNo={}", bill.getBillNo());
        } catch (Exception e) {
            // 科目映射缺失等配置问题不应阻塞账单确认业务，但需记录日志供财务补录
            log.warn("[BillAggregation] 会计凭证生成失败（可在会计模块手动补录）: billNo={}, err={}",
                    bill.getBillNo(), e.getMessage());
        }
    }

    // ==================== 内部 DTO ====================

    @Data
    public static class BillPushRequest {
        private String billType;       // PAYABLE / RECEIVABLE
        private String billCategory;   // MATERIAL / PRODUCT / EXTERNAL_FACTORY / PAYROLL / EXPENSE / SHIPMENT / DEDUCTION / INVENTORY_PROFIT（盘盈） / INVENTORY_LOSS（盘亏）
        private String sourceType;     // MATERIAL_RECONCILIATION / PAYROLL_SETTLEMENT / ...
        private String sourceId;
        private String sourceNo;
        private String counterpartyType; // SUPPLIER / CUSTOMER / WORKER / FACTORY
        private String counterpartyId;
        private String counterpartyName;
        private String orderId;
        private String orderNo;
        private String styleNo;
        private BigDecimal amount;
        private String settlementMonth;
        private String remark;
    }

    @Data
    public static class CounterpartyGroupDTO {
        private String counterpartyType;    // WORKER / FACTORY / SUPPLIER / CUSTOMER
        private String counterpartyId;
        private String counterpartyName;
        private Integer billCount;          // 该对象名下账单笔数
        private BigDecimal totalAmount;     // 累计推送
        private BigDecimal settledAmount;   // 已结清
        private BigDecimal unsettledAmount; // 未结清 = 累计 - 已结
        /** D-474：部分付款后挂账（结算中）的笔数——让财务一眼看出谁还有尾款没付完 */
        private Integer settlingCount = 0;
        /** D-474：待确认笔数（上游刚推过来、财务还没确认的） */
        private Integer pendingCount = 0;
    }

    @Data
    public static class BillQueryRequest {
        private int pageNum = 1;
        private int pageSize = 20;
        private String billType;
        private String billCategory;
        private String status;
        private String settlementMonth;      // 向后兼容：单月筛选
        private String createTimeStart;      // new：创建时间范围 - 开始（YYYY-MM-DD 或 YYYY-MM-DD HH:mm:ss）
        private String createTimeEnd;        // new：创建时间范围 - 结束（YYYY-MM-DD 或 YYYY-MM-DD HH:mm:ss）
        private String counterpartyName;
        private String counterpartyId;       // D-472：按往来对象精确过滤（往来总账详情页用）
        private String orderNo;
    }
}
