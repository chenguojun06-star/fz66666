package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.FactoryShipment;
import com.fashion.supplychain.production.mapper.FactoryShipmentMapper;
import com.fashion.supplychain.production.service.FactoryShipmentService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.service.StyleInfoService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

@Service
@Slf4j
public class FactoryShipmentServiceImpl
        extends ServiceImpl<FactoryShipmentMapper, FactoryShipment>
        implements FactoryShipmentService {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private StyleInfoService styleInfoService;

    private static final DateTimeFormatter NO_FMT = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");

    @Override
    public IPage<FactoryShipment> queryPage(Map<String, Object> params) {
        int page = ParamUtils.getPage(params);
        int pageSize = ParamUtils.getPageSize(params);

        LambdaQueryWrapper<FactoryShipment> qw = new LambdaQueryWrapper<>();
        qw.eq(FactoryShipment::getDeleteFlag, 0);

        String ctxFactoryId = UserContext.factoryId();
        if (StringUtils.hasText(ctxFactoryId)) {
            qw.eq(FactoryShipment::getFactoryId, ctxFactoryId);
        }

        List<String> factoryOrderIds = (List<String>) params.get("_factoryOrderIds");
        if (factoryOrderIds != null && !factoryOrderIds.isEmpty()) {
            qw.in(FactoryShipment::getOrderId, factoryOrderIds);
        }

        String orderId = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(params, "orderId"));
        if (StringUtils.hasText(orderId)) {
            qw.eq(FactoryShipment::getOrderId, orderId);
        }

        String factoryId = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(params, "factoryId"));
        if (StringUtils.hasText(factoryId)) {
            qw.eq(FactoryShipment::getFactoryId, factoryId);
        }

        String receiveStatus = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(params, "receiveStatus"));
        if (StringUtils.hasText(receiveStatus)) {
            qw.eq(FactoryShipment::getReceiveStatus, receiveStatus);
        }

        String keyword = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(params, "keyword"));
        if (StringUtils.hasText(keyword)) {
            qw.and(w -> w.like(FactoryShipment::getShipmentNo, keyword)
                    .or().like(FactoryShipment::getOrderNo, keyword)
                    .or().like(FactoryShipment::getStyleNo, keyword));
        }

        qw.orderByDesc(FactoryShipment::getCreateTime);
        IPage<FactoryShipment> pageResult = this.page(new Page<>(page, pageSize), qw);
        enrichStyleImage(pageResult.getRecords());
        return pageResult;
    }

    /**
     * D-310：发货单列表回填款式图（shipment.orderId→order.styleId→StyleInfo.cover），PC/手机发货记录展示用
     */
    private void enrichStyleImage(List<FactoryShipment> records) {
        if (records == null || records.isEmpty()) return;
        try {
            java.util.Set<String> needOrderIds = new java.util.HashSet<>();
            for (FactoryShipment fs : records) {
                if (StringUtils.hasText(fs.getOrderId())) needOrderIds.add(fs.getOrderId());
            }
            if (needOrderIds.isEmpty()) return;
            com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<com.fashion.supplychain.production.entity.ProductionOrder> ow =
                    new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<>();
            ow.in(com.fashion.supplychain.production.entity.ProductionOrder::getId, needOrderIds)
              .select(com.fashion.supplychain.production.entity.ProductionOrder::getId,
                      com.fashion.supplychain.production.entity.ProductionOrder::getStyleId);
            java.util.Map<String, String> orderIdToStyleId = new java.util.HashMap<>();
            for (com.fashion.supplychain.production.entity.ProductionOrder o : productionOrderService.list(ow)) {
                if (o != null && StringUtils.hasText(o.getStyleId())) orderIdToStyleId.put(o.getId(), o.getStyleId());
            }
            java.util.Set<String> allStyleIds = new java.util.HashSet<>(orderIdToStyleId.values());
            java.util.Map<String, String> styleIdToCover = new java.util.HashMap<>();
            if (!allStyleIds.isEmpty()) {
                java.util.Set<Long> styleIdNums = new java.util.HashSet<>();
                for (String sid : allStyleIds) {
                    try { styleIdNums.add(Long.parseLong(sid)); } catch (NumberFormatException ignore) { }
                }
                if (!styleIdNums.isEmpty()) {
                    for (com.fashion.supplychain.style.entity.StyleInfo s : styleInfoService.listByIds(styleIdNums)) {
                        if (s != null && StringUtils.hasText(s.getCover())) styleIdToCover.put(String.valueOf(s.getId()), s.getCover());
                    }
                }
            }
            for (FactoryShipment fs : records) {
                String sid = orderIdToStyleId.get(fs.getOrderId());
                if (sid != null) fs.setStyleImage(styleIdToCover.get(sid));
            }
        } catch (Exception e) {
            // enrich 失败不影响主流程（列表无图仅展示降级）
        }
    }

    @Override
    public int sumShippedByOrderId(String orderId) {
        if (!StringUtils.hasText(orderId)) {
            return 0;
        }
        List<FactoryShipment> list = this.lambdaQuery()
                .eq(FactoryShipment::getOrderId, orderId.trim())
                .eq(FactoryShipment::getDeleteFlag, 0)
                .select(FactoryShipment::getShipQuantity)
                .list();
        return list.stream()
                .mapToInt(s -> s.getShipQuantity() != null ? s.getShipQuantity() : 0)
                .sum();
    }

    @Override
    public String buildShipmentNo() {
        LocalDateTime now = LocalDateTime.now();
        int rand = ThreadLocalRandom.current().nextInt(100, 999);
        return "FS" + now.format(NO_FMT) + rand;
    }
}
