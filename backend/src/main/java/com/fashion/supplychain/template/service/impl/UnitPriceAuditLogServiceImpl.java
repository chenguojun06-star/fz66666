package com.fashion.supplychain.template.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.template.entity.UnitPriceAuditLog;
import com.fashion.supplychain.template.mapper.UnitPriceAuditLogMapper;
import com.fashion.supplychain.template.service.UnitPriceAuditLogService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;

@Service
@Slf4j
public class UnitPriceAuditLogServiceImpl extends ServiceImpl<UnitPriceAuditLogMapper, UnitPriceAuditLog>
        implements UnitPriceAuditLogService {

    @Override
    public void logPriceChange(String styleNo, String processName, BigDecimal oldPrice, BigDecimal newPrice,
            String changeSource, String relatedId, String operator, String remark) {
        if (!StringUtils.hasText(styleNo) || !StringUtils.hasText(processName)) {
            return;
        }

        // 价格无变化时不记录
        BigDecimal oldVal = oldPrice == null ? BigDecimal.ZERO : oldPrice;
        BigDecimal newVal = newPrice == null ? BigDecimal.ZERO : newPrice;
        if (oldVal.compareTo(newVal) == 0) {
            return;
        }

        try {
            UnitPriceAuditLog auditLog = new UnitPriceAuditLog();
            auditLog.setStyleNo(styleNo.trim());
            auditLog.setProcessName(processName.trim());
            auditLog.setOldPrice(oldVal);
            auditLog.setNewPrice(newVal);
            auditLog.setChangeSource(StringUtils.hasText(changeSource) ? changeSource.trim() : "unknown");
            auditLog.setRelatedId(StringUtils.hasText(relatedId) ? relatedId.trim() : null);

            String op = operator;
            if (!StringUtils.hasText(op)) {
                UserContext ctx = UserContext.get();
                op = ctx != null ? ctx.getUsername() : "system";
            }
            auditLog.setOperator(op);
            auditLog.setCreateTime(LocalDateTime.now());
            auditLog.setRemark(StringUtils.hasText(remark) ? remark.trim() : null);

            save(auditLog);
            log.info("Unit price audit logged: styleNo={}, process={}, {} -> {}", styleNo, processName, oldVal, newVal);
        } catch (Exception e) {
            log.error("Failed to log unit price audit: styleNo={}, process={}", styleNo, processName, e);
        }
    }

    @Override
    public List<UnitPriceAuditLog> listByStyleNo(String styleNo) {
        if (!StringUtils.hasText(styleNo)) {
            return Collections.emptyList();
        }
        return list(new LambdaQueryWrapper<UnitPriceAuditLog>()
                .eq(UnitPriceAuditLog::getStyleNo, styleNo.trim())
                .orderByDesc(UnitPriceAuditLog::getCreateTime));
    }

    @Override
    public List<UnitPriceAuditLog> listByStyleNoAndProcess(String styleNo, String processName) {
        if (!StringUtils.hasText(styleNo) || !StringUtils.hasText(processName)) {
            return Collections.emptyList();
        }
        return list(new LambdaQueryWrapper<UnitPriceAuditLog>()
                .eq(UnitPriceAuditLog::getStyleNo, styleNo.trim())
                .eq(UnitPriceAuditLog::getProcessName, processName.trim())
                .orderByDesc(UnitPriceAuditLog::getCreateTime));
    }
}
