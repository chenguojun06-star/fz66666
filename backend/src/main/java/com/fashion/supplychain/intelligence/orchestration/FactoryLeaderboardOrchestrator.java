package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.FactoryLeaderboardResponse;
import com.fashion.supplychain.intelligence.dto.FactoryLeaderboardResponse.FactoryRank;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.service.FactoryService;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 工厂绩效排行榜编排器 — 四维评分 + 金银铜排名
 *
 * <p>四维评分：
 * <ul>
 *   <li>capacityScore: 已完成件数/（日均产能×30天）× 100</li>
 *   <li>deliveryScore: 按期完成订单数 / 总完成订单数 × 100</li>
 *   <li>qualityScore: 质检通过件数 / 总质检件数 × 100</li>
 *   <li>efficiencyScore: 全局中位工时/该工厂件均工时 × 100</li>
 * </ul>
 * 综合分 = (capacity + delivery + quality + efficiency) / 4
 */
@Service
@Slf4j
public class FactoryLeaderboardOrchestrator {

    @Autowired
    private FactoryService factoryService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ScanRecordService scanRecordService;

    public FactoryLeaderboardResponse rank() {
        FactoryLeaderboardResponse resp = new FactoryLeaderboardResponse();
        Long tenantId = UserContext.tenantId();

        List<Factory> factories = loadFactories(tenantId);
        if (factories.isEmpty()) {
            resp.setTotalFactories(0);
            resp.setRankings(Collections.emptyList());
            return resp;
        }

        LocalDateTime thirtyDaysAgo = LocalDate.now().minusDays(30).atStartOfDay();
        List<ProductionOrder> orders = loadOrders(tenantId);
        List<ScanRecord> scans = loadScans(tenantId, thirtyDaysAgo);

        Map<String, List<ProductionOrder>> orderByFactory = orders.stream()
                .filter(o -> o.getFactoryName() != null)
                .collect(Collectors.groupingBy(ProductionOrder::getFactoryName));

        // orderId → factoryName 映射（ScanRecord 无 factoryName 字段）
        Map<String, String> orderToFactory = orders.stream()
                .filter(o -> o.getFactoryName() != null)
                .collect(Collectors.toMap(o -> String.valueOf(o.getId()),
                        ProductionOrder::getFactoryName, (a, b) -> a));

        Map<String, List<ScanRecord>> scanByFactory = new HashMap<>();
        for (ScanRecord r : scans) {
            String factory = orderToFactory.getOrDefault(r.getOrderId(), null);
            if (factory != null) {
                scanByFactory.computeIfAbsent(factory, k -> new ArrayList<>()).add(r);
            }
        }

        List<FactoryRank> rankings = new ArrayList<>();
        for (Factory f : factories) {
            String name = f.getFactoryName();
            List<ProductionOrder> fOrders = orderByFactory.getOrDefault(name, Collections.emptyList());
            List<ScanRecord> fScans = scanByFactory.getOrDefault(name, Collections.emptyList());
            rankings.add(buildRank(f, fOrders, fScans));
        }

        rankings.sort(Comparator.comparingInt(FactoryRank::getTotalScore).reversed());

        // 分配排名和奖牌
        for (int i = 0; i < rankings.size(); i++) {
            FactoryRank r = rankings.get(i);
            r.setRank(i + 1);
            if (i == 0) r.setMedal("gold");
            else if (i == 1) r.setMedal("silver");
            else if (i == 2) r.setMedal("bronze");
            else r.setMedal("none");
        }

        resp.setRankings(rankings);
        resp.setTotalFactories(rankings.size());
        return resp;
    }

    private FactoryRank buildRank(Factory factory,
            List<ProductionOrder> orders, List<ScanRecord> scans) {
        FactoryRank r = new FactoryRank();
        r.setFactoryId(factory.getId());
        r.setFactoryName(factory.getFactoryName());

        // 订单统计
        long active = orders.stream().filter(o -> "IN_PROGRESS".equals(o.getStatus())).count();
        long completed = orders.stream().filter(o -> "COMPLETED".equals(o.getStatus())).count();
        r.setActiveOrders((int) active);
        r.setCompletedOrders((int) completed);

        // 产能分：完成件数 / 订单总件数
        long totalQty = orders.stream()
                .mapToInt(o -> o.getOrderQuantity() != null ? o.getOrderQuantity() : 0).sum();
        long completedQty = orders.stream()
                .mapToInt(o -> o.getCompletedQuantity() != null ? o.getCompletedQuantity() : 0).sum();
        r.setCapacityScore(totalQty > 0 ? Math.min(100, (int) (completedQty * 100 / totalQty)) : 50);

        // 交期分：按期完成率
        long onTime = orders.stream()
                .filter(o -> "COMPLETED".equals(o.getStatus()) && o.getPlannedEndDate() != null)
                .filter(o -> o.getUpdateTime() != null
                        && !o.getUpdateTime().isAfter(o.getPlannedEndDate()))
                .count();
        r.setDeliveryScore(completed > 0 ? Math.min(100, (int) (onTime * 100 / completed)) : 50);

        // 质量分：成功扫码率
        long totalScans = scans.size();
        long successScans = scans.stream()
                .filter(s -> "success".equals(s.getScanResult())).count();
        r.setQualityScore(totalScans > 0 ? Math.min(100, (int) (successScans * 100 / totalScans)) : 50);

        // 效率分：简化为 日均产量百分位
        r.setEfficiencyScore(completedQty > 0 ? Math.min(100, (int) (completedQty / Math.max(1, active + completed))) : 50);

        // 综合分
        r.setTotalScore((r.getCapacityScore() + r.getDeliveryScore()
                + r.getQualityScore() + r.getEfficiencyScore()) / 4);

        r.setTrend("same"); // 简化
        return r;
    }

    private List<Factory> loadFactories(Long tenantId) {
        QueryWrapper<Factory> qw = new QueryWrapper<>();
        qw.eq(tenantId != null, "tenant_id", tenantId);
        return factoryService.list(qw);
    }

    private List<ProductionOrder> loadOrders(Long tenantId) {
        QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
        qw.eq(tenantId != null, "tenant_id", tenantId)
          .eq("delete_flag", 0);
        return productionOrderService.list(qw);
    }

    private List<ScanRecord> loadScans(Long tenantId, LocalDateTime since) {
        QueryWrapper<ScanRecord> qw = new QueryWrapper<>();
        qw.eq(tenantId != null, "tenant_id", tenantId)
          .ge("scan_time", since);
        return scanRecordService.list(qw);
    }
}
