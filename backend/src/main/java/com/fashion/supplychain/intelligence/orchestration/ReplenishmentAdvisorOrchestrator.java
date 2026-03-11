package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.dto.MaterialShortageResponse;
import com.fashion.supplychain.intelligence.dto.MaterialShortageResponse.ShortageItem;
import com.fashion.supplychain.intelligence.dto.ReplenishmentAdvisorResponse;
import com.fashion.supplychain.intelligence.dto.ReplenishmentAdvisorResponse.ReplenishmentItem;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * B8 - 补料建议编排器
 * 复用 MaterialShortageOrchestrator.predict() 获取缺料预测，
 * 结合物料紧迫级别与供应商信息，生成补料采购优先级建议。
 */
@Service
@Slf4j
public class ReplenishmentAdvisorOrchestrator {

    @Autowired
    private MaterialShortageOrchestrator materialShortageOrchestrator;

    public ReplenishmentAdvisorResponse suggest() {
        MaterialShortageResponse shortage = materialShortageOrchestrator.predict();
        List<ShortageItem> shortageItems = shortage.getShortageItems();
        if (shortageItems == null || shortageItems.isEmpty()) {
            ReplenishmentAdvisorResponse empty = new ReplenishmentAdvisorResponse();
            empty.setShortageCount(0);
            empty.setUrgentCount(0);
            empty.setItems(List.of());
            return empty;
        }

        List<ReplenishmentItem> items = new ArrayList<>();
        int urgentCount = 0;
        for (ShortageItem s : shortageItems) {
            ReplenishmentItem item = buildItem(s);
            items.add(item);
            if ("urgent".equals(item.getUrgencyLevel())) urgentCount++;
        }

        // 按紧迫评分降序
        items.sort((a, b) -> Double.compare(b.getUrgencyScore(), a.getUrgencyScore()));

        ReplenishmentAdvisorResponse resp = new ReplenishmentAdvisorResponse();
        resp.setShortageCount(items.size());
        resp.setUrgentCount(urgentCount);
        resp.setItems(items);
        log.debug("[ReplenishmentAdvisor] shortageCount={} urgentCount={}", items.size(), urgentCount);
        return resp;
    }

    private ReplenishmentItem buildItem(ShortageItem s) {
        ReplenishmentItem item = new ReplenishmentItem();
        item.setMaterialCode(s.getMaterialCode());
        item.setMaterialName(s.getMaterialName());
        item.setSpec(s.getSpec());
        item.setUnit(s.getUnit());
        item.setCurrentStock(s.getCurrentStock());
        item.setDemandQuantity(s.getDemandQuantity());
        item.setShortageQuantity(s.getShortageQuantity());
        item.setRecommendedSupplier(s.getSupplierName());
        item.setSupplierContact(s.getSupplierContact());
        item.setSupplierPhone(s.getSupplierPhone());

        // 紧迫级别与评分
        String risk = s.getRiskLevel() != null ? s.getRiskLevel() : "watch";
        String urgency;
        double urgencyScore;
        switch (risk) {
            case "high" -> {
                urgency = "urgent";
                urgencyScore = s.getShortageQuantity() * 3.0;
            }
            case "medium" -> {
                urgency = "warning";
                urgencyScore = s.getShortageQuantity() * 1.5;
            }
            default -> {
                urgency = "watch";
                urgencyScore = s.getShortageQuantity() * 0.8;
            }
        }
        item.setUrgencyLevel(urgency);
        item.setUrgencyScore(Math.round(urgencyScore * 10.0) / 10.0);

        // AI 建议文案
        String supplierInfo = s.getSupplierName() != null && !s.getSupplierName().isEmpty()
                ? "建议联系供应商 " + s.getSupplierName() + " 补货。"
                : "暂无记录供应商，建议采购部门寻源。";
        String advice;
        if ("urgent".equals(urgency)) {
            advice = String.format("缺口 %d %s，高风险，需在48小时内紧急下单。%s",
                    s.getShortageQuantity(), s.getUnit(), supplierInfo);
        } else if ("warning".equals(urgency)) {
            advice = String.format("缺口 %d %s，中度风险，建议3日内安排补货。%s",
                    s.getShortageQuantity(), s.getUnit(), supplierInfo);
        } else {
            advice = String.format("缺口 %d %s，可列入下次常规采购计划。%s",
                    s.getShortageQuantity(), s.getUnit(), supplierInfo);
        }
        item.setAdvice(advice);
        item.setAffectedOrders(0); // 原始数据无此字段，预留
        return item;
    }
}
