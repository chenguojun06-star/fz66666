package com.fashion.supplychain.style.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.style.entity.StyleQuotation;
import com.fashion.supplychain.style.orchestration.StyleQuotationOrchestrator;
import com.fashion.supplychain.style.orchestration.StyleQuotationAuditOrchestrator;
import lombok.Data;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/style/quotation")
@PreAuthorize("isAuthenticated()")
public class StyleQuotationController {

    @Autowired
    private StyleQuotationOrchestrator styleQuotationOrchestrator;

    @Autowired
    private StyleQuotationAuditOrchestrator styleQuotationAuditOrchestrator;

    @GetMapping
    public Result<StyleQuotation> getByStyleId(
            @RequestParam(required = false) String styleId,
            @RequestParam(required = false) String styleNo) {
        Long resolvedStyleId = StyleIdResolver.resolve(styleId, styleNo);
        if (resolvedStyleId == null) {
            return Result.fail("缺少参数 styleId 或 styleNo");
        }
        StyleQuotation quotation = styleQuotationOrchestrator.getByStyleId(resolvedStyleId);
        return Result.success(quotation);
    }

    @PostMapping
    public Result<Boolean> saveOrUpdate(@RequestBody StyleQuotation styleQuotation) {
        return Result.success(styleQuotationOrchestrator.saveOrUpdate(styleQuotation));
    }

    @PutMapping
    public Result<Boolean> update(@RequestBody StyleQuotation styleQuotation) {
        return Result.success(styleQuotationOrchestrator.saveOrUpdate(styleQuotation));
    }

    @PostMapping("/audit")
    public Result<StyleQuotation> audit(@RequestBody AuditRequest req) {
        return Result.success(styleQuotationAuditOrchestrator.audit(
                req.getStyleId(), req.getAuditStatus(), req.getAuditRemark()));
    }

    @PostMapping("/unlock")
    public Result<Boolean> unlock(@RequestBody UnlockRequest req) {
        if (req.getStyleId() == null) {
            return Result.fail("styleId不能为空");
        }
        if (req.getRemark() == null || req.getRemark().trim().isEmpty()) {
            return Result.fail("解锁备注不能为空");
        }
        styleQuotationOrchestrator.unlockQuotation(req.getStyleId(), req.getRemark().trim());
        return Result.success(true);
    }

    @Data
    static class AuditRequest {
        private Long styleId;
        private Integer auditStatus;
        private String auditRemark;
    }

    @Data
    static class UnlockRequest {
        private Long styleId;
        private String remark;
    }
}
