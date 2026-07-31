package com.fashion.supplychain.finance.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.finance.entity.AccountSubject;
import com.fashion.supplychain.finance.entity.AccountingVoucher;
import com.fashion.supplychain.finance.orchestration.AccountingVoucherOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 会计凭证 Controller — 凭证生成/查询/冲销 + 科目列表
 * <p>
 * 数据流转：
 * 1. 账单确认（BillAggregation.status=CONFIRMED）→ 调用 generate 生成凭证
 * 2. 账单冲销（reverseBySource）→ 调用 reverse 冲销对应凭证
 * 3. 凭证借贷必须平衡（debit_total = credit_total）
 * 4. 所有查询带 tenant_id（多租户隔离）
 */
@RestController
@RequestMapping("/api/finance/accounting")
@PreAuthorize("isAuthenticated()")
public class AccountingVoucherController {

    @Autowired
    private AccountingVoucherOrchestrator accountingVoucherOrchestrator;

    /** 从账单生成会计凭证（幂等，借贷平衡） */
    @PostMapping("/voucher/generate")
    public Result<AccountingVoucher> generateVoucher(@RequestParam String billAggregationId) {
        return Result.success(accountingVoucherOrchestrator.generateVoucherFromBill(billAggregationId));
    }

    /** 查询凭证列表（按凭证日期范围过滤） */
    @GetMapping("/voucher/list")
    public Result<List<AccountingVoucher>> listVouchers(
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        return Result.success(accountingVoucherOrchestrator.queryVouchers(startDate, endDate));
    }

    /** 凭证详情（含分录行） */
    @GetMapping("/voucher/detail/{id}")
    public Result<Map<String, Object>> voucherDetail(@PathVariable Long id) {
        return Result.success(accountingVoucherOrchestrator.getVoucherDetail(id));
    }

    /** 冲销凭证（生成红字凭证，借贷互换） */
    @PostMapping("/voucher/reverse/{id}")
    public Result<AccountingVoucher> reverseVoucher(@PathVariable Long id) {
        return Result.success(accountingVoucherOrchestrator.reverseVoucher(id));
    }

    /** 会计科目列表 */
    @GetMapping("/subjects")
    public Result<List<AccountSubject>> listSubjects() {
        return Result.success(accountingVoucherOrchestrator.querySubjects());
    }
}
