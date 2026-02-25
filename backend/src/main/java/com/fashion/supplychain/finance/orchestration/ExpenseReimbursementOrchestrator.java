package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.entity.ExpenseReimbursement;
import com.fashion.supplychain.finance.service.ExpenseReimbursementService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * 费用报销编排器
 * 负责报销单的创建、审批、付款等业务流程编排
 */
@Slf4j
@Service
public class ExpenseReimbursementOrchestrator {

    @Autowired
    private ExpenseReimbursementService expenseReimbursementService;

    /**
     * 创建报销单
     */
    @Transactional(rollbackFor = Exception.class)
    public ExpenseReimbursement createReimbursement(ExpenseReimbursement entity) {
        // 生成报销单号
        String reimbursementNo = expenseReimbursementService.generateReimbursementNo();
        entity.setReimbursementNo(reimbursementNo);

        // 设置申请人信息
        String uid = UserContext.userId();
        entity.setApplicantId(uid != null ? Long.parseLong(uid) : null);
        entity.setApplicantName(UserContext.username());
        entity.setStatus("pending");
        entity.setDeleteFlag(0);
        entity.setCreateBy(UserContext.username());
        entity.setCreateTime(LocalDateTime.now());
        entity.setUpdateTime(LocalDateTime.now());
        entity.setTenantId(UserContext.tenantId());

        expenseReimbursementService.save(entity);
        log.info("报销单创建成功: no={}, applicant={}, amount={}, type={}",
                reimbursementNo, entity.getApplicantName(), entity.getAmount(), entity.getExpenseType());

        return entity;
    }

    /**
     * 更新报销单（仅待审批状态可编辑）
     */
    @Transactional(rollbackFor = Exception.class)
    public ExpenseReimbursement updateReimbursement(ExpenseReimbursement entity) {
        ExpenseReimbursement existing = expenseReimbursementService.getById(entity.getId());
        if (existing == null) {
            throw new RuntimeException("报销单不存在");
        }
        if (!"pending".equals(existing.getStatus()) && !"rejected".equals(existing.getStatus())) {
            throw new RuntimeException("只有待审批或被驳回的报销单可以编辑");
        }
        // 只有本人可以编辑
        if (!String.valueOf(existing.getApplicantId()).equals(UserContext.userId())) {
            throw new RuntimeException("只能编辑自己的报销单");
        }

        // ⚠️ 用 LambdaUpdateWrapper 显式 SET NULL
        LambdaUpdateWrapper<ExpenseReimbursement> resubmitUw = new LambdaUpdateWrapper<>();
        resubmitUw.eq(ExpenseReimbursement::getId, entity.getId())
                  .set(ExpenseReimbursement::getUpdateBy, UserContext.username())
                  .set(ExpenseReimbursement::getUpdateTime, LocalDateTime.now())
                  .set(ExpenseReimbursement::getStatus, "pending")
                  .set(ExpenseReimbursement::getApprovalRemark, null);
        expenseReimbursementService.update(resubmitUw);
        entity.setStatus("pending");
        entity.setApprovalRemark(null);
        log.info("报销单更新: id={}, no={}", entity.getId(), existing.getReimbursementNo());

        return entity;
    }

    /**
     * 审批报销单
     * @param id 报销单ID
     * @param action approve=批准, reject=驳回
     * @param remark 审批备注
     */
    @Transactional(rollbackFor = Exception.class)
    public ExpenseReimbursement approveReimbursement(String id, String action, String remark) {
        ExpenseReimbursement entity = expenseReimbursementService.getById(id);
        if (entity == null) {
            throw new RuntimeException("报销单不存在");
        }
        if (!"pending".equals(entity.getStatus())) {
            throw new RuntimeException("只有待审批的报销单可以审批，当前状态: " + entity.getStatus());
        }

        String approverUid = UserContext.userId();
        entity.setApproverId(approverUid != null ? Long.parseLong(approverUid) : null);
        entity.setApproverName(UserContext.username());
        entity.setApprovalTime(LocalDateTime.now());
        entity.setApprovalRemark(remark);
        entity.setUpdateBy(UserContext.username());
        entity.setUpdateTime(LocalDateTime.now());

        if ("approve".equals(action)) {
            entity.setStatus("approved");
            log.info("报销单已批准: no={}, approver={}", entity.getReimbursementNo(), UserContext.username());
        } else if ("reject".equals(action)) {
            entity.setStatus("rejected");
            log.info("报销单已驳回: no={}, approver={}, reason={}", entity.getReimbursementNo(), UserContext.username(), remark);
        } else {
            throw new RuntimeException("无效的审批操作: " + action);
        }

        expenseReimbursementService.updateById(entity);
        return entity;
    }

    /**
     * 确认付款
     */
    @Transactional(rollbackFor = Exception.class)
    public ExpenseReimbursement confirmPayment(String id, String remark) {
        ExpenseReimbursement entity = expenseReimbursementService.getById(id);
        if (entity == null) {
            throw new RuntimeException("报销单不存在");
        }
        if (!"approved".equals(entity.getStatus())) {
            throw new RuntimeException("只有已批准的报销单可以付款，当前状态: " + entity.getStatus());
        }

        entity.setStatus("paid");
        entity.setPaymentTime(LocalDateTime.now());
        entity.setPaymentBy(UserContext.username());
        entity.setUpdateBy(UserContext.username());
        entity.setUpdateTime(LocalDateTime.now());
        if (remark != null) {
            entity.setApprovalRemark(remark);
        }

        expenseReimbursementService.updateById(entity);
        log.info("报销单已付款: no={}, amount={}, payTo={}", entity.getReimbursementNo(), entity.getAmount(), entity.getAccountName());

        return entity;
    }

    /**
     * 删除报销单（仅待审批/已驳回状态可删除）
     */
    @Transactional(rollbackFor = Exception.class)
    public void deleteReimbursement(String id) {
        ExpenseReimbursement entity = expenseReimbursementService.getById(id);
        if (entity == null) {
            throw new RuntimeException("报销单不存在");
        }
        if (!"pending".equals(entity.getStatus()) && !"rejected".equals(entity.getStatus())) {
            throw new RuntimeException("只有待审批或被驳回的报销单可以删除");
        }
        if (!String.valueOf(entity.getApplicantId()).equals(UserContext.userId()) && !UserContext.isSuperAdmin()) {
            throw new RuntimeException("只能删除自己的报销单");
        }

        // 软删除
        entity.setDeleteFlag(1);
        entity.setUpdateBy(UserContext.username());
        entity.setUpdateTime(LocalDateTime.now());
        expenseReimbursementService.updateById(entity);
        log.info("报销单已删除: no={}", entity.getReimbursementNo());
    }
}
