package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.production.entity.FactoryShipmentDetail;
import java.util.List;
import java.util.Map;

public interface FactoryShipmentDetailService extends IService<FactoryShipmentDetail> {

    List<FactoryShipmentDetail> listByShipmentId(String shipmentId);

    void saveDetails(String shipmentId, List<Map<String, Object>> detailParams, Long tenantId);

    /** 更新实际收货数量（颜色×尺码级别） */
    void updateReceivedDetails(String shipmentId, List<Map<String, Object>> receivedDetails);

    /** 更新质检结果（合格/次品数量） */
    void updateQualityDetails(String shipmentId, List<Map<String, Object>> qualityDetails);

    /** 标记退回返修数量 */
    void markReturned(String shipmentId, List<Map<String, Object>> returnDetails);
}
