package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
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
 * 订单质量填充服务
 * 处理次品数量、返修数量等质量统计字段的填充
 */
@Service
@Slf4j
public class OrderQualityFillService {

    private final ProductWarehousingMapper productWarehousingMapper;

    @Autowired
    public OrderQualityFillService(ProductWarehousingMapper productWarehousingMapper) {
        this.productWarehousingMapper = productWarehousingMapper;
    }

    /**
     * 填充质量统计字段（次品数量、返修数量）
     * 从t_product_warehousing表聚合
     */
    public void fillQualityStats(List<ProductionOrder> records) {
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

        // 聚合次品数量
        Map<String, Integer> unqualifiedAgg = aggregateUnqualifiedQuantities(orderIds);

        // 填充到订单对象
        for (ProductionOrder o : records) {
            if (o == null || !StringUtils.hasText(o.getId())) {
                continue;
            }
            String oid = o.getId().trim();
            Integer unqualifiedQty = unqualifiedAgg.getOrDefault(oid, 0);
            o.setUnqualifiedQuantity(unqualifiedQty);
            // 返修数量暂时使用次品数量（实际业务可能需要调整）
            o.setRepairQuantity(unqualifiedQty);
        }
    }

    /**
     * 聚合次品数量
     */
    private Map<String, Integer> aggregateUnqualifiedQuantities(List<String> orderIds) {
        Map<String, Integer> unqualifiedAgg = new HashMap<>();

        try {
            List<ProductWarehousing> list = productWarehousingMapper
                    .selectList(new LambdaQueryWrapper<ProductWarehousing>()
                            .select(ProductWarehousing::getOrderId, ProductWarehousing::getUnqualifiedQuantity)
                            .in(ProductWarehousing::getOrderId, orderIds)
                            .eq(ProductWarehousing::getDeleteFlag, 0));
            if (list != null) {
                for (ProductWarehousing w : list) {
                    if (w == null || !StringUtils.hasText(w.getOrderId())) {
                        continue;
                    }
                    String oid = w.getOrderId().trim();
                    int q = w.getUnqualifiedQuantity() == null ? 0 : w.getUnqualifiedQuantity();
                    if (q > 0) {
                        unqualifiedAgg.put(oid, unqualifiedAgg.getOrDefault(oid, 0) + q);
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Failed to aggregate unqualified quantities for orders: orderIdsCount={}", orderIds.size(), e);
        }

        return unqualifiedAgg;
    }
}
