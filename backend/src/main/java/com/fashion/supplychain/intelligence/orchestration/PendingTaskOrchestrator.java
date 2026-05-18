package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.PendingTaskDTO;
import com.fashion.supplychain.intelligence.dto.PendingTaskSummaryDTO;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.service.UserService;
import java.time.LocalDateTime;
import java.util.*;
import java.util.function.Supplier;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/**
 * 待办任务编排器 — 薄层 Facade，委托给域 Collector
 *
 * 域 Collector 清单：
 *   - ProductionPendingCollector — 裁剪/质检/返修/采购到货
 *   - OrderPendingCollector     — 逾期/异常/样衣开发
 *   - FinancePendingCollector   — 工资结算/物料对账/费用报销
 */
@Service
@Slf4j
public class PendingTaskOrchestrator {

    private static final int MAX_PER_CATEGORY = 10;

    static final Map<String, String[]> CATEGORY_META = new LinkedHashMap<>();
    static {
        CATEGORY_META.put("CUTTING_TASK",      new String[]{"裁剪任务",   "✂️"});
        CATEGORY_META.put("QUALITY_INSPECT",   new String[]{"质检待处理", "🔍"});
        CATEGORY_META.put("REPAIR",            new String[]{"返修任务",   "🔧"});
        CATEGORY_META.put("MATERIAL_PURCHASE", new String[]{"采购到货",   "📦"});
        CATEGORY_META.put("OVERDUE_ORDER",     new String[]{"逾期订单",   "⏰"});
        CATEGORY_META.put("EXCEPTION_REPORT",  new String[]{"异常报告",   "🚨"});
        CATEGORY_META.put("STYLE_DEVELOPMENT", new String[]{"样衣开发",   "👗"});
        CATEGORY_META.put("PAYROLL_SETTLEMENT",new String[]{"工资结算",   "💰"});
        CATEGORY_META.put("MATERIAL_RECON",    new String[]{"物料对账",   "📋"});
        CATEGORY_META.put("EXPENSE_REIMBURSE", new String[]{"费用报销",   "🧾"});
    }

    @Autowired private ProductionPendingCollector prodCollector;
    @Autowired private OrderPendingCollector orderCollector;
    @Autowired private FinancePendingCollector financeCollector;
    @Autowired private UserService userService;

    public List<PendingTaskDTO> getMyPendingTasks() {
        List<PendingTaskDTO> all = new ArrayList<>();
        collectSafely("cutting", prodCollector::collectCuttingTasks, all);
        collectSafely("quality", prodCollector::collectQualityTasks, all);
        collectSafely("repair", () -> prodCollector.collectRepairTasks(), all);
        collectSafely("material", prodCollector::collectMaterialTasks, all);
        collectSafely("overdue", () -> orderCollector.collectOverdueOrders(prodCollector), all);
        collectSafely("exception", () -> orderCollector.collectExceptionReports(prodCollector), all);
        collectSafely("styleDev", orderCollector::collectStyleDevelopmentTasks, all);
        collectSafely("payroll", financeCollector::collectPayrollSettlementTasks, all);
        collectSafely("materialRecon", financeCollector::collectMaterialReconciliationTasks, all);
        collectSafely("expenseReimburse", financeCollector::collectExpenseReimbursementTasks, all);

        all = filterByResponsiblePerson(all);

        Map<String, PendingTaskDTO> deduped = new LinkedHashMap<>();
        for (PendingTaskDTO task : all) {
            if (task.getId() != null) deduped.putIfAbsent(task.getId(), task);
        }
        List<PendingTaskDTO> dedupedAll = new ArrayList<>(deduped.values());
        dedupedAll.sort(Comparator.comparingInt(PendingTaskDTO::getPriorityOrder)
                .thenComparing(t -> t.getCreatedAt() != null ? t.getCreatedAt() : LocalDateTime.MIN,
                        Comparator.reverseOrder()));
        return dedupedAll;
    }

    public PendingTaskSummaryDTO getMyPendingTaskSummary() {
        List<PendingTaskDTO> all = getMyPendingTasks();
        PendingTaskSummaryDTO summary = new PendingTaskSummaryDTO();
        summary.setTotalCount(all.size());
        summary.setHighPriorityCount((int) all.stream().filter(t -> "high".equals(t.getPriority())).count());

        Map<String, CategoryCountAccumulator> accumulators = new LinkedHashMap<>();
        for (Map.Entry<String, String[]> entry : CATEGORY_META.entrySet()) {
            accumulators.put(entry.getKey(), new CategoryCountAccumulator(entry.getValue()[0], entry.getValue()[1]));
        }
        for (PendingTaskDTO t : all) {
            CategoryCountAccumulator acc = accumulators.get(t.getTaskType());
            if (acc != null) { acc.count++; if ("high".equals(t.getPriority())) acc.highCount++; }
        }

        Map<String, PendingTaskSummaryDTO.CategoryCount> categoryCounts = new LinkedHashMap<>();
        for (Map.Entry<String, CategoryCountAccumulator> entry : accumulators.entrySet()) {
            CategoryCountAccumulator acc = entry.getValue();
            if (acc.count > 0) {
                categoryCounts.put(entry.getKey(), new PendingTaskSummaryDTO.CategoryCount(
                        entry.getKey(), acc.label, acc.icon, acc.count, acc.highCount));
            }
        }
        summary.setCategoryCounts(categoryCounts);

        PendingTaskDTO topUrgent = all.stream().filter(t -> "high".equals(t.getPriority())).findFirst().orElse(null);
        if (topUrgent != null) {
            summary.setTopUrgentTitle(topUrgent.getTitle());
            summary.setTopUrgentDeepLinkPath(buildFullDeepLink(topUrgent));
        }
        return summary;
    }

    static void fillCategoryMeta(PendingTaskDTO dto) {
        String[] meta = CATEGORY_META.get(dto.getTaskType());
        if (meta != null) { dto.setCategoryLabel(meta[0]); dto.setCategoryIcon(meta[1]); }
    }

    // ── 内部工具 ──

    private void collectSafely(String source, Supplier<List<PendingTaskDTO>> supplier, List<PendingTaskDTO> target) {
        try { target.addAll(supplier.get()); } catch (Exception e) { log.warn("[PendingTask] {} 采集失败: {}", source, e.getMessage()); }
    }

    private String buildFullDeepLink(PendingTaskDTO dto) {
        String base = dto.getDeepLinkPath() != null ? dto.getDeepLinkPath() : "/production";
        StringBuilder sb = new StringBuilder(base);
        boolean hasQuery = base.contains("?");
        if (StringUtils.hasText(dto.getOrderNo())) { sb.append(hasQuery ? "&" : "?").append("orderNo=").append(dto.getOrderNo()); hasQuery = true; }
        if (StringUtils.hasText(dto.getStyleNo())) { sb.append(hasQuery ? "&" : "?").append("styleNo=").append(dto.getStyleNo()); }
        return sb.toString();
    }

    private List<PendingTaskDTO> filterByResponsiblePerson(List<PendingTaskDTO> tasks) {
        if (UserContext.isTenantOwner() || UserContext.isTopAdmin()) return tasks;
        String currentUserId = UserContext.userId();
        String currentUserDisplayName = resolveCurrentUserDisplayName();
        String currentUsername = UserContext.username();
        boolean isFinance = isFinanceRole();
        boolean isProductionOrMerchandiser = isProductionOrMerchandiserRole();
        boolean isFactoryUser = UserContext.isFactoryUser();
        return tasks.stream().filter(task -> {
            if (StringUtils.hasText(task.getAssigneeId()) && currentUserId != null) return currentUserId.equals(task.getAssigneeId());
            if (StringUtils.hasText(task.getAssigneeName())
                    && (task.getAssigneeName().equals(currentUserDisplayName) || task.getAssigneeName().equals(currentUsername))) return true;
            String taskType = task.getTaskType();
            if ("CUTTING_TASK".equals(taskType) || "QUALITY_INSPECT".equals(taskType) || "MATERIAL_PURCHASE".equals(taskType)) return false;
            if ("PAYROLL_SETTLEMENT".equals(taskType) || "MATERIAL_RECON".equals(taskType) || "EXPENSE_REIMBURSE".equals(taskType)) return isFinance;
            if ("OVERDUE_ORDER".equals(taskType) || "EXCEPTION_REPORT".equals(taskType)) return isProductionOrMerchandiser;
            if ("REPAIR".equals(taskType)) return isProductionOrMerchandiser || isFactoryUser;
            if ("STYLE_DEVELOPMENT".equals(taskType)) return isProductionOrMerchandiser || isFactoryUser;
            return false;
        }).collect(Collectors.toList());
    }

    private boolean isFinanceRole() {
        String role = UserContext.role();
        return role != null && (role.contains("财务") || role.toLowerCase().contains("finance"));
    }

    private boolean isProductionOrMerchandiserRole() {
        String role = UserContext.role();
        if (role == null) return false;
        String r = role.toLowerCase();
        return r.contains("生产") || r.contains("跟单") || r.contains("管理")
                || r.contains("admin") || r.contains("manager") || r.contains("supervisor")
                || role.contains("主管") || role.contains("管理员");
    }

    private String resolveCurrentUserDisplayName() {
        try {
            String username = UserContext.username();
            Long tenantId = UserContext.tenantId();
            if (username == null || tenantId == null) return "";
            User me = userService.lambdaQuery()
                    .eq(User::getUsername, username).eq(User::getTenantId, tenantId)
                    .select(User::getName, User::getUsername).last("LIMIT 1").one();
            return (me != null && me.getName() != null) ? me.getName() : username;
        } catch (Exception e) { return UserContext.username() != null ? UserContext.username() : ""; }
    }

    private static class CategoryCountAccumulator {
        String label, icon;
        int count, highCount;
        CategoryCountAccumulator(String label, String icon) { this.label = label; this.icon = icon; }
    }
}