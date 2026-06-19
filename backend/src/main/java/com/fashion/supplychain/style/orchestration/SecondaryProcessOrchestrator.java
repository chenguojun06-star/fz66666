package com.fashion.supplychain.style.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.orchestration.BillAggregationOrchestrator;
import com.fashion.supplychain.style.entity.SecondaryProcess;
import com.fashion.supplychain.style.service.SecondaryProcessService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;

/**
 * 二次工艺编排器
 * <p>
 * 核心职责：
 * 1. createProcess() — 新建二次工艺（数据规范化 + 保存 + 报价重算）
 * 2. updateProcess() — 更新二次工艺（数据规范化 + 更新 + 报价重算）
 * 3. deleteProcess() — 删除二次工艺（删除 + 报价重算）
 * 4. approveProcess() — 审批二次工艺（状态流转 + 账单推送）
 */
@Service
@Slf4j
public class SecondaryProcessOrchestrator {

    @Autowired
    private SecondaryProcessService secondaryProcessService;

    @Autowired
    private StyleQuotationOrchestrator styleQuotationOrchestrator;

    @Autowired
    private BillAggregationOrchestrator billAggregationOrchestrator;

    public List<SecondaryProcess> listByStyleId(Long styleId) {
        if (styleId == null) {
            return List.of();
        }
        return secondaryProcessService.listByStyleId(styleId);
    }

    public SecondaryProcess getById(Long id) {
        if (id == null) {
            return null;
        }
        return secondaryProcessService.getById(id);
    }

    @Transactional(rollbackFor = Exception.class)
    public SecondaryProcess createProcess(SecondaryProcess process) {
        if (process == null) {
            throw new IllegalArgumentException("参数不能为空");
        }
        normalizeProcess(process, null);
        boolean ok = secondaryProcessService.save(process);
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }
        try {
            styleQuotationOrchestrator.recalculateFromLiveData(process.getStyleId());
        } catch (Exception e) {
            log.warn("Auto-sync quotation failed after secondary process create: styleId={}", process.getStyleId(), e);
        }
        return process;
    }

    @Transactional(rollbackFor = Exception.class)
    public SecondaryProcess updateProcess(Long id, SecondaryProcess process) {
        if (id == null || process == null) {
            throw new IllegalArgumentException("参数不能为空");
        }
        SecondaryProcess existing = secondaryProcessService.getById(id);
        process.setId(id);
        normalizeProcess(process, existing);
        boolean ok = secondaryProcessService.updateById(process);
        if (!ok) {
            throw new IllegalStateException("更新失败");
        }
        Long styleId = process.getStyleId();
        if (styleId == null) {
            styleId = existing != null ? existing.getStyleId() : null;
        }
        if (styleId != null) {
            try {
                styleQuotationOrchestrator.recalculateFromLiveData(styleId);
            } catch (Exception e) {
                log.warn("Auto-sync quotation failed after secondary process update: styleId={}", styleId, e);
            }
        }
        return process;
    }

    @Transactional(rollbackFor = Exception.class)
    public void deleteProcess(Long id) {
        if (id == null) {
            throw new IllegalArgumentException("id不能为空");
        }
        SecondaryProcess existing = secondaryProcessService.getById(id);
        Long styleId = existing != null ? existing.getStyleId() : null;

        boolean ok = secondaryProcessService.removeById(id);
        if (!ok) {
            if (secondaryProcessService.getById(id) == null) {
                log.warn("[SECONDARY-PROCESS-DELETE] id={} already deleted, idempotent success", id);
                return;
            }
            throw new IllegalStateException("删除失败");
        }

        if (styleId != null) {
            try {
                styleQuotationOrchestrator.recalculateFromLiveData(styleId);
            } catch (Exception e) {
                log.warn("Auto-sync quotation failed after secondary process delete: styleId={}", styleId, e);
            }
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public SecondaryProcess approveProcess(Long id, Map<String, Object> body) {
        if (id == null) {
            throw new IllegalArgumentException("id不能为空");
        }
        SecondaryProcess process = secondaryProcessService.getById(id);
        if (process == null) {
            throw new NoSuchElementException("二次工艺不存在");
        }

        if ("approved".equals(process.getApprovalStatus())) {
            throw new IllegalStateException("已审批，不可重复操作");
        }

        String action = body != null && body.get("action") != null
                ? body.get("action").toString()
                : "approve";
        if ("approve".equalsIgnoreCase(action)) {
            process.setApprovalStatus("approved");
            process.setApprovedById(UserContext.userId());
            process.setApprovedByName(UserContext.username());
            process.setApprovedTime(LocalDateTime.now());

            if (process.getTotalPrice() != null && process.getTotalPrice().compareTo(java.math.BigDecimal.ZERO) > 0) {
                BillAggregationOrchestrator.BillPushRequest req = new BillAggregationOrchestrator.BillPushRequest();
                req.setBillType("PAYABLE");
                req.setBillCategory("SECONDARY_PROCESS");
                req.setSourceType("SECONDARY_PROCESS");
                req.setSourceId(String.valueOf(id));
                req.setSourceNo("SP-" + id);
                req.setCounterpartyType("FACTORY");
                req.setCounterpartyId(process.getFactoryId());
                req.setCounterpartyName(process.getFactoryName());
                req.setAmount(process.getTotalPrice());
                req.setRemark("二次工艺审批: " + process.getProcessName());
                req.setSettlementMonth(LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM")));
                billAggregationOrchestrator.pushBill(req);
            }
        } else {
            process.setApprovalStatus("rejected");
        }

        process.setUpdatedAt(LocalDateTime.now());
        boolean ok = secondaryProcessService.updateById(process);
        if (!ok) {
            throw new IllegalStateException("更新失败");
        }
        return process;
    }

    private void normalizeProcess(SecondaryProcess process, SecondaryProcess existing) {
        if (process == null) {
            return;
        }
        if (!StringUtils.hasText(process.getProcessType())) {
            String existingType = (existing != null && StringUtils.hasText(existing.getProcessType()))
                    ? existing.getProcessType() : null;
            process.setProcessType(existingType != null ? existingType : "二次工艺");
        }
        String normalizedStatus = normalizeStatus(process.getStatus());
        process.setStatus(normalizedStatus);

        String currentUser = StringUtils.hasText(UserContext.username()) ? UserContext.username().trim() : null;
        String assignee = firstNonBlank(process.getAssignee(), existing != null ? existing.getAssignee() : null, currentUser);
        if (StringUtils.hasText(assignee)) {
            process.setAssignee(assignee);
        }

        if ("completed".equals(normalizedStatus)) {
            LocalDateTime completedTime = process.getCompletedTime();
            if (completedTime == null && existing != null) {
                completedTime = existing.getCompletedTime();
            }
            process.setCompletedTime(completedTime != null ? completedTime : LocalDateTime.now());
            return;
        }

        process.setCompletedTime(null);
    }

    private String normalizeStatus(String rawStatus) {
        String status = StringUtils.hasText(rawStatus) ? rawStatus.trim().toLowerCase() : "pending";
        return Set.of("pending", "processing", "completed", "cancelled").contains(status) ? status : "pending";
    }

    private String firstNonBlank(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (StringUtils.hasText(value)) {
                return value.trim();
            }
        }
        return null;
    }
}
