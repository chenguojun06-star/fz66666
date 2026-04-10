package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.production.entity.FactoryShipmentDetail;
import com.fashion.supplychain.production.mapper.FactoryShipmentDetailMapper;
import com.fashion.supplychain.production.service.FactoryShipmentDetailService;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
public class FactoryShipmentDetailServiceImpl
        extends ServiceImpl<FactoryShipmentDetailMapper, FactoryShipmentDetail>
        implements FactoryShipmentDetailService {

    @Override
    public List<FactoryShipmentDetail> listByShipmentId(String shipmentId) {
        return this.lambdaQuery()
                .eq(FactoryShipmentDetail::getShipmentId, shipmentId)
                .orderByAsc(FactoryShipmentDetail::getColor, FactoryShipmentDetail::getSizeName)
                .list();
    }

    @Override
    public void saveDetails(String shipmentId, List<Map<String, Object>> detailParams, Long tenantId) {
        List<FactoryShipmentDetail> details = new ArrayList<>();
        for (Map<String, Object> d : detailParams) {
            String color = (String) d.getOrDefault("color", "");
            String sizeName = (String) d.getOrDefault("sizeName", "");
            Object qtyObj = d.get("quantity");
            int qty = qtyObj instanceof Number ? ((Number) qtyObj).intValue() : 0;
            if (qty <= 0) continue;
            FactoryShipmentDetail detail = new FactoryShipmentDetail();
            detail.setShipmentId(shipmentId);
            detail.setColor(color);
            detail.setSizeName(sizeName);
            detail.setQuantity(qty);
            detail.setTenantId(tenantId);
            details.add(detail);
        }
        if (!details.isEmpty()) {
            this.saveBatch(details);
        }
    }
}
