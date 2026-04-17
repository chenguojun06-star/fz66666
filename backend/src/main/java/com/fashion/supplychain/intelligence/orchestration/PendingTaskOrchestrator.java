package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.entity.ExpenseReimbursement;
import com.fashion.supplychain.finance.entity.MaterialReconciliation;
import com.fashion.supplychain.finance.entity.PayrollSettlement;
import com.fashion.supplychain.finance.service.ExpenseReimbursementService;
import com.fashion.supplychain.finance.orchestration.MaterialReconciliationOrchestrator;
import com.fashion.supplychain.finance.orchestration.PayrollSettlementOrchestrator;
import com.fashion.supplychain.intelligence.dto.PendingTaskDTO;
import com.fashion.supplychain.intelligence.dto.PendingTaskSummaryDTO;
import com.fashion.supplychain.production.entity.ProductionExceptionReport;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.helper.MaterialPurchaseQueryHelper;
import com.fashion.supplychain.production.helper.ScanRecordQueryHelper;
import com.fashion.supplychain.production.orchestration.CuttingTaskOrchestrator;
import com.fashion.supplychain.production.orchestration.ProductWarehousingOrchestrator;
import com.fashion.supplychain.production.service.ProductionExceptionReportService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Supplier;
import java.util.stream.Collectors;

@Service
@Slf4j
public class PendingTaskOrchestrator {

    private static final int MAX_PER_CATEGORY = 10;
    private static final Set<String> TERMINAL_STATUSES = Set.of("completed", "cancelled", "scrapped", "archived", "closed");

    private static final Map<String, String[]> CATEGORY_META = new LinkedHashMap<>();
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

    @Autowired private CuttingTaskOrchestrator cuttingTaskOrchestrator;
    @Autowired private ScanRecordQueryHelper scanRecordQueryHelper;
    @Autowired private ProductWarehousingOrchestrator warehousingOrchestrator;
    @Autowired private MaterialPurchaseQueryHelper materialPurchaseQueryHelper;
    @Autowired private ProductionExceptionReportService exceptionReportService;
    @Autowired private ProductionOrderService productionOrderService;
    @Autowired private StyleInfoService styleInfoService;
    @Autowired private PayrollSettlementOrchestrator payrollSettlementOrchestrator;
    @Autowired private MaterialReconciliationOrchestrator materialReconciliationOrchestrator;
    @Autowired private ExpenseReimbursementService expenseReimbursementService;

    public List<PendingTaskDTO> getMyPendingTasks() {
        List<PendingTaskDTO> all = new ArrayList<>();
        collectSafely("cutting", this::collectCuttingTasks, all);
        collectSafely("quality", this::collectQualityTasks, all);
        collectSafely("repair", this::collectRepairTasks, all);
        collectSafely("material", this::collectMaterialTasks, all);
        collectSafely("overdue", this::collectOverdueOrders, all);
        collectSafely("exception", this::collectExceptionReports, all);
        collectSafely("styleDev", this::collectStyleDevelopmentTasks, all);
        collectSafely("payroll", this::collectPayrollSettlementTasks, all);
        collectSafely("materialRecon", this::collectMaterialReconciliationTasks, all);
        collectSafely("expenseReimburse", this::collectExpenseReimbursementTasks, all);
        // 全局去重：防止不同 collector 因条件交叉产生重复 id（保留首次出现的那条）
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
            if (acc != null) {
                acc.count++;
                if ("high".equals(t.getPriority())) acc.highCount++;
            }
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

        PendingTaskDTO topUrgent = all.stream()
                .filter(t -> "high".equals(t.getPriority()))
                .findFirst().orElse(null);
        if (topUrgent != null) {
            summary.setTopUrgentTitle(topUrgent.getTitle());
            summary.setTopUrgentDeepLinkPath(buildFullDeepLink(topUrgent));
        }

        return summary;
    }

    private List<PendingTaskDTO> collectCuttingTasks() {
        return cuttingTaskOrchestrator.getMyTasks().stream().limit(MAX_PER_CATEGORY).map(t -> {
            PendingTaskDTO dto = new PendingTaskDTO();
            dto.setId("CUT_" + t.getId());
            dto.setTaskType("CUTTING_TASK");
            dto.setModule("production");
            dto.setTitle("裁剪任务 " + safe(t.getProductionOrderNo()));
            dto.setDescription(safe(t.getStyleNo()) + " " + t.getOrderQuantity() + "件待裁剪");
            dto.setOrderNo(t.getProductionOrderNo());
            dto.setStyleNo(t.getStyleNo());
            dto.setDeepLinkPath("/production/cutting");
            dto.setPriority("medium");
            dto.setCreatedAt(t.getReceivedTime());
            dto.setQuantity(t.getOrderQuantity());
            if (t.getReceivedTime() != null) {
                dto.setStartTime(t.getReceivedTime().toString());
            }
            if (t.getExpectedShipDate() != null) {
                dto.setEndTime(t.getExpectedShipDate().toString());
            }
            dto.setAssigneeName(t.getReceiverName());
            fillCategoryMeta(dto);
            return dto;
        }).collect(Collectors.toList());
    }

    private List<PendingTaskDTO> collectQualityTasks() {
        return scanRecordQueryHelper.getMyQualityTasks().stream().limit(MAX_PER_CATEGORY).map(r -> {
            PendingTaskDTO dto = new PendingTaskDTO();
            dto.setId("QC_" + r.getId());
            dto.setTaskType("QUALITY_INSPECT");
            dto.setModule("production");
            dto.setTitle("质检待处理 " + safe(r.getOrderNo()));
            dto.setDescription(safe(r.getProcessName()) + " " + r.getQuantity() + "件");
            dto.setOrderNo(r.getOrderNo());
            dto.setStyleNo(r.getStyleNo());
            dto.setDeepLinkPath("/production/warehousing");
            dto.setPriority("medium");
            dto.setCreatedAt(r.getScanTime());
            fillCategoryMeta(dto);
            return dto;
        }).collect(Collectors.toList());
    }

    private List<PendingTaskDTO> collectRepairTasks() {
        Long tenantId = UserContext.tenantId();
        List<Map<String, Object>> repairs = warehousingOrchestrator.listPendingRepairTasks(tenantId);
        return repairs.stream().limit(MAX_PER_CATEGORY).map(m -> {
            PendingTaskDTO dto = new PendingTaskDTO();
            dto.setId("RPR_" + safeObj(m.get("bundleId")));
            dto.setTaskType("REPAIR");
            dto.setModule("production");
            String orderNo = safeObj(m.get("orderNo"));
            int defectQty = toInt(m.get("defectQty"));
            dto.setTitle("返修 " + orderNo);
            dto.setDescription(defectQty + "件次品待返修");
            dto.setOrderNo(orderNo);
            dto.setStyleNo(safeObj(m.get("styleNo")));
            dto.setDeepLinkPath("/production/warehousing");
            dto.setPriority("high");
            dto.setCreatedAt(null);
            fillCategoryMeta(dto);
            return dto;
        }).collect(Collectors.toList());
    }

    private List<PendingTaskDTO> collectMaterialTasks() {
        return materialPurchaseQueryHelper.getMyTasks().stream().limit(MAX_PER_CATEGORY).map(p -> {
            PendingTaskDTO dto = new PendingTaskDTO();
            dto.setId("MAT_" + p.getId());
            dto.setTaskType("MATERIAL_PURCHASE");
            dto.setModule("production");
            dto.setTitle("采购待收货 " + safe(p.getPurchaseNo()));
            int purchased = p.getPurchaseQuantity() != null ? p.getPurchaseQuantity().intValue() : 0;
            int arrived = p.getArrivedQuantity() != null ? p.getArrivedQuantity() : 0;
            dto.setDescription(safe(p.getMaterialName()) + " 已到" + arrived + "/" + purchased);
            dto.setOrderNo(p.getOrderNo());
            dto.setStyleNo(p.getStyleNo());
            dto.setDeepLinkPath("/production/material");
            dto.setPriority("medium");
            dto.setCreatedAt(p.getCreateTime());
            fillCategoryMeta(dto);
            return dto;
        }).collect(Collectors.toList());
    }

    private List<PendingTaskDTO> collectOverdueOrders() {
        Long tenantId = UserContext.tenantId();
        String factoryId = UserContext.factoryId();
        LocalDate today = LocalDate.now();
        List<ProductionOrder> orders = productionOrderService.lambdaQuery()
                .select(ProductionOrder::getId, ProductionOrder::getOrderNo,
                        ProductionOrder::getStyleNo, ProductionOrder::getExpectedShipDate,
                        ProductionOrder::getProductionProgress)
                .eq(tenantId != null, ProductionOrder::getTenantId, tenantId)
                .eq(StringUtils.hasText(factoryId), ProductionOrder::getFactoryId, factoryId)
                .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                .isNotNull(ProductionOrder::getExpectedShipDate)
                .lt(ProductionOrder::getExpectedShipDate, today)
                .last("LIMIT " + MAX_PER_CATEGORY)
                .list();
        return orders.stream().map(o -> {
            PendingTaskDTO dto = new PendingTaskDTO();
            dto.setId("OVD_" + o.getId());
            dto.setTaskType("OVERDUE_ORDER");
            dto.setModule("production");
            long days = ChronoUnit.DAYS.between(o.getExpectedShipDate(), today);
            dto.setTitle("订单逾期 " + safe(o.getOrderNo()));
            int prog = o.getProductionProgress() != null ? o.getProductionProgress() : 0;
            dto.setDescription("逾期" + days + "天，进度" + prog + "%");
            dto.setOrderNo(o.getOrderNo());
            dto.setStyleNo(o.getStyleNo());
            dto.setDeepLinkPath("/production");
            dto.setPriority("high");
            dto.setCreatedAt(o.getExpectedShipDate() != null ? o.getExpectedShipDate().atStartOfDay() : null);
            fillCategoryMeta(dto);
            return dto;
        }).collect(Collectors.toList());
    }

    private List<PendingTaskDTO> collectExceptionReports() {
        Long tenantId = UserContext.tenantId();
        List<ProductionExceptionReport> reports = exceptionReportService.lambdaQuery()
                .select(ProductionExceptionReport::getId, ProductionExceptionReport::getOrderNo,
                        ProductionExceptionReport::getExceptionType,
                        ProductionExceptionReport::getDescription,
                        ProductionExceptionReport::getCreateTime)
                .eq(tenantId != null, ProductionExceptionReport::getTenantId, tenantId)
                .eq(ProductionExceptionReport::getStatus, "PENDING")
                .last("LIMIT " + MAX_PER_CATEGORY)
                .list();
        return reports.stream().map(r -> {
            PendingTaskDTO dto = new PendingTaskDTO();
            dto.setId("EXC_" + r.getId());
            dto.setTaskType("EXCEPTION_REPORT");
            dto.setModule("production");
            dto.setTitle("异常待处理 " + safe(r.getOrderNo()));
            dto.setDescription(safe(r.getExceptionType()) + " " + safe(r.getDescription()));
            dto.setOrderNo(r.getOrderNo());
            dto.setDeepLinkPath("/production");
            dto.setPriority("high");
            dto.setCreatedAt(r.getCreateTime());
            fillCategoryMeta(dto);
            return dto;
        }).collect(Collectors.toList());
    }

    private List<PendingTaskDTO> collectStyleDevelopmentTasks() {
        Long tenantId = UserContext.tenantId();
        Map<String, Object> params = new HashMap<>();
        params.put("tenantId", tenantId);
        // 待办任务只关心进行中的样衣开发，明确排除已报废款式
        params.put("excludeScrapped", Boolean.TRUE);
        // 排除已推大货（pushedToOrder=1）的款：样衣已完成并推大货，无需再出现在待办中
        params.put("excludePushedToOrder", Boolean.TRUE);
        List<String> devNodes = List.of("未开始", "纸样开发中", "样衣制作中");
        List<StyleInfo> styles = new ArrayList<>();
        for (String node : devNodes) {
            params.put("progressNode", node);
            IPage<StyleInfo> page = styleInfoService.queryPage(params);
            if (page != null && page.getRecords() != null) {
                styles.addAll(page.getRecords());
            }
            if (styles.size() >= MAX_PER_CATEGORY) break;
        }
        // 按 ID 去重：防止同一款式因 progressNode 条件交叉在多次查询中重复出现
        Set<Long> seenIds = new LinkedHashSet<>();
        List<StyleInfo> uniqueStyles = styles.stream()
                .filter(s -> s.getId() != null && seenIds.add(s.getId()))
                // 防御过滤：排除已报废和已完成的款式（双重保险，DB层已过滤但此处兜底）
                .filter(s -> {
                    String pn = s.getProgressNode();
                    return pn != null && !pn.equals("开发样报废")
                            && !pn.equals("样衣完成") && !pn.equals("纸样完成");
                })
                .collect(Collectors.toList());
        return uniqueStyles.stream().limit(MAX_PER_CATEGORY).map(s -> {
            PendingTaskDTO dto = new PendingTaskDTO();
            dto.setId("STY_" + s.getId());
            dto.setTaskType("STYLE_DEVELOPMENT");
            dto.setModule("style");
            dto.setTitle("样衣开发 " + safe(s.getStyleNo()));
            String node = s.getProgressNode() != null ? s.getProgressNode() : "进行中";
            dto.setDescription(safe(s.getStyleName()) + " " + node);
            dto.setOrderNo("");
            dto.setStyleNo(s.getStyleNo());
            dto.setDeepLinkPath("/style-info");
            dto.setPriority("medium");
            dto.setCreatedAt(null);
            // 数量：样板数
            dto.setQuantity(s.getSampleQuantity());
            // 交板日期作为截止时间
            if (s.getDeliveryDate() != null) {
                dto.setEndTime(s.getDeliveryDate().toString());
            }
            // 当前阶段的领取人 + 开始时间（按 progressNode 匹配对应字段）
            if ("纸样开发中".equals(node)) {
                dto.setAssigneeName(s.getPatternAssignee());
                if (s.getPatternStartTime() != null) dto.setStartTime(s.getPatternStartTime().toString());
            } else if ("样衣制作中".equals(node)) {
                dto.setAssigneeName(s.getProductionAssignee());
                if (s.getProductionStartTime() != null) dto.setStartTime(s.getProductionStartTime().toString());
            } else {
                // 未开始：默认展示纸样阶段领取人；若未设置再回退到样衣领取人
                dto.setAssigneeName(StringUtils.hasText(s.getPatternAssignee())
                        ? s.getPatternAssignee() : s.getProductionAssignee());
                // 未开始阶段没有流程开始时间，以创建时间作为开始时间展示
                if (s.getCreateTime() != null) dto.setStartTime(s.getCreateTime().toString());
            }
            fillCategoryMeta(dto);
            return dto;
        }).collect(Collectors.toList());
    }

    private List<PendingTaskDTO> collectPayrollSettlementTasks() {
        Long tenantId = UserContext.tenantId();
        Map<String, Object> params = new HashMap<>();
        params.put("tenantId", tenantId);
        params.put("status", "pending");
        IPage<PayrollSettlement> page = payrollSettlementOrchestrator.list(params);
        List<PayrollSettlement> settlements = page != null ? page.getRecords() : List.of();
        return settlements.stream().limit(MAX_PER_CATEGORY).map(ps -> {
            PendingTaskDTO dto = new PendingTaskDTO();
            dto.setId("PAY_" + ps.getId());
            dto.setTaskType("PAYROLL_SETTLEMENT");
            dto.setModule("finance");
            dto.setTitle("工资结算待审批 " + safe(ps.getSettlementNo()));
            String desc = safe(ps.getOrderNo());
            if (ps.getTotalAmount() != null) {
                desc += " 金额" + ps.getTotalAmount().toPlainString();
            }
            dto.setDescription(desc);
            dto.setOrderNo(safe(ps.getOrderNo()));
            dto.setStyleNo(safe(ps.getStyleNo()));
            dto.setDeepLinkPath("/finance/payroll-operator-summary");
            dto.setPriority("high");
            dto.setCreatedAt(ps.getCreateTime());
            fillCategoryMeta(dto);
            return dto;
        }).collect(Collectors.toList());
    }

    private List<PendingTaskDTO> collectMaterialReconciliationTasks() {
        Long tenantId = UserContext.tenantId();
        Map<String, Object> params = new HashMap<>();
        params.put("tenantId", tenantId);
        params.put("status", "pending");
        IPage<MaterialReconciliation> page = materialReconciliationOrchestrator.list(params);
        List<MaterialReconciliation> reconList = page != null ? page.getRecords() : List.of();
        return reconList.stream().limit(MAX_PER_CATEGORY).map(mr -> {
            PendingTaskDTO dto = new PendingTaskDTO();
            dto.setId("MRC_" + mr.getId());
            dto.setTaskType("MATERIAL_RECON");
            dto.setModule("finance");
            dto.setTitle("物料对账待确认 " + safe(mr.getReconciliationNo()));
            String desc = safe(mr.getMaterialName()) + " " + safe(mr.getSupplierName());
            if (mr.getFinalAmount() != null) {
                desc += " " + mr.getFinalAmount().toPlainString() + "元";
            }
            dto.setDescription(desc);
            dto.setOrderNo(safe(mr.getOrderNo()));
            dto.setStyleNo(safe(mr.getStyleNo()));
            dto.setDeepLinkPath("/finance/material-reconciliation");
            dto.setPriority("medium");
            dto.setCreatedAt(mr.getCreateTime());
            fillCategoryMeta(dto);
            return dto;
        }).collect(Collectors.toList());
    }

    private List<PendingTaskDTO> collectExpenseReimbursementTasks() {
        Long tenantId = UserContext.tenantId();
        List<ExpenseReimbursement> expenses = expenseReimbursementService.lambdaQuery()
                .eq(tenantId != null, ExpenseReimbursement::getTenantId, tenantId)
                .eq(ExpenseReimbursement::getStatus, "pending")
                .eq(ExpenseReimbursement::getDeleteFlag, 0)
                .last("LIMIT " + MAX_PER_CATEGORY)
                .list();
        return expenses.stream().map(er -> {
            PendingTaskDTO dto = new PendingTaskDTO();
            dto.setId("EXP_" + er.getId());
            dto.setTaskType("EXPENSE_REIMBURSE");
            dto.setModule("finance");
            dto.setTitle("费用报销待审批 " + safe(er.getReimbursementNo()));
            String desc = safe(er.getApplicantName()) + " " + safe(er.getTitle());
            if (er.getAmount() != null) {
                desc += " " + er.getAmount().toPlainString() + "元";
            }
            dto.setDescription(desc);
            dto.setOrderNo("");
            dto.setStyleNo("");
            dto.setDeepLinkPath("/finance/expense-reimbursement");
            dto.setPriority("medium");
            dto.setCreatedAt(er.getCreateTime());
            fillCategoryMeta(dto);
            return dto;
        }).collect(Collectors.toList());
    }

    private void fillCategoryMeta(PendingTaskDTO dto) {
        String[] meta = CATEGORY_META.get(dto.getTaskType());
        if (meta != null) {
            dto.setCategoryLabel(meta[0]);
            dto.setCategoryIcon(meta[1]);
        }
    }

    private String buildFullDeepLink(PendingTaskDTO dto) {
        String base = dto.getDeepLinkPath() != null ? dto.getDeepLinkPath() : "/production";
        StringBuilder sb = new StringBuilder(base);
        boolean hasQuery = base.contains("?");
        if (StringUtils.hasText(dto.getOrderNo())) {
            sb.append(hasQuery ? "&" : "?").append("orderNo=").append(dto.getOrderNo());
            hasQuery = true;
        }
        if (StringUtils.hasText(dto.getStyleNo())) {
            sb.append(hasQuery ? "&" : "?").append("styleNo=").append(dto.getStyleNo());
        }
        return sb.toString();
    }

    private void collectSafely(String source, Supplier<List<PendingTaskDTO>> supplier,
                               List<PendingTaskDTO> target) {
        try {
            target.addAll(supplier.get());
        } catch (Exception e) {
            log.warn("[PendingTask] {} 采集失败: {}", source, e.getMessage());
        }
    }

    private String safe(String s) { return s != null ? s : ""; }
    private String safeObj(Object o) { return o != null ? String.valueOf(o) : ""; }
    private int toInt(Object o) {
        if (o instanceof Number n) return n.intValue();
        return 0;
    }

    private static class CategoryCountAccumulator {
        String label;
        String icon;
        int count;
        int highCount;

        CategoryCountAccumulator(String label, String icon) {
            this.label = label;
            this.icon = icon;
        }
    }
}
