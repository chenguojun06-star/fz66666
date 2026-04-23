package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.SelfHealingResponse;
import com.fashion.supplychain.intelligence.dto.SelfHealingResponse.DiagnosisItem;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.orchestration.ProductionOrderOrchestrator;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 智能异常自愈编排器 — 数据一致性诊断 + 自动修复
 *
 * <p>检查项：
 * <ol>
 *   <li>进度与扫码不一致：productionProgress 与实际扫码件数不匹配</li>
 *   <li>已完成但状态异常：completedQty ≥ orderQty 但 status ≠ COMPLETED</li>
 *   <li>幽灵扫码：扫码记录引用不存在的订单</li>
 *   <li>数量溢出：completedQty > orderQty (含裁剪容差)</li>
 * </ol>
 */
@Service
@Slf4j
public class SelfHealingOrchestrator {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private ProductionOrderOrchestrator productionOrderOrchestrator;

    private static final java.util.Set<String> TERMINAL_STATUSES = java.util.Set.of("completed", "cancelled", "scrapped", "archived", "closed");

    public SelfHealingResponse diagnose() {
        SelfHealingResponse resp = new SelfHealingResponse();
        try {
        Long tenantId = UserContext.tenantId();
        List<DiagnosisItem> items = new ArrayList<>();
        int autoFixed = 0;

        // ── 检查1: 进度与扫码不一致 ──
        DiagnosisItem progressCheck = checkProgressConsistency(tenantId);
        items.add(progressCheck);
        if ("fixed".equals(progressCheck.getResult())) autoFixed++;

        // ── 检查2: 已完成但状态异常 ──
        DiagnosisItem statusCheck = checkStatusConsistency(tenantId);
        items.add(statusCheck);

        // ── 检查3: 幽灵扫码记录 ──
        DiagnosisItem ghostCheck = checkGhostScans(tenantId);
        items.add(ghostCheck);

        // ── 检查4: 数量溢出 ──
        DiagnosisItem overflowCheck = checkQuantityOverflow(tenantId);
        items.add(overflowCheck);

        // 汇总
        long issues = items.stream().filter(i -> !"ok".equals(i.getResult())).count();
        resp.setItems(items);
        resp.setTotalChecks(items.size());
        resp.setIssuesFound((int) issues);
        resp.setAutoFixed(autoFixed);
        resp.setNeedManual((int) (issues - autoFixed));
        resp.setHealthScore(items.isEmpty() ? 100
                : Math.max(0, 100 - (int) issues * 25));
        resp.setStatus(issues == 0 ? "healthy" : issues <= 2 ? "warning" : "critical");
        } catch (Exception e) {
            log.error("[自愈诊断] 数据加载异常（降级返回空数据）: {}", e.getMessage(), e);
        }
        return resp;
    }

    private DiagnosisItem checkProgressConsistency(Long tenantId) {
        DiagnosisItem item = new DiagnosisItem();
        item.setCheckName("生产进度一致性");
        item.setCheckType("progress");

        QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
        qw.eq(tenantId != null, "tenant_id", tenantId)
          .eq("delete_flag", 0)
          .in("status", "production", "IN_PROGRESS", "CREATED");
        List<ProductionOrder> orders = productionOrderService.list(qw);

        int inconsistent = 0;
        for (ProductionOrder o : orders) {
            int total = o.getOrderQuantity() != null ? o.getOrderQuantity() : 0;
            int completed = o.getCompletedQuantity() != null ? o.getCompletedQuantity() : 0;
            int progress = o.getProductionProgress() != null ? o.getProductionProgress() : 0;
            if (total > 0) {
                int expected = (int) ((completed * 100.0) / total);
                if (Math.abs(expected - progress) > 10) {
                    inconsistent++;
                }
            }
        }

        if (inconsistent == 0) {
            item.setResult("ok");
            item.setDescription("所有进行中订单进度数据一致");
        } else {
            item.setResult("warning");
            item.setDescription(String.format("%d 个订单进度偏差超过10%%", inconsistent));
        }
        item.setAffectedOrders(inconsistent);
        return item;
    }

    private DiagnosisItem checkStatusConsistency(Long tenantId) {
        DiagnosisItem item = new DiagnosisItem();
        item.setCheckName("完工状态检查");
        item.setCheckType("progress");

        QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
        qw.eq(tenantId != null, "tenant_id", tenantId)
          .eq("delete_flag", 0)
          .notIn("status", TERMINAL_STATUSES);
        List<ProductionOrder> orders = productionOrderService.list(qw);

        int abnormal = 0;
        for (ProductionOrder o : orders) {
            int total = o.getOrderQuantity() != null ? o.getOrderQuantity() : 0;
            int completed = o.getCompletedQuantity() != null ? o.getCompletedQuantity() : 0;
            if (total > 0 && completed >= total) {
                abnormal++;
            }
        }

        if (abnormal == 0) {
            item.setResult("ok");
            item.setDescription("无异常状态订单");
        } else {
            item.setResult("warning");
            item.setDescription(String.format("%d 个订单已完成但状态未标记为 COMPLETED", abnormal));
        }
        item.setAffectedOrders(abnormal);
        return item;
    }

    private DiagnosisItem checkGhostScans(Long tenantId) {
        DiagnosisItem item = new DiagnosisItem();
        item.setCheckName("孤立扫码记录");
        item.setCheckType("scan");

        // 简化检查：查最近7天成功扫码
        QueryWrapper<ScanRecord> sqw = new QueryWrapper<>();
        sqw.eq(tenantId != null, "tenant_id", tenantId)
          .eq("scan_result", "success")
          .ge("scan_time", LocalDateTime.now().minusDays(7));
        List<ScanRecord> recentScans = scanRecordService.list(sqw);

        Set<String> scanOrderIds = recentScans.stream()
                .map(ScanRecord::getOrderId).filter(Objects::nonNull)
                .collect(Collectors.toSet());

        int ghost = 0;
        if (!scanOrderIds.isEmpty()) {
            Map<String, ProductionOrder> orderMap = productionOrderService
                    .listByIds(scanOrderIds)
                    .stream()
                    .collect(Collectors.toMap(o -> String.valueOf(o.getId()), o -> o, (a, b) -> a));
            for (String orderId : scanOrderIds) {
                ProductionOrder order = orderMap.get(orderId);
                if (order == null || order.getDeleteFlag() != null && order.getDeleteFlag() == 1) {
                    ghost++;
                }
            }
        }

        if (ghost == 0) {
            item.setResult("ok");
            item.setDescription("无孤立扫码记录");
        } else {
            item.setResult("error");
            item.setDescription(String.format("发现 %d 个订单已删除但仍存在扫码记录", ghost));
        }
        item.setAffectedOrders(ghost);
        return item;
    }

    private DiagnosisItem checkQuantityOverflow(Long tenantId) {
        DiagnosisItem item = new DiagnosisItem();
        item.setCheckName("数量溢出检查");
        item.setCheckType("stock");

        QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
        qw.eq(tenantId != null, "tenant_id", tenantId)
          .eq("delete_flag", 0)
          .eq("status", "production");
        List<ProductionOrder> orders = productionOrderService.list(qw);

        int overflow = 0;
        for (ProductionOrder o : orders) {
            int total = o.getOrderQuantity() != null ? o.getOrderQuantity() : 0;
            int completed = o.getCompletedQuantity() != null ? o.getCompletedQuantity() : 0;
            // 允许 5% 容差
            if (total > 0 && completed > total * 1.05) {
                overflow++;
            }
        }

        if (overflow == 0) {
            item.setResult("ok");
            item.setDescription("无数量溢出");
        } else {
            item.setResult("warning");
            item.setDescription(String.format("%d 个订单已完成件数超出订单件数 5%% 以上", overflow));
        }
        item.setAffectedOrders(overflow);
        return item;
    }

    // ══════════════════════════════════════════════════════════════
    //   一键修复 — 诊断 + 自动修复可修复项，返回修复结果
    // ══════════════════════════════════════════════════════════════

    /**
     * 诊断 + 一键修复所有可自动修复的问题。
     * <p>当前可自动修复：进度不一致（重算 productionProgress）、完工状态遗漏（标记 COMPLETED）。
     * 幽灵扫码和数量溢出需人工介入，仅标记。</p>
     */
    @Transactional(rollbackFor = Exception.class)
    public SelfHealingResponse repair() {
        Long tenantId = UserContext.tenantId();
        List<DiagnosisItem> items = new ArrayList<>();
        int autoFixed = 0;

        // ── 修复1: 进度不一致 → 重算 productionProgress ──
        DiagnosisItem progressFix = repairProgressConsistency(tenantId);
        items.add(progressFix);
        if ("fixed".equals(progressFix.getResult())) autoFixed++;

        // ── 修复2: 完工但状态未标记 → 标记 COMPLETED ──
        DiagnosisItem statusFix = repairStatusConsistency(tenantId);
        items.add(statusFix);
        if ("fixed".equals(statusFix.getResult())) autoFixed++;

        // ── 检查3: 幽灵扫码（仅诊断，需人工） ──
        DiagnosisItem ghostCheck = checkGhostScans(tenantId);
        items.add(ghostCheck);

        // ── 检查4: 数量溢出（仅诊断，需人工） ──
        DiagnosisItem overflowCheck = checkQuantityOverflow(tenantId);
        items.add(overflowCheck);

        long issues = items.stream().filter(i -> !"ok".equals(i.getResult()) && !"fixed".equals(i.getResult())).count();
        SelfHealingResponse resp = new SelfHealingResponse();
        resp.setItems(items);
        resp.setTotalChecks(items.size());
        resp.setIssuesFound((int) items.stream().filter(i -> !"ok".equals(i.getResult())).count());
        resp.setAutoFixed(autoFixed);
        resp.setNeedManual((int) issues);
        resp.setHealthScore(Math.max(0, 100 - (int) issues * 25));
        resp.setStatus(issues == 0 ? "healthy" : issues <= 2 ? "warning" : "critical");

        log.info("[自愈修复] tenant={} 自动修复={} 需人工={}", tenantId, autoFixed, issues);
        return resp;
    }

    private DiagnosisItem repairProgressConsistency(Long tenantId) {
        DiagnosisItem item = new DiagnosisItem();
        item.setCheckName("生产进度一致性修复");
        item.setCheckType("progress");

        QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
        qw.eq(tenantId != null, "tenant_id", tenantId)
          .eq("delete_flag", 0)
          .in("status", "production", "IN_PROGRESS", "CREATED");
        List<ProductionOrder> orders = productionOrderService.list(qw);

        int fixed = 0;
        for (ProductionOrder o : orders) {
            int total = o.getOrderQuantity() != null ? o.getOrderQuantity() : 0;
            int completed = o.getCompletedQuantity() != null ? o.getCompletedQuantity() : 0;
            int currentProgress = o.getProductionProgress() != null ? o.getProductionProgress() : 0;
            if (total > 0) {
                int expected = Math.min(100, (int) ((completed * 100.0) / total));
                if (Math.abs(expected - currentProgress) > 10) {
                    log.info("[自愈修复] 订单 {} 进度 {}% -> {}%（修复前记录）", o.getOrderNo(), currentProgress, expected);
                    o.setProductionProgress(expected);
                    productionOrderService.updateById(o);
                    fixed++;
                }
            }
        }

        if (fixed == 0) {
            item.setResult("ok");
            item.setDescription("所有进行中订单进度数据一致");
        } else {
            item.setResult("fixed");
            item.setDescription(String.format("已修复 %d 个订单的进度偏差", fixed));
            item.setFixedAt(LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
        }
        item.setAffectedOrders(fixed);
        return item;
    }

    private DiagnosisItem repairStatusConsistency(Long tenantId) {
        DiagnosisItem item = new DiagnosisItem();
        item.setCheckName("完工状态标记");
        item.setCheckType("progress");

        QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
        qw.eq(tenantId != null, "tenant_id", tenantId)
          .eq("delete_flag", 0)
          .notIn("status", TERMINAL_STATUSES);
        List<ProductionOrder> orders = productionOrderService.list(qw);

        int fixed = 0;
        int skipped = 0;
        for (ProductionOrder o : orders) {
            int total = o.getOrderQuantity() != null ? o.getOrderQuantity() : 0;
            int completed = o.getCompletedQuantity() != null ? o.getCompletedQuantity() : 0;
            if (total > 0 && completed >= total) {
                try {
                    productionOrderOrchestrator.closeOrder(o.getId(), "self_healing", "自愈修复-完工自动关单", false);
                    fixed++;
                    log.info("[自愈修复] 订单 {} 完工件数 {}/{} 通过closeOrder关单", o.getOrderNo(), completed, total);
                } catch (Exception e) {
                    skipped++;
                    log.warn("[自愈修复] 订单 {} closeOrder失败(可能不满足90%阈值): {}", o.getOrderNo(), e.getMessage());
                }
            }
        }

        if (fixed == 0 && skipped == 0) {
            item.setResult("ok");
            item.setDescription("无异常状态订单");
        } else {
            item.setResult("fixed");
            String desc = String.format("已通过closeOrder关闭 %d 个已完工订单", fixed);
            if (skipped > 0) desc += String.format("，%d 个因不满足关单条件跳过", skipped);
            item.setDescription(desc);
            item.setFixedAt(LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
        }
        item.setAffectedOrders(fixed);
        return item;
    }
}
