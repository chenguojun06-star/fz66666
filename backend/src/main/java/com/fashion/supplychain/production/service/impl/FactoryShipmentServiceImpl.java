package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.production.entity.FactoryShipment;
import com.fashion.supplychain.production.mapper.FactoryShipmentMapper;
import com.fashion.supplychain.production.service.FactoryShipmentService;
import lombok.extern.slf4j.Slf4j;
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

    private static final DateTimeFormatter NO_FMT = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");

    @Override
    public IPage<FactoryShipment> queryPage(Map<String, Object> params) {
        int page = ParamUtils.getPage(params);
        int pageSize = ParamUtils.getPageSize(params);

        LambdaQueryWrapper<FactoryShipment> qw = new LambdaQueryWrapper<>();
        qw.eq(FactoryShipment::getDeleteFlag, 0);

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
        return this.page(new Page<>(page, pageSize), qw);
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
