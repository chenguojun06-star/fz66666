package com.fashion.supplychain.intelligence.engine.risk;

import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.ArrayList;
import java.util.List;

@Component
@Lazy
@RequiredArgsConstructor
public class QualityRiskDetector implements RiskDetector {

    private final ProductionOrderMapper orderMapper;

    @Override
    public RiskType getType() { return RiskType.QUALITY; }

    @Override
    public List<RiskItem> detect(Long tenantId) {
        if (tenantId == null) return List.of();
        List<ProductionOrder> orders = orderMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<ProductionOrder>()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .last("LIMIT 2000"));
        if (orders.isEmpty()) return List.of();

        List<RiskItem> items = new ArrayList<>();
        for (ProductionOrder o : orders) {
            String status = o.getStatus() != null ? o.getStatus() : "";
            String remarks = o.getRemarks() != null ? o.getRemarks() : "";
            boolean qualityIssue = status.contains("返工") || status.contains("REWORK")
                    || status.contains("不合格") || status.contains("UNQUALIFIED")
                    || remarks.contains("次品") || remarks.contains("返修") || remarks.contains("质量问题");
            if (qualityIssue) {
                RiskItem item = RiskItem.create(RiskType.QUALITY, "HIGH", 80.0);
                item.setOrderId(o.getId());
                item.setDescription("订单 " + o.getOrderNo() + " 存在质量问题：需要返工/次品/返修");
                item.setSuggestedAction("联系工厂质控部门，要求返工或重新生产");
                item.getMetadata().put("status", status);
                items.add(item);
            }
        }
        return items;
    }
}
