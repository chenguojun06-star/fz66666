package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.StyleQuoteSuggestionResponse;
import com.fashion.supplychain.intelligence.dto.StyleQuoteSuggestionResponse.HistoricalOrder;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleQuotation;
import com.fashion.supplychain.style.service.StyleQuotationService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 款式报价建议编排器 — 基于历史订单与BOM数据提供报价参考
 *
 * <p>算法：
 * <ol>
 *   <li>查询该款号的现有报价单（t_style_quotation）</li>
 *   <li>查询该款号的历史生产订单（最近5单取报价、件数）</li>
 *   <li>汇总物料成本 + 工序成本 → 建议报价</li>
 * </ol>
 */
@Service
@Slf4j
public class StyleQuoteSuggestionOrchestrator {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private StyleQuotationService styleQuotationService;

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final BigDecimal DEFAULT_MARGIN = new BigDecimal("1.20"); // 20%利润

    public StyleQuoteSuggestionResponse suggest(String styleNo) {
        StyleQuoteSuggestionResponse resp = new StyleQuoteSuggestionResponse();
        resp.setStyleNo(styleNo);
        resp.setRecentOrders(Collections.emptyList());

        if (styleNo == null || styleNo.trim().isEmpty()) {
            resp.setSuggestion("未指定款号");
            return resp;
        }

        try {
            Long tenantId = UserContext.tenantId();

            // 1. 查询该款号历史生产订单
            QueryWrapper<ProductionOrder> oqw = new QueryWrapper<>();
            oqw.eq(tenantId != null, "tenant_id", tenantId)
               .eq("style_no", styleNo.trim())
               .eq("delete_flag", 0)
               .orderByDesc("create_time")
               .last("LIMIT 10");
            List<ProductionOrder> orders = productionOrderService.list(oqw);

            resp.setHistoricalOrderCount(orders.size());
            resp.setHistoricalTotalQuantity(orders.stream()
                    .mapToInt(o -> o.getOrderQuantity() != null ? o.getOrderQuantity() : 0).sum());

            // 2. 查询该款号报价单（通过styleId关联）
            fillQuotationData(resp, orders, tenantId);

            // 3. 最近5单明细
            List<HistoricalOrder> recentOrders = orders.stream()
                    .limit(5)
                    .map(o -> {
                        HistoricalOrder ho = new HistoricalOrder();
                        ho.setOrderNo(o.getOrderNo());
                        ho.setQuantity(o.getOrderQuantity() != null ? o.getOrderQuantity() : 0);
                        ho.setUnitPrice(o.getQuotationUnitPrice());
                        ho.setCreateTime(o.getCreateTime() != null ? o.getCreateTime().format(DATE_FMT) : "-");
                        ho.setStatus(o.getStatus());
                        return ho;
                    })
                    .collect(Collectors.toList());
            resp.setRecentOrders(recentOrders);

            // 4. 生成建议文案
            buildSuggestion(resp);

        } catch (Exception e) {
            log.error("[款式报价建议] styleNo={} 异常: {}", styleNo, e.getMessage(), e);
            resp.setSuggestion("数据加载异常，请稍后重试");
        }
        return resp;
    }

    private void fillQuotationData(StyleQuoteSuggestionResponse resp,
                                   List<ProductionOrder> orders, Long tenantId) {
        // 尝试从订单中提取 styleId
        String styleId = orders.stream()
                .map(ProductionOrder::getStyleId)
                .filter(Objects::nonNull)
                .findFirst().orElse(null);

        if (styleId != null) {
            try {
                Long sid = Long.parseLong(styleId);
                StyleQuotation sq = styleQuotationService.getByStyleId(sid);
                if (sq != null) {
                    resp.setCurrentQuotation(sq.getTotalPrice());
                    resp.setMaterialCost(sq.getMaterialCost());
                    resp.setProcessCost(sq.getProcessCost());

                    BigDecimal mc = sq.getMaterialCost() != null ? sq.getMaterialCost() : BigDecimal.ZERO;
                    BigDecimal pc = sq.getProcessCost() != null ? sq.getProcessCost() : BigDecimal.ZERO;
                    BigDecimal total = mc.add(pc);
                    resp.setTotalCost(total);
                    resp.setSuggestedPrice(total.multiply(DEFAULT_MARGIN).setScale(2, RoundingMode.HALF_UP));
                    return;
                }
            } catch (NumberFormatException ignored) {
                // styleId 非数字，跳过
            }
        }

        // 如果没有报价单，从历史订单的 quotationUnitPrice 推算
        List<BigDecimal> prices = orders.stream()
                .map(ProductionOrder::getQuotationUnitPrice)
                .filter(p -> p != null && p.compareTo(BigDecimal.ZERO) > 0)
                .collect(Collectors.toList());
        if (!prices.isEmpty()) {
            BigDecimal avg = prices.stream()
                    .reduce(BigDecimal.ZERO, BigDecimal::add)
                    .divide(BigDecimal.valueOf(prices.size()), 2, RoundingMode.HALF_UP);
            resp.setCurrentQuotation(avg);
            resp.setSuggestedPrice(avg);
        }
    }

    private void buildSuggestion(StyleQuoteSuggestionResponse resp) {
        if (resp.getHistoricalOrderCount() == 0) {
            resp.setSuggestion("该款号暂无历史订单，建议参考BOM报价单定价");
            return;
        }

        StringBuilder sb = new StringBuilder();
        sb.append(String.format("历史 %d 单，共 %s 件",
                resp.getHistoricalOrderCount(),
                resp.getHistoricalTotalQuantity()));

        if (resp.getTotalCost() != null && resp.getTotalCost().compareTo(BigDecimal.ZERO) > 0) {
            sb.append(String.format("。成本 ¥%s，建议报价 ≥ ¥%s",
                    resp.getTotalCost().toPlainString(),
                    resp.getSuggestedPrice().toPlainString()));
        } else if (resp.getCurrentQuotation() != null) {
            sb.append(String.format("。历史均价 ¥%s", resp.getCurrentQuotation().toPlainString()));
        }

        resp.setSuggestion(sb.toString());
    }
}
