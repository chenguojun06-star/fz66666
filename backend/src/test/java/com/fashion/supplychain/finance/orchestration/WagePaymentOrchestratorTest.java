package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.entity.PaymentAccount;
import com.fashion.supplychain.finance.entity.WagePayment;
import com.fashion.supplychain.finance.service.ExpenseReimbursementService;
import com.fashion.supplychain.finance.service.MaterialReconciliationService;
import com.fashion.supplychain.finance.service.PaymentAccountService;
import com.fashion.supplychain.finance.service.WagePaymentService;
import com.fashion.supplychain.websocket.service.WebSocketService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WagePaymentOrchestratorTest {

    @Mock
    private PaymentAccountService paymentAccountService;

    @Mock
    private WagePaymentService wagePaymentService;

    @Mock
    private WebSocketService webSocketService;

    @Mock
    private MaterialReconciliationService materialReconciliationService;

    @Mock
    private ExpenseReimbursementService expenseReimbursementService;

    @InjectMocks
    private WagePaymentOrchestrator wagePaymentOrchestrator;

    @BeforeEach
    void setUp() {
        UserContext.clear();
        UserContext ctx = new UserContext();
        ctx.setTenantId(1L);
        ctx.setUserId("user001");
        UserContext.set(ctx);
    }

    // ─── listAccounts ────────────────────────────────────────────────────────

    @Test
    void listAccounts_returnsEmptyListWhenNoAccounts() {
        when(paymentAccountService.list(any(Wrapper.class))).thenReturn(Collections.emptyList());

        List<PaymentAccount> result = wagePaymentOrchestrator.listAccounts("worker", "w001");

        assertThat(result).isEmpty();
    }

    @Test
    void listAccounts_returnsAccountsFromService() {
        PaymentAccount account = new PaymentAccount();
        account.setId("acc001");
        account.setOwnerType("worker");
        account.setOwnerId("w001");
        account.setAccountType("wechat");

        when(paymentAccountService.list(any(Wrapper.class))).thenReturn(List.of(account));

        List<PaymentAccount> result = wagePaymentOrchestrator.listAccounts("worker", "w001");

        assertThat(result).hasSize(1);
        assertThat(result.get(0).getId()).isEqualTo("acc001");
    }

    // ─── removeAccount ───────────────────────────────────────────────────────

    @Test
    void removeAccount_withNonexistentAccount_throwsException() {
        when(paymentAccountService.getById(anyString())).thenReturn(null);

        assertThatThrownBy(() -> wagePaymentOrchestrator.removeAccount("acc999"))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("收款账户不存在");
    }

    @Test
    void removeAccount_setsStatusInactive() {
        PaymentAccount account = new PaymentAccount();
        account.setId("acc001");
        account.setTenantId(1L);

        when(paymentAccountService.getById("acc001")).thenReturn(account);
        when(paymentAccountService.updateById(any())).thenReturn(true);

        wagePaymentOrchestrator.removeAccount("acc001");

        assertThat(account.getStatus()).isEqualTo("inactive");
        verify(paymentAccountService).updateById(account);
    }

    // ─── confirmOfflinePayment ───────────────────────────────────────────────

    @Test
    void confirmOfflinePayment_withNonexistentPayment_throwsException() {
        when(wagePaymentService.getById(anyString())).thenReturn(null);

        assertThatThrownBy(() ->
            wagePaymentOrchestrator.confirmOfflinePayment("pay999", "http://proof.jpg", null))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("支付记录不存在");
    }

    @Test
    void confirmOfflinePayment_setsStatusSuccess() {
        WagePayment payment = new WagePayment();
        payment.setId("pay001");
        payment.setTenantId(1L);
        payment.setPaymentNo("PAY20260101001");

        when(wagePaymentService.getById("pay001")).thenReturn(payment);
        when(wagePaymentService.updateById(any())).thenReturn(true);

        WagePayment result = wagePaymentOrchestrator.confirmOfflinePayment(
            "pay001", "http://proof.jpg", "已收到");

        assertThat(result.getStatus()).isEqualTo("success");
        assertThat(result.getPaymentProof()).isEqualTo("http://proof.jpg");
        assertThat(result.getPaymentTime()).isNotNull();
    }

    // ─── saveAccount ─────────────────────────────────────────────────────────

    @Test
    void saveAccount_setsDefaultWhenFirstAccount() {
        when(paymentAccountService.count(any(Wrapper.class))).thenReturn(0L);
        when(paymentAccountService.saveOrUpdate(any())).thenReturn(true);

        PaymentAccount account = new PaymentAccount();
        account.setOwnerType("worker");
        account.setOwnerId("w001");
        account.setAccountType("wechat");

        PaymentAccount result = wagePaymentOrchestrator.saveAccount(account);

        assertThat(result.getIsDefault()).isEqualTo(1);
        assertThat(result.getTenantId()).isEqualTo(1L);
        assertThat(result.getStatus()).isEqualTo("active");
    }

    @Test
    void saveAccount_doesNotOverrideDefaultWhenAccountsExist() {
        when(paymentAccountService.count(any(Wrapper.class))).thenReturn(2L);
        when(paymentAccountService.saveOrUpdate(any())).thenReturn(true);

        PaymentAccount account = new PaymentAccount();
        account.setOwnerType("worker");
        account.setOwnerId("w001");
        account.setAccountType("alipay");
        account.setIsDefault(0);

        PaymentAccount result = wagePaymentOrchestrator.saveAccount(account);

        // should not be set to 1 (only set when existCount==0)
        assertThat(result.getIsDefault()).isEqualTo(0);
    }
}
