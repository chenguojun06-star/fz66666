package com.fashion.supplychain.common.aop;

import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.CuttingTaskService;
import com.fashion.supplychain.production.service.MaterialPickingService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.service.StyleInfoService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.lang.reflect.Field;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 操作日志快照与变更对比辅助类（P2#10 拆分自 SystemOperationLogAspect）
 * 职责：
 *   1. 查询实体快照（修改前/修改后的字段值）
 *   2. 将实体对象转为 字段名->字符串值 的 Map
 *
 * 设计原则：
 *   - 纯查询方法，无 @Transactional
 *   - 不修改业务流程，不改 API 契约
 *   - 多租户隔离由 UserContext + 各 Service 内部保障（targetId 已经过 Orchestrator 校验）
 */
@Slf4j
@Component
public class OperationLogSnapshotHelper {

    @Autowired(required = false)
    private StyleInfoService styleInfoService;

    @Autowired(required = false)
    private ProductionOrderService productionOrderService;

    @Autowired(required = false)
    private MaterialPurchaseService materialPurchaseService;

    @Autowired(required = false)
    private MaterialPickingService materialPickingService;

    @Autowired(required = false)
    private CuttingTaskService cuttingTaskService;

    @Autowired(required = false)
    private CuttingBundleService cuttingBundleService;

    /**
     * 查询实体快照（字段名 -> 字段值）
     * 用于 before/after 对比
     */
    public Map<String, String> queryEntitySnapshot(String targetType, String targetId) {
        if (targetType == null || targetId == null) return null;
        try {
            Object entity = null;
            switch (targetType) {
                case "款式":
                    entity = styleInfoService != null ? styleInfoService.getById(targetId) : null;
                    break;
                case "订单":
                    entity = productionOrderService != null ? productionOrderService.getById(targetId) : null;
                    break;
                case "采购单":
                    entity = materialPurchaseService != null ? materialPurchaseService.getById(targetId) : null;
                    break;
                case "领料单":
                    entity = materialPickingService != null ? materialPickingService.getById(targetId) : null;
                    break;
                case "裁剪单":
                    entity = cuttingTaskService != null ? cuttingTaskService.getById(targetId) : null;
                    break;
                case "菲号":
                    entity = cuttingBundleService != null ? cuttingBundleService.getById(targetId) : null;
                    break;
                default:
                    break;
            }
            if (entity == null) return null;
            return beanToMap(entity);
        } catch (Exception e) {
            log.debug("[OpLog] 查询实体快照失败: targetType={} targetId={}", targetType, targetId, e);
            return null;
        }
    }

    /**
     * 将实体对象转为 字段名->字符串值 的 Map（排除非业务字段）
     */
    public Map<String, String> beanToMap(Object bean) {
        Map<String, String> map = new LinkedHashMap<>();
        try {
            for (Field f : bean.getClass().getDeclaredFields()) {
                String name = f.getName();
                // 排除非业务字段
                if (name.equals("serialVersionUID") || name.equals("tenantId")
                    || name.equals("deleteFlag") || name.equals("createTime") || name.equals("updateTime")
                    || name.startsWith("$") || name.equals("id")) continue;
                f.setAccessible(true);
                Object val = f.get(bean);
                if (val != null) {
                    map.put(name, String.valueOf(val));
                }
            }
        } catch (Exception e) {
            log.debug("[OpLog] beanToMap失败", e);
        }
        return map;
    }
}
