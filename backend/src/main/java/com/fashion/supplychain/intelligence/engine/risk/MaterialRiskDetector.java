package com.fashion.supplychain.intelligence.engine.risk;

import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.mapper.MaterialPurchaseMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.ArrayList;
import java.util.List;

@Component
@Lazy
@RequiredArgsConstructor
public class MaterialRiskDetector implements RiskDetector {

    private final MaterialPurchaseMapper purchaseMapper;

    @Override
    public RiskType getType() { return RiskType.MATERIAL; }

    @Override
    public List<RiskItem> detect(Long tenantId) {
        if (tenantId == null) return List.of();
        List<MaterialPurchase> purchases = purchaseMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<MaterialPurchase>()
                        .eq(MaterialPurchase::getTenantId, tenantId)
                        .eq(MaterialPurchase::getDeleteFlag, 0)
                        .last("LIMIT 2000"));
        if (purchases.isEmpty()) return List.of();

        List<RiskItem> items = new ArrayList<>();
        for (MaterialPurchase mp : purchases) {
            java.math.BigDecimal required = mp.getPurchaseQuantity();
            Integer arrived = mp.getArrivedQuantity();
            if (required == null || arrived == null) continue;
            if (required.signum() <= 0) continue;
            double ratio = arrived.doubleValue() / required.doubleValue();
            String status = mp.getStatus() != null ? mp.getStatus() : "";
            if (ratio < 0.5 && (status.contains("采购中") || status.contains("PURCHASING")
                    || status.contains("PENDING") || status.isEmpty())) {
                String severity = ratio < 0.2 ? "CRITICAL" : ratio < 0.35 ? "HIGH" : "MEDIUM";
                RiskItem item = RiskItem.create(RiskType.MATERIAL, severity, Math.min(100, 60 + (0.5 - ratio) * 100));
                item.setOrderId(mp.getOrderId());
                item.setDescription("物料 " + mp.getMaterialName() + " 到货率仅 "
                        + String.format("%.0f", ratio * 100) + "%");
                item.setSuggestedAction("紧急催料，考虑替代供应商");
                item.getMetadata().put("materialId", mp.getMaterialId());
                item.getMetadata().put("required", required);
                item.getMetadata().put("arrived", arrived);
                item.getMetadata().put("status", status);
                items.add(item);
            }
        }
        return items;
    }
}
