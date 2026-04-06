package com.fashion.supplychain.style.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.style.entity.StyleQuotation;
import com.fashion.supplychain.style.service.StyleQuotationService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * 报价单审核独立编排器（不影响 StyleQuotationOrchestrator 的数据流）
 * <p>
 * 审核状态：0=待审核（默认），1=审核通过，2=审核驳回
 * 业务规则：报价单必须先保存锁定（isLocked=1）才可进行审核操作
 */
@Slf4j
@Service
public class StyleQuotationAuditOrchestrator {

    @Autowired
    private StyleQuotationService styleQuotationService;

    /**
     * 审核报价单
     *
     * @param styleId     款号ID
     * @param auditStatus 审核结论（1=审核通过，2=审核驳回）
     * @param auditRemark 审核意见
     * @return 更新后的报价单
     */
    @Transactional(rollbackFor = Exception.class)
    public StyleQuotation audit(Long styleId, Integer auditStatus, String auditRemark) {
        StyleQuotation q = styleQuotationService.lambdaQuery()
                .eq(StyleQuotation::getStyleId, styleId)
                .one();
        if (q == null) {
            throw new IllegalArgumentException("报价单不存在，请先保存报价单");
        }
        if (!Integer.valueOf(1).equals(q.getIsLocked())) {
            throw new IllegalStateException("报价单未锁定，请先保存并锁定报价单后再进行审核");
        }
        if (auditStatus == null || (auditStatus != 1 && auditStatus != 2)) {
            throw new IllegalArgumentException("审核状态无效，必须为 1（通过）或 2（驳回）");
        }

        q.setAuditStatus(auditStatus);
        q.setAuditRemark(auditRemark);
        q.setAuditorId(UserContext.userId());
        q.setAuditorName(UserContext.username());
        q.setAuditTime(LocalDateTime.now());
        styleQuotationService.updateById(q);

        log.info("[QuotationAudit] styleId={} auditStatus={} auditor={}", styleId, auditStatus, q.getAuditorName());
        return q;
    }

    /**
     * 重置审核状态（退回至待审核，用于报价单解锁后重新修改的场景）
     *
     * @param styleId 款号ID
     */
    @Transactional(rollbackFor = Exception.class)
    public void resetAuditStatus(Long styleId) {
        StyleQuotation q = styleQuotationService.lambdaQuery()
                .eq(StyleQuotation::getStyleId, styleId)
                .one();
        if (q == null) {
            return;
        }
        q.setAuditStatus(0);
        q.setAuditRemark(null);
        q.setAuditorId(null);
        q.setAuditorName(null);
        q.setAuditTime(null);
        styleQuotationService.updateById(q);
        log.info("[QuotationAudit] styleId={} audit reset to pending by {}", styleId, UserContext.username());
    }
}
