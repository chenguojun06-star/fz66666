package com.fashion.supplychain.integration.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.integration.entity.ExpressOrder;
import com.fashion.supplychain.integration.mapper.ExpressOrderMapper;
import com.fashion.supplychain.integration.service.ExpressOrderService;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class ExpressOrderServiceImpl extends ServiceImpl<ExpressOrderMapper, ExpressOrder> implements ExpressOrderService {

    @Override
    public IPage<ExpressOrder> pageByTenant(Long tenantId, int page, int pageSize, String platformCode, String keyword) {
        LambdaQueryWrapper<ExpressOrder> qw = new LambdaQueryWrapper<>();
        qw.eq(ExpressOrder::getTenantId, tenantId);
        qw.eq(ExpressOrder::getDeleteFlag, 0);
        if (StringUtils.hasText(platformCode)) {
            qw.eq(ExpressOrder::getPlatformCode, platformCode);
        }
        if (StringUtils.hasText(keyword)) {
            qw.and(w -> w.like(ExpressOrder::getTrackingNo, keyword)
                    .or().like(ExpressOrder::getOrderNo, keyword)
                    .or().like(ExpressOrder::getReceiverName, keyword));
        }
        qw.orderByDesc(ExpressOrder::getCreateTime);
        return page(new Page<>(page, pageSize), qw);
    }

    @Override
    public List<ExpressOrder> listByOrderId(String orderId) {
        return list(new LambdaQueryWrapper<ExpressOrder>()
                .eq(ExpressOrder::getOrderId, orderId)
                .eq(ExpressOrder::getDeleteFlag, 0));
    }

    @Override
    public ExpressOrder getByTrackingNo(String trackingNo) {
        return getOne(new LambdaQueryWrapper<ExpressOrder>()
                .eq(ExpressOrder::getTrackingNo, trackingNo)
                .eq(ExpressOrder::getDeleteFlag, 0));
    }

    @Override
    public ExpressOrder createExpressOrder(ExpressOrder order) {
        order.setCreateTime(LocalDateTime.now());
        order.setUpdateTime(LocalDateTime.now());
        order.setDeleteFlag(0);
        save(order);
        return order;
    }

    @Override
    public ExpressOrder updateTracking(String id, String trackingNo, String trackingNoSub) {
        ExpressOrder order = getById(id);
        if (order != null) {
            order.setTrackingNo(trackingNo);
            if (trackingNoSub != null) order.setTrackingNoSub(trackingNoSub);
            order.setLogisticsStatus(0);
            order.setUpdateTime(LocalDateTime.now());
            updateById(order);
        }
        return order;
    }

    @Override
    public ExpressOrder updateStatus(String id, Integer status, String trackData) {
        ExpressOrder order = getById(id);
        if (order != null) {
            order.setLogisticsStatus(status);
            if (trackData != null) order.setTrackData(trackData);
            order.setTrackUpdateTime(LocalDateTime.now());
            order.setUpdateTime(LocalDateTime.now());
            updateById(order);
        }
        return order;
    }
}