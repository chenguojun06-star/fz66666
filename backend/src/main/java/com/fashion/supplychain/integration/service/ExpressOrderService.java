package com.fashion.supplychain.integration.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.integration.entity.ExpressOrder;

import java.util.List;
import java.util.Map;

public interface ExpressOrderService extends IService<ExpressOrder> {

    IPage<ExpressOrder> pageByTenant(Long tenantId, int page, int pageSize, String platformCode, String keyword);

    List<ExpressOrder> listByOrderId(String orderId);

    ExpressOrder getByTrackingNo(String trackingNo);

    ExpressOrder createExpressOrder(ExpressOrder order);

    ExpressOrder updateTracking(String id, String trackingNo, String trackingNoSub);

    ExpressOrder updateStatus(String id, Integer status, String trackData);
}