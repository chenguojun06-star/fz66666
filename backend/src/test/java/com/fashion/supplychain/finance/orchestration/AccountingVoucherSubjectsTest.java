package com.fashion.supplychain.finance.orchestration;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * D-474 付款凭证科目规则测试（纯函数，不启 Spring、不连库）。
 *
 * 这是"钱"的规则：借方必须冲掉确认时挂的应付科目，贷方必须走银行/现金，
 * 弄反或写错科目会导致账实不符，用测试钉死。
 */
class AccountingVoucherSubjectsTest {

    @Test
    @DisplayName("银行付款：借应付账款、贷银行存款（1002）")
    void bankPaymentUsesBankDeposit() {
        AccountingVoucherOrchestrator.PaymentSubjects s =
                AccountingVoucherOrchestrator.resolvePaymentSubjects("2202", "OFFLINE");
        assertEquals("2202", s.getDebit(), "借方应为确认时挂的应付账款");
        assertEquals("1002", s.getCredit(), "贷方应为银行存款");
    }

    @Test
    @DisplayName("工资付款：借应付职工薪酬（2211）、贷银行存款")
    void payrollPaymentUsesSalaryPayable() {
        AccountingVoucherOrchestrator.PaymentSubjects s =
                AccountingVoucherOrchestrator.resolvePaymentSubjects("2211", "BANK");
        assertEquals("2211", s.getDebit(), "工资走应付职工薪酬");
        assertEquals("1002", s.getCredit());
    }

    @Test
    @DisplayName("现金付款：贷方记库存现金（1001）")
    void cashPaymentUsesCash() {
        AccountingVoucherOrchestrator.PaymentSubjects s =
                AccountingVoucherOrchestrator.resolvePaymentSubjects("2202", "CASH");
        assertEquals("1001", s.getCredit(), "现金付款应记库存现金");
    }

    @Test
    @DisplayName("支付方式为空时默认走银行存款")
    void nullMethodFallsBackToBank() {
        AccountingVoucherOrchestrator.PaymentSubjects s =
                AccountingVoucherOrchestrator.resolvePaymentSubjects("2202", null);
        assertEquals("1002", s.getCredit(), "未指定支付方式默认银行存款");
    }
}
