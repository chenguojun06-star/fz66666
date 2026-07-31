package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.entity.PayrollSettlement;
import com.fashion.supplychain.finance.service.PayrollSettlementService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

@Slf4j
@Component
public class PayrollSettlementNoGenerator {

    private static final DateTimeFormatter DAY_FMT = DateTimeFormatter.ofPattern("yyyyMMdd");

    @Autowired
    private PayrollSettlementService payrollSettlementService;

    public String nextSettlementNo() {
        String day = LocalDate.now().format(DAY_FMT);
        String prefix = "PS" + day;
        PayrollSettlement latest = payrollSettlementService
                .lambdaQuery()
                .eq(PayrollSettlement::getTenantId, UserContext.tenantId())
                .likeRight(PayrollSettlement::getSettlementNo, prefix)
                .orderByDesc(PayrollSettlement::getSettlementNo)
                .last("limit 1")
                .one();
        int seq = resolveNextSeq(prefix, latest == null ? null : latest.getSettlementNo());
        for (int i = 0; i < 200; i++) {
            String candidate = prefix + "%03d".formatted(seq);
            Long cnt = payrollSettlementService.count(
                    new LambdaQueryWrapper<PayrollSettlement>()
                            .eq(PayrollSettlement::getSettlementNo, candidate)
                            .eq(PayrollSettlement::getTenantId, UserContext.tenantId()));
            if (cnt == null || cnt == 0) {
                return candidate;
            }
            seq += 1;
        }
        String fallback = String.valueOf(System.nanoTime());
        String suffix = fallback.length() > 6 ? fallback.substring(fallback.length() - 6) : fallback;
        return prefix + suffix;
    }

    public int resolveNextSeq(String prefix, String latestValue) {
        if (!StringUtils.hasText(prefix) || !StringUtils.hasText(latestValue)) {
            return 1;
        }
        String v = latestValue.trim();
        if (!v.startsWith(prefix) || v.length() < prefix.length() + 3) {
            return 1;
        }
        String tail = v.substring(v.length() - 3);
        try {
            int n = Integer.parseInt(tail);
            return Math.max(1, n + 1);
        } catch (Exception e) {
            log.warn("Failed to parse payroll settlement sequence: prefix={}, latestValue={}", prefix, latestValue, e);
            return 1;
        }
    }
}
