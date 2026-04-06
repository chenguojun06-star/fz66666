package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.production.entity.FactoryShipment;
import java.util.Map;

public interface FactoryShipmentService extends IService<FactoryShipment> {

    IPage<FactoryShipment> queryPage(Map<String, Object> params);

    int sumShippedByOrderId(String orderId);

    String buildShipmentNo();
}
