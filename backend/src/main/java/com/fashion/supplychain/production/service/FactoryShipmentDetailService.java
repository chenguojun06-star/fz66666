package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.production.entity.FactoryShipmentDetail;
import java.util.List;

public interface FactoryShipmentDetailService extends IService<FactoryShipmentDetail> {

    List<FactoryShipmentDetail> listByShipmentId(String shipmentId);

    void saveDetails(String shipmentId, List<java.util.Map<String, Object>> detailParams, Long tenantId);
}
