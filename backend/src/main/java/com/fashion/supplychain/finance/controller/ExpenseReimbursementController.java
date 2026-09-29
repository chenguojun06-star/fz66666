package com.fashion.supplychain.finance.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.finance.entity.ExpenseReimbursement;
import com.fashion.supplychain.finance.entity.ExpenseReimbursementDoc;
import com.fashion.supplychain.finance.orchestration.ExpenseDocOrchestrator;
import com.fashion.supplychain.finance.orchestration.ExpenseReimbursementOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

import java.util.Map;

/**
 * 费用报销 Controller
 * 提供报销单的CRUD和审批流程API
 *
 * <p>本类只做「参数解析 + 调 Orchestrator + 组装 Result」。查询类接口原先直接注入
 * ExpenseReimbursementService / ExpenseReimbursementDocService（D-630 规则6 违规），
 * 已下沉到 {@link ExpenseReimbursementOrchestrator}。
 */
@Slf4j
@RestController
@RequestMapping("/api/finance/expense-reimbursement")
@PreAuthorize("isAuthenticated()")
public class ExpenseReimbursementController {

    @Autowired
    private ExpenseReimbursementOrchestrator orchestrator;

    @Autowired
    private ExpenseDocOrchestrator expenseDocOrchestrator;

    /**
     * 分页查询报销单列表
     * 支持参数：page, size, applicantId, status, expenseType, reimbursementNo, keyword
     */
    @PreAuthorize("isAuthenticated()")
    @GetMapping("/list")
    public Result<IPage<ExpenseReimbursement>> list(@RequestParam Map<String, Object> params) {
        return orchestrator.queryPage(params);
    }

    /**
     * 查询报销单详情
     */
    @PreAuthorize("isAuthenticated()")
    @GetMapping("/{id}")
    public Result<ExpenseReimbursement> getById(@PathVariable String id) {
        return orchestrator.getDetail(id);
    }

    /**
     * 创建报销单
     */
    @PreAuthorize("isAuthenticated()")
    @PostMapping
    public Result<ExpenseReimbursement> create(@RequestBody ExpenseReimbursement entity) {
        try {
            ExpenseReimbursement created = orchestrator.createReimbursement(entity);
            return Result.success(created);
        } catch (Exception e) {
            log.error("创建报销单失败", e);
            return Result.fail("创建失败: " + e.getMessage());
        }
    }

    /**
     * 更新报销单
     */
    @PreAuthorize("isAuthenticated()")
    @PutMapping
    public Result<ExpenseReimbursement> update(@RequestBody ExpenseReimbursement entity) {
        try {
            ExpenseReimbursement updated = orchestrator.updateReimbursement(entity);
            return Result.success(updated);
        } catch (Exception e) {
            log.error("更新报销单失败", e);
            return Result.fail("更新失败: " + e.getMessage());
        }
    }

    /**
     * 删除报销单（软删除）
     */
    @PreAuthorize("hasAnyAuthority('ROLE_admin', 'ROLE_ADMIN', 'ROLE_1', 'ROLE_tenant_owner', 'ROLE_管理员', 'ROLE_主管', 'ROLE_SUPER_ADMIN')")
    @DeleteMapping("/{id}")
    public Result<Boolean> delete(@PathVariable String id) {
        try {
            orchestrator.deleteReimbursement(id);
            return Result.success(true);
        } catch (Exception e) {
            log.error("删除报销单失败", e);
            return Result.fail("删除失败: " + e.getMessage());
        }
    }

    /**
     * 审批操作（批准/驳回）
     * action: approve=批准, reject=驳回
     */
    @PreAuthorize("hasAnyAuthority('ROLE_admin', 'ROLE_ADMIN', 'ROLE_1', 'ROLE_tenant_owner', 'ROLE_管理员', 'ROLE_主管', 'ROLE_SUPER_ADMIN')")
    @PostMapping("/{id}/approve")
    public Result<ExpenseReimbursement> approve(
            @PathVariable String id,
            @RequestParam String action,
            @RequestParam(required = false) String remark) {
        try {
            ExpenseReimbursement result = orchestrator.approveReimbursement(id, action, remark);
            return Result.success(result);
        } catch (Exception e) {
            log.error("审批报销单失败", e);
            return Result.fail("审批失败: " + e.getMessage());
        }
    }

    /**
     * 批量审批（全部批准）
     */
    @PreAuthorize("hasAnyAuthority('ROLE_admin', 'ROLE_ADMIN', 'ROLE_1', 'ROLE_tenant_owner', 'ROLE_管理员', 'ROLE_主管', 'ROLE_SUPER_ADMIN')")
    @PostMapping("/batch-approve")
    public Result<List<ExpenseReimbursement>> batchApprove(@RequestBody Map<String, Object> body) {
        try {
            @SuppressWarnings("unchecked")
            List<String> ids = (List<String>) body.get("ids");
            String remark = (String) body.get("remark");
            if (ids == null || ids.isEmpty()) {
                return Result.fail("请选择要审批的报销单");
            }
            List<ExpenseReimbursement> results = orchestrator.batchApproveReimbursement(ids, remark);
            return Result.success(results);
        } catch (Exception e) {
            log.error("批量审批报销单失败", e);
            return Result.fail("批量审批失败: " + e.getMessage());
        }
    }

    /**
     * 确认付款
     */
    @PreAuthorize("hasAnyAuthority('ROLE_admin', 'ROLE_ADMIN', 'ROLE_1', 'ROLE_tenant_owner', 'ROLE_管理员', 'ROLE_主管', 'ROLE_SUPER_ADMIN')")
    @PostMapping("/{id}/pay")
    public Result<ExpenseReimbursement> pay(
            @PathVariable String id,
            @RequestParam(required = false) String remark) {
        try {
            ExpenseReimbursement result = orchestrator.confirmPayment(id, remark);
            return Result.success(result);
        } catch (Exception e) {
            log.error("付款失败", e);
            return Result.fail("付款失败: " + e.getMessage());
        }
    }

    /**
     * 上传报销凭证图片并调用AI识别
     * 返回：docId, imageUrl, recognizedAmount, recognizedDate, recognizedTitle, recognizedType
     */
    @PreAuthorize("isAuthenticated()")
    @PostMapping(value = "/recognize-doc", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Result<java.util.Map<String, Object>> recognizeDoc(
            @RequestPart("file") MultipartFile file) {
        try {
            java.util.Map<String, Object> result = expenseDocOrchestrator.recognizeDoc(file);
            if (result.containsKey("error")) {
                return Result.fail(result.get("error").toString());
            }
            return Result.success(result);
        } catch (Exception e) {
            log.error("报销凭证识别失败", e);
            return Result.fail("识别失败: " + e.getMessage());
        }
    }

    /**
     * 查询报销单下的所有凭证
     */
    @PreAuthorize("isAuthenticated()")
    @GetMapping("/docs")
    public Result<List<ExpenseReimbursementDoc>> getDocs(
            @RequestParam String reimbursementId) {
        return orchestrator.listDocs(reimbursementId);
    }

    /**
     * 将上传的凭证绑定到已创建的报销单（提交报销单后调用）
     */
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/docs/link")
    public Result<Boolean> linkDocs(
            @RequestBody LinkDocsRequest req) {
        return orchestrator.linkDocs(req.getDocIds(), req.getReimbursementId(), req.getReimbursementNo());
    }

    /** 凭证绑定请求体 */
    public static class LinkDocsRequest {
        private List<String> docIds;
        private String reimbursementId;
        private String reimbursementNo;
        public List<String> getDocIds() { return docIds; }
        public void setDocIds(List<String> docIds) { this.docIds = docIds; }
        public String getReimbursementId() { return reimbursementId; }
        public void setReimbursementId(String reimbursementId) { this.reimbursementId = reimbursementId; }
        public String getReimbursementNo() { return reimbursementNo; }
        public void setReimbursementNo(String reimbursementNo) { this.reimbursementNo = reimbursementNo; }
    }
}
