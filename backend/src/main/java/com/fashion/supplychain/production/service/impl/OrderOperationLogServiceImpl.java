package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.OrderOperationLog;
import com.fashion.supplychain.production.mapper.OrderOperationLogMapper;
import com.fashion.supplychain.production.service.OrderOperationLogService;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.List;

@Service
public class OrderOperationLogServiceImpl extends ServiceImpl<OrderOperationLogMapper, OrderOperationLog>
        implements OrderOperationLogService {

    @Override
    public List<OrderOperationLog> listByOrder(String orderNo, Long orderId, String action) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        LambdaQueryWrapper<OrderOperationLog> wrapper = new LambdaQueryWrapper<OrderOperationLog>()
                .eq(OrderOperationLog::getTenantId, tenantId)
                .orderByDesc(OrderOperationLog::getCreateTime);
        if (StringUtils.hasText(orderNo)) {
            wrapper.eq(OrderOperationLog::getOrderNo, orderNo.trim());
        } else if (orderId != null) {
            wrapper.eq(OrderOperationLog::getOrderId, orderId);
        } else {
            return List.of();
        }
        if (StringUtils.hasText(action)) {
            wrapper.eq(OrderOperationLog::getAction, action.trim());
        }
        return list(wrapper);
    }
}