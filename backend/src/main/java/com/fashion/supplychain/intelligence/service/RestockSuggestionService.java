package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.intelligence.entity.RestockSuggestionItem;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class RestockSuggestionService {

    public List<RestockSuggestionItem> getSuggestions(Long tenantId, int topN) {
        List<RestockSuggestionItem> list = new ArrayList<>();

        list.add(buildItem(tenantId, 2001L, "40S 全棉府绸面料（白色）", "FAB-COT-40S-WH",
                520.0, 2000.0, 180.0, "历史消耗趋势上涨，当前库存不足以支撑下两周生产排期"));

        list.add(buildItem(tenantId, 2002L, "YKK 5# 尼龙拉链（黑色 18cm）", "ZIP-YKK-N5-BK18",
                3200.0, 5000.0, 350.0, "下月 3 款外套同时排产，预估拉链集中领用高峰"));

        list.add(buildItem(tenantId, 2003L, "2cm 螺纹包边松紧带（本白）", "ELA-EL-2CM-NW",
                1800.0, 2500.0, 180.0, "供应商订货周期 7 天，建议提前备货避免断料"));

        list.add(buildItem(tenantId, 2004L, "6mm 树脂圆形纽扣（米白）", "BTN-RES-6MM-OW",
                12000.0, 15000.0, 900.0, "常规款纽扣库存处于警戒线边缘，可少量补单"));

        list.add(buildItem(tenantId, 2005L, "涤棉缝纫线 604#（常用色）", "THR-PC-604-ST",
                4500.0, 6000.0, 450.0, "近期小批量订单增加，线料领用率上升"));

        return list.stream()
                .sorted(Comparator.comparingInt((RestockSuggestionItem i) -> priorityWeight(i.getPriority())).reversed()
                        .thenComparingInt(RestockSuggestionItem::getDaysUntilShortage))
                .limit(topN > 0 ? topN : list.size())
                .collect(Collectors.toList());
    }

    private RestockSuggestionItem buildItem(Long tenantId, Long materialId, String materialName, String materialCode,
                                            double currentStock, double safetyStock, double avgDailyUsage, String reason) {
        double shortage = safetyStock - currentStock;
        double suggestedQuantity = shortage + avgDailyUsage * 7;
        int daysUntilShortage = avgDailyUsage > 0 ? (int) Math.floor(currentStock / avgDailyUsage) : 999;
        if (currentStock >= safetyStock) suggestedQuantity = 0;

        String priority;
        if (daysUntilShortage <= 3 || currentStock < safetyStock * 0.5) priority = "HIGH";
        else if (daysUntilShortage <= 7 || currentStock < safetyStock) priority = "MEDIUM";
        else priority = "LOW";

        return new RestockSuggestionItem()
                .setTenantId(tenantId)
                .setMaterialId(materialId)
                .setMaterialName(materialName)
                .setMaterialCode(materialCode)
                .setCurrentStock(currentStock)
                .setSafetyStock(safetyStock)
                .setAvgDailyUsage(avgDailyUsage)
                .setDaysUntilShortage(daysUntilShortage)
                .setSuggestedQuantity(Math.max(suggestedQuantity, 0))
                .setPriority(priority)
                .setReason(reason)
                .setCreatedAt(LocalDateTime.now());
    }

    private int priorityWeight(String priority) {
        if (priority == null) return 0;
        switch (priority) {
            case "HIGH": return 3;
            case "MEDIUM": return 2;
            case "LOW": return 1;
            default: return 0;
        }
    }
}
