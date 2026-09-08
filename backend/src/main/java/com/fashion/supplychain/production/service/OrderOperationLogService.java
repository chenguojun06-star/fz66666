package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.production.entity.OrderOperationLog;

import java.util.List;

public interface OrderOperationLogService extends IService<OrderOperationLog> {
    List<OrderOperationLog> listByOrder(String orderNo, Long orderId, String action);
}