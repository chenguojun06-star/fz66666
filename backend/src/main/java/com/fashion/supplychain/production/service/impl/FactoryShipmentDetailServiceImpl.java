package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.production.entity.FactoryShipmentDetail;
import com.fashion.supplychain.production.mapper.FactoryShipmentDetailMapper;
import com.fashion.supplychain.production.service.FactoryShipmentDetailService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Slf4j
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

    @Override
    public void updateReceivedDetails(String shipmentId, List<Map<String, Object>> receivedDetails) {
        List<FactoryShipmentDetail> existing = listByShipmentId(shipmentId);
        for (Map<String, Object> rd : receivedDetails) {
            String color = (String) rd.getOrDefault("color", "");
            String sizeName = (String) rd.getOrDefault("sizeName", "");
            int qty = rd.get("quantity") instanceof Number ? ((Number) rd.get("quantity")).intValue() : 0;
            if (qty <= 0) continue;
            // 匹配已有明细，更新收货数量
            for (FactoryShipmentDetail detail : existing) {
                if (color.equals(detail.getColor()) && sizeName.equals(detail.getSizeName())) {
                    detail.setReceivedQuantity(qty);
                    this.updateById(detail);
                    break;
                }
            }
        }
    }

    @Override
    public void updateQualityDetails(String shipmentId, List<Map<String, Object>> qualityDetails) {
        List<FactoryShipmentDetail> existing = listByShipmentId(shipmentId);
        for (Map<String, Object> qd : qualityDetails) {
            String color = (String) qd.getOrDefault("color", "");
            String sizeName = (String) qd.getOrDefault("sizeName", "");
            int qualified = qd.get("qualifiedQty") instanceof Number
                    ? ((Number) qd.get("qualifiedQty")).intValue() : 0;
            int defective = qd.get("defectiveQty") instanceof Number
                    ? ((Number) qd.get("defectiveQty")).intValue() : 0;
            if (qualified <= 0 && defective <= 0) continue;
            for (FactoryShipmentDetail detail : existing) {
                if (color.equals(detail.getColor()) && sizeName.equals(detail.getSizeName())) {
                    detail.setQualifiedQuantity(qualified);
                    detail.setDefectiveQuantity(defective);
                    this.updateById(detail);
                    break;
                }
            }
        }
    }

    @Override
    public void markReturned(String shipmentId, List<Map<String, Object>> returnDetails) {
        List<FactoryShipmentDetail> existing = listByShipmentId(shipmentId);
        for (Map<String, Object> rd : returnDetails) {
            String color = (String) rd.getOrDefault("color", "");
            String sizeName = (String) rd.getOrDefault("sizeName", "");
            int qty = rd.get("quantity") instanceof Number ? ((Number) rd.get("quantity")).intValue() : 0;
            if (qty <= 0) continue;
            for (FactoryShipmentDetail detail : existing) {
                if (color.equals(detail.getColor()) && sizeName.equals(detail.getSizeName())) {
                    int currentReturned = detail.getReturnedQuantity() != null ? detail.getReturnedQuantity() : 0;
                    detail.setReturnedQuantity(currentReturned + qty);
                    this.updateById(detail);
                    break;
                }
            }
        }
    }
}
