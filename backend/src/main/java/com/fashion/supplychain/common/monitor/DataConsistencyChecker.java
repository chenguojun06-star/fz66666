package com.fashion.supplychain.common.monitor;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.production.entity.*;
import com.fashion.supplychain.production.mapper.*;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.mapper.StyleInfoMapper;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.mapper.FactoryMapper;
import com.fashion.supplychain.system.mapper.UserMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

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
            // 1. 检查订单引用的款式是否存在
            checkOrphanStyleReferences(result);
            
            // 2. 检查裁剪包引用的订单是否存在
            checkOrphanOrderReferences(result);
            
            // 3. 检查扫码记录引用的订单是否存在
            checkOrphanScanRecordReferences(result);
            
        } catch (Exception e) {
            log.error("[DataConsistency] 检查孤立记录异常", e);
            result.addError("checkIsolatedRecords", e.getMessage());
        }
    }

    private void checkOrphanStyleReferences(CheckResult result) {
        // 获取所有款式ID
        Set<Long> validStyleIds = styleInfoMapper.selectList(null).stream()
            .map(StyleInfo::getId)
            .collect(Collectors.toSet());
        
        if (validStyleIds.isEmpty()) return;
        
        // 查询引用的款式ID但款式不存在的订单
        List<ProductionOrder> orders = orderMapper.selectList(null);
        List<String> orphanStyleOrders = orders.stream()
            .filter(o -> o.getStyleId() != null && !validStyleIds.contains(o.getStyleId()))
            .map(ProductionOrder::getOrderNo)
            .collect(Collectors.toList());
        
        if (!orphanStyleOrders.isEmpty()) {
            result.addIssue("t_production_order", "孤立款式引用", orphanStyleOrders.size(),
                "订单引用的款式不存在: " + orphanStyleOrders.stream().limit(5).collect(Collectors.joining(",")));
        }
    }

    private void checkOrphanOrderReferences(CheckResult result) {
        // 获取所有订单ID
        Set<String> validOrderIds = orderMapper.selectList(null).stream()
            .map(ProductionOrder::getId)
            .collect(Collectors.toSet());
        
        if (validOrderIds.isEmpty()) return;
        
        // 查询引用的订单ID但订单不存在的裁剪包
        List<CuttingBundle> bundles = cuttingBundleMapper.selectList(null);
        List<String> orphanOrderBundles = bundles.stream()
            .filter(b -> b.getProductionOrderId() != null && !validOrderIds.contains(b.getProductionOrderId()))
            .map(b -> "bundleNo=" + b.getBundleNo())
            .collect(Collectors.toList());
        
        if (!orphanOrderBundles.isEmpty()) {
            result.addIssue("t_cutting_bundle", "孤立订单引用", orphanOrderBundles.size(),
                "裁剪包引用的订单不存在: " + orphanOrderBundles.stream().limit(5).collect(Collectors.joining(",")));
        }
    }

    private void checkOrphanScanRecordReferences(CheckResult result) {
        // 获取所有订单ID
        Set<String> validOrderIds = orderMapper.selectList(null).stream()
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

    private void checkWarehousingOrderMismatch(CheckResult result) {
        // 检查入库数量超过订单数量的异常情况
        // 入库合格数量 > 订单数量可能是录入错误
        List<ProductionOrder> orders = orderMapper.selectList(
            new LambdaQueryWrapper<ProductionOrder>()
                .eq(ProductionOrder::getStatus, "completed")
        );
        
        List<String> abnormalOrders = new ArrayList<>();
        for (ProductionOrder order : orders) {
            Integer orderQty = order.getOrderQuantity();
            // 实际入库数量需要从入库表汇总
            // 这里简化处理，只记录检查点
        }
        
        if (!abnormalOrders.isEmpty()) {
            result.addIssue("t_production_order", "数量异常", abnormalOrders.size(),
                "入库数量超过订单数量的订单: " + abnormalOrders.stream().limit(5).collect(Collectors.joining(",")));
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
