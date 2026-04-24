package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.MaterialShortageResponse;
import com.fashion.supplychain.intelligence.dto.MaterialShortageResponse.ShortageItem;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.MaterialStockMapper;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.mapper.StyleBomMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

/**
 * 面料缺口预测编排器
 *
 * <p>算法：
 * <pre>
 *   1. 查询租户内所有「进行中」订单（status IN_PROGRESS / PENDING）
 *   2. 按 styleNo 关联 t_style_bom，计算每种物料需求量：
 *      需求量 = Σ(BOM.usageAmount × (1 + lossRate) × order.orderQuantity)
 *   3. 与 t_material_stock 当前库存对比，计算缺口：
 *      缺口 = 需求量 - 库存量
 *   4. 缺口 > 0 → 加入预警列表，按风险等级（HIGH/MEDIUM/LOW）分级
 * </pre>
 */
@Service
@Slf4j
public class MaterialShortageOrchestrator {

    @Autowired
    private ProductionOrderMapper productionOrderMapper;

    @Autowired
    private StyleBomMapper styleBomMapper;

    @Autowired
    private MaterialStockMapper materialStockMapper;

    public MaterialShortageResponse predict() {
        Long tenantId = UserContext.tenantId();
        MaterialShortageResponse resp = new MaterialShortageResponse();

        // 1. 查询所有在产订单
        QueryWrapper<ProductionOrder> orderQw = new QueryWrapper<>();
        orderQw.eq(tenantId != null, "tenant_id", tenantId)
               .eq("delete_flag", 0)
               .in("status", "production", "cutting", "draft");
        List<ProductionOrder> activeOrders = productionOrderMapper.selectList(orderQw);

        if (activeOrders.isEmpty()) {
            resp.setShortageItems(Collections.emptyList());
            resp.setSufficientCount(0);
            resp.setCoveredOrderCount(0);
            resp.setSummary("当前无在产订单，无需预测");
            return resp;
        }

        resp.setCoveredOrderCount(activeOrders.size());

        // 2. 收集所有 styleId，批量查 BOM
        Set<Long> styleIds = activeOrders.stream()
                .map(ProductionOrder::getStyleId)
                .filter(Objects::nonNull)
                .map(s -> { try { return Long.parseLong(s); } catch (Exception e) { return null; } })
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        if (styleIds.isEmpty()) {
            resp.setShortageItems(Collections.emptyList());
            resp.setSummary("订单未绑定款式，无法计算面料需求");
            return resp;
        }

        QueryWrapper<StyleBom> bomQw = new QueryWrapper<>();
        bomQw.select(
            "id",
            "style_id",
            "material_code",
            "material_name",
            "material_type",
            "color",
            "specification",
            "size",
            "unit",
            "usage_amount",
            "loss_rate",
            "unit_price",
            "total_price",
            "supplier",
            "supplier_contact_person",
            "supplier_contact_phone",
            "remark",
            "tenant_id",
            "create_time",
            "update_time"
        );
        bomQw.eq(tenantId != null, "tenant_id", tenantId)
             .in("style_id", styleIds);
        // 注意：t_style_bom 表无 delete_flag 列，不可加此条件
        List<StyleBom> bomList = styleBomMapper.selectList(bomQw);

        // styleId → BOM列表
        Map<Long, List<StyleBom>> bomByStyle = bomList.stream()
                .collect(Collectors.groupingBy(StyleBom::getStyleId));

        // styleId(String) → orderQuantity 累加
        Map<Long, Integer> qtyByStyle = new HashMap<>();
        for (ProductionOrder order : activeOrders) {
            if (order.getStyleId() == null) continue;
            try {
                Long sid = Long.parseLong(order.getStyleId());
                int qty = order.getOrderQuantity() != null ? order.getOrderQuantity() : 0;
                qtyByStyle.merge(sid, qty, Integer::sum);
            } catch (NumberFormatException e) { log.debug("数字解析失败: {}", e.getMessage()); }
        }

        // 3. 计算各物料总需求量 key = materialCode + "|" + color
        Map<String, Double> demandMap = new LinkedHashMap<>();
        Map<String, StyleBom> bomMetaMap = new LinkedHashMap<>();

        for (Map.Entry<Long, Integer> entry : qtyByStyle.entrySet()) {
            Long sid = entry.getKey();
            int qty = entry.getValue();
            if (qty == 0) continue;
            List<StyleBom> boms = bomByStyle.getOrDefault(sid, Collections.emptyList());

            for (StyleBom bom : boms) {
                if (bom.getMaterialCode() == null) continue;
                double usageAmt = bom.getUsageAmount() != null ? bom.getUsageAmount().doubleValue() : 0;
                double lossRate = bom.getLossRate() != null ? bom.getLossRate().doubleValue() : 0;
                double totalUsage = usageAmt * (1 + lossRate / 100.0) * qty;

                String key = bom.getMaterialCode() + "|" + (bom.getColor() != null ? bom.getColor() : "");
                demandMap.merge(key, totalUsage, Double::sum);
                bomMetaMap.putIfAbsent(key, bom);
            }
        }

        if (demandMap.isEmpty()) {
            resp.setShortageItems(Collections.emptyList());
            resp.setSummary("BOM 中无物料数据");
            return resp;
        }

        // 4. 批量查库存
        Set<String> materialCodes = demandMap.keySet().stream()
                .map(k -> k.split("\\|")[0])
                .collect(Collectors.toSet());

        QueryWrapper<MaterialStock> stockQw = new QueryWrapper<>();
        stockQw.eq(tenantId != null, "tenant_id", tenantId)
               .in("material_code", materialCodes)
               .eq("delete_flag", 0);
        List<MaterialStock> stocks = materialStockMapper.selectList(stockQw);

        // key = materialCode + "|" + color → 库存量
        Map<String, Integer> stockMap = new HashMap<>();
        for (MaterialStock s : stocks) {
            String k = s.getMaterialCode() + "|" + (s.getColor() != null ? s.getColor() : "");
            stockMap.merge(k, s.getQuantity() != null ? s.getQuantity() : 0, Integer::sum);
        }

        // 5. 计算缺口
        List<ShortageItem> shortageItems = new ArrayList<>();
        int sufficientCount = 0;

        for (Map.Entry<String, Double> entry : demandMap.entrySet()) {
            String key = entry.getKey();
            int demand = (int) Math.ceil(entry.getValue());
            int stock = stockMap.getOrDefault(key, 0);
            int shortage = demand - stock;

            StyleBom meta = bomMetaMap.get(key);

            if (shortage <= 0) {
                sufficientCount++;
                continue;
            }

            ShortageItem item = new ShortageItem();
            item.setMaterialCode(meta.getMaterialCode());
            item.setMaterialName(meta.getMaterialName());
            item.setUnit(meta.getUnit());
            item.setSpec(meta.getColor() != null ? meta.getColor() : meta.getSpecification());
            item.setCurrentStock(stock);
            item.setDemandQuantity(demand);
            item.setShortageQuantity(shortage);
            item.setSupplierName(meta.getSupplier());
            item.setSupplierContact(meta.getSupplierContactPerson());
            item.setSupplierPhone(meta.getSupplierContactPhone());

            // 风险分级：缺口 > 需求50% HIGH，> 20% MEDIUM，其余 LOW
            double shortageRatio = (double) shortage / demand;
            if (shortageRatio > 0.5) {
                item.setRiskLevel("HIGH");
            } else if (shortageRatio > 0.2) {
                item.setRiskLevel("MEDIUM");
            } else {
                item.setRiskLevel("LOW");
            }
            shortageItems.add(item);
        }

        // 按缺口量降序
        shortageItems.sort(Comparator.comparingInt(ShortageItem::getShortageQuantity).reversed());

        resp.setShortageItems(shortageItems);
        resp.setSufficientCount(sufficientCount);

        long highCount = shortageItems.stream().filter(i -> "HIGH".equals(i.getRiskLevel())).count();
        resp.setSummary(String.format("共 %d 种物料面临缺货（其中 %d 种高风险），建议立即采购",
                shortageItems.size(), highCount));

        log.info("[MaterialShortage] tenantId={} 订单数={} 缺口物料数={} 高风险={}",
                tenantId, activeOrders.size(), shortageItems.size(), highCount);
        return resp;
    }
}
