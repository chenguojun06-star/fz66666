package com.fashion.supplychain.intelligence.engine.risk;

import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.mapper.MaterialPurchaseMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.ArrayList;
import java.util.List;

/**
 * 入库差异风险检测器（SUGGESTION模式）
 *
 * 检测逻辑：查询 MaterialPurchase 采购记录，
 * 采购数量(purchaseQuantity)与到货数量(arrivedQuantity)差异率>10%即触发。
 */
@Component
@Lazy
@RequiredArgsConstructor
public class WarehouseDiffRiskDetector implements RiskDetector {

    private final MaterialPurchaseMapper purchaseMapper;

    @Override
    public RiskType getType() { return RiskType.WAREHOUSE_DIFF; }

    @Override
    public List<RiskItem> detect(Long tenantId) {
        if (tenantId == null) return List.of();
        java.time.LocalDateTime threeMonthsAgo = java.time.LocalDateTime.now().minusMonths(3);
        List<MaterialPurchase> purchases = purchaseMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<MaterialPurchase>()
                        .select(MaterialPurchase::getId, MaterialPurchase::getOrderId,
                                MaterialPurchase::getMaterialName, MaterialPurchase::getMaterialId,
                                MaterialPurchase::getPurchaseQuantity, MaterialPurchase::getArrivedQuantity,
                                MaterialPurchase::getStatus)
                        .eq(MaterialPurchase::getTenantId, tenantId)
                        .eq(MaterialPurchase::getDeleteFlag, 0)
                        .ge(MaterialPurchase::getUpdateTime, threeMonthsAgo)
                        .last("LIMIT 500"));
        if (purchases.isEmpty()) return List.of();

        List<RiskItem> items = new ArrayList<>();
        for (MaterialPurchase mp : purchases) {
            java.math.BigDecimal purchaseQty = mp.getPurchaseQuantity();
            Integer arrived = mp.getArrivedQuantity();
            if (purchaseQty == null || arrived == null) continue;
            double purchased = purchaseQty.doubleValue();
            if (purchased <= 0) continue;

            // 差异率 = |采购数 - 到货数| / 采购数
            double diff = Math.abs(purchased - arrived);
            double diffRate = diff / purchased;
            if (diffRate > 0.10) {
                String direction = arrived < purchased ? "少到货" : "多到货";
                double shortagePct = diffRate * 100;
                String severity = diffRate >= 0.5 ? "CRITICAL"
                        : diffRate >= 0.3 ? "HIGH" : "MEDIUM";
                double score = Math.min(100, 50 + diffRate * 100);
                RiskItem item = RiskItem.create(RiskType.WAREHOUSE_DIFF, severity, score);
                item.setOrderId(mp.getOrderId());
                item.setDescription("物料 " + mp.getMaterialName() + direction
                        + String.format("%.1f", shortagePct) + "%（采购 "
                        + String.format("%.0f", purchased) + "，到货 " + arrived + "）");
                item.setSuggestedAction("锁定该批次并通知采购与仓库对账，核实入库差异原因");
                item.getMetadata().put("materialId", mp.getMaterialId());
                item.getMetadata().put("materialName", mp.getMaterialName());
                item.getMetadata().put("purchaseQuantity", purchased);
                item.getMetadata().put("arrivedQuantity", arrived);
                item.getMetadata().put("diffRate", diffRate);
                item.getMetadata().put("direction", direction);
                item.getMetadata().put("status", mp.getStatus() != null ? mp.getStatus() : "");
                items.add(item);
            }
        }
        return items;
    }
}
