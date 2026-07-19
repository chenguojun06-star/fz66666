package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.crm.orchestration.ReceivableOrchestrator;
import com.fashion.supplychain.finance.entity.BillAggregation;
import com.fashion.supplychain.finance.entity.Payable;
import com.fashion.supplychain.finance.service.BillAggregationService;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 账单汇总编排器 — 统一收付款账单聚合
 * <p>
 * 核心职责：
 * 1. pushBill() — 各模块审批通过后推送账单（幂等，uk_source去重）
 * 2. listBills() — 分页查询账单列表
 * 3. confirmBill() / batchConfirm() — 账单确认
 * 4. settleBill() — 账单结清
 * 5. cancelBill() — 取消账单
 * 6. getStats() — 统计数据（各状态金额汇总）
 */
@Slf4j
@Service
public class BillAggregationOrchestrator {

    @Autowired
    private BillAggregationService billAggregationService;

    @Autowired(required = false)
    private PayableOrchestrator payableOrchestrator;

    @Autowired(required = false)
    private ReceivableOrchestrator receivableOrchestrator;

    // ==================== 1. 账单推送（各模块调用） ====================

    /**
     * 推送账单到汇总表（幂等 — 基于 source_type + source_id + tenant_id 唯一索引）
     */
    public boolean billExists(String sourceType, String sourceId) {
        Long tenantId = TenantAssert.requireTenantId();
        return billAggregationService.lambdaQuery()
                .eq(BillAggregation::getSourceType, sourceType)
                .eq(BillAggregation::getSourceId, sourceId)
                .eq(BillAggregation::getTenantId, tenantId)
                .eq(BillAggregation::getDeleteFlag, 0)
                .exists();
    }

    public boolean billExistsByOrderId(String sourceType, String orderId) {
        Long tenantId = TenantAssert.requireTenantId();
        return billAggregationService.lambdaQuery()
                .eq(BillAggregation::getSourceType, sourceType)
                .eq(BillAggregation::getOrderId, orderId)
                .eq(BillAggregation::getTenantId, tenantId)
                .eq(BillAggregation::getDeleteFlag, 0)
                .exists();
    }

    public void syncAmountBySource(String sourceType, String sourceId, BigDecimal newAmount) {
        if (!StringUtils.hasText(sourceType) || !StringUtils.hasText(sourceId) || newAmount == null) {
            return;
        }
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        BillAggregation bill = billAggregationService.lambdaQuery()
                .eq(BillAggregation::getSourceType, sourceType)
                .eq(BillAggregation::getSourceId, sourceId)
                .eq(BillAggregation::getTenantId, tenantId)
                .eq(BillAggregation::getDeleteFlag, 0)
                .last("LIMIT 1")
                .one();
        if (bill != null && !"SETTLED".equals(bill.getStatus()) && !"CANCELLED".equals(bill.getStatus())) {
            bill.setAmount(newAmount);
            billAggregationService.updateById(bill);
            log.info("[BillAggregation] 同步金额: sourceType={}, sourceId={}, newAmount={}, billStatus={}", sourceType, sourceId, newAmount, bill.getStatus());
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public BillAggregation pushBill(BillPushRequest request) {
        Long tenantId = TenantAssert.requireTenantId();

        // 幂等检查：同来源不重复推送
        BillAggregation existing = billAggregationService.lambdaQuery()
                .eq(BillAggregation::getSourceType, request.getSourceType())
                .eq(BillAggregation::getSourceId, request.getSourceId())
                .eq(BillAggregation::getTenantId, tenantId)
                .eq(BillAggregation::getDeleteFlag, 0)
                .one();
        if (existing != null) {
            if (request.getAmount() != null && existing.getAmount() != null
                    && request.getAmount().compareTo(existing.getAmount()) != 0
                    && !"SETTLED".equals(existing.getStatus()) && !"CANCELLED".equals(existing.getStatus())) {
                existing.setAmount(request.getAmount());
                existing.setRemark((existing.getRemark() != null ? existing.getRemark() + " | " : "")
                        + "金额同步更新: " + existing.getAmount() + "→" + request.getAmount());
                billAggregationService.updateById(existing);
                log.info("[BillAggregation] 账单金额同步: billNo={}, old={}, new={}",
                        existing.getBillNo(), existing.getAmount(), request.getAmount());
            }
            log.info("[BillAggregation] 账单已存在: sourceType={}, sourceId={}, billNo={}",
                    request.getSourceType(), request.getSourceId(), existing.getBillNo());
            return existing;
        }

        BillAggregation bill = new BillAggregation();
        bill.setBillNo(generateBillNo());
        bill.setBillType(request.getBillType());
        bill.setBillCategory(request.getBillCategory());
        bill.setSourceType(request.getSourceType());
        bill.setSourceId(request.getSourceId());
        bill.setSourceNo(request.getSourceNo());
        bill.setCounterpartyType(request.getCounterpartyType());
        bill.setCounterpartyId(request.getCounterpartyId());
        bill.setCounterpartyName(request.getCounterpartyName());
        bill.setOrderId(request.getOrderId());
        bill.setOrderNo(request.getOrderNo());
        bill.setStyleNo(request.getStyleNo());
        bill.setAmount(request.getAmount());
        bill.setSettledAmount(BigDecimal.ZERO);
        bill.setStatus("PENDING");
        bill.setSettlementMonth(request.getSettlementMonth());
        bill.setRemark(request.getRemark());
        bill.setCreatorId(UserContext.userId());
        bill.setCreatorName(UserContext.username());
        bill.setTenantId(tenantId);
        bill.setDeleteFlag(0);

        billAggregationService.save(bill);
        log.info("[BillAggregation] 推送账单: billNo={}, type={}, category={}, amount={}, source={}:{}",
                bill.getBillNo(), bill.getBillType(), bill.getBillCategory(),
                bill.getAmount(), bill.getSourceType(), bill.getSourceId());
        return bill;
    }

    // ==================== 2. 查询 ====================

    /**
     * 分页查询账单列表
     * 支持按创建时间范围过滤(new: createTimeStart / createTimeEnd)
     * 同时保持向后兼容 settlementMonth 单月筛选
     */
    public Page<BillAggregation> listBills(BillQueryRequest query) {
        Long tenantId = TenantAssert.requireTenantId();
        Page<BillAggregation> page = new Page<>(query.getPageNum(), query.getPageSize());

        LambdaQueryWrapper<BillAggregation> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(BillAggregation::getTenantId, tenantId)
                .eq(BillAggregation::getDeleteFlag, 0)
                .eq(StringUtils.hasText(query.getBillType()), BillAggregation::getBillType, query.getBillType())
                .eq(StringUtils.hasText(query.getBillCategory()), BillAggregation::getBillCategory, query.getBillCategory())
                .eq(StringUtils.hasText(query.getStatus()), BillAggregation::getStatus, query.getStatus())
                .eq(StringUtils.hasText(query.getSettlementMonth()), BillAggregation::getSettlementMonth, query.getSettlementMonth())
                .like(StringUtils.hasText(query.getCounterpartyName()), BillAggregation::getCounterpartyName, query.getCounterpartyName())
                .like(StringUtils.hasText(query.getOrderNo()), BillAggregation::getOrderNo, query.getOrderNo())
                // 日期范围过滤：若传入创建时间范围，则过滤 createTime 在该范围内的账单
                .ge(StringUtils.hasText(query.getCreateTimeStart()), BillAggregation::getCreateTime, query.getCreateTimeStart())
                .le(StringUtils.hasText(query.getCreateTimeEnd()), BillAggregation::getCreateTime, query.getCreateTimeEnd())
                .orderByDesc(BillAggregation::getCreateTime);

        return billAggregationService.page(page, wrapper);
    }

    /**
     * 统计各状态汇总
     */
    public Map<String, Object> getStats(String billType) {
        Long tenantId = TenantAssert.requireTenantId();
        List<BillAggregation> all = billAggregationService.lambdaQuery()
                .eq(BillAggregation::getTenantId, tenantId)
                .eq(BillAggregation::getDeleteFlag, 0)
                .eq(StringUtils.hasText(billType), BillAggregation::getBillType, billType)
                .select(BillAggregation::getStatus, BillAggregation::getAmount, BillAggregation::getSettledAmount)
                .last("LIMIT 5000")
                .list();

        BigDecimal pendingAmount = BigDecimal.ZERO;
        BigDecimal confirmedAmount = BigDecimal.ZERO;
        BigDecimal settledAmount = BigDecimal.ZERO;
        int pendingCount = 0, confirmedCount = 0, settledCount = 0, totalCount = all.size();

        for (BillAggregation b : all) {
            BigDecimal amt = b.getAmount() != null ? b.getAmount() : BigDecimal.ZERO;
            if (b.getStatus() == null) continue;
            switch (b.getStatus()) {
                case "PENDING":
                    pendingAmount = pendingAmount.add(amt);
                    pendingCount++;
                    break;
                case "CONFIRMED":
                case "SETTLING":
                    confirmedAmount = confirmedAmount.add(amt);
                    confirmedCount++;
                    break;
                case "SETTLED":
                    settledAmount = settledAmount.add(b.getSettledAmount() != null ? b.getSettledAmount() : amt);
                    settledCount++;
                    break;
                default:
                    break;
            }
        }

        Map<String, Object> stats = new HashMap<>();
        stats.put("pendingAmount", pendingAmount);
        stats.put("pendingCount", pendingCount);
        stats.put("confirmedAmount", confirmedAmount);
        stats.put("confirmedCount", confirmedCount);
        stats.put("settledAmount", settledAmount);
        stats.put("settledCount", settledCount);
        stats.put("totalCount", totalCount);
        return stats;
    }

    // ==================== 3. 状态流转 ====================

    /**
     * 确认账单（PENDING → CONFIRMED）
     */
    @Transactional(rollbackFor = Exception.class)
    public void confirmBill(String billId) {
        BillAggregation bill = getBillOrThrow(billId);
        if (!"PENDING".equals(bill.getStatus())) {
            throw new RuntimeException("只有待确认状态的账单可以确认");
        }
        bill.setStatus("CONFIRMED");
        bill.setConfirmedById(UserContext.userId());
        bill.setConfirmedByName(UserContext.username());
        bill.setConfirmedAt(LocalDateTime.now());
        billAggregationService.updateById(bill);
        ensureSettlementTaskFromBill(bill);
        log.info("[BillAggregation] 确认账单: billNo={}", bill.getBillNo());
    }

    /**
     * 批量确认
     */
    @Transactional(rollbackFor = Exception.class)
    public int batchConfirm(List<String> billIds) {
        int count = 0;
        for (String id : billIds) {
            try {
                confirmBill(id);
                count++;
            } catch (Exception e) {
                log.warn("[BillAggregation] 批量确认跳过: id={}, reason={}", id, e.getMessage());
            }
        }
        return count;
    }

    /**
     * 结清账单（CONFIRMED → SETTLED）
     */
    @Transactional(rollbackFor = Exception.class)
    public void settleBill(String billId, BigDecimal settledAmount) {
        BillAggregation bill = getBillOrThrow(billId);
        if (!"CONFIRMED".equals(bill.getStatus()) && !"SETTLING".equals(bill.getStatus())) {
            throw new RuntimeException("只有已确认/结算中的账单可以结清");
        }
        bill.setSettledAmount(settledAmount != null ? settledAmount : bill.getAmount());
        bill.setStatus("SETTLED");
        bill.setSettledById(UserContext.userId());
        bill.setSettledByName(UserContext.username());
        bill.setSettledAt(LocalDateTime.now());
        billAggregationService.updateById(bill);
        log.info("[BillAggregation] 结清账单: billNo={}, amount={}", bill.getBillNo(), bill.getSettledAmount());
    }

    /**
     * 取消账单（PENDING/CONFIRMED → CANCELLED）
     */
    @Transactional(rollbackFor = Exception.class)
    public void cancelBill(String billId, String reason) {
        BillAggregation bill = getBillOrThrow(billId);
        if ("SETTLED".equals(bill.getStatus())) {
            throw new RuntimeException("已结清的账单不可取消");
        }
        bill.setStatus("CANCELLED");
        bill.setRemark(reason);
        billAggregationService.updateById(bill);
        log.info("[BillAggregation] 取消账单: billNo={}, reason={}", bill.getBillNo(), reason);
    }

    @Transactional(rollbackFor = Exception.class)
    public void cancelBySource(String sourceType, String sourceId) {
        Long tenantId = TenantAssert.requireTenantId();
        BillAggregation existing = billAggregationService.lambdaQuery()
                .eq(BillAggregation::getSourceType, sourceType)
                .eq(BillAggregation::getSourceId, sourceId)
                .eq(BillAggregation::getTenantId, tenantId)
                .eq(BillAggregation::getDeleteFlag, 0)
                .one();
        if (existing == null) {
            return;
        }
        if ("SETTLED".equals(existing.getStatus())) {
            log.warn("[BillAggregation] 已结清账单不可取消: billNo={}, source={}:{}",
                    existing.getBillNo(), sourceType, sourceId);
            return;
        }
        existing.setStatus("CANCELLED");
        existing.setRemark("上游单据操作自动取消: sourceType=" + sourceType);
        billAggregationService.updateById(existing);
        log.info("[BillAggregation] 联动取消账单: billNo={}, source={}:{}", existing.getBillNo(), sourceType, sourceId);
    }

    /**
     * 反向账单机制（P0-10 阻塞根因修复）
     * <p>
     * 用于退货/撤回/反转/删除场景，按来源单据反推账单：
     * 1. 未结清账单：直接置为 CANCELLED，同步联动 Payable/Receivable 状态
     * 2. 已结清账单：抛异常提示需先冲账（防止财务数据丢失）
     * 3. 未支付 Payable/未收款 Receivable：同步删除/取消
     * 4. 已支付 Payable/已收款 Receivable：仅回写 remark，不删除（保留财务痕迹）
     * <p>
     * 与 cancelBySource 的区别：
     * - cancelBySource 仅取消未结清账单，不联动 Payable/Receivable
     * - reverseBySource 联动全链路（Bill → Payable/Receivable），用于反向操作
     *
     * @param sourceType 来源类型
     * @param sourceId   来源ID
     * @param reason     反向原因（退货/撤回/反转/删除等）
     */
    @Transactional(rollbackFor = Exception.class)
    public void reverseBySource(String sourceType, String sourceId, String reason) {
        Long tenantId = TenantAssert.requireTenantId();
        if (!StringUtils.hasText(sourceType) || !StringUtils.hasText(sourceId)) {
            return;
        }
        BillAggregation bill = billAggregationService.lambdaQuery()
                .eq(BillAggregation::getSourceType, sourceType)
                .eq(BillAggregation::getSourceId, sourceId)
                .eq(BillAggregation::getTenantId, tenantId)
                .eq(BillAggregation::getDeleteFlag, 0)
                .last("LIMIT 1")
                .one();
        if (bill == null) {
            log.info("[BillAggregation] 反向账单未找到匹配: sourceType={}, sourceId={}", sourceType, sourceId);
            return;
        }
        reverseBillInternal(bill, reason);
    }

    /**
     * 按订单号反向所有关联账单（用于订单全链路删除/反转）
     */
    @Transactional(rollbackFor = Exception.class)
    public int reverseByOrder(String orderId, String reason) {
        Long tenantId = TenantAssert.requireTenantId();
        if (!StringUtils.hasText(orderId)) {
            return 0;
        }
        List<BillAggregation> bills = billAggregationService.lambdaQuery()
                .eq(BillAggregation::getOrderId, orderId)
                .eq(BillAggregation::getTenantId, tenantId)
                .eq(BillAggregation::getDeleteFlag, 0)
                .ne(BillAggregation::getStatus, "CANCELLED")
                .list();
        int count = 0;
        for (BillAggregation bill : bills) {
            try {
                reverseBillInternal(bill, reason);
                count++;
            } catch (Exception e) {
                log.warn("[BillAggregation] 反向账单失败（继续处理其他账单）: billNo={}, err={}",
                        bill.getBillNo(), e.getMessage());
            }
        }
        log.info("[BillAggregation] 订单级反向账单完成: orderId={}, reversed={}", orderId, count);
        return count;
    }

    /**
     * 反向账单内部实现（单个账单 + 联动 Payable/Receivable）
     */
    private void reverseBillInternal(BillAggregation bill, String reason) {
        // 已结清账单：禁止反向（需先冲账）
        if ("SETTLED".equals(bill.getStatus())) {
            BigDecimal settled = bill.getSettledAmount() != null ? bill.getSettledAmount() : BigDecimal.ZERO;
            if (settled.compareTo(BigDecimal.ZERO) > 0) {
                throw new RuntimeException("账单 " + bill.getBillNo()
                        + " 已结算 " + settled + " 元，需先在付款中心冲账后再反向操作");
            }
        }
        String originalStatus = bill.getStatus();
        String reverseRemark = "【反向操作】" + (reason != null ? reason : "上游单据操作")
                + " | 原状态: " + originalStatus + " | 操作人: " + UserContext.username()
                + " | 时间: " + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        // 1. 账单置为 CANCELLED
        bill.setStatus("CANCELLED");
        bill.setRemark(StringUtils.hasText(bill.getRemark())
                ? bill.getRemark() + "\n" + reverseRemark : reverseRemark);
        billAggregationService.updateById(bill);

        // 2. 联动 Payable（仅未付款的可直接取消；已付款的保留痕迹）
        if ("PAYABLE".equalsIgnoreCase(bill.getBillType()) && payableOrchestrator != null) {
            try {
                Payable payable = payableOrchestrator.findByBillAggregationId(bill.getId());
                if (payable != null) {
                    BigDecimal paidAmount = payable.getPaidAmount() != null ? payable.getPaidAmount() : BigDecimal.ZERO;
                    if (paidAmount.compareTo(BigDecimal.ZERO) == 0) {
                        // 未付款：直接标记 CANCELLED（保留 deleteFlag=0 以便查询历史）
                        payable.setStatus("CANCELLED");
                        payable.setDescription((payable.getDescription() != null ? payable.getDescription() + " | " : "")
                                + reverseRemark);
                        payable.setUpdateTime(LocalDateTime.now());
                        payableOrchestrator.updatePayableStatus(payable);
                        log.info("[BillAggregation] 反向联动 Payable 取消: payableNo={}, billNo={}",
                                payable.getPayableNo(), bill.getBillNo());
                    } else {
                        log.warn("[BillAggregation] 反向联动 Payable 已付款保留痕迹: payableNo={}, paidAmount={}",
                                payable.getPayableNo(), paidAmount);
                    }
                }
            } catch (Exception e) {
                log.error("[BillAggregation] 反向联动 Payable 失败（账单已取消，继续处理）: billNo={}, err={}",
                        bill.getBillNo(), e.getMessage());
            }
        }

        // 3. 联动 Receivable（仅未收款的可直接取消；已收款的保留痕迹）
        if ("RECEIVABLE".equalsIgnoreCase(bill.getBillType()) && receivableOrchestrator != null) {
            try {
                com.fashion.supplychain.crm.entity.Receivable receivable = receivableOrchestrator.findByBillAggregationId(bill.getId());
                if (receivable != null) {
                    BigDecimal received = receivable.getReceivedAmount() != null ? receivable.getReceivedAmount() : BigDecimal.ZERO;
                    if (received.compareTo(BigDecimal.ZERO) == 0) {
                        // 未收款：直接标记 CANCELLED
                        receivable.setStatus("CANCELLED");
                        receivable.setDescription((receivable.getDescription() != null ? receivable.getDescription() + " | " : "")
                                + reverseRemark);
                        receivable.setUpdateTime(LocalDateTime.now());
                        receivableOrchestrator.updateReceivableStatus(receivable);
                        log.info("[BillAggregation] 反向联动 Receivable 取消: receivableNo={}, billNo={}",
                                receivable.getReceivableNo(), bill.getBillNo());
                    } else {
                        log.warn("[BillAggregation] 反向联动 Receivable 已收款保留痕迹: receivableNo={}, receivedAmount={}",
                                receivable.getReceivableNo(), received);
                    }
                }
            } catch (Exception e) {
                log.error("[BillAggregation] 反向联动 Receivable 失败（账单已取消，继续处理）: billNo={}, err={}",
                        bill.getBillNo(), e.getMessage());
            }
        }

        log.info("[BillAggregation] 反向账单完成: billNo={}, originalStatus={}, reason={}",
                bill.getBillNo(), originalStatus, reason);
    }

    // ==================== 内部方法 ====================

    private BillAggregation getBillOrThrow(String billId) {
        BillAggregation bill = billAggregationService.getById(billId);
        if (bill == null || bill.getDeleteFlag() != 0) {
            throw new RuntimeException("账单不存在: " + billId);
        }
        TenantAssert.assertBelongsToCurrentTenant(bill.getTenantId(), "账单");
        return bill;
    }

    private static final java.util.concurrent.atomic.AtomicInteger BILL_NO_SEQ = new java.util.concurrent.atomic.AtomicInteger(0);

    private String generateBillNo() {
        return "BA" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS")) + String.format("%03d", BILL_NO_SEQ.incrementAndGet() % 1000);
    }

    /**
     * 方案A：BillAggregation 作为唯一财务出口。
     * 在 CONFIRM 阶段按账单类型派生待收付任务（幂等）。
     */
    private void ensureSettlementTaskFromBill(BillAggregation bill) {
        if (bill == null) {
            return;
        }
        try {
            if ("PAYABLE".equalsIgnoreCase(bill.getBillType())) {
                if (payableOrchestrator == null) {
                    log.warn("[BillAggregation] PayableOrchestrator 不可用，跳过应付派生: billNo={}", bill.getBillNo());
                    return;
                }
                Payable merged = payableOrchestrator.findOrCreateMergedPayable(bill);
                bill.setPayableId(merged.getId());
                billAggregationService.updateById(bill);
                log.info("[BillAggregation] 已合并到应付任务: billNo={}, payableNo={}, mergedAmount={}",
                        bill.getBillNo(), merged.getPayableNo(), merged.getAmount());
                return;
            }
            if ("RECEIVABLE".equalsIgnoreCase(bill.getBillType())) {
                if (receivableOrchestrator == null) {
                    log.warn("[BillAggregation] ReceivableOrchestrator 不可用，跳过应收派生: billNo={}", bill.getBillNo());
                    return;
                }
                if (receivableOrchestrator.findByBillAggregationId(bill.getId()) == null) {
                    receivableOrchestrator.createFromBill(bill);
                    log.info("[BillAggregation] 已派生应收任务: billNo={}", bill.getBillNo());
                }
            }
        } catch (Exception e) {
            throw new RuntimeException("派生待收付任务失败: " + e.getMessage(), e);
        }
    }

    // ==================== 内部 DTO ====================

    @Data
    public static class BillPushRequest {
        private String billType;       // PAYABLE / RECEIVABLE
        private String billCategory;   // MATERIAL / SHIPMENT / PAYROLL / EXPENSE / ...
        private String sourceType;     // MATERIAL_RECONCILIATION / PAYROLL_SETTLEMENT / ...
        private String sourceId;
        private String sourceNo;
        private String counterpartyType; // SUPPLIER / CUSTOMER / WORKER / FACTORY
        private String counterpartyId;
        private String counterpartyName;
        private String orderId;
        private String orderNo;
        private String styleNo;
        private BigDecimal amount;
        private String settlementMonth;
        private String remark;
    }

    @Data
    public static class BillQueryRequest {
        private int pageNum = 1;
        private int pageSize = 20;
        private String billType;
        private String billCategory;
        private String status;
        private String settlementMonth;      // 向后兼容：单月筛选
        private String createTimeStart;      // new：创建时间范围 - 开始（YYYY-MM-DD 或 YYYY-MM-DD HH:mm:ss）
        private String createTimeEnd;        // new：创建时间范围 - 结束（YYYY-MM-DD 或 YYYY-MM-DD HH:mm:ss）
        private String counterpartyName;
        private String orderNo;
    }
}
