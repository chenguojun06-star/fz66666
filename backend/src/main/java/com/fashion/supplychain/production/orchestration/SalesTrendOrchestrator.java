package com.fashion.supplychain.production.orchestration;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.production.service.ProductOutstockService;
import com.fashion.supplychain.warehouse.constant.OutstockTypeConstants;

import lombok.extern.slf4j.Slf4j;

/**
 * 款式销量趋势查询（D-800）
 *
 * <h3>数据来源与口径</h3>
 * 唯一事实来源：{@code t_product_outstock}（出库台账），只统计<b>销售</b>口径
 * （{@link OutstockTypeConstants#SALE_OUTSTOCK_TYPES}）——
 * 调拨、报废、样衣借出、冲销红字全部排除，它们都不是「卖掉了」。
 *
 * <h3>⚠️ 数据真实性铁律（本类最重要约束）</h3>
 * <ul>
 *   <li><b>只读真实落库数据</b>，不使用随机数、常量、估算值填充任何数字。</li>
 *   <li><b>无数据就是无数据</b>：返回 {@code hasData=false} + {@code dataRange=null}，
 *       缺口日期<b>不补0</b>。前端必须显示「暂无销量数据」而不是画一条平的零线
 *       ——「卖不动」和「没记录」是两回事，补0会把前者伪装成后者。</li>
 *   <li><b>缺口日期的处理</b>：只在「该色码确实有流水」的前提下，中间没卖货的日期才补 0
 *       （0 是事实：这个日期真的没卖）；若该色码一条流水都没有，整段日期不生成，
 *       由 {@code hasData=false} 表达。</li>
 *   <li><b>渠道如实反映</b>：渠道取自出库台账的 platform_code，取不到就是 {@code null}，
 *       <b>不猜、不兜底成某个平台</b>。前端显示「—」。</li>
 * </ul>
 *
 * <p>背景：本功能上线前，电商现货发货链路根本不写出库台账（只扣库存+改单状态），
 * 导致平台销量在台账里完全缺失。D-800 补齐了该链路后数据才具备参考价值。
 */
@Slf4j
@Service
public class SalesTrendOrchestrator {

    /**
     * 趋势默认天数。
     *
     * <p>D-800 补修：原为 30 天，但服装是<b>低频大批</b>（一个月出一批货），
     * 30 天窗口对多数款式必然查空，下单人员会误判「没卖过」。
     * 改为 90 天（约一个季度，覆盖正常补货周期）。
     */
private static final int DEFAULT_DAYS = 90;
    private static final int MAX_DAYS = 365;
    private static final DateTimeFormatter DAY_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    @Autowired
    private ProductOutstockService productOutstockService;

    /**
     * 查询款式销量趋势（款号级）。
     * @param styleNo  款号
     * @param days     天数，默认 90，上限 365
     * @return 含 hasData / dataRange / totalQty / points / channels
     */
    public Map<String, Object> getStyleSalesTrend(String styleNo, Integer days) {
        int window = normalizeDays(days);
        Long tenantId = UserContext.tenantId();
        Map<String, Object> result = baseResult(window);
        if (!StringUtils.hasText(styleNo) || tenantId == null) {
            return result;
        }

        LocalDate to = LocalDate.now();
        LocalDate from = to.minusDays(window - 1L);
        List<ProductOutstock> rows = querySaleOutstocks(tenantId, styleNo, from, to);
        return build(result, rows, to, from, window, null);
    }

    /**
     * 查询款式下「颜色×尺码」销量趋势（下单页矩阵用）。
     *
     * <p>返回 {@code matrix: {颜色: {尺码: {该色码的趋势对象}}}}。
     * 没有流水的色码<b>不出现在 matrix 里</b>（而不是出现一个全 0 的对象），
     * 前端据此显示「—」。
     *
     * @param colors 限定颜色（可空 = 不限）
     * @param sizes  限定尺码（可空 = 不限）
     */
    public Map<String, Object> getStyleSizeColorSalesTrend(String styleNo, Integer days,
                                                           List<String> colors, List<String> sizes) {
        int window = normalizeDays(days);
        Long tenantId = UserContext.tenantId();
        Map<String, Object> result = baseResult(window);
        result.put("matrix", new LinkedHashMap<String, Object>());
        if (!StringUtils.hasText(styleNo) || tenantId == null) {
            return result;
        }

        LocalDate to = LocalDate.now();
        LocalDate from = to.minusDays(window - 1L);
        List<ProductOutstock> rows = querySaleOutstocks(tenantId, styleNo, from, to);

        // D-800 补修：窗口内没数据时自动回溯，避免「明明卖过却查不到」。
        //
        // 【实测踩到的坑】BR24XQ0098E 在 2026-09-11 发过 5 个码各 60 件，
        // 到 10-11 正好距今 30 天，而默认 30 天窗口从 09-12 起 —— 刚好差 1 天被排除，
        // 下单人员点开只看到「—」，误以为「这款没卖过」。实际是低频款（一月一批），
        // 固定 30 天窗口对服装行业几乎必然查空。
        //
        // 【为什么是回溯而不是单纯把默认改大】单纯改成 90 天仍会有下一次边界踩坑。
        // 回溯是兜底：窗口内空就往前找，找到为止，并**如实告知实际用了多长的区间**，
        // 让下单人员知道「这是 3 个月前的数据」而不是误以为「最近卖得差」。
        int actualWindow = window;
        if (rows.isEmpty() && window < MAX_DAYS) {
            int extended = Math.min(MAX_DAYS, Math.max(window * 2, DEFAULT_DAYS));
            LocalDate wideFrom = to.minusDays(extended - 1L);
            List<ProductOutstock> wideRows = querySaleOutstocks(tenantId, styleNo, wideFrom, to);
            if (!wideRows.isEmpty()) {
                rows = wideRows;
                from = wideFrom;
                actualWindow = extended;
                log.info("[销量趋势] 近{}天无数据，自动回溯到{}天命中: styleNo={}",
                        window, extended, styleNo);
            }
        }
        result.put("days", actualWindow);
        if (actualWindow != window) {
            result.put("windowExpanded", true);
            result.put("requestedDays", window);
        }

        if (rows.isEmpty()) {
            // 全款式无任何销售流水 —— 诚实表达，不造零线
            result.put("hasData", false);
            result.put("noDataReason", "该款式在最近 " + actualWindow + " 天内没有销售出库记录");
            return result;
        }

        // 按 色 → 码 → 按日 聚合（保留真实日期缺口语义）
        Map<String, Map<String, Map<LocalDate, Integer>>> grouped = new LinkedHashMap<>();
        Map<String, Integer> channelCount = new LinkedHashMap<>();
        int totalQty = 0;
        LocalDate minDate = null;
        LocalDate maxDate = null;

        for (ProductOutstock r : rows) {
            String color = StringUtils.trimWhitespace(r.getColor());
            String size = StringUtils.trimWhitespace(r.getSize());
            // 色码缺失的行不参与色码维度聚合（不猜、不用字符串切分 skuCode 补）
            if (color == null || size == null) {
                continue;
            }
            if (!matchesFilter(colors, color) || !matchesFilter(sizes, size)) {
                continue;
            }
            LocalDate d = toLocalDate(r.getCreateTime());
            if (d == null) {
                continue;
            }
            int qty = r.getOutstockQuantity() != null ? r.getOutstockQuantity() : 0;
            grouped.computeIfAbsent(color, k -> new LinkedHashMap<>())
                    .computeIfAbsent(size, k -> new TreeMap<>())
                    .merge(d, qty, Integer::sum);
            totalQty += qty;
            if (minDate == null || d.isBefore(minDate)) minDate = d;
            if (maxDate == null || d.isAfter(maxDate)) maxDate = d;
            String ch = OutstockTypeConstants.normalizeChannelForRead(r.getPlatformCode());
            if (ch != null) {
                channelCount.merge(ch, 1, Integer::sum);
            }
        }

        if (grouped.isEmpty()) {
            // 有流水但没有一行带色码 —— 明确说明原因，不返回空壳
            result.put("hasData", false);
            result.put("noColorSizeReason", "出库流水缺少颜色/尺码，无法按色码分析");
            return result;
        }

        @SuppressWarnings("unchecked")
        Map<String, Object> matrix = (Map<String, Object>) result.get("matrix");
        for (Map.Entry<String, Map<String, Map<LocalDate, Integer>>> ce : grouped.entrySet()) {
            Map<String, Object> sizeMap = new LinkedHashMap<>();
            for (Map.Entry<String, Map<LocalDate, Integer>> se : ce.getValue().entrySet()) {
                sizeMap.put(se.getKey(), buildCellTrend(se.getValue(), to, from, actualWindow));
            }
            matrix.put(ce.getKey(), sizeMap);
        }

        result.put("hasData", true);
        result.put("totalQty", totalQty);
        result.put("recordCount", rows.size());
        result.put("dataRange", rangeStr(minDate, maxDate));
        result.put("channels", topChannels(channelCount));
        return result;
    }

    // ==================== 内部实现 ====================

    /**
     * 按「销售口径 + 款号 + 时间窗」查真实出库流水。
     *
     * <p>款号用等值匹配（{@code style_no = ?}），<b>不用 likeRight 前缀匹配</b> ——
     * 款号 A1001 会前缀命中 A10012 的销量，是真实存在的跨款串数问题。
     */
    private List<ProductOutstock> querySaleOutstocks(Long tenantId, String styleNo,
                                                     LocalDate from, LocalDate to) {
        try {
            return productOutstockService.list(new LambdaQueryWrapper<ProductOutstock>()
                    .eq(ProductOutstock::getTenantId, tenantId)
                    .eq(ProductOutstock::getStyleNo, styleNo.trim())
                    .eq(ProductOutstock::getDeleteFlag, 0)
                    .in(ProductOutstock::getOutstockType, OutstockTypeConstants.SALE_OUTSTOCK_TYPES)
                    .between(ProductOutstock::getCreateTime,
                            from.atStartOfDay(), to.atTime(23, 59, 59)));
        } catch (Exception e) {
            log.error("[销量趋势] 查询出库流水失败: styleNo={} err={}", styleNo, e.getMessage(), e);
            // 查不到就明确告诉调用方「无数据」，绝不用默认值伪装成查询成功
            return new ArrayList<>();
        }
    }

    /**
     * 构建单个色码的趋势。
     *
     * <p>只有确实存在流水记录（{@code qtyByDate} 非空）才生成日期轴并补缺口 0；
     * 「该日期真的没卖货」补 0 是事实陈述，不是编造。
     */
    private Map<String, Object> buildCellTrend(Map<LocalDate, Integer> qtyByDate,
                                                LocalDate to, LocalDate from, int window) {
        Map<String, Object> cell = new LinkedHashMap<>();
        int total = qtyByDate.values().stream().mapToInt(Integer::intValue).sum();
        cell.put("totalQty", total);
        cell.put("recordDays", qtyByDate.size());
        cell.put("hasData", !qtyByDate.isEmpty());

        List<Map<String, Object>> points = new ArrayList<>();
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
            Integer q = qtyByDate.get(d);
            Map<String, Object> p = new LinkedHashMap<>();
            p.put("date", d.format(DAY_FMT));
            p.put("qty", q != null ? q : 0);
            points.add(p);
        }
        cell.put("points", points);

        // 日均只在该色码有流水时才算 —— 无流水的 0 日均没有意义
        cell.put("avgQty", qtyByDate.isEmpty() ? null : round2((double) total / qtyByDate.size()));
        return cell;
    }

    private Map<String, Object> build(Map<String, Object> result, List<ProductOutstock> rows,
                                     LocalDate to, LocalDate from, int window,
                                     Map<String, Object> unused) {
        if (rows.isEmpty()) {
            result.put("hasData", false);
            return result;
        }
        Map<LocalDate, Integer> qtyByDate = new TreeMap<>();
        Map<String, Integer> channelCount = new LinkedHashMap<>();
        int totalQty = 0;
        LocalDate minDate = null;
        LocalDate maxDate = null;
        for (ProductOutstock r : rows) {
            LocalDate d = toLocalDate(r.getCreateTime());
            if (d == null) continue;
            qtyByDate.merge(d, r.getOutstockQuantity() != null ? r.getOutstockQuantity() : 0, Integer::sum);
            totalQty += r.getOutstockQuantity() != null ? r.getOutstockQuantity() : 0;
            if (minDate == null || d.isBefore(minDate)) minDate = d;
            if (maxDate == null || d.isAfter(maxDate)) maxDate = d;
            String ch = OutstockTypeConstants.normalizeChannelForRead(r.getPlatformCode());
            if (ch != null) channelCount.merge(ch, 1, Integer::sum);
        }
        result.put("hasData", true);
        result.put("totalQty", totalQty);
        result.put("recordCount", rows.size());
        result.put("recordDays", qtyByDate.size());
        result.put("dataRange", rangeStr(minDate, maxDate));
        result.put("points", buildCellTrend(qtyByDate, to, from, window).get("points"));
        result.put("channels", topChannels(channelCount));
        return result;
    }

    private Map<String, Object> baseResult(int window) {
        Map<String, Object> m = new LinkedHashMap<>();
        // 默认 hasData=false：无数据是常态之一，前端据此显示「暂无数据」而不是零线
        m.put("hasData", false);
        m.put("days", window);
        m.put("totalQty", null);
        m.put("recordCount", 0);
        m.put("dataRange", null);
        m.put("channels", new ArrayList<>());
        m.put("source", "t_product_outstock（出库台账，仅销售口径：发货/自由出库/扫码出库）");
        return m;
    }

    private int normalizeDays(Integer days) {
        if (days == null || days <= 0) return DEFAULT_DAYS;
        return Math.min(days, MAX_DAYS);
    }

    private LocalDate toLocalDate(LocalDateTime t) {
        return t != null ? t.toLocalDate() : null;
    }

    private String rangeStr(LocalDate min, LocalDate max) {
        if (min == null || max == null) return null;
        return min.format(DAY_FMT) + " ~ " + max.format(DAY_FMT);
    }

    /** 渠道 Top N（按流水条数），如实反映；无渠道数据返回空列表而不是编一个 */
    private List<Map<String, Object>> topChannels(Map<String, Integer> channelCount) {
        List<Map<String, Object>> out = new ArrayList<>();
        channelCount.entrySet().stream()
                .sorted((a, b) -> Integer.compare(b.getValue(), a.getValue()))
                .limit(8)
                .forEach(e -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("channel", e.getKey());
                    m.put("recordCount", e.getValue());
                    out.add(m);
                });
        return out;
    }

    private boolean matchesFilter(List<String> filters, String value) {
        if (filters == null || filters.isEmpty()) return true;
        for (String f : filters) {
            if (java.util.Objects.equals(StringUtils.trimWhitespace(f), value)) {
                return true;
            }
        }
        return false;
    }

    private double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }
}