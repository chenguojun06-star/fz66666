package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.intelligence.dto.NlQueryResponse;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * 生产域查询处理器 — 订单查询、产量查询、裁剪查询
 */
@Component
@Slf4j
public class ProductionQueryHandler {

    @Autowired private ProductionOrderService productionOrderService;
    @Autowired private ScanRecordService scanRecordService;

    public NlQueryResponse handleOrderQuery(String question, Long tenantId, String factoryId,
                                             java.util.Set<String> terminalStatuses,
                                             java.util.function.BiConsumer<NlQueryResponse, Long> insightFn) {
        NlQueryResponse resp = new NlQueryResponse();
        resp.setIntent("order_query");

        var matcher = NlQueryDataHandlers.ORDER_NO_PATTERN.matcher(question);
        if (matcher.find()) {
            String orderNo = matcher.group();
            QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
            qw.eq("tenant_id", tenantId)
              .eq(StringUtils.hasText(factoryId), "factory_id", factoryId)
              .eq("order_no", orderNo).eq("delete_flag", 0);
            ProductionOrder order = productionOrderService.getOne(qw, false);
            if (order != null) {
                int progress = order.getProductionProgress() != null ? order.getProductionProgress() : 0;
                int completed = order.getCompletedQuantity() != null ? order.getCompletedQuantity() : 0;
                int total = order.getOrderQuantity() != null ? order.getOrderQuantity() : 0;
                int cuttingQty = order.getCuttingQuantity() != null ? order.getCuttingQuantity() : 0;
                int bundleCount = order.getCuttingBundleCount() != null ? order.getCuttingBundleCount() : 0;
                String statusCn = NlQueryDataHandlers.translateStatus(order.getStatus());
                String factory = order.getFactoryName() != null ? order.getFactoryName() : "未指定";

                long activeWorkers = 0;
                try {
                    QueryWrapper<ScanRecord> aqw = new QueryWrapper<>();
                    aqw.eq("tenant_id", tenantId)
                       .eq("order_id", order.getId())
                       .eq("scan_result", "success")
                       .ne("scan_type", "orchestration")
                       .ge("scan_time", LocalDateTime.now().minusDays(7))
                       .select("DISTINCT operator_id");
                    activeWorkers = scanRecordService.list(aqw).stream()
                            .map(ScanRecord::getOperatorId).filter(Objects::nonNull).distinct().count();
                } catch (Exception e) {
                    log.warn("[智能问答] 查询订单活跃工人失败: orderNo={}, error={}", orderNo, e.getMessage());
                }

                StringBuilder sb = new StringBuilder();
                sb.append(String.format("📋 订单 %s\n", orderNo));
                sb.append(String.format("• 状态：%s\n", statusCn));
                sb.append(String.format("• 生产进度：%d%%（%d/%d 件）\n", progress, completed, total));
                if (cuttingQty > 0) {
                    sb.append(String.format("• 裁剪数量：%d 件（%d 个菲号）\n", cuttingQty, bundleCount));
                }
                sb.append(String.format("• 加工厂：%s\n", factory));
                if (activeWorkers > 0) {
                    sb.append(String.format("• 近7天参与工人：%d 人\n", activeWorkers));
                }
                if (order.getPlannedEndDate() != null) {
                    long daysLeft = java.time.temporal.ChronoUnit.DAYS.between(LocalDateTime.now(), order.getPlannedEndDate());
                    sb.append(String.format("• 交期：%s（%s）\n",
                            order.getPlannedEndDate().toLocalDate(),
                            daysLeft > 0 ? "剩余" + daysLeft + "天" : "已逾期" + Math.abs(daysLeft) + "天"));
                    if (progress > 0 && progress < 90 && daysLeft > 0) {
                        double dailyRate = completed > 0 && daysLeft > 0 ? (double) completed / Math.max(1, 30 - (int) daysLeft) : 0;
                        if (dailyRate > 0) {
                            int remaining = total - completed;
                            long estDays = (long) Math.ceil(remaining / dailyRate);
                            sb.append(String.format("• 预计还需 %d 天完成", estDays));
                        }
                    }
                }
                resp.setAnswer(sb.toString().trim());
                resp.setConfidence(95);
                Map<String, Object> data = new LinkedHashMap<>();
                data.put("orderNo", orderNo);
                data.put("status", order.getStatus());
                data.put("progress", progress);
                data.put("completed", completed);
                data.put("total", total);
                data.put("cuttingQuantity", cuttingQty);
                data.put("cuttingBundleCount", bundleCount);
                data.put("activeWorkers", activeWorkers);
                data.put("factory", factory);
                resp.setData(data);
            } else {
                resp.setAnswer(String.format("未找到订单 %s，请确认订单号是否正确", orderNo));
                resp.setConfidence(80);
            }
        } else {
            QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
            qw.eq("tenant_id", tenantId)
              .eq(StringUtils.hasText(factoryId), "factory_id", factoryId)
              .eq("delete_flag", 0).notIn("status", terminalStatuses);
            long inProgress = productionOrderService.count(qw);
            resp.setAnswer(String.format("当前有 %d 个进行中订单。请提供具体订单号（如PO20260301001）以查看详情。", inProgress));
            resp.setConfidence(70);
        }
        insightFn.accept(resp, tenantId);
        resp.setSuggestions(Arrays.asList("有哪些延期订单？", "今日扫码数量是多少？", "整体情况怎么样？"));
        return resp;
    }

    public NlQueryResponse handleProductionQuery(Long tenantId, String factoryId,
                                                  com.fashion.supplychain.dashboard.service.DashboardQueryService dashboardQueryService,
                                                  java.util.function.BiConsumer<NlQueryResponse, Long> insightFn) {
        NlQueryResponse resp = new NlQueryResponse();
        resp.setIntent("production");

        long todayScan = dashboardQueryService.sumTodayScanQuantity();
        LocalDateTime thirtyMinAgo = LocalDateTime.now().minusMinutes(30);
        long activeWorkers = 0;
        try {
            QueryWrapper<ScanRecord> aqw = new QueryWrapper<>();
            aqw.eq("tenant_id", tenantId)
               .eq(StringUtils.hasText(factoryId), "factory_id", factoryId)
               .eq("scan_result", "success")
               .ne("scan_type", "orchestration")
               .ge("scan_time", thirtyMinAgo)
               .select("DISTINCT operator_id");
            activeWorkers = scanRecordService.list(aqw).stream()
                    .map(ScanRecord::getOperatorId).filter(Objects::nonNull).distinct().count();
        } catch (Exception e) {
            log.warn("[智能问答] 查询活跃工人数量失败: tenantId={}, error={}", tenantId, e.getMessage());
        }

        StringBuilder sb = new StringBuilder(String.format("📦 今日累计扫码 %d 件\n", todayScan));
        if (activeWorkers > 0) {
            sb.append(String.format("• 最近30分钟活跃工人：%d 人\n", activeWorkers));
        }
        if (todayScan > 0) {
            int hour = LocalDateTime.now().getHour();
            if (hour > 0) {
                sb.append(String.format("• 平均每小时：%.0f 件", (double) todayScan / hour));
            }
        }

        resp.setAnswer(sb.toString().trim());
        resp.setConfidence(90);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("todayScanQty", todayScan);
        data.put("activeWorkers", activeWorkers);
        resp.setData(data);
        insightFn.accept(resp, tenantId);
        resp.setSuggestions(Arrays.asList("和昨天比怎么样？", "哪个工厂产量最高？", "有多少延期订单？"));
        return resp;
    }

    public NlQueryResponse handleCuttingQuery(String question, Long tenantId, String factoryId,
                                               java.util.Set<String> terminalStatuses,
                                               com.fashion.supplychain.dashboard.service.DashboardQueryService dashboardQueryService) {
        NlQueryResponse resp = new NlQueryResponse();
        resp.setIntent("cutting");

        var matcher = NlQueryDataHandlers.ORDER_NO_PATTERN.matcher(question != null ? question : "");
        if (matcher.find()) {
            String orderNo = matcher.group();
            QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
            qw.eq("tenant_id", tenantId)
              .eq(StringUtils.hasText(factoryId), "factory_id", factoryId)
              .eq("order_no", orderNo).eq("delete_flag", 0);
            ProductionOrder order = productionOrderService.getOne(qw, false);
            if (order != null) {
                int orderQty = order.getOrderQuantity() != null ? order.getOrderQuantity() : 0;
                int cuttingQty = order.getCuttingQuantity() != null ? order.getCuttingQuantity() : 0;
                int bundleCount = order.getCuttingBundleCount() != null ? order.getCuttingBundleCount() : 0;
                int completed = order.getCompletedQuantity() != null ? order.getCompletedQuantity() : 0;
                String statusCn = NlQueryDataHandlers.translateStatus(order.getStatus());

                StringBuilder sb = new StringBuilder();
                sb.append(String.format("✂️ 订单 %s 裁剪情况\n", orderNo));
                sb.append(String.format("• 订单数量：%d 件\n", orderQty));
                sb.append(String.format("• 裁剪数量：%d 件\n", cuttingQty));
                sb.append(String.format("• 菲号数量：%d 个\n", bundleCount));
                sb.append(String.format("• 完成数量：%d 件\n", completed));
                sb.append(String.format("• 状态：%s\n", statusCn));
                if (orderQty > 0 && cuttingQty > 0) {
                    int cuttingPct = Math.min(100, cuttingQty * 100 / orderQty);
                    sb.append(String.format("• 裁剪完成率：%d%%", cuttingPct));
                }
                resp.setAnswer(sb.toString().trim());
                resp.setConfidence(92);
                Map<String, Object> data = new LinkedHashMap<>();
                data.put("orderNo", orderNo);
                data.put("orderQuantity", orderQty);
                data.put("cuttingQuantity", cuttingQty);
                data.put("cuttingBundleCount", bundleCount);
                data.put("completedQuantity", completed);
                resp.setData(data);
            } else {
                resp.setAnswer(String.format("未找到订单 %s，请确认订单号是否正确", orderNo));
                resp.setConfidence(80);
            }
        } else {
            LocalDateTime todayStart = LocalDateTime.of(LocalDate.now(), LocalTime.MIN);
            LocalDateTime todayEnd = LocalDateTime.of(LocalDate.now(), LocalTime.MAX);
            long todayCutting = dashboardQueryService.sumCuttingQuantityBetween(todayStart, todayEnd);

            resp.setAnswer(String.format("✂️ 今日裁剪数量：%d 件", todayCutting));
            resp.setConfidence(85);
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("todayCutting", todayCutting);
            resp.setData(data);
        }
        resp.setSuggestions(Arrays.asList("今日产量多少？", "入库情况如何？", "整体情况怎么样？"));
        return resp;
    }
}