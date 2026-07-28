package com.fashion.supplychain.style.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
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
        Long tenantId = UserContext.tenantId();
        return secondaryProcessService.lambdaQuery()
                .eq(SecondaryProcess::getStyleId, styleId)
                .eq(SecondaryProcess::getTenantId, tenantId)
                .list();
    }

    public SecondaryProcess getById(Long id) {
        if (id == null) {
            return null;
        }
        Long tenantId = UserContext.tenantId();
        return secondaryProcessService.lambdaQuery()
                .eq(SecondaryProcess::getId, id)
                .eq(SecondaryProcess::getTenantId, tenantId)
                .one();
    }

    @Transactional(rollbackFor = Exception.class)
    public SecondaryProcess createProcess(SecondaryProcess process) {
        if (process == null) {
            throw new IllegalArgumentException("参数不能为空");
        }
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        process.setTenantId(tenantId);
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
        Long tenantId = UserContext.tenantId();
        SecondaryProcess existing = secondaryProcessService.lambdaQuery()
                .eq(SecondaryProcess::getId, id)
                .eq(SecondaryProcess::getTenantId, tenantId)
                .one();
        process.setId(id);
        normalizeProcess(process, existing);
        boolean ok = secondaryProcessService.updateById(process);
        if (!ok) {
            throw new IllegalStateException("更新失败");
        }

        // P1-3 修复：已审批的二次工艺，若 totalPrice 或 factoryId 变化，同步账单
        // P0-5 修复：再激活逻辑 — 审批状态从 approved 改回 pending/rejected 时反向账单
        // - totalPrice 变化 → syncAmountBySource 同步金额
        // - factoryId 变化 → 先 reverseBySource 再 pushBill（重推）
        // - approvalStatus 从 approved → 非 approved → reverseBySource（再激活/撤销审批）
        // - 失败不阻塞主流程（账单异常走人工对账）
        if (existing != null && "approved".equals(existing.getApprovalStatus())
                && billAggregationOrchestrator != null) {
            java.math.BigDecimal existingTotal = existing.getTotalPrice();
            java.math.BigDecimal newTotal = process.getTotalPrice();
            String existingFactoryId = existing.getFactoryId();
            String newFactoryId = process.getFactoryId();
            String newApprovalStatus = process.getApprovalStatus();
            boolean totalPriceChanged = newTotal != null
                    && (existingTotal == null || newTotal.compareTo(existingTotal) != 0);
            boolean factoryIdChanged = newFactoryId != null
                    && !newFactoryId.equals(existingFactoryId);
            // P0-5 再激活：审批状态从 approved 变为其他状态（pending/rejected/cancelled）
            boolean approvalReverted = StringUtils.hasText(newApprovalStatus)
                    && !"approved".equals(newApprovalStatus);
            try {
                if (approvalReverted) {
                    // 再激活/撤销审批：反向已推送的账单
                    try {
                        billAggregationOrchestrator.reverseBySource("SECONDARY_PROCESS",
                                String.valueOf(id), "二次工艺撤销审批（再激活）: oldStatus=approved, newStatus="
                                        + newApprovalStatus);
                        log.info("[SECONDARY-PROCESS-UPDATE] 撤销审批联动反向账单: id={}, newStatus={}",
                                id, newApprovalStatus);
                    } catch (Exception e) {
                        log.warn("[SECONDARY-PROCESS-UPDATE] 撤销审批反向账单失败(不阻塞主流程): id={}, err={}",
                                id, e.getMessage());
                    }
                } else if (factoryIdChanged) {
                    // 工厂变更：先反向旧账单，再按新工厂重推
                    try {
                        billAggregationOrchestrator.reverseBySource("SECONDARY_PROCESS",
                                String.valueOf(id), "二次工艺工厂变更重推: oldFactory=" + existingFactoryId
                                        + ", newFactory=" + newFactoryId);
                    } catch (Exception e) {
                        log.warn("[SECONDARY-PROCESS-UPDATE] 工厂变更反向旧账单失败(继续重推): id={}, err={}",
                                id, e.getMessage());
                    }
                    BillAggregationOrchestrator.BillPushRequest req = new BillAggregationOrchestrator.BillPushRequest();
                    req.setBillType("PAYABLE");
                    req.setBillCategory("EXTERNAL_FACTORY");
                    req.setSourceType("SECONDARY_PROCESS");
                    req.setSourceId(String.valueOf(id));
                    req.setSourceNo("SP-" + id);
                    req.setCounterpartyType("FACTORY");
                    req.setCounterpartyId(newFactoryId);
                    req.setCounterpartyName(process.getFactoryName());
                    req.setAmount(newTotal != null ? newTotal : existingTotal);
                    req.setRemark("二次工艺工厂变更重推: " + process.getProcessName());
                    req.setSettlementMonth(LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM")));
                    billAggregationOrchestrator.pushBill(req);
                    log.info("[SECONDARY-PROCESS-UPDATE] 工厂变更重推账单: id={}, newFactoryId={}", id, newFactoryId);
                } else if (totalPriceChanged) {
                    billAggregationOrchestrator.syncAmountBySource("SECONDARY_PROCESS",
                            String.valueOf(id), newTotal);
                    log.info("[SECONDARY-PROCESS-UPDATE] 同步账单金额: id={}, newTotal={}", id, newTotal);
                }
            } catch (Exception e) {
                log.warn("[SECONDARY-PROCESS-UPDATE] 账单同步失败(不阻塞主流程): id={}, err={}",
                        id, e.getMessage());
            }
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
        Long tenantId = UserContext.tenantId();
        SecondaryProcess existing = secondaryProcessService.lambdaQuery()
                .eq(SecondaryProcess::getId, id)
                .eq(SecondaryProcess::getTenantId, tenantId)
                .one();
        Long styleId = existing != null ? existing.getStyleId() : null;

        // P0-3 + P1-3 修复：删除前若已审批，反向已推送的账单（避免账单悬挂）
        // 放在 removeById 之前，确保账单反向在事务内完成
        if (existing != null && "approved".equals(existing.getApprovalStatus())) {
            try {
                if (billAggregationOrchestrator != null) {
                    billAggregationOrchestrator.reverseBySource("SECONDARY_PROCESS",
                            String.valueOf(id), "二次工艺删除");
                    log.info("[SECONDARY-PROCESS-DELETE] 删除联动反向账单: id={}", id);
                }
            } catch (Exception e) {
                log.warn("[SECONDARY-PROCESS-DELETE] 反向账单失败(不阻塞删除): id={}, err={}", id, e.getMessage());
            }
        }

        boolean ok = secondaryProcessService.lambdaUpdate()
                .eq(SecondaryProcess::getId, id)
                .eq(SecondaryProcess::getTenantId, tenantId)
                .remove();
        if (!ok) {
            if (secondaryProcessService.lambdaQuery()
                    .eq(SecondaryProcess::getId, id)
                    .eq(SecondaryProcess::getTenantId, tenantId)
                    .one() == null) {
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
        // P3 审计修复：显式校验租户归属（P0铁律4 多租户隔离）
        TenantAssert.assertBelongsToCurrentTenant(process.getTenantId(), "二次工艺");

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
                // P1-5 修复：二次工艺对方是 FACTORY（外协外发），归入"外发厂"类别
                // 原值 "SECONDARY_PROCESS" 不在 BillAggregation 声明的 7 种枚举中
                req.setBillCategory("EXTERNAL_FACTORY");
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
            // P0 财务闭环修复：审核拒绝时反向已推送的二次工艺账单（sourceType=SECONDARY_PROCESS）
            // 避免账单悬挂（审核通过时已推 PAYABLE 账单，拒绝时需反向）
            try {
                billAggregationOrchestrator.reverseBySource("SECONDARY_PROCESS",
                        String.valueOf(id), "二次工艺审核拒绝");
                log.info("[二次工艺] 拒绝联动反向账单: processId={}", id);
            } catch (Exception e) {
                // 已结清账单会抛异常 — 不阻塞拒绝主流程，记录告警供财务对账
                log.warn("[二次工艺] 拒绝联动反向账单失败（可能存在已结清账单需手动冲账）: processId={}, err={}",
                        id, e.getMessage());
            }
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
