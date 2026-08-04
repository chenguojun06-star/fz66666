package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.constant.BillConstants;
import com.fashion.supplychain.finance.entity.EmployeeAdvance;
import com.fashion.supplychain.finance.entity.PayrollSettlement;
import com.fashion.supplychain.finance.service.EmployeeAdvanceService;
import com.fashion.supplychain.finance.service.PayrollSettlementService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import java.util.NoSuchElementException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Component
@Slf4j
public class EmployeeAdvanceOrchestrator {

    private static final DateTimeFormatter DAY_FMT = DateTimeFormatter.ofPattern("yyyyMMdd");
    private static final DateTimeFormatter MONTH_FMT = DateTimeFormatter.ofPattern("yyyy-MM");

    @Autowired
    private EmployeeAdvanceService employeeAdvanceService;

    @Autowired
    private PayrollSettlementService payrollSettlementService;

    /**
     * P0-2 修复：借支接入 BillAggregation 聚合层
     * - approve：推送 PAYABLE 账单（费用报销类，对方 EMPLOYEE）
     * - reject：反向已推送账单
     * - repay：联动 Payable paidAmount（部分/全部还款）
     * 使用 @Lazy 避免循环依赖（BillAggregationOrchestrator 依赖 PayableOrchestrator 等）
     */
    @Lazy
    @Autowired(required = false)
    private BillAggregationOrchestrator billAggregationOrchestrator;

    public com.baomidou.mybatisplus.core.metadata.IPage<EmployeeAdvance> list(Map<String, Object> params) {
        TenantAssert.assertTenantContext();
        String employeeName = params != null ? (String) params.get("employeeName") : null;
        String status = params != null ? (String) params.get("status") : null;
        String repaymentStatus = params != null ? (String) params.get("repaymentStatus") : null;
        String startDate = params != null ? (String) params.get("startDate") : null;
        String endDate = params != null ? (String) params.get("endDate") : null;
        int page = params != null && params.get("page") != null ? Integer.parseInt(String.valueOf(params.get("page"))) : 1;
        int size = params != null && params.get("size") != null ? Integer.parseInt(String.valueOf(params.get("size"))) : 20;

        LambdaQueryWrapper<EmployeeAdvance> qw = new LambdaQueryWrapper<EmployeeAdvance>()
                .eq(EmployeeAdvance::getDeleteFlag, 0)
                .eq(EmployeeAdvance::getTenantId, UserContext.tenantId())
                .orderByDesc(EmployeeAdvance::getCreateTime);
        if (StringUtils.hasText(employeeName)) {
            qw.like(EmployeeAdvance::getEmployeeName, employeeName);
        }
        if (StringUtils.hasText(status)) {
            qw.eq(EmployeeAdvance::getStatus, status);
        }
        if (StringUtils.hasText(repaymentStatus)) {
            qw.eq(EmployeeAdvance::getRepaymentStatus, repaymentStatus);
        }
        // 日期范围筛选（按 createTime）
        if (StringUtils.hasText(startDate)) {
            qw.ge(EmployeeAdvance::getCreateTime, java.time.LocalDate.parse(startDate).atStartOfDay());
        }
        if (StringUtils.hasText(endDate)) {
            qw.le(EmployeeAdvance::getCreateTime, java.time.LocalDate.parse(endDate).atTime(java.time.LocalTime.MAX));
        }
        return employeeAdvanceService.page(new Page<>(page, size), qw);
    }

    @Transactional(rollbackFor = Exception.class)
    public EmployeeAdvance create(EmployeeAdvance advance) {
        TenantAssert.assertTenantContext();
        if (!UserContext.isSupervisorOrAbove()) {
            throw new org.springframework.security.access.AccessDeniedException("仅主管及以上可创建借支申请");
        }
        if (advance.getAmount() == null || advance.getAmount().compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("借支金额必须大于0");
        }
        advance.setAdvanceNo(nextAdvanceNo());
        advance.setStatus("pending");
        advance.setRepaymentAmount(BigDecimal.ZERO);
        advance.setRemainingAmount(advance.getAmount());
        advance.setRepaymentStatus("unrepaid");
        advance.setCreateTime(LocalDateTime.now());
        advance.setUpdateTime(LocalDateTime.now());
        advance.setDeleteFlag(0);
        UserContext ctx = UserContext.get();
        if (ctx != null && StringUtils.hasText(ctx.getUserId())) {
            advance.setCreateBy(ctx.getUserId().trim());
            advance.setUpdateBy(ctx.getUserId().trim());
        }
        employeeAdvanceService.save(advance);
        log.info("[EmployeeAdvance] 借支申请已创建: advanceNo={}, employee={}, amount={}",
                advance.getAdvanceNo(), advance.getEmployeeName(), advance.getAmount());
        return advance;
    }

    @Transactional(rollbackFor = Exception.class)
    public void approve(String advanceId, String remark) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        if (!UserContext.isTopAdmin()) {
            throw new org.springframework.security.access.AccessDeniedException("仅管理员及以上可审批借支");
        }
        EmployeeAdvance advance = employeeAdvanceService.lambdaQuery()
                .eq(EmployeeAdvance::getId, advanceId)
                .eq(EmployeeAdvance::getTenantId, tenantId)
                .eq(EmployeeAdvance::getDeleteFlag, 0)
                .one();
        if (advance == null) {
            throw new NoSuchElementException("借支记录不存在");
        }
        UserContext ctx = UserContext.get();
        String approverId = ctx != null ? ctx.getUserId() : null;
        String approverName = ctx != null ? ctx.getUsername() : null;
        int rows = employeeAdvanceService.atomicApprove(advanceId, approverId, approverName, remark, tenantId);
        if (rows == 0) {
            throw new OptimisticLockingFailureException("借支审批冲突，记录可能已被处理，请刷新后重试");
        }
        // P0-2 修复：审批通过后推送 PAYABLE 账单到 BillAggregation 聚合层
        // - billType=PAYABLE / billCategory=EXPENSE / sourceType=EMPLOYEE_ADVANCE
        // - counterpartyType=EMPLOYEE / 幂等预检 billExists
        // - 失败不阻塞主流程（账单异常走人工对账，但事务已提交）
        if (billAggregationOrchestrator != null && advance.getAmount() != null
                && advance.getAmount().compareTo(BigDecimal.ZERO) > 0) {
            try {
                String sourceId = String.valueOf(advance.getId());
                if (!billAggregationOrchestrator.billExists(BillConstants.SOURCE_EMPLOYEE_ADVANCE, sourceId)) {
                    BillAggregationOrchestrator.BillPushRequest req = new BillAggregationOrchestrator.BillPushRequest();
                    req.setBillType(BillConstants.BILL_TYPE_PAYABLE);
                    req.setBillCategory(BillConstants.CATEGORY_EXPENSE);
                    req.setSourceType(BillConstants.SOURCE_EMPLOYEE_ADVANCE);
                    req.setSourceId(sourceId);
                    req.setSourceNo(advance.getAdvanceNo());
                    req.setCounterpartyType(BillConstants.COUNTERPARTY_EMPLOYEE);
                    req.setCounterpartyId(advance.getEmployeeId());
                    req.setCounterpartyName(advance.getEmployeeName());
                    req.setAmount(advance.getAmount());
                    req.setSettlementMonth(LocalDateTime.now().format(MONTH_FMT));
                    req.setRemark("员工借支审批: " + advance.getAdvanceNo()
                            + (StringUtils.hasText(remark) ? " | 备注: " + remark : ""));
                    billAggregationOrchestrator.pushBill(req);
                    log.info("[EmployeeAdvance] 推送账单成功: advanceNo={}, amount={}",
                            advance.getAdvanceNo(), advance.getAmount());
                } else {
                    log.info("[EmployeeAdvance] 账单已存在，跳过推送: advanceNo={}", advance.getAdvanceNo());
                }
            } catch (Exception e) {
                log.warn("[EmployeeAdvance] 推送账单失败（不阻塞主流程）: advanceNo={}, err={}",
                        advance.getAdvanceNo(), e.getMessage());
            }
        }
        log.info("[EmployeeAdvance] 借支已审批通过: advanceNo={}, approver={}", advance.getAdvanceNo(), approverName);
    }

    @Transactional(rollbackFor = Exception.class)
    public void reject(String advanceId, String remark) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        if (!UserContext.isTopAdmin()) {
            throw new org.springframework.security.access.AccessDeniedException("仅管理员及以上可审批借支");
        }
        EmployeeAdvance advance = employeeAdvanceService.lambdaQuery()
                .eq(EmployeeAdvance::getId, advanceId)
                .eq(EmployeeAdvance::getTenantId, tenantId)
                .eq(EmployeeAdvance::getDeleteFlag, 0)
                .one();
        if (advance == null) {
            throw new NoSuchElementException("借支记录不存在");
        }
        UserContext ctx = UserContext.get();
        String approverId = ctx != null ? ctx.getUserId() : null;
        String approverName = ctx != null ? ctx.getUsername() : null;
        int rows = employeeAdvanceService.atomicReject(advanceId, approverId, approverName, remark, tenantId);
        if (rows == 0) {
            throw new OptimisticLockingFailureException("借支驳回冲突，记录可能已被处理，请刷新后重试");
        }
        // P0-2 修复：驳回时反向已推送的账单（如有）
        // - 已结清账单会抛异常 → 不阻塞驳回主流程，记录告警供财务对账
        if (billAggregationOrchestrator != null) {
            try {
                billAggregationOrchestrator.reverseBySource(
                        BillConstants.SOURCE_EMPLOYEE_ADVANCE,
                        String.valueOf(advance.getId()),
                        "员工借支驳回: " + (StringUtils.hasText(remark) ? remark : "无"));
                log.info("[EmployeeAdvance] 驳回联动反向账单: advanceNo={}", advance.getAdvanceNo());
            } catch (Exception e) {
                log.warn("[EmployeeAdvance] 驳回联动反向账单失败（可能存在已结清账单需手动冲账）: advanceNo={}, err={}",
                        advance.getAdvanceNo(), e.getMessage());
            }
        }
        log.info("[EmployeeAdvance] 借支已驳回: advanceNo={}, approver={}", advance.getAdvanceNo(), approverName);
    }

    @Transactional(rollbackFor = Exception.class)
    public void repay(String advanceId, BigDecimal repayAmount) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        if (repayAmount == null || repayAmount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("还款金额必须大于0");
        }
        EmployeeAdvance advance = employeeAdvanceService.lambdaQuery()
                .eq(EmployeeAdvance::getId, advanceId)
                .eq(EmployeeAdvance::getTenantId, tenantId)
                .eq(EmployeeAdvance::getDeleteFlag, 0)
                .one();
        if (advance == null) {
            throw new NoSuchElementException("借支记录不存在");
        }
        if (!"approved".equalsIgnoreCase(advance.getStatus())) {
            throw new IllegalStateException("只有已审批的借支可还款");
        }
        BigDecimal remaining = advance.getRemainingAmount() != null ? advance.getRemainingAmount() : advance.getAmount();
        if (repayAmount.compareTo(remaining) > 0) {
            throw new IllegalArgumentException("还款金额不能超过剩余未还金额: " + remaining);
        }
        int rows = employeeAdvanceService.atomicRepay(advance.getId(), repayAmount, advance.getRepaymentAmount(), tenantId);
        if (rows == 0) {
            throw new OptimisticLockingFailureException("还款操作冲突，请重试");
        }
        BigDecimal newRepaid = advance.getRepaymentAmount().add(repayAmount);
        BigDecimal newRemaining = advance.getAmount().subtract(newRepaid);
        // P0-2 修复：还款联动 BillAggregation.settledAmount
        // - 部分还款：仅更新 settledAmount = newRepaid
        // - 全部还清：syncSettledAmountBySource 内部会自动流转为 SETTLED
        if (billAggregationOrchestrator != null) {
            try {
                billAggregationOrchestrator.syncSettledAmountBySource(
                        BillConstants.SOURCE_EMPLOYEE_ADVANCE,
                        String.valueOf(advance.getId()),
                        newRepaid);
                log.info("[EmployeeAdvance] 还款联动账单 settledAmount: advanceNo={}, newRepaid={}",
                        advance.getAdvanceNo(), newRepaid);
            } catch (Exception e) {
                log.warn("[EmployeeAdvance] 还款联动账单失败（不阻塞主流程）: advanceNo={}, err={}",
                        advance.getAdvanceNo(), e.getMessage());
            }
        }
        log.info("[EmployeeAdvance] 借支还款: advanceNo={}, repayAmount={}, remaining={}",
                advance.getAdvanceNo(), repayAmount, newRemaining);
    }

    private String nextAdvanceNo() {
        String day = LocalDate.now().format(DAY_FMT);
        String prefix = "EA" + day;
        EmployeeAdvance latest = employeeAdvanceService.lambdaQuery()
                .eq(EmployeeAdvance::getTenantId, UserContext.tenantId())
                .likeRight(EmployeeAdvance::getAdvanceNo, prefix)
                .orderByDesc(EmployeeAdvance::getAdvanceNo)
                .last("limit 1")
                .one();
        int seq = 1;
        if (latest != null && StringUtils.hasText(latest.getAdvanceNo())) {
            String v = latest.getAdvanceNo();
            if (v.length() >= prefix.length() + 3) {
                try {
                    seq = Integer.parseInt(v.substring(v.length() - 3)) + 1;
                } catch (NumberFormatException e) {
                    log.warn("[EmployeeAdvance] 解析借支编号序号失败: {}", e.getMessage());
                }
            }
        }
        for (int i = 0; i < 200; i++) {
            String candidate = prefix + "%03d".formatted(seq);
            Long cnt = employeeAdvanceService.count(new LambdaQueryWrapper<EmployeeAdvance>()
                    .eq(EmployeeAdvance::getAdvanceNo, candidate)
                    .eq(EmployeeAdvance::getTenantId, UserContext.tenantId()));
            if (cnt == null || cnt == 0) return candidate;
            seq++;
        }
        return prefix + System.nanoTime() % 1000000;
    }
}
