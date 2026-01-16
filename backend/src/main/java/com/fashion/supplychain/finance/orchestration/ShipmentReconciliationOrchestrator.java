package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.entity.ShipmentReconciliation;
import com.fashion.supplychain.finance.service.ShipmentReconciliationService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.orchestration.ProductionOrderOrchestrator;
import com.fashion.supplychain.production.service.ProductionOrderService;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
@Slf4j
public class ShipmentReconciliationOrchestrator {

    @Autowired
    private ShipmentReconciliationService shipmentReconciliationService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ProductionOrderOrchestrator productionOrderOrchestrator;

    public IPage<ShipmentReconciliation> list(Map<String, Object> params) {
        IPage<ShipmentReconciliation> page = shipmentReconciliationService.queryPage(params);
        if (page != null) {
            fillProductionCompletedQuantity(page.getRecords());
        }
        return page;
    }

    public List<ShipmentReconciliation> listAll() {
        return shipmentReconciliationService.list();
    }

    public ShipmentReconciliation getById(String id) {
        String key = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(key)) {
            throw new IllegalArgumentException("参数错误");
        }
        ShipmentReconciliation r = shipmentReconciliationService.getById(key);
        if (r == null) {
            throw new NoSuchElementException("对账单不存在");
        }
        fillProductionCompletedQuantity(List.of(r));
        return r;
    }

    private void fillProductionCompletedQuantity(List<ShipmentReconciliation> records) {
        if (records == null || records.isEmpty()) {
            return;
        }

        List<String> orderIds = records.stream()
                .map(ShipmentReconciliation::getOrderId)
                .filter(StringUtils::hasText)
                .map(String::trim)
                .distinct()
                .collect(Collectors.toList());
        if (orderIds.isEmpty()) {
            return;
        }

        List<ProductionOrder> orders;
        try {
            orders = productionOrderService.listByIds(orderIds);
        } catch (Exception e) {
            log.warn("Failed to query production orders for shipment reconciliation: orderIdsCount={}",
                    orderIds == null ? 0 : orderIds.size(),
                    e);
            orders = List.of();
        }

        Map<String, Integer> completedByOrderId = new HashMap<>();
        if (orders != null) {
            for (ProductionOrder o : orders) {
                if (o == null || !StringUtils.hasText(o.getId())) {
                    continue;
                }
                completedByOrderId.put(o.getId().trim(), o.getCompletedQuantity());
            }
        }

        for (ShipmentReconciliation r : records) {
            if (r == null || !StringUtils.hasText(r.getOrderId())) {
                continue;
            }
            Integer v = completedByOrderId.get(r.getOrderId().trim());
            r.setProductionCompletedQuantity(v);
        }
    }

    public boolean save(ShipmentReconciliation shipmentReconciliation) {
        if (shipmentReconciliation == null) {
            throw new IllegalArgumentException("参数错误");
        }
        shipmentReconciliation.setStatus("pending");
        boolean ok = shipmentReconciliationService.save(shipmentReconciliation);
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }
        return true;
    }

    public boolean update(ShipmentReconciliation shipmentReconciliation) {
        if (shipmentReconciliation == null || !StringUtils.hasText(shipmentReconciliation.getId())) {
            throw new IllegalArgumentException("参数错误");
        }
        ShipmentReconciliation current = shipmentReconciliationService.getById(shipmentReconciliation.getId());
        if (current == null) {
            throw new NoSuchElementException("对账单不存在");
        }
        String st = current.getStatus() == null ? "" : current.getStatus().trim();
        if (StringUtils.hasText(st) && !"pending".equalsIgnoreCase(st) && !UserContext.isTopAdmin()) {
            throw new IllegalStateException("当前状态不允许修改，请先退回到上一个环节");
        }
        boolean ok = shipmentReconciliationService.updateById(shipmentReconciliation);
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }
        return true;
    }

    public boolean delete(String id) {
        String key = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(key)) {
            throw new IllegalArgumentException("参数错误");
        }
        ShipmentReconciliation current = shipmentReconciliationService.getById(key);
        if (current == null) {
            throw new NoSuchElementException("对账单不存在");
        }
        String st = current.getStatus() == null ? "" : current.getStatus().trim();
        if (StringUtils.hasText(st) && !"pending".equalsIgnoreCase(st) && !UserContext.isTopAdmin()) {
            throw new IllegalStateException("当前状态不允许删除，请先退回到上一个环节");
        }
        boolean ok = shipmentReconciliationService.removeById(key);
        if (!ok) {
            throw new IllegalStateException("删除失败");
        }
        return true;
    }

    public int backfill() {
        if (!UserContext.isSupervisorOrAbove()) {
            throw new AccessDeniedException("仅主管级别及以上可执行补数据");
        }
        return productionOrderOrchestrator.backfillFinanceRecords();
    }
}
