package com.fashion.supplychain.procurement.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.orchestration.MaterialPurchaseOrchestrator;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.service.FactoryService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;

/**
 * 供应商采购编排器
 * - 供应商列表：只读，从 t_factory 中筛选 supplier_type='MATERIAL'
 * - 采购单管理：委托给 MaterialPurchaseOrchestrator
 */
@Slf4j
@Service
public class ProcurementOrchestrator {

    @Autowired
    private FactoryService factoryService;

    @Autowired
    private MaterialPurchaseOrchestrator materialPurchaseOrchestrator;

    /**
     * 供应商列表（只读，supplier_type='MATERIAL'）
     */
    public IPage<Factory> listSuppliers(Map<String, Object> params) {
        int page = parseIntOrDefault(params, "page", 1);
        int pageSize = parseIntOrDefault(params, "pageSize", 20);
        String keyword = (String) params.getOrDefault("keyword", "");

        LambdaQueryWrapper<Factory> wrapper = new LambdaQueryWrapper<Factory>()
                .eq(Factory::getDeleteFlag, 0)
                .eq(Factory::getSupplierType, "MATERIAL")
                .and(StringUtils.hasText(keyword), w -> w
                        .like(Factory::getFactoryName, keyword)
                        .or().like(Factory::getFactoryCode, keyword)
                )
                .orderByDesc(Factory::getCreateTime);

        return factoryService.page(new Page<>(page, pageSize), wrapper);
    }

    /**
     * 采购单列表 —— 委托给 MaterialPurchaseOrchestrator
     */
    public IPage<MaterialPurchase> listPurchaseOrders(Map<String, Object> params) {
        return materialPurchaseOrchestrator.list(params);
    }

    /**
     * 综合统计数据：供应商数量 + 采购单统计
     */
    public Map<String, Object> getStats(Map<String, Object> params) {
        // 供应商总数（MATERIAL 类型，不分租户，是系统级资源）
        long supplierCount = factoryService.count(
                new LambdaQueryWrapper<Factory>()
                        .eq(Factory::getDeleteFlag, 0)
                        .eq(Factory::getSupplierType, "MATERIAL")
        );

        // 采购单状态汇总
        Map<String, Object> purchaseStats = materialPurchaseOrchestrator.getStatusStats(params);

        Map<String, Object> result = new HashMap<>();
        result.put("supplierCount", supplierCount);
        result.put("purchaseStats", purchaseStats);

        // 从采购单 stats 中提取常用数字
        if (purchaseStats != null) {
            result.put("totalPurchaseOrders", purchaseStats.getOrDefault("total", 0));
            result.put("pendingOrders", purchaseStats.getOrDefault("PENDING", 0));
        }

        return result;
    }

    // ──────────────────────────────────────────────
    // 工具方法
    // ──────────────────────────────────────────────
    private int parseIntOrDefault(Map<String, Object> params, String key, int def) {
        Object val = params.get(key);
        if (val == null) return def;
        try {
            return Integer.parseInt(val.toString());
        } catch (NumberFormatException e) {
            return def;
        }
    }
}
