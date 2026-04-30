package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.StringWriter;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.*;

/**
 * 全模块数字孪生构建器 — 小云统一数据视图。
 * <p>
 * 从五大业务域并行拉取实时数据，构建企业全景快照：
 * <ol>
 *   <li><b>生产域</b> — 订单进度、工序状态、质量异常、逾期预警</li>
 *   <li><b>物料域</b> — 库存水位、采购在途、缺料预警</li>
 *   <li><b>财务域</b> — 应收应付、利润概览、异常费用</li>
 *   <li><b>仓储域</b> — 出入库动态、呆滞库存</li>
 *   <li><b>样衣域</b> — 开发进度、打样周期</li>
 * </ol>
 * </p>
 *
 * <p>与旧 DigitalTwinBuilderOrchestrator 的区别：
 * 旧版只读生产订单表；本版覆盖全模块，为小云「操作全系统」提供数据底座。</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FullDigitalTwinBuilder {

    private final ObjectMapper objectMapper = new ObjectMapper();

    /** 各域数据获取器（按需注入，允许部分为 null） */
    private final List<DomainDataProvider> providers;

    /** 并行查询线程池 */
    private final ExecutorService twinExecutor = new ThreadPoolExecutor(
            5, 10, 60L, TimeUnit.SECONDS,
            new LinkedBlockingQueue<>(20),
            r -> {
                Thread t = new Thread(r, "digital-twin-" + System.currentTimeMillis() % 1000);
                t.setDaemon(true);
                return t;
            },
            new ThreadPoolExecutor.CallerRunsPolicy());

    /** 全量快照缓存 */
    private volatile FullSnapshot cachedSnapshot;
    private volatile long cacheTime;
    private static final long SNAPSHOT_TTL_MS = 60_000; // 1分钟缓存

    // ===== 数据模型 =====

    /**
     * 全模块快照
     */
    public record FullSnapshot(
            long timestamp,
            Long tenantId,
            ProductionDomain production,
            MaterialDomain material,
            FinanceDomain finance,
            WarehouseDomain warehouse,
            StyleDomain style,
            Map<String, Object> summary
    ) {
        public String toPromptBlock() {
            StringBuilder sb = new StringBuilder();
            sb.append("\n【企业数字孪生 · 实时全景快照】\n");
            sb.append("生成时间：").append(new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss")
                    .format(new Date(timestamp))).append("\n\n");

            if (production != null) {
                sb.append("### 生产域\n");
                sb.append("- 在制订单：").append(production.inProgressOrders).append(" 个\n");
                sb.append("- 逾期订单：").append(production.overdueOrders).append(" 个");
                if (production.overdueRate > 0) sb.append("（逾期率 ").append(String.format("%.1f%%", production.overdueRate)).append("）");
                sb.append("\n");
                sb.append("- 停滞工单：").append(production.stalledTasks).append(" 个\n");
                sb.append("- 质量异常：").append(production.qualityIssues).append(" 起\n");
                if (production.topOverdueFactory != null) {
                    sb.append("- 🔴 最需关注工厂：").append(production.topOverdueFactory).append("\n");
                }
                sb.append("\n");
            }

            if (material != null) {
                sb.append("### 物料域\n");
                sb.append("- 物料库存种类：").append(material.totalSkuCount).append(" 种\n");
                sb.append("- 低库存预警：").append(material.lowStockCount).append(" 种\n");
                sb.append("- 采购在途：").append(material.purchasingInTransit).append(" 单\n");
                sb.append("- 待收料：").append(material.pendingReceive).append(" 批\n");
                sb.append("\n");
            }

            if (finance != null) {
                sb.append("### 财务域\n");
                sb.append("- 本月应收：¥").append(formatMoney(finance.monthReceivable)).append("\n");
                sb.append("- 本月应付：¥").append(formatMoney(finance.monthPayable)).append("\n");
                sb.append("- 待审批结算：").append(finance.pendingApproval).append(" 笔\n");
                sb.append("- 异常费用预警：").append(finance.anomalyCount).append(" 起\n");
                sb.append("\n");
            }

            if (warehouse != null) {
                sb.append("### 仓储域\n");
                sb.append("- 今日入库：").append(warehouse.todayInbound).append(" 批\n");
                sb.append("- 今日出库：").append(warehouse.todayOutbound).append(" 批\n");
                sb.append("- 呆滞库存：").append(warehouse.slowMovingSku).append(" 种\n");
                sb.append("\n");
            }

            if (style != null) {
                sb.append("### 样衣域\n");
                sb.append("- 开发中款式：").append(style.inDevelopment).append(" 个\n");
                sb.append("- 打样中：").append(style.inSampling).append(" 个\n");
                sb.append("- 平均打样周期：").append(style.avgSampleDays).append(" 天\n");
                sb.append("\n");
            }

            return sb.toString();
        }

        private String formatMoney(Double amount) {
            if (amount == null) return "0";
            if (amount >= 10000) {
                return String.format("%.2f万", amount / 10000);
            }
            return String.format("%.0f", amount);
        }
    }

    // ===== 域数据模型 =====

    public record ProductionDomain(
            int inProgressOrders, int overdueOrders, double overdueRate,
            long stalledTasks, int qualityIssues, String topOverdueFactory,
            Map<String, Object> detail
    ) {}

    public record MaterialDomain(
            long totalSkuCount, long lowStockCount,
            int purchasingInTransit, int pendingReceive,
            Map<String, Object> detail
    ) {}

    public record FinanceDomain(
            Double monthReceivable, Double monthPayable,
            int pendingApproval, int anomalyCount,
            Map<String, Object> detail
    ) {}

    public record WarehouseDomain(
            int todayInbound, int todayOutbound,
            long slowMovingSku, Map<String, Object> detail
    ) {}

    public record StyleDomain(
            int inDevelopment, int inSampling,
            double avgSampleDays, Map<String, Object> detail
    ) {}

    // ===== 核心方法 =====

    /**
     * 构建全模块数字孪生快照（带缓存）
     */
    public FullSnapshot buildSnapshot() {
        // 检查缓存
        if (cachedSnapshot != null && (System.currentTimeMillis() - cacheTime) < SNAPSHOT_TTL_MS) {
            return cachedSnapshot;
        }

        Long tenantId = UserContext.tenantId();
        log.info("[DigitalTwin] 开始构建全模块数字孪生... tenantId={}", tenantId);

        List<CompletableFuture<?>> futures = new ArrayList<>();

        // 并行拉取各域数据
        CompletableFuture<ProductionDomain> prodFuture = supplyAsync(() ->
                providers.stream()
                        .filter(p -> p.supports("production"))
                        .findFirst()
                        .map(p -> p.buildProduction(tenantId))
                        .orElse(null));
        futures.add(prodFuture);

        CompletableFuture<MaterialDomain> matFuture = supplyAsync(() ->
                providers.stream()
                        .filter(p -> p.supports("material"))
                        .findFirst()
                        .map(p -> p.buildMaterial(tenantId))
                        .orElse(null));
        futures.add(matFuture);

        CompletableFuture<FinanceDomain> finFuture = supplyAsync(() ->
                providers.stream()
                        .filter(p -> p.supports("finance"))
                        .findFirst()
                        .map(p -> p.buildFinance(tenantId))
                        .orElse(null));
        futures.add(finFuture);

        CompletableFuture<WarehouseDomain> whFuture = supplyAsync(() ->
                providers.stream()
                        .filter(p -> p.supports("warehouse"))
                        .findFirst()
                        .map(p -> p.buildWarehouse(tenantId))
                        .orElse(null));
        futures.add(whFuture);

        CompletableFuture<StyleDomain> styleFuture = supplyAsync(() ->
                providers.stream()
                        .filter(p -> p.supports("style"))
                        .findFirst()
                        .map(p -> p.buildStyle(tenantId))
                        .orElse(null));
        futures.add(styleFuture);

        // 等待所有域完成（8秒超时）
        try {
            CompletableFuture.allOf(futures.toArray(new CompletableFuture[0]))
                    .get(8, TimeUnit.SECONDS);
        } catch (TimeoutException e) {
            log.warn("[DigitalTwin] 部分域数据拉取超时（8s），使用已返回结果");
        } catch (Exception e) {
            log.warn("[DigitalTwin] 构建异常: {}", e.getMessage());
        }

        // 组装快照
        ProductionDomain prod = safeGet(prodFuture);
        MaterialDomain mat = safeGet(matFuture);
        FinanceDomain fin = safeGet(finFuture);
        WarehouseDomain wh = safeGet(whFuture);
        StyleDomain style = safeGet(styleFuture);

        // 汇总摘要
        Map<String, Object> summary = buildSummary(prod, mat, fin, wh, style, tenantId);

        FullSnapshot snapshot = new FullSnapshot(
                System.currentTimeMillis(), tenantId,
                prod, mat, fin, wh, style, summary
        );

        // 更新缓存
        this.cachedSnapshot = snapshot;
        this.cacheTime = System.currentTimeMillis();

        log.info("[DigitalTwin] 数字孪生构建完成: prod={}, mat={}, fin={}, wh={}, style={}",
                prod != null ? prod.inProgressOrders + "订单" : "N/A",
                mat != null ? mat.totalSkuCount + "SKU" : "N/A",
                fin != null ? "¥" + fin.monthReceivable : "N/A",
                wh != null ? wh.todayInbound + "入库" : "N/A",
                style != null ? style.inDevelopment + "款式" : "N/A");

        return snapshot;
    }

    /**
     * 获取当前缓存快照
     */
    public FullSnapshot getCachedSnapshot() {
        return cachedSnapshot;
    }

    /**
     * 刷新缓存
     */
    public FullSnapshot refresh() {
        cachedSnapshot = null;
        return buildSnapshot();
    }

    // ===== 辅助方法 =====

    private Map<String, Object> buildSummary(ProductionDomain prod, MaterialDomain mat,
                                              FinanceDomain fin, WarehouseDomain wh,
                                              StyleDomain style, Long tenantId) {
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("tenantId", tenantId);
        summary.put("generatedAt", LocalDateTime.now().toString());

        List<String> alerts = new ArrayList<>();
        if (prod != null && prod.overdueOrders > 0) {
            alerts.add("🔴 生产逾期 " + prod.overdueOrders + " 单");
        }
        if (mat != null && mat.lowStockCount > 0) {
            alerts.add("🟡 物料低库存 " + mat.lowStockCount + " 种");
        }
        if (fin != null && fin.anomalyCount > 0) {
            alerts.add("🟡 财务异常 " + fin.anomalyCount + " 起");
        }
        if (wh != null && wh.slowMovingSku > 0) {
            alerts.add("🟠 呆滞库存 " + wh.slowMovingSku + " 种");
        }

        summary.put("alerts", alerts);
        summary.put("alertCount", alerts.size());
        return summary;
    }

    private <T> CompletableFuture<T> supplyAsync(java.util.function.Supplier<T> supplier) {
        return CompletableFuture.supplyAsync(supplier, twinExecutor);
    }

    private <T> T safeGet(CompletableFuture<T> future) {
        try {
            return future.getNow(null);
        } catch (Exception e) {
            return null;
        }
    }

    // ===== 域数据提供者接口 =====

    /**
     * 域数据提供者接口。
     * 各业务模块通过实现此接口并注册为 Spring Bean 来贡献数据。
     */
    public interface DomainDataProvider {
        /** 支持的域名称 */
        String domain();

        /** 是否支持指定域 */
        default boolean supports(String domainName) {
            return domain().equalsIgnoreCase(domainName);
        }

        /** 构建生产域数据 */
        default ProductionDomain buildProduction(Long tenantId) { return null; }

        /** 构建物料域数据 */
        default MaterialDomain buildMaterial(Long tenantId) { return null; }

        /** 构建财务域数据 */
        default FinanceDomain buildFinance(Long tenantId) { return null; }

        /** 构建仓储域数据 */
        default WarehouseDomain buildWarehouse(Long tenantId) { return null; }

        /** 构建样衣域数据 */
        default StyleDomain buildStyle(Long tenantId) { return null; }
    }
}
