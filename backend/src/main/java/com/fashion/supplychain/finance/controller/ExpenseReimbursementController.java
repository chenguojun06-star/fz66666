package com.fashion.supplychain.finance.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.ExpenseReimbursement;
import com.fashion.supplychain.finance.entity.ExpenseReimbursementDoc;
import com.fashion.supplychain.finance.orchestration.ExpenseDocOrchestrator;
import com.fashion.supplychain.finance.orchestration.ExpenseReimbursementOrchestrator;
import com.fashion.supplychain.finance.service.ExpenseReimbursementDocService;
import com.fashion.supplychain.finance.service.ExpenseReimbursementService;
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
 */
@Slf4j
@RestController
@RequestMapping("/api/finance/expense-reimbursement")
@PreAuthorize("isAuthenticated()")
public class ExpenseReimbursementController {

    @Autowired
    private ExpenseReimbursementOrchestrator orchestrator;

    @Autowired
    private ExpenseReimbursementService expenseReimbursementService;

    @Autowired
    private ExpenseDocOrchestrator expenseDocOrchestrator;

    @Autowired
    private ExpenseReimbursementDocService expenseReimbursementDocService;

    /**
     * 分页查询报销单列表
     * 支持参数：page, size, applicantId, status, expenseType, reimbursementNo, keyword
     */
    @PreAuthorize("isAuthenticated()")
    @GetMapping("/list")
    public Result<IPage<ExpenseReimbursement>> list(@RequestParam Map<String, Object> params) {
        IPage<ExpenseReimbursement> page = expenseReimbursementService.queryPage(params);
        return Result.success(page);
    }

    /**
     * 查询报销单详情
     */
    @PreAuthorize("isAuthenticated()")
    @GetMapping("/{id}")
    public Result<ExpenseReimbursement> getById(@PathVariable String id) {
        ExpenseReimbursement entity = expenseReimbursementService.getById(id);
        if (entity == null) {
            return Result.fail("报销单不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(entity.getTenantId(), "报销单");
        return Result.success(entity);
    }

    /**
     * 创建报销单
     */
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
    @PreAuthorize("isAuthenticated()")
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
    @PreAuthorize("isAuthenticated()")
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
    @PreAuthorize("isAuthenticated()")
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
    @PreAuthorize("isAuthenticated()")
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
        Long tenantId = UserContext.tenantId();
        List<ExpenseReimbursementDoc> docs =
                expenseReimbursementDocService.listByReimbursementId(tenantId, reimbursementId);
        return Result.success(docs);
    }

    /**
     * 将上传的凭证绑定到已创建的报销单（提交报销单后调用）
     */
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/docs/link")
    public Result<Boolean> linkDocs(
            @RequestBody LinkDocsRequest req) {
        try {
            expenseReimbursementDocService.linkDocs(req.getDocIds(), req.getReimbursementId(), req.getReimbursementNo());
            return Result.success(true);
        } catch (Exception e) {
            log.error("绑定凭证失败", e);
            return Result.fail("绑定失败: " + e.getMessage());
        }
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
