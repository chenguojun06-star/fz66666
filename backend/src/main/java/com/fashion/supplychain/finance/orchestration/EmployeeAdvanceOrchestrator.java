package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
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
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Component
@Slf4j
public class EmployeeAdvanceOrchestrator {

    private static final DateTimeFormatter DAY_FMT = DateTimeFormatter.ofPattern("yyyyMMdd");

    @Autowired
    private EmployeeAdvanceService employeeAdvanceService;

    @Autowired
    private PayrollSettlementService payrollSettlementService;

    public com.baomidou.mybatisplus.core.metadata.IPage<EmployeeAdvance> list(Map<String, Object> params) {
        TenantAssert.assertTenantContext();
        String employeeName = params != null ? (String) params.get("employeeName") : null;
        String status = params != null ? (String) params.get("status") : null;
        String repaymentStatus = params != null ? (String) params.get("repaymentStatus") : null;
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
        if (!UserContext.isTopAdmin()) {
            throw new org.springframework.security.access.AccessDeniedException("仅管理员及以上可审批借支");
        }
        EmployeeAdvance advance = employeeAdvanceService.getById(advanceId);
        if (advance == null || advance.getDeleteFlag() == 1) {
            throw new NoSuchElementException("借支记录不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(advance.getTenantId(), "员工借支");
        if (!"pending".equalsIgnoreCase(advance.getStatus())) {
            throw new IllegalStateException("只有待审批状态可审批");
        }
        LocalDateTime now = LocalDateTime.now();
        UserContext ctx = UserContext.get();
        advance.setStatus("approved");
        advance.setApproverId(ctx != null ? ctx.getUserId() : null);
        advance.setApproverName(ctx != null ? ctx.getUsername() : null);
        advance.setApprovalTime(now);
        advance.setApprovalRemark(remark);
        advance.setUpdateTime(now);
        employeeAdvanceService.updateById(advance);
        log.info("[EmployeeAdvance] 借支已审批通过: advanceNo={}, approver={}", advance.getAdvanceNo(), advance.getApproverName());
    }

    @Transactional(rollbackFor = Exception.class)
    public void reject(String advanceId, String remark) {
        TenantAssert.assertTenantContext();
        if (!UserContext.isTopAdmin()) {
            throw new org.springframework.security.access.AccessDeniedException("仅管理员及以上可审批借支");
        }
        EmployeeAdvance advance = employeeAdvanceService.getById(advanceId);
        if (advance == null || advance.getDeleteFlag() == 1) {
            throw new NoSuchElementException("借支记录不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(advance.getTenantId(), "员工借支");
        if (!"pending".equalsIgnoreCase(advance.getStatus())) {
            throw new IllegalStateException("只有待审批状态可驳回");
        }
        advance.setStatus("rejected");
        advance.setApprovalRemark(remark);
        advance.setUpdateTime(LocalDateTime.now());
        UserContext ctx = UserContext.get();
        if (ctx != null) {
            advance.setApproverId(ctx.getUserId());
            advance.setApproverName(ctx.getUsername());
            advance.setApprovalTime(LocalDateTime.now());
        }
        employeeAdvanceService.updateById(advance);
    }

    @Transactional(rollbackFor = Exception.class)
    public void repay(String advanceId, BigDecimal repayAmount) {
        TenantAssert.assertTenantContext();
        if (repayAmount == null || repayAmount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("还款金额必须大于0");
        }
        EmployeeAdvance advance = employeeAdvanceService.getById(advanceId);
        if (advance == null || advance.getDeleteFlag() == 1) {
            throw new NoSuchElementException("借支记录不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(advance.getTenantId(), "员工借支");
        if (!"approved".equalsIgnoreCase(advance.getStatus())) {
            throw new IllegalStateException("只有已审批的借支可还款");
        }
        BigDecimal remaining = advance.getRemainingAmount() != null ? advance.getRemainingAmount() : advance.getAmount();
        if (repayAmount.compareTo(remaining) > 0) {
            throw new IllegalArgumentException("还款金额不能超过剩余未还金额: " + remaining);
        }
        BigDecimal newRepaid = advance.getRepaymentAmount().add(repayAmount);
        BigDecimal newRemaining = advance.getAmount().subtract(newRepaid);
        advance.setRepaymentAmount(newRepaid);
        advance.setRemainingAmount(newRemaining);
        advance.setRepaymentStatus(newRemaining.compareTo(BigDecimal.ZERO) == 0 ? "repaid" : "partial");
        advance.setUpdateTime(LocalDateTime.now());
        employeeAdvanceService.updateById(advance);
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
                } catch (NumberFormatException ignored) {}
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
