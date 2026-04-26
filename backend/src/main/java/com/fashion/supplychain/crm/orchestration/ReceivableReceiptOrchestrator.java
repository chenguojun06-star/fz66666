package com.fashion.supplychain.crm.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.crm.entity.Receivable;
import com.fashion.supplychain.crm.entity.ReceivableReceiptLog;
import com.fashion.supplychain.crm.service.ReceivableReceiptLogService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class ReceivableReceiptOrchestrator {

    private final ReceivableReceiptLogService receivableReceiptLogService;

    @Transactional(rollbackFor = Exception.class)
    public ReceivableReceiptLog recordReceipt(Receivable receivable, BigDecimal amount, String remark) {
        TenantAssert.assertTenantContext();
        UserContext ctx = UserContext.get();
        ReceivableReceiptLog log = new ReceivableReceiptLog();
        log.setReceivableId(receivable.getId());
        log.setReceivableNo(receivable.getReceivableNo());
        log.setCustomerId(receivable.getCustomerId());
        log.setCustomerName(receivable.getCustomerName());
        log.setSourceBizType(receivable.getSourceBizType());
        log.setSourceBizId(receivable.getSourceBizId());
        log.setSourceBizNo(receivable.getSourceBizNo());
        log.setReceivedAmount(amount);
        log.setRemark(remark);
        log.setReceivedTime(LocalDateTime.now());
        log.setTenantId(UserContext.tenantId());
        log.setDeleteFlag(0);
        if (ctx != null) {
            log.setOperatorId(ctx.getUserId() == null ? null : String.valueOf(ctx.getUserId()));
            log.setOperatorName(ctx.getUsername());
        }
        receivableReceiptLogService.save(log);
        return log;
    }

    public List<ReceivableReceiptLog> listByReceivableId(String receivableId) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        return receivableReceiptLogService.list(new LambdaQueryWrapper<ReceivableReceiptLog>()
                .eq(ReceivableReceiptLog::getDeleteFlag, 0)
                .eq(ReceivableReceiptLog::getTenantId, tenantId)
                .eq(ReceivableReceiptLog::getReceivableId, receivableId)
                .orderByDesc(ReceivableReceiptLog::getReceivedTime)
                .orderByDesc(ReceivableReceiptLog::getCreateTime));
    }
}
