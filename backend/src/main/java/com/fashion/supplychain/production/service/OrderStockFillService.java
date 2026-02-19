package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.ProductOutstockMapper;
import com.fashion.supplychain.production.mapper.ProductWarehousingMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 订单库存填充服务
 * 处理入库、出库、在库数量的统计和填充
 */
@Service
@Slf4j
public class OrderStockFillService {

    private final ProductWarehousingMapper productWarehousingMapper;
    private final ProductOutstockMapper productOutstockMapper;

    @Autowired
    public OrderStockFillService(
            ProductWarehousingMapper productWarehousingMapper,
            ProductOutstockMapper productOutstockMapper) {
        this.productWarehousingMapper = productWarehousingMapper;
        this.productOutstockMapper = productOutstockMapper;
    }

    /**
     * 填充库存汇总数据
     * 包括：入库数量、出库数量、在库数量
     */
    public void fillStockSummary(List<ProductionOrder> records) {
        if (records == null || records.isEmpty()) {
            return;
        }

        List<String> orderIds = records.stream()
                .map(r -> r == null ? null : r.getId())
                .filter(StringUtils::hasText)
                .map(String::trim)
                .distinct()
                .collect(Collectors.toList());

        if (orderIds.isEmpty()) {
            return;
        }

        // 聚合入库数量
        Map<String, Integer> inAgg = aggregateWarehousingQuantities(orderIds);

        // 聚合出库数量
        Map<String, Integer> outAgg = aggregateOutstockQuantities(orderIds);

        // 填充到订单对象
        for (ProductionOrder o : records) {
            if (o == null || !StringUtils.hasText(o.getId())) {
                continue;
            }
            String oid = o.getId().trim();
            int in = Math.max(0, inAgg.getOrDefault(oid, 0));
            int out = Math.max(0, outAgg.getOrDefault(oid, 0));
            o.setWarehousingQualifiedQuantity(in);
            o.setOutstockQuantity(out);
            o.setInStockQuantity(Math.max(0, in - out));
        }
    }

    /**
     * 聚合入库数量
     */
    private Map<String, Integer> aggregateWarehousingQuantities(List<String> orderIds) {
        Map<String, Integer> inAgg = new HashMap<>();
        try {
            List<ProductWarehousing> list = productWarehousingMapper
                    .selectList(new LambdaQueryWrapper<ProductWarehousing>()
                            .select(ProductWarehousing::getOrderId, ProductWarehousing::getQualifiedQuantity)
                            .in(ProductWarehousing::getOrderId, orderIds)
                            .eq(ProductWarehousing::getDeleteFlag, 0));
            if (list != null) {
                for (ProductWarehousing w : list) {
                    if (w == null || !StringUtils.hasText(w.getOrderId())) {
                        continue;
                    }
                    String oid = w.getOrderId().trim();
                    int q = w.getQualifiedQuantity() == null ? 0 : w.getQualifiedQuantity();
                    if (q <= 0) {
                        continue;
                    }
                    inAgg.put(oid, inAgg.getOrDefault(oid, 0) + q);
                }
            }
        } catch (Exception e) {
            log.warn("Failed to aggregate warehousing quantities for orders: orderIdsCount={}",
                    orderIds == null ? 0 : orderIds.size(),
                    e);
        }
        return inAgg;
    }

    /**
     * 聚合出库数量
     */
    private Map<String, Integer> aggregateOutstockQuantities(List<String> orderIds) {
        Map<String, Integer> outAgg = new HashMap<>();
        try {
            List<ProductOutstock> list = productOutstockMapper.selectList(new LambdaQueryWrapper<ProductOutstock>()
                    .select(ProductOutstock::getOrderId, ProductOutstock::getOutstockQuantity)
                    .in(ProductOutstock::getOrderId, orderIds)
                    .eq(ProductOutstock::getDeleteFlag, 0));
            if (list != null) {
                for (ProductOutstock o : list) {
                    if (o == null || !StringUtils.hasText(o.getOrderId())) {
                        continue;
                    }
                    String oid = o.getOrderId().trim();
                    int q = o.getOutstockQuantity() == null ? 0 : o.getOutstockQuantity();
                    if (q <= 0) {
                        continue;
                    }
                    outAgg.put(oid, outAgg.getOrDefault(oid, 0) + q);
                }
            }
        } catch (Exception e) {
            log.warn("Failed to aggregate outstock quantities for orders: orderIdsCount={}",
                    orderIds == null ? 0 : orderIds.size(),
                    e);
        }
        return outAgg;
    }
}
