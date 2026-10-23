package com.fashion.supplychain.common.monitor;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.production.entity.*;
import com.fashion.supplychain.production.mapper.*;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.mapper.ProductSkuMapper;
import com.fashion.supplychain.style.mapper.StyleInfoMapper;
import com.fashion.supplychain.system.mapper.FactoryMapper;
import com.fashion.supplychain.system.mapper.UserMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.stream.Collectors;

/**
 * 数据一致性校验服务
 * 
 * <p>定时检测孤儿数据和数据不一致问题，确保多租户数据安全。
 * 
 * <p>检查项：
 * <ul>
 *   <li>孤儿数据：无 tenant_id 的记录</li>
 *   <li>孤立记录：外键引用不存在</li>
 *   <li>数据不一致：关联数据不匹配</li>
 * </ul>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DataConsistencyChecker {

    @Autowired
    private ProductionOrderMapper orderMapper;
    
    @Autowired
    private ScanRecordMapper scanRecordMapper;
    
    @Autowired
    private CuttingBundleMapper cuttingBundleMapper;
    
    @Autowired
    private ProductWarehousingMapper warehousingMapper;
    
    @Autowired
    private MaterialPurchaseMapper materialPurchaseMapper;
    
    @Autowired
    private MaterialStockMapper materialStockMapper;
    
    @Autowired
    private StyleInfoMapper styleInfoMapper;
    
    @Autowired
    private FactoryMapper factoryMapper;
    
    @Autowired
    private UserMapper userMapper;

    /** D-846：库存对账巡检需要 SKU 库存视角 */
    @Autowired
    private ProductSkuMapper productSkuMapper;

    /** D-846：对账判定要扣减出库（否则有出货的款会被全部误报） */
    @Autowired
    private ProductOutstockMapper productOutstockMapper;

    /** 检测结果缓存 */
    private volatile long lastCheckTime = 0;
    private volatile CheckResult lastResult = null;

    /**
     * 每日凌晨2点执行数据校验
     */
    @Scheduled(cron = "0 0 2 * * ?")
    public void dailyConsistencyCheck() {
        log.info("[DataConsistency] 开始每日数据一致性校验...");
        try {
            CheckResult result = performFullCheck();
            lastResult = result;
            lastCheckTime = System.currentTimeMillis();
            log.info("[DataConsistency] 校验完成: 孤儿数据={}, 孤立记录={}, 数据不一致={}",
                    result.orphanRecords, result.isolatedRecords, result.inconsistentRecords);
            
            if (result.hasIssues()) {
                log.warn("[DataConsistency] 发现数据问题，建议人工检查并修复");
            }
        } catch (Exception e) {
            log.error("[DataConsistency] 校验异常", e);
        }
    }

    /**
     * 执行完整数据一致性检查
     */
    public CheckResult performFullCheck() {
        CheckResult result = new CheckResult();
        result.startTime = System.currentTimeMillis();
        
        // 1. 检查孤儿数据（无 tenant_id）
        checkOrphanRecords(result);
        
        // 2. 检查孤立记录（外键引用不存在）
        checkIsolatedRecords(result);
        
        // 3. 检查数据不一致
        checkDataInconsistency(result);

        // 4. D-846：库存对账闭环检查——「有库存无入库单」「有入库单但账不平」
        //    （2026-10-23 生产报障「入库记录全没、0=110+0+0」的守护；
        //     此前该类问题只能靠人肉翻库发现）
        checkStockWithoutInbound(result);
        checkStockVsInboundMismatch(result);
        
        result.endTime = System.currentTimeMillis();
        result.duration = result.endTime - result.startTime;
        
        return result;
    }

    /**
     * 检查孤儿数据（无 tenant_id 的记录）
     * 
     * <p>这些记录可能是：
     * <ul>
     *   <li>系统初始化时创建的测试数据</li>
     *   <li>导入数据时遗漏的 tenant_id</li>
     *   <li>迁移过程中的异常数据</li>
     * </ul>
     */
    private void checkOrphanRecords(CheckResult result) {
        log.info("[DataConsistency] 检查孤儿数据...");
        
        try {
            // 检查 t_production_order
            List<ProductionOrder> orderWithoutTenant = orderMapper.selectList(
                new LambdaQueryWrapper<ProductionOrder>().isNull(ProductionOrder::getTenantId)
            );
            if (!orderWithoutTenant.isEmpty()) {
                result.addIssue("t_production_order", "孤儿记录", orderWithoutTenant.size(), 
                    "tenant_id为空的订单记录");
            }
            
            // 检查 t_style_info
            List<StyleInfo> styleWithoutTenant = styleInfoMapper.selectList(
                new LambdaQueryWrapper<StyleInfo>().isNull(StyleInfo::getTenantId)
            );
            if (!styleWithoutTenant.isEmpty()) {
                result.addIssue("t_style_info", "孤儿记录", styleWithoutTenant.size(),
                    "tenant_id为空的款式记录");
            }
            
            // 检查 t_material_stock
            List<MaterialStock> stockWithoutTenant = materialStockMapper.selectList(
                new LambdaQueryWrapper<MaterialStock>().isNull(MaterialStock::getTenantId)
            );
            if (!stockWithoutTenant.isEmpty()) {
                result.addIssue("t_material_stock", "孤儿记录", stockWithoutTenant.size(),
                    "tenant_id为空的库存记录");
            }
            
            result.orphanRecords = orderWithoutTenant.size() + styleWithoutTenant.size() + stockWithoutTenant.size();
            
        } catch (Exception e) {
            log.error("[DataConsistency] 检查孤儿数据异常", e);
            result.addError("checkOrphanRecords", e.getMessage());
        }
    }

    /**
     * 检查孤立记录（外键引用不存在）
     */
    private void checkIsolatedRecords(CheckResult result) {
        log.info("[DataConsistency] 检查孤立记录...");

        try {
            // 一次查询订单（只查需要的列），复用于三个子检查，避免全表扫描3次
            List<ProductionOrder> orders = orderMapper.selectList(
                new LambdaQueryWrapper<ProductionOrder>()
                    .select(ProductionOrder::getId, ProductionOrder::getStyleId, ProductionOrder::getOrderNo)
            );

            // 1. 检查订单引用的款式是否存在
            checkOrphanStyleReferences(result, orders);

            // 2. 检查裁剪包引用的订单是否存在
            checkOrphanOrderReferences(result, orders);

            // 3. 检查扫码记录引用的订单是否存在
            checkOrphanScanRecordReferences(result, orders);

        } catch (Exception e) {
            log.error("[DataConsistency] 检查孤立记录异常", e);
            result.addError("checkIsolatedRecords", e.getMessage());
        }
    }

    private void checkOrphanStyleReferences(CheckResult result, List<ProductionOrder> orders) {
        // 获取所有款式ID（只查ID列，避免全表扫描）
        Set<Long> validStyleIds = styleInfoMapper.selectList(
            new LambdaQueryWrapper<StyleInfo>().select(StyleInfo::getId)
        ).stream()
            .map(StyleInfo::getId)
            .collect(Collectors.toSet());

        if (validStyleIds.isEmpty()) return;

        // 复用已查询的订单数据
        List<String> orphanStyleOrders = orders.stream()
            .filter(o -> o.getStyleId() != null && !validStyleIds.contains(o.getStyleId()))
            .map(ProductionOrder::getOrderNo)
            .collect(Collectors.toList());

        if (!orphanStyleOrders.isEmpty()) {
            result.addIssue("t_production_order", "孤立款式引用", orphanStyleOrders.size(),
                "订单引用的款式不存在: " + orphanStyleOrders.stream().limit(5).collect(Collectors.joining(",")));
        }
    }

    private void checkOrphanOrderReferences(CheckResult result, List<ProductionOrder> orders) {
        // 复用已查询的订单数据
        Set<String> validOrderIds = orders.stream()
            .map(ProductionOrder::getId)
            .collect(Collectors.toSet());

        if (validOrderIds.isEmpty()) return;

        // 查询裁剪包（只查需要的列，避免全表扫描）
        List<CuttingBundle> bundles = cuttingBundleMapper.selectList(
            new LambdaQueryWrapper<CuttingBundle>()
                .select(CuttingBundle::getProductionOrderId, CuttingBundle::getBundleNo)
        );
        List<String> orphanOrderBundles = bundles.stream()
            .filter(b -> b.getProductionOrderId() != null && !validOrderIds.contains(b.getProductionOrderId()))
            .map(b -> "bundleNo=" + b.getBundleNo())
            .collect(Collectors.toList());

        if (!orphanOrderBundles.isEmpty()) {
            result.addIssue("t_cutting_bundle", "孤立订单引用", orphanOrderBundles.size(),
                "裁剪包引用的订单不存在: " + orphanOrderBundles.stream().limit(5).collect(Collectors.joining(",")));
        }
    }

    private void checkOrphanScanRecordReferences(CheckResult result, List<ProductionOrder> orders) {
        // 复用已查询的订单数据
        Set<String> validOrderIds = orders.stream()
            .map(ProductionOrder::getId)
            .collect(Collectors.toSet());

        if (validOrderIds.isEmpty()) return;

        // 查询引用的订单ID但订单不存在的扫码记录
        List<ScanRecord> orphanScans = scanRecordMapper.selectList(
            new LambdaQueryWrapper<ScanRecord>()
                .isNotNull(ScanRecord::getOrderId)
                .ne(ScanRecord::getOrderId, "")
                .and(w -> w.notIn(ScanRecord::getOrderId, validOrderIds).or().isNull(ScanRecord::getTenantId))
        );
        
        if (!orphanScans.isEmpty()) {
            result.addIssue("t_scan_record", "孤立订单引用/无租户", orphanScans.size(),
                "扫码记录引用的订单不存在或无租户");
        }
    }

    /**
     * 检查数据不一致
     */
    private void checkDataInconsistency(CheckResult result) {
        log.info("[DataConsistency] 检查数据不一致...");
        
        try {
            // 1. 检查订单数量与扫码记录不匹配
            checkOrderScanMismatch(result);
            
            // 2. 检查入库数量与订单数量不匹配（异常情况）
            checkWarehousingOrderMismatch(result);
            
            // 3. 检查采购数量与入库数量不匹配
            checkPurchaseWarehousingMismatch(result);
            
        } catch (Exception e) {
            log.error("[DataConsistency] 检查数据不一致异常", e);
            result.addError("checkDataInconsistency", e.getMessage());
        }
    }

    private void checkOrderScanMismatch(CheckResult result) {
        // 订单应该有扫码记录，如果没有可能是数据异常
        // 这里只做统计，不做自动修复
        long orderCount = orderMapper.selectCount(null);
        long scanCount = scanRecordMapper.selectCount(null);
        
        if (orderCount > 0 && scanCount == 0) {
            result.addIssue("t_scan_record", "数据异常", 1,
                "存在订单但无任何扫码记录，可能是扫码功能未启用或数据迁移问题");
        }
    }

    /**
     * D-846：检查「有库存但无任何入库单」的款。
     *
     * <p>2026-10-23 事故：11 个款库存非零却查不到入库单，对账公式呈现
     * 0 = 110 + 0 + 0，用户以为数据丢失。根因是 SKU 库存可被建款/导入直接写入，
     * 与入库单（只由质检入库/扫码/补录生成）是两条独立路径。
     * 本检查让这类「无单库存」在每日巡检里显形，不等用户报障。
     */
    private void checkStockWithoutInbound(CheckResult result) {
        log.info("[DataConsistency] 检查有库存无入库单的款...");
        try {
            Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
            List<ProductSku> skusWithStock = productSkuMapper.selectList(
                    new LambdaQueryWrapper<ProductSku>()
                            .gt(ProductSku::getStockQuantity, 0)
                            .eq(tenantId != null, ProductSku::getTenantId, tenantId));
            if (skusWithStock == null || skusWithStock.isEmpty()) {
                return;
            }
            List<ProductWarehousing> inbound = warehousingMapper.selectList(
                    new LambdaQueryWrapper<ProductWarehousing>()
                            .eq(ProductWarehousing::getDeleteFlag, 0)
                            .eq(tenantId != null, ProductWarehousing::getTenantId, tenantId));
            Set<String> stylesWithInbound = (inbound == null ? List.<ProductWarehousing>of() : inbound).stream()
                    .map(w -> w.getStyleNo() == null ? "" : w.getStyleNo().trim())
                    .filter(s -> !s.isEmpty())
                    .collect(Collectors.toSet());

            Map<String, Integer> stockByStyle = new LinkedHashMap<>();
            for (ProductSku sku : skusWithStock) {
                String sn = sku.getStyleNo() == null ? "" : sku.getStyleNo().trim();
                if (sn.isEmpty()) continue;
                int q = sku.getStockQuantity() == null ? 0 : sku.getStockQuantity();
                stockByStyle.merge(sn, q, Integer::sum);
            }
            List<String> orphans = new ArrayList<>();
            int orphanQty = 0;
            for (Map.Entry<String, Integer> e : stockByStyle.entrySet()) {
                if (!stylesWithInbound.contains(e.getKey())) {
                    orphans.add(e.getKey() + "(" + e.getValue() + "件)");
                    orphanQty += e.getValue();
                }
            }
            if (!orphans.isEmpty()) {
                result.addIssue("t_product_sku", "有库存无入库单", orphans.size(),
                        "以下款有库存但无任何入库单（库存来自建款/导入直写，需补录入库单闭合对账）: "
                                + orphans.stream().limit(10).collect(Collectors.joining(", "))
                                + (orphans.size() > 10 ? " 等共 " + orphans.size() + " 款" : "")
                                + "，合计 " + orphanQty + " 件");
            }
        } catch (Exception e) {
            result.addError("checkStockWithoutInbound", e.getMessage());
        }
    }

    /**
     * D-846：检查「有入库单但库存与库存流水平账不一致」的款。
     *
     * <p>对账口径必须与前端公式一致：<b>合格入库 = 当前库存 + 出库总量 + 次品</b>
     * → 期望库存 = 合格入库 − 出库 − 次品。
     * ⚠️ 首版只比「库存 vs 合格入库」没有扣减出库/次品，会把所有有出货的款
     * 全部误报（假阳性洪水），本版修正。出库冲销用负数记录，SUM 自然抵消。
     * 排除无入库单的款（由 checkStockWithoutInbound 单独报告，避免重复噪音）。
     */
    private void checkStockVsInboundMismatch(CheckResult result) {
        log.info("[DataConsistency] 检查库存与入库-出库-次品是否平衡...");
        try {
            Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
            List<ProductSku> skus = productSkuMapper.selectList(
                    new LambdaQueryWrapper<ProductSku>()
                            .gt(ProductSku::getStockQuantity, 0)
                            .eq(tenantId != null, ProductSku::getTenantId, tenantId));
            if (skus == null || skus.isEmpty()) {
                return;
            }
            List<ProductWarehousing> inbound = warehousingMapper.selectList(
                    new LambdaQueryWrapper<ProductWarehousing>()
                            .eq(ProductWarehousing::getDeleteFlag, 0)
                            .eq(tenantId != null, ProductWarehousing::getTenantId, tenantId));
            List<ProductOutstock> outstock = productOutstockMapper.selectList(
                    new LambdaQueryWrapper<ProductOutstock>()
                            .eq(ProductOutstock::getDeleteFlag, 0)
                            .eq(tenantId != null, ProductOutstock::getTenantId, tenantId));

            Map<String, Integer> inboundByStyle = new HashMap<>();
            Map<String, Integer> defectByStyle = new HashMap<>();
            for (ProductWarehousing w : (inbound == null ? List.<ProductWarehousing>of() : inbound)) {
                String sn = w.getStyleNo() == null ? "" : w.getStyleNo().trim();
                if (sn.isEmpty()) continue;
                inboundByStyle.merge(sn, w.getQualifiedQuantity() == null ? 0 : w.getQualifiedQuantity(), Integer::sum);
                defectByStyle.merge(sn, w.getUnqualifiedQuantity() == null ? 0 : w.getUnqualifiedQuantity(), Integer::sum);
            }
            Map<String, Integer> outByStyle = new HashMap<>();
            for (ProductOutstock o : (outstock == null ? List.<ProductOutstock>of() : outstock)) {
                String sn = o.getStyleNo() == null ? "" : o.getStyleNo().trim();
                if (sn.isEmpty()) continue;
                outByStyle.merge(sn, o.getOutstockQuantity() == null ? 0 : o.getOutstockQuantity(), Integer::sum);
            }
            Map<String, Integer> stockByStyle = new LinkedHashMap<>();
            for (ProductSku sku : skus) {
                String sn = sku.getStyleNo() == null ? "" : sku.getStyleNo().trim();
                if (sn.isEmpty()) continue;
                stockByStyle.merge(sn, sku.getStockQuantity() == null ? 0 : sku.getStockQuantity(), Integer::sum);
            }
            List<String> diffs = new ArrayList<>();
            for (Map.Entry<String, Integer> e : stockByStyle.entrySet()) {
                String sn = e.getKey();
                Integer in = inboundByStyle.get(sn);
                if (in == null) continue;              // 无单款由另一检查报告
                int defect = defectByStyle.getOrDefault(sn, 0);
                int out = outByStyle.getOrDefault(sn, 0);
                int expected = in - out - defect;      // 期望库存
                if (expected != e.getValue()) {
                    diffs.add(sn + "(库存" + e.getValue() + "≠期望" + expected
                            + "：入库" + in + "-出库" + out + "-次品" + defect + ")");
                }
            }
            if (!diffs.isEmpty()) {
                result.addIssue("t_product_sku", "库存与入库不平", diffs.size(),
                        "以下款库存与「入库-出库-次品」不一致（可能存在未登记出库/次品、盘点调整或异常删单）: "
                                + diffs.stream().limit(10).collect(Collectors.joining(", "))
                                + (diffs.size() > 10 ? " 等共 " + diffs.size() + " 款" : ""));
            }
        } catch (Exception e) {
            result.addError("checkStockVsInboundMismatch", e.getMessage());
        }
    }

    private void checkWarehousingOrderMismatch(CheckResult result) {
        // D-846：填实原空壳——检查入库合格数量超过订单总数量的异常（录入错误/重复入库）。
        // 原实现只有注释和空循环，等于没检查。
        try {
            List<ProductionOrder> orders = orderMapper.selectList(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .eq(ProductionOrder::getStatus, "completed"));
            if (orders == null || orders.isEmpty()) {
                return;
            }
            Map<String, Integer> inboundByOrderNo = new HashMap<>();
            List<ProductWarehousing> inbound = warehousingMapper.selectList(
                    new LambdaQueryWrapper<ProductWarehousing>()
                            .eq(ProductWarehousing::getDeleteFlag, 0));
            for (ProductWarehousing w : (inbound == null ? List.<ProductWarehousing>of() : inbound)) {
                String on = w.getOrderNo() == null ? "" : w.getOrderNo().trim();
                if (on.isEmpty()) continue;
                int q = w.getQualifiedQuantity() == null ? 0 : w.getQualifiedQuantity();
                inboundByOrderNo.merge(on, q, Integer::sum);
            }
            List<String> abnormalOrders = new ArrayList<>();
            for (ProductionOrder order : orders) {
                Integer orderQty = order.getOrderQuantity();
                String on = order.getOrderNo() == null ? "" : order.getOrderNo().trim();
                if (orderQty == null || on.isEmpty()) continue;
                Integer in = inboundByOrderNo.get(on);
                if (in != null && in > orderQty) {
                    abnormalOrders.add(on + "(入库" + in + ">订单" + orderQty + ")");
                }
            }
            if (!abnormalOrders.isEmpty()) {
                result.addIssue("t_production_order", "数量异常", abnormalOrders.size(),
                        "入库数量超过订单数量的订单: "
                                + abnormalOrders.stream().limit(5).collect(Collectors.joining(",")));
            }
        } catch (Exception e) {
            result.addError("checkWarehousingOrderMismatch", e.getMessage());
        }
    }

    private void checkPurchaseWarehousingMismatch(CheckResult result) {
        // 采购入库数量超过采购数量的异常
        // 类似上面的实现
    }

    /**
     * 获取上次检查结果
     */
    public CheckResult getLastResult() {
        return lastResult;
    }

    /**
     * 获取上次检查时间
     */
    public long getLastCheckTime() {
        return lastCheckTime;
    }

    /**
     * 校验结果
     */
    public static class CheckResult {
        public long startTime;
        public long endTime;
        public long duration;
        public int orphanRecords;
        public int isolatedRecords;
        public int inconsistentRecords;
        public final List<Issue> issues = new ArrayList<>();
        public final List<String> errors = new ArrayList<>();

        public void addIssue(String table, String type, int count, String detail) {
            issues.add(new Issue(table, type, count, detail));
        }

        public void addError(String check, String message) {
            errors.add(check + ": " + message);
        }

        public boolean hasIssues() {
            return !issues.isEmpty();
        }

        public int totalIssues() {
            return issues.size();
        }

        @Override
        public String toString() {
            return String.format("CheckResult[orphan=%d, isolated=%d, inconsistent=%d, issues=%d, duration=%dms]",
                    orphanRecords, isolatedRecords, inconsistentRecords, issues.size(), duration);
        }
    }

    /**
     * 问题记录
     */
    public static class Issue {
        public final String table;
        public final String type;
        public final int count;
        public final String detail;

        public Issue(String table, String type, int count, String detail) {
            this.table = table;
            this.type = type;
            this.count = count;
            this.detail = detail;
        }

        @Override
        public String toString() {
            return String.format("[%s] %s: %d条 - %s", table, type, count, detail);
        }
    }
}
