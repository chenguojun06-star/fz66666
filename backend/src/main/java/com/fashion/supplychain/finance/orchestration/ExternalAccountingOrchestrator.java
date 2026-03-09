package com.fashion.supplychain.finance.orchestration;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import java.math.BigDecimal;

/**
 * 外账对接编排器 (Finance Webhook Integration)
 * 模拟将系统内的成本、发票、应收应付数据同步到外部财务系统（如金蝶、用友）。
 */
@Slf4j
@Service
public class ExternalAccountingOrchestrator {

    public void syncReceivableToKingdee(String orderNo, BigDecimal amount, String customerId) {
        log.info("[ERP Data Sync] 同步应收账款到金蝶: 订单={}, 金额={}, 客户={}", orderNo, amount, customerId);
        // 这里可以对接真实的 Webhook / REST API
    }

    public void syncPayableToYonyou(String purchaseNo, BigDecimal amount, String supplierId) {
        log.info("[ERP Data Sync] 同步应付账款到用友: 采购单={}, 金额={}, 供应商={}", purchaseNo, amount, supplierId);
        // 这里可以对接真实的 Webhook / REST API
    }
}
