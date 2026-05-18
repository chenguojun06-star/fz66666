package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.intelligence.dto.NlQueryResponse;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.dashboard.service.DashboardQueryService;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * 延期查询处理器
 */
@Component
@Slf4j
public class OverdueQueryHandler {

    @Autowired private DashboardQueryService dashboardQueryService;
    @Autowired private ScanRecordService scanRecordService;

    public NlQueryResponse handleOverdueQuery(Long tenantId,
                                               java.util.function.BiConsumer<NlQueryResponse, Long> insightFn) {
        NlQueryResponse resp = new NlQueryResponse();
        resp.setIntent("overdue");
        List<ProductionOrder> allOverdues = dashboardQueryService.listOverdueOrders(200);
        long count = allOverdues.size();

        if (count == 0) {
            resp.setAnswer("🎉 当前没有延期订单，生产进度良好！");
            resp.setConfidence(95);
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("overdueCount", 0);
            data.put("factoryGroups", Collections.emptyList());
            resp.setData(data);
        } else {
            LocalDateTime now = LocalDateTime.now();

            Map<String, List<ProductionOrder>> byFactory = allOverdues.stream()
                    .collect(Collectors.groupingBy(
                            o -> o.getFactoryName() != null ? o.getFactoryName() : "未指定",
                            LinkedHashMap::new, Collectors.toList()));

            List<Map<String, Object>> factoryGroups = new ArrayList<>();
            int totalQuantity = 0;
            int totalProgress = 0;
            int totalOverdueDays = 0;

            for (Map.Entry<String, List<ProductionOrder>> entry : byFactory.entrySet()) {
                String fName = entry.getKey();
                List<ProductionOrder> orders = entry.getValue();
                int fOrderCount = orders.size();
                int fTotalQty = orders.stream().mapToInt(o -> o.getOrderQuantity() != null ? o.getOrderQuantity() : 0).sum();
                int fAvgProgress = (int) orders.stream().mapToInt(o -> o.getProductionProgress() != null ? o.getProductionProgress() : 0).average().orElse(0);
                int fAvgOverdueDays = (int) orders.stream().mapToInt(o -> {
                    if (o.getPlannedEndDate() != null) return (int) ChronoUnit.DAYS.between(o.getPlannedEndDate(), now);
                    return 0;
                }).average().orElse(0);

                long fActiveWorkers = 0;
                try {
                    Set<String> orderIds = orders.stream()
                            .map(ProductionOrder::getId)
                            .filter(Objects::nonNull)
                            .collect(Collectors.toSet());
                    if (!orderIds.isEmpty()) {
                        QueryWrapper<ScanRecord> aqw = new QueryWrapper<>();
                        aqw.eq("tenant_id", tenantId)
                           .in("order_id", orderIds)
                           .eq("scan_result", "success")
                           .ne("scan_type", "orchestration")
                           .ge("scan_time", now.minusDays(30))
                           .select("DISTINCT operator_id");
                        fActiveWorkers = scanRecordService.list(aqw).stream()
                                .map(ScanRecord::getOperatorId).filter(Objects::nonNull).distinct().count();
                    }
                } catch (Exception e) {
                    log.warn("[智能问答] 查询工厂活跃工人失败: factory={}, error={}", fName, e.getMessage());
                }

                int fEstDays = fAvgProgress > 0 && fTotalQty > 0
                        ? (int) Math.ceil((100.0 - fAvgProgress) / Math.max(fAvgProgress, 1) * (fAvgOverdueDays > 0 ? fAvgOverdueDays : 7))
                        : -1;

                List<Map<String, Object>> orderItems = orders.stream().map(o -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("orderNo", o.getOrderNo());
                    item.put("styleNo", o.getStyleNo());
                    item.put("progress", o.getProductionProgress() != null ? o.getProductionProgress() : 0);
                    item.put("overdueDays", o.getPlannedEndDate() != null ? (int) ChronoUnit.DAYS.between(o.getPlannedEndDate(), now) : 0);
                    item.put("quantity", o.getOrderQuantity() != null ? o.getOrderQuantity() : 0);
                    item.put("plannedEndDate", o.getPlannedEndDate() != null ? o.getPlannedEndDate().toLocalDate().toString() : null);
                    return item;
                }).collect(Collectors.toList());

                Map<String, Object> group = new LinkedHashMap<>();
                group.put("factoryName", fName);
                group.put("totalOrders", fOrderCount);
                group.put("totalQuantity", fTotalQty);
                group.put("avgProgress", fAvgProgress);
                group.put("avgOverdueDays", fAvgOverdueDays);
                group.put("activeWorkers", fActiveWorkers);
                group.put("estimatedCompletionDays", fEstDays);
                group.put("orders", orderItems);
                factoryGroups.add(group);

                totalQuantity += fTotalQty;
                totalProgress += orders.stream().mapToInt(o -> o.getProductionProgress() != null ? o.getProductionProgress() : 0).sum();
                totalOverdueDays += orders.stream().mapToInt(o -> {
                    if (o.getPlannedEndDate() != null) return (int) ChronoUnit.DAYS.between(o.getPlannedEndDate(), now);
                    return 0;
                }).sum();
            }

            int overallAvgProgress = count > 0 ? totalProgress / (int) count : 0;
            int overallAvgOverdueDays = count > 0 ? totalOverdueDays / (int) count : 0;

            List<Map<String, Object>> flatOverdueList = new ArrayList<>();
            for (Map<String, Object> group : factoryGroups) {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> orders = (List<Map<String, Object>>) group.get("orders");
                if (orders != null) {
                    for (Map<String, Object> o : orders) {
                        Map<String, Object> flat = new LinkedHashMap<>(o);
                        flat.put("factoryName", group.get("factoryName"));
                        flatOverdueList.add(flat);
                    }
                }
            }
            flatOverdueList.sort((a, b) -> Integer.compare(
                    (int) b.getOrDefault("overdueDays", 0),
                    (int) a.getOrDefault("overdueDays", 0)));

            StringBuilder sb = new StringBuilder();
            sb.append(String.format("⚠️ 当前共有 %d 个延期订单，涉及 %d 家工厂", count, byFactory.size()));
            sb.append(String.format("，总件数 %d，平均进度 %d%%，平均延期 %d 天\n", totalQuantity, overallAvgProgress, overallAvgOverdueDays));

            int showLimit = Math.min(flatOverdueList.size(), 15);
            sb.append("\n📋 具体延期订单（按逾期天数排序）：\n");
            for (int i = 0; i < showLimit; i++) {
                Map<String, Object> o = flatOverdueList.get(i);
                String orderNo = String.valueOf(o.getOrDefault("orderNo", "?"));
                int progress = (int) o.getOrDefault("progress", 0);
                int overdueDays = (int) o.getOrDefault("overdueDays", 0);
                int qty = (int) o.getOrDefault("quantity", 0);
                String factory = String.valueOf(o.getOrDefault("factoryName", "未指定"));
                String plannedDate = String.valueOf(o.getOrDefault("plannedEndDate", "?"));
                sb.append(String.format("  %d. %s | %s | 进度%d%% | 逾期%d天 | %d件 | 交期%s\n",
                        i + 1, orderNo, factory, progress, overdueDays, qty, plannedDate));
            }
            if (flatOverdueList.size() > showLimit) {
                sb.append(String.format("  ... 还有 %d 个延期订单，可在订单列表中查看完整数据", flatOverdueList.size() - showLimit));
            }

            sb.append("\n\n🏭 工厂维度汇总：\n");
            for (Map<String, Object> group : factoryGroups) {
                String fName = String.valueOf(group.get("factoryName"));
                int fCount = (int) group.get("totalOrders");
                int fQty = (int) group.get("totalQuantity");
                int fAvgP = (int) group.get("avgProgress");
                int fAvgO = (int) group.get("avgOverdueDays");
                sb.append(String.format("  • %s：%d单延期，%d件，平均进度%d%%，平均逾期%d天\n",
                        fName, fCount, fQty, fAvgP, fAvgO));
            }

            try {
                String factoryGroupsJson = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(factoryGroups);
                sb.append("\n【OVERDUE_FACTORY】").append(factoryGroupsJson).append("【/OVERDUE_FACTORY】");
            } catch (Exception e) {
                log.warn("[智能问答] 序列化工厂分组数据失败: {}", e.getMessage());
            }

            resp.setAnswer(sb.toString().trim());
            resp.setConfidence(90);

            Map<String, Object> data = new LinkedHashMap<>();
            data.put("overdueCount", (int) count);
            data.put("totalQuantity", totalQuantity);
            data.put("avgProgress", overallAvgProgress);
            data.put("avgOverdueDays", overallAvgOverdueDays);
            data.put("factoryGroupCount", byFactory.size());
            data.put("factoryGroups", factoryGroups);
            resp.setData(data);
        }
        insightFn.accept(resp, tenantId);
        resp.setSuggestions(Arrays.asList("今日产量如何？", "哪个工厂延期最多？", "整体情况怎么样？"));
        return resp;
    }
}