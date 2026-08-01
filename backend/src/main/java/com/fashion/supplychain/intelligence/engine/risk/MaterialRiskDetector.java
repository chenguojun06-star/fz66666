package com.fashion.supplychain.intelligence.engine.risk;

import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.mapper.MaterialStockMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.ArrayList;
import java.util.List;

/**
 * 物料安全库存风险检测器
 * P1修复：从到货率检测改为安全库存检测
 * 查询 t_material_stock 表，当前库存 < 安全库存的物料触发风险
 */
@Component
@Lazy
@RequiredArgsConstructor
public class MaterialRiskDetector implements RiskDetector {

    private final MaterialStockMapper materialStockMapper;

    @Override
    public RiskType getType() { return RiskType.MATERIAL; }

    @Override
    public List<RiskItem> detect(Long tenantId) {
        if (tenantId == null) return List.of();

        // 查询当前库存低于安全库存的物料
        List<MaterialStock> lowStockMaterials = materialStockMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<MaterialStock>()
                        .select(MaterialStock::getId, MaterialStock::getMaterialId,
                                MaterialStock::getMaterialName, MaterialStock::getMaterialCode,
                                MaterialStock::getQuantity, MaterialStock::getSafetyStock,
                                MaterialStock::getUnit, MaterialStock::getMaterialType)
                        .eq(MaterialStock::getTenantId, tenantId)
                        .eq(MaterialStock::getDeleteFlag, 0)
                        .isNotNull(MaterialStock::getSafetyStock)
                        .last("LIMIT 500"));
        if (lowStockMaterials.isEmpty()) return List.of();

        List<RiskItem> items = new ArrayList<>();
        for (MaterialStock ms : lowStockMaterials) {
            Integer quantity = ms.getQuantity();
            Integer safetyStock = ms.getSafetyStock();
            if (quantity == null || safetyStock == null || safetyStock <= 0) continue;

            // P1修复：当前库存 < 安全库存即触发
            if (quantity < safetyStock) {
                double shortageRatio = 1.0 - (double) quantity / safetyStock;
                String severity = quantity == 0 ? "CRITICAL"
                        : shortageRatio >= 0.5 ? "HIGH" : "MEDIUM";
                double score = Math.min(100, 50 + shortageRatio * 100);
                RiskItem item = RiskItem.create(RiskType.MATERIAL, severity, score);
                item.setDescription("物料 " + ms.getMaterialName() + "（"
                        + ms.getMaterialCode() + "）库存 " + quantity
                        + " 低于安全库存 " + safetyStock + (ms.getUnit() != null ? ms.getUnit() : ""));
                item.setSuggestedAction("紧急采购补料，联系供应商加急发货");
                item.getMetadata().put("materialId", ms.getMaterialId());
                item.getMetadata().put("materialCode", ms.getMaterialCode());
                item.getMetadata().put("materialName", ms.getMaterialName());
                item.getMetadata().put("currentQuantity", quantity);
                item.getMetadata().put("safetyStock", safetyStock);
                item.getMetadata().put("shortageRatio", shortageRatio);
                items.add(item);
            }
        }
        return items;
    }
}
