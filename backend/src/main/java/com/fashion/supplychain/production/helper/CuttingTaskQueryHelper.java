package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.CuttingTask;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.CuttingBundleMapper;
import com.fashion.supplychain.production.service.ProductionOrderQueryService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Component
@Slf4j
public class CuttingTaskQueryHelper {

    private static final String FACTORY_TYPE_INTERNAL = "INTERNAL";
    private static final String FACTORY_TYPE_EXTERNAL = "EXTERNAL";

    @Autowired private CuttingBundleMapper cuttingBundleMapper;
    @Autowired private ProductionOrderService productionOrderService;
    @Autowired private ProductionOrderQueryService productionOrderQueryService;
    @Autowired private StyleInfoService styleInfoService;

    public IPage<CuttingTask> queryPage(Map<String, Object> params,
                                         com.fashion.supplychain.production.mapper.CuttingTaskMapper taskMapper) {
        Integer page = ParamUtils.getPage(params);
        Integer pageSize = ParamUtils.getPageSize(params);
        Page<CuttingTask> pageInfo = new Page<>(page, pageSize);

        String orderNo = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(params, "orderNo"));
        String styleNo = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(params, "styleNo"));
        String status = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(params, "status"));
        String factoryType = normalizeFactoryType(ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(params, "factoryType")));

        List<String> factoryMatchedOrderIds = resolveFactoryMatchedOrderIds(orderNo, factoryType);
        LambdaQueryWrapper<CuttingTask> queryWrapper = buildQueryWrapper(orderNo, styleNo, status, factoryType, factoryMatchedOrderIds, params, page, pageSize);
        if (queryWrapper == null) {
            return new Page<>(page, pageSize, 0);
        }

        IPage<CuttingTask> pageResult = taskMapper.selectPage(pageInfo, queryWrapper);
        List<CuttingTask> records = pageResult.getRecords();
        if (records == null || records.isEmpty()) {
            return pageResult;
        }

        List<String> orderIdsFiltered = collectDistinctFields(records, CuttingTask::getProductionOrderId);
        List<String> orderNos = collectDistinctFields(records, CuttingTask::getProductionOrderNo);
        if (orderIdsFiltered.isEmpty() && orderNos.isEmpty()) {
            return pageResult;
        }

        applyBundleStats(records, orderIdsFiltered, orderNos);
        enrichWithOrderInfo(records, orderIdsFiltered, orderNos);

        return pageResult;
    }

    private List<String> resolveFactoryMatchedOrderIds(String orderNo, String factoryType) {
        if (!StringUtils.hasText(orderNo)) {
            return java.util.Collections.emptyList();
        }
        return productionOrderService.list(
                new LambdaQueryWrapper<ProductionOrder>()
                    .select(ProductionOrder::getId)
                    .like(ProductionOrder::getFactoryName, orderNo)
                    .eq(StringUtils.hasText(factoryType), ProductionOrder::getFactoryType, factoryType)
                    .and(w -> w.isNull(ProductionOrder::getDeleteFlag).or().eq(ProductionOrder::getDeleteFlag, 0))
                    .ne(ProductionOrder::getStatus, "scrapped"))
            .stream()
            .map(ProductionOrder::getId)
            .filter(StringUtils::hasText)
            .collect(Collectors.toList());
    }

    private LambdaQueryWrapper<CuttingTask> buildQueryWrapper(String orderNo, String styleNo, String status,
                                                               String factoryType, List<String> factoryMatchedOrderIds,
                                                               Map<String, Object> params, int page, int pageSize) {
        LambdaQueryWrapper<CuttingTask> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.select(
            CuttingTask::getId, CuttingTask::getProductionOrderId, CuttingTask::getProductionOrderNo,
            CuttingTask::getOrderQrCode, CuttingTask::getStyleId, CuttingTask::getStyleNo, CuttingTask::getStyleName,
            CuttingTask::getColor, CuttingTask::getSize, CuttingTask::getOrderQuantity, CuttingTask::getStatus,
            CuttingTask::getReceiverId, CuttingTask::getReceiverName, CuttingTask::getReceivedTime,
            CuttingTask::getBundledTime, CuttingTask::getCreateTime, CuttingTask::getUpdateTime,
            CuttingTask::getRemarks, CuttingTask::getExpectedShipDate,
            CuttingTask::getCreatorId, CuttingTask::getCreatorName, CuttingTask::getUpdaterId, CuttingTask::getUpdaterName,
            CuttingTask::getTenantId);
        queryWrapper.apply("(production_order_id IS NULL OR production_order_id = '' OR production_order_id NOT IN (SELECT id FROM t_production_order WHERE delete_flag = 1 OR status = 'scrapped'))");

        if (StringUtils.hasText(orderNo)) {
            queryWrapper.and(w -> {
                w.like(CuttingTask::getProductionOrderNo, orderNo)
                        .or().like(CuttingTask::getStyleNo, orderNo);
                if (!factoryMatchedOrderIds.isEmpty()) {
                    w.or().in(CuttingTask::getProductionOrderId, factoryMatchedOrderIds);
                }
            });
        }
        queryWrapper
                .like(StringUtils.hasText(styleNo), CuttingTask::getStyleNo, styleNo)
                .eq(StringUtils.hasText(status), CuttingTask::getStatus, status)
                .orderByDesc(CuttingTask::getCreateTime);

        @SuppressWarnings("unchecked")
        List<String> factoryOrderIds = (List<String>) params.get("_factoryOrderIds");

        if (factoryOrderIds != null) {
            if (factoryOrderIds.isEmpty()) {
                return null;
            }
            queryWrapper.in(CuttingTask::getProductionOrderId, factoryOrderIds);
        } else if (StringUtils.hasText(factoryType)) {
            List<String> matchedOrderIds = productionOrderService.list(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .select(ProductionOrder::getId)
                            .eq(ProductionOrder::getFactoryType, factoryType)
                            .and(w -> w.isNull(ProductionOrder::getDeleteFlag).or().eq(ProductionOrder::getDeleteFlag, 0))
                            .ne(ProductionOrder::getStatus, "scrapped"))
                .stream()
                .map(ProductionOrder::getId)
                .filter(StringUtils::hasText)
                .map(String::trim)
                .distinct()
                .collect(Collectors.toList());
            if (matchedOrderIds.isEmpty()) {
                return null;
            }
            queryWrapper.in(CuttingTask::getProductionOrderId, matchedOrderIds);
        }

        return queryWrapper;
    }

    private void applyBundleStats(List<CuttingTask> records, List<String> orderIdsFiltered, List<String> orderNos) {
        Map<String, int[]> aggByOrderId = new HashMap<>();
        Map<String, int[]> aggByOrderNo = new HashMap<>();

        LambdaQueryWrapper<CuttingBundle> qw = new LambdaQueryWrapper<CuttingBundle>()
                .select(CuttingBundle::getProductionOrderId, CuttingBundle::getProductionOrderNo, CuttingBundle::getQuantity);
        if (!orderIdsFiltered.isEmpty() && !orderNos.isEmpty()) {
            qw.and(w -> w.in(CuttingBundle::getProductionOrderId, orderIdsFiltered)
                    .or().in(CuttingBundle::getProductionOrderNo, orderNos));
        } else if (!orderIdsFiltered.isEmpty()) {
            qw.in(CuttingBundle::getProductionOrderId, orderIdsFiltered);
        } else {
            qw.in(CuttingBundle::getProductionOrderNo, orderNos);
        }

        List<CuttingBundle> bundles = cuttingBundleMapper.selectList(qw);
        if (bundles != null) {
            for (CuttingBundle b : bundles) {
                if (b == null) continue;
                String oid = StringUtils.hasText(b.getProductionOrderId()) ? b.getProductionOrderId().trim() : null;
                String ono = StringUtils.hasText(b.getProductionOrderNo()) ? b.getProductionOrderNo().trim() : null;
                int q = b.getQuantity() == null ? 0 : b.getQuantity();
                if (StringUtils.hasText(oid)) {
                    int[] v = aggByOrderId.computeIfAbsent(oid, k -> new int[]{0, 0});
                    v[0] += Math.max(q, 0);
                    v[1] += 1;
                }
                if (StringUtils.hasText(ono)) {
                    int[] v = aggByOrderNo.computeIfAbsent(ono, k -> new int[]{0, 0});
                    v[0] += Math.max(q, 0);
                    v[1] += 1;
                }
            }
        }

        for (CuttingTask t : records) {
            String oid = StringUtils.hasText(t.getProductionOrderId()) ? t.getProductionOrderId().trim() : null;
            int[] a = StringUtils.hasText(oid) ? aggByOrderId.get(oid) : null;
            if (a == null) {
                String on = StringUtils.hasText(t.getProductionOrderNo()) ? t.getProductionOrderNo().trim() : null;
                a = StringUtils.hasText(on) ? aggByOrderNo.get(on) : null;
            }
            t.setCuttingQuantity(a != null ? a[0] : 0);
            t.setCuttingBundleCount(a != null ? a[1] : 0);
        }
    }

    private void enrichWithOrderInfo(List<CuttingTask> records, List<String> orderIdsFiltered, List<String> orderNos) {
        if (orderIdsFiltered.isEmpty() && orderNos.isEmpty()) return;

        List<ProductionOrder> orders = productionOrderService.list(
                new LambdaQueryWrapper<ProductionOrder>()
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .and(w -> {
                            if (!orderIdsFiltered.isEmpty()) w.in(ProductionOrder::getId, orderIdsFiltered);
                            if (!orderNos.isEmpty()) {
                                if (!orderIdsFiltered.isEmpty()) w.or();
                                w.in(ProductionOrder::getOrderNo, orderNos);
                            }
                        })
                        .select(ProductionOrder::getId, ProductionOrder::getOrderNo, ProductionOrder::getStyleNo,
                                ProductionOrder::getCreatedByName, ProductionOrder::getCreateTime,
                                ProductionOrder::getFactoryName, ProductionOrder::getFactoryType));
        productionOrderQueryService.fillStyleCover(orders);

        Map<String, ProductionOrder> orderMap = orders.stream()
                .filter(o -> o != null && StringUtils.hasText(o.getId()))
                .collect(Collectors.toMap(ProductionOrder::getId, o -> o, (a, b) -> a));
        Map<String, ProductionOrder> orderNoMap = orders.stream()
                .filter(o -> o != null && StringUtils.hasText(o.getOrderNo()))
                .collect(Collectors.toMap(o -> o.getOrderNo().trim(), o -> o, (a, b) -> a));

        for (CuttingTask t : records) {
            ProductionOrder order = null;
            String orderId = t.getProductionOrderId();
            if (StringUtils.hasText(orderId) && orderMap.containsKey(orderId.trim())) {
                order = orderMap.get(orderId.trim());
            } else {
                String orderNoKey = StringUtils.hasText(t.getProductionOrderNo()) ? t.getProductionOrderNo().trim() : null;
                if (StringUtils.hasText(orderNoKey)) order = orderNoMap.get(orderNoKey);
            }
            if (order != null) {
                t.setOrderCreatorName(order.getCreatedByName());
                t.setOrderTime(order.getCreateTime());
                t.setFactoryName(order.getFactoryName());
                t.setFactoryType(order.getFactoryType());
                t.setStyleCover(order.getStyleCover());
            }
        }

        fillStyleCoverFallback(records);
    }

    private void fillStyleCoverFallback(List<CuttingTask> records) {
        List<CuttingTask> missing = records.stream()
                .filter(t -> t != null && !StringUtils.hasText(t.getStyleCover()) && StringUtils.hasText(t.getStyleNo()))
                .collect(Collectors.toList());
        if (missing.isEmpty()) return;

        Set<String> styleNos = missing.stream()
                .map(CuttingTask::getStyleNo)
                .map(String::trim)
                .collect(Collectors.toSet());

        List<StyleInfo> styles = styleInfoService.list(new LambdaQueryWrapper<StyleInfo>()
                .in(StyleInfo::getStyleNo, styleNos));
        Map<String, String> coverByStyleNo = new HashMap<>();
        if (styles != null) {
            for (StyleInfo s : styles) {
                if (s == null || !StringUtils.hasText(s.getStyleNo()) || !StringUtils.hasText(s.getCover())) continue;
                coverByStyleNo.putIfAbsent(s.getStyleNo().trim(), s.getCover());
            }
        }

        for (CuttingTask t : missing) {
            String cover = coverByStyleNo.get(t.getStyleNo().trim());
            if (StringUtils.hasText(cover)) {
                t.setStyleCover(cover);
            }
        }
    }

    private List<String> collectDistinctFields(List<CuttingTask> records, java.util.function.Function<CuttingTask, String> getter) {
        return records.stream()
                .map(getter)
                .filter(StringUtils::hasText)
                .map(String::trim)
                .distinct()
                .collect(Collectors.toList());
    }

    private String normalizeFactoryType(String raw) {
        if (!StringUtils.hasText(raw)) return null;
        String normalized = raw.trim().toUpperCase();
        if (FACTORY_TYPE_INTERNAL.equals(normalized) || FACTORY_TYPE_EXTERNAL.equals(normalized)) return normalized;
        return null;
    }
}
