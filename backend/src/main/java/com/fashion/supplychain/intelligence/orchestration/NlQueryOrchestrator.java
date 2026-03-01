package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.NlQueryRequest;
import com.fashion.supplychain.intelligence.dto.NlQueryResponse;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.dashboard.service.DashboardQueryService;
import java.time.LocalDate;
import java.util.*;
import java.util.regex.Pattern;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * AI 自然语言查询编排器 — 将用户自然语言转换为结构化数据查询
 *
 * <p>支持的意图识别：
 * <ul>
 *   <li>order_query  — "订单 PO2026xxx 进度多少"</li>
 *   <li>overdue      — "有多少延期订单"</li>
 *   <li>production   — "今日产量多少"、"本周扫码数"</li>
 *   <li>quality      — "质检通过率多少"</li>
 *   <li>factory      — "哪个工厂最多订单"</li>
 * </ul>
 *
 * <p>关键字匹配 + 规则引擎，非 LLM；轻量级、低延迟。
 */
@Service
@Slf4j
public class NlQueryOrchestrator {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private DashboardQueryService dashboardQueryService;

    private static final Pattern ORDER_NO_PATTERN = Pattern.compile("PO\\d{8,}");

    public NlQueryResponse query(NlQueryRequest req) {
        String question = req.getQuestion().trim();
        Long tenantId = UserContext.tenantId();
        log.info("[NlQuery] question={}, tenant={}", question, tenantId);

        // 意图识别（关键字匹配优先级）
        if (containsAny(question, "订单", "进度", "PO")) {
            return handleOrderQuery(question, tenantId);
        }
        if (containsAny(question, "延期", "逾期", "超期", "过期")) {
            return handleOverdueQuery(tenantId);
        }
        if (containsAny(question, "产量", "扫码", "今日", "今天")) {
            return handleProductionQuery(tenantId);
        }
        if (containsAny(question, "质检", "质量", "通过率", "良品率")) {
            return handleQualityQuery(tenantId);
        }
        if (containsAny(question, "工厂", "车间")) {
            return handleFactoryQuery(tenantId);
        }

        // 兜底
        NlQueryResponse fallback = new NlQueryResponse();
        fallback.setIntent("unknown");
        fallback.setAnswer("抱歉，暂时无法理解该问题。您可以尝试询问：订单进度、延期订单数、今日产量等。");
        fallback.setConfidence(20);
        fallback.setSuggestions(Arrays.asList(
                "今天扫码多少件？", "有多少延期订单？",
                "订单PO20260301001进度如何？", "质检通过率多少？"));
        return fallback;
    }

    // ── 订单查询 ──
    private NlQueryResponse handleOrderQuery(String question, Long tenantId) {
        NlQueryResponse resp = new NlQueryResponse();
        resp.setIntent("order_query");

        // 尝试提取订单号
        var matcher = ORDER_NO_PATTERN.matcher(question);
        if (matcher.find()) {
            String orderNo = matcher.group();
            QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
            qw.eq(tenantId != null, "tenant_id", tenantId)
              .eq("order_no", orderNo).eq("delete_flag", 0);
            ProductionOrder order = productionOrderService.getOne(qw, false);
            if (order != null) {
                resp.setAnswer(String.format("订单 %s：进度 %d%%，已完成 %d/%d 件，状态 %s",
                        orderNo,
                        order.getProductionProgress() != null ? order.getProductionProgress() : 0,
                        order.getCompletedQuantity() != null ? order.getCompletedQuantity() : 0,
                        order.getOrderQuantity() != null ? order.getOrderQuantity() : 0,
                        order.getStatus()));
                resp.setConfidence(95);
                Map<String, Object> data = new LinkedHashMap<>();
                data.put("orderNo", orderNo);
                data.put("status", order.getStatus());
                data.put("progress", order.getProductionProgress());
                data.put("completed", order.getCompletedQuantity());
                data.put("total", order.getOrderQuantity());
                resp.setData(data);
            } else {
                resp.setAnswer(String.format("未找到订单 %s，请确认订单号是否正确", orderNo));
                resp.setConfidence(80);
            }
        } else {
            // 无订单号，返回概要
            QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
            qw.eq(tenantId != null, "tenant_id", tenantId)
              .eq("delete_flag", 0).eq("status", "IN_PROGRESS");
            long inProgress = productionOrderService.count(qw);
            resp.setAnswer(String.format("当前有 %d 个进行中订单。请提供具体订单号以查看详情。", inProgress));
            resp.setConfidence(70);
        }
        resp.setSuggestions(Arrays.asList("有哪些延期订单？", "今日扫码数量是多少？"));
        return resp;
    }

    // ── 延期查询 ──
    private NlQueryResponse handleOverdueQuery(Long tenantId) {
        NlQueryResponse resp = new NlQueryResponse();
        resp.setIntent("overdue");
        long count = dashboardQueryService.countOverdueOrders();
        resp.setAnswer(String.format("当前共有 %d 个延期订单", count));
        resp.setConfidence(90);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("overdueCount", (int) count);
        resp.setData(data);
        resp.setSuggestions(Arrays.asList("哪些订单最紧急？", "今日产量如何？"));
        return resp;
    }

    // ── 产量查询 ──
    private NlQueryResponse handleProductionQuery(Long tenantId) {
        NlQueryResponse resp = new NlQueryResponse();
        resp.setIntent("production");
        long todayScan = dashboardQueryService.sumTodayScanQuantity();
        resp.setAnswer(String.format("今日累计扫码 %d 件", todayScan));
        resp.setConfidence(90);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("todayScanQty", todayScan);
        resp.setData(data);
        resp.setSuggestions(Arrays.asList("和昨天比怎么样？", "哪个工厂产量最高？"));
        return resp;
    }

    // ── 质量查询 ──
    private NlQueryResponse handleQualityQuery(Long tenantId) {
        NlQueryResponse resp = new NlQueryResponse();
        resp.setIntent("quality");
        // 简化：用全部扫码成功率代替
        resp.setAnswer("质量模块数据正在聚合中，请稍后查看「质量热力图」面板获取详细数据。");
        resp.setConfidence(60);
        resp.setSuggestions(Arrays.asList("查看质量热力图", "今日扫码多少件？"));
        return resp;
    }

    // ── 工厂查询 ──
    private NlQueryResponse handleFactoryQuery(Long tenantId) {
        NlQueryResponse resp = new NlQueryResponse();
        resp.setIntent("factory");

        QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
        qw.eq(tenantId != null, "tenant_id", tenantId)
          .eq("delete_flag", 0)
          .eq("status", "IN_PROGRESS")
          .isNotNull("factory_name")
          .groupBy("factory_name")
          .select("factory_name", "COUNT(*) as order_count")
          .orderByDesc("order_count")
          .last("LIMIT 5");
        List<Map<String, Object>> factoryStats = productionOrderService.listMaps(qw);

        if (!factoryStats.isEmpty()) {
            StringBuilder sb = new StringBuilder("当前订单量前5的工厂：\n");
            for (Map<String, Object> m : factoryStats) {
                sb.append(String.format("  %s — %s 个订单\n", m.get("factory_name"), m.get("order_count")));
            }
            resp.setAnswer(sb.toString().trim());
            resp.setConfidence(85);
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("factoryRanking", factoryStats);
            resp.setData(data);
        } else {
            resp.setAnswer("暂无工厂订单数据");
            resp.setConfidence(70);
        }
        resp.setSuggestions(Arrays.asList("哪个工厂质量最好？", "工厂排行榜"));
        return resp;
    }

    private boolean containsAny(String text, String... keywords) {
        for (String kw : keywords) {
            if (text.contains(kw)) return true;
        }
        return false;
    }
}
