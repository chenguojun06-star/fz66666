package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.PatternProduction;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.PatternProductionService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.orchestration.MaterialPurchaseOrchestrator;
import com.baomidou.mybatisplus.core.metadata.IPage;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;

@RestController
@RequestMapping({ "/api/production/purchase", "/api/production/material" })
@Slf4j
public class MaterialPurchaseController {

    @Autowired
    private MaterialPurchaseOrchestrator materialPurchaseOrchestrator;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private PatternProductionService patternProductionService;

    @GetMapping("/list")
    public Result<?> list(@RequestParam Map<String, Object> params) {
        IPage<MaterialPurchase> page = materialPurchaseOrchestrator.list(params);

        // 补充下单数量字段（订单或样板生产）
        List<MaterialPurchase> records = page.getRecords();
        if (records != null && !records.isEmpty()) {
            // 收集订单ID和样板生产ID
            Set<String> orderIds = new HashSet<>();
            Set<String> patternProductionIds = new HashSet<>();

            for (MaterialPurchase record : records) {
                String sourceType = record.getSourceType();
                if ("order".equals(sourceType) && StringUtils.hasText(record.getOrderId())) {
                    orderIds.add(record.getOrderId());
                } else if ("sample".equals(sourceType) && StringUtils.hasText(record.getPatternProductionId())) {
                    patternProductionIds.add(record.getPatternProductionId());
                }
            }

            // 批量查询订单数量
            Map<String, Integer> orderQuantityMap = new HashMap<>();
            if (!orderIds.isEmpty()) {
                try {
                    List<ProductionOrder> orders = productionOrderService.listByIds(orderIds);
                    for (ProductionOrder order : orders) {
                        if (order != null && StringUtils.hasText(order.getId())) {
                            orderQuantityMap.put(order.getId(), order.getOrderQuantity());
                        }
                    }
                } catch (Exception e) {
                    log.warn("Failed to load order quantities", e);
                }
            }

            // 批量查询样板生产数量
            Map<String, Integer> patternQuantityMap = new HashMap<>();
            if (!patternProductionIds.isEmpty()) {
                try {
                    List<PatternProduction> patterns = patternProductionService.listByIds(patternProductionIds);
                    for (PatternProduction pattern : patterns) {
                        if (pattern != null && StringUtils.hasText(pattern.getId())) {
                            patternQuantityMap.put(pattern.getId(), pattern.getQuantity());
                        }
                    }
                } catch (Exception e) {
                    log.warn("Failed to load pattern production quantities", e);
                }
            }

            // 使用LinkedHashMap包装数据以添加orderQuantity字段
            List<Map<String, Object>> enrichedRecords = records.stream()
                    .map(record -> {
                        Map<String, Object> map = new LinkedHashMap<>();
                        // 复制所有原有字段
                        map.put("id", record.getId());
                        map.put("purchaseNo", record.getPurchaseNo());
                        map.put("materialId", record.getMaterialId());
                        map.put("materialCode", record.getMaterialCode());
                        map.put("materialName", record.getMaterialName());
                        map.put("materialType", record.getMaterialType());
                        map.put("specifications", record.getSpecifications());
                        map.put("unit", record.getUnit());
                        map.put("purchaseQuantity", record.getPurchaseQuantity());
                        map.put("arrivedQuantity", record.getArrivedQuantity());
                        map.put("supplierId", record.getSupplierId());
                        map.put("supplierName", record.getSupplierName());
                        map.put("unitPrice", record.getUnitPrice());
                        map.put("totalAmount", record.getTotalAmount());
                        map.put("receiverId", record.getReceiverId());
                        map.put("receiverName", record.getReceiverName());
                        map.put("receivedTime", record.getReceivedTime());
                        map.put("remark", record.getRemark());
                        map.put("orderId", record.getOrderId());
                        map.put("orderNo", record.getOrderNo());
                        map.put("styleId", record.getStyleId());
                        map.put("styleNo", record.getStyleNo());
                        map.put("styleName", record.getStyleName());
                        map.put("styleCover", record.getStyleCover());
                        map.put("returnConfirmed", record.getReturnConfirmed());
                        map.put("returnQuantity", record.getReturnQuantity());
                        map.put("returnConfirmerId", record.getReturnConfirmerId());
                        map.put("returnConfirmerName", record.getReturnConfirmerName());
                        map.put("returnConfirmTime", record.getReturnConfirmTime());
                        map.put("status", record.getStatus());
                        map.put("createTime", record.getCreateTime());
                        map.put("updateTime", record.getUpdateTime());
                        map.put("expectedArrivalDate", record.getExpectedArrivalDate());
                        map.put("actualArrivalDate", record.getActualArrivalDate());
                        map.put("expectedShipDate", record.getExpectedShipDate());
                        map.put("sourceType", record.getSourceType());
                        map.put("patternProductionId", record.getPatternProductionId());

                        // 添加下单数量（根据来源类型从不同表获取）
                        Integer orderQuantity = null;
                        String sourceType = record.getSourceType();
                        if ("order".equals(sourceType) && StringUtils.hasText(record.getOrderId())) {
                            orderQuantity = orderQuantityMap.get(record.getOrderId());
                        } else if ("sample".equals(sourceType) && StringUtils.hasText(record.getPatternProductionId())) {
                            orderQuantity = patternQuantityMap.get(record.getPatternProductionId());
                        }
                        map.put("orderQuantity", orderQuantity);

                        return map;
                    })
                    .collect(Collectors.toList());

            // 构建新的返回结果
            Map<String, Object> result = new HashMap<>();
            result.put("records", enrichedRecords);
            result.put("total", page.getTotal());
            result.put("size", page.getSize());
            result.put("current", page.getCurrent());
            result.put("pages", page.getPages());

            return Result.success(result);
        }

        return Result.success(page);
    }

    @GetMapping("/{id}")
    public Result<MaterialPurchase> getById(@PathVariable String id) {
        return Result.success(materialPurchaseOrchestrator.getById(id));
    }

    @PostMapping
    public Result<Boolean> save(@RequestBody MaterialPurchase materialPurchase) {
        return Result.success(materialPurchaseOrchestrator.save(materialPurchase));
    }

    @PutMapping
    public Result<Boolean> update(@RequestBody MaterialPurchase materialPurchase) {
        return Result.success(materialPurchaseOrchestrator.update(materialPurchase));
    }

    @PostMapping("/batch")
    public Result<Boolean> batch(@RequestBody List<MaterialPurchase> purchases) {
        return Result.success(materialPurchaseOrchestrator.batch(purchases));
    }

    @PostMapping("/update-arrived-quantity")
    public Result<Boolean> updateArrivedQuantity(@RequestBody Map<String, Object> params) {
        return Result.success(materialPurchaseOrchestrator.updateArrivedQuantity(params));
    }

    @GetMapping("/demand/preview")
    public Result<?> previewDemand(@RequestParam String orderId) {
        return Result.success(materialPurchaseOrchestrator.previewDemand(orderId));
    }

    @PostMapping("/demand/generate")
    public Result<?> generateDemand(@RequestBody Map<String, Object> params) {
        return Result.success(materialPurchaseOrchestrator.generateDemand(params));
    }

    @PostMapping("/receive")
    public Result<?> receive(@RequestBody Map<String, Object> body) {
        return Result.success(materialPurchaseOrchestrator.receive(body));
    }

    @PostMapping({ "/return-confirm", "/returnConfirm" })
    public Result<?> returnConfirm(@RequestBody Map<String, Object> body) {
        return Result.success(materialPurchaseOrchestrator.returnConfirm(body));
    }

    @PostMapping({ "/return-confirm/reset", "/returnConfirm/reset" })
    public Result<?> resetReturnConfirm(@RequestBody Map<String, Object> body) {
        return Result.success(materialPurchaseOrchestrator.resetReturnConfirm(body));
    }

    @DeleteMapping("/{id}")
    public Result<Boolean> delete(@PathVariable String id) {
        return Result.success(materialPurchaseOrchestrator.delete(id));
    }

    /**
     * 通过扫码获取关联的采购单列表
     * @param params 包含 scanCode 和 orderNo
     * @return 采购单列表
     */
    @GetMapping("/by-scan-code")
    public Result<List<MaterialPurchase>> getByScanCode(@RequestParam Map<String, Object> params) {
        return Result.success(materialPurchaseOrchestrator.getByScanCode(params));
    }

    /**
     * 获取当前用户的采购任务
     * @return 采购任务列表
     */
    @GetMapping("/my-tasks")
    public Result<List<MaterialPurchase>> getMyTasks() {
        return Result.success(materialPurchaseOrchestrator.getMyTasks());
    }

    /**
     * 快速编辑物料采购（备注和预计出货日期）
     */
    @PutMapping("/quick-edit")
    public Result<?> quickEdit(@RequestBody Map<String, Object> payload) {
        String id = (String) payload.get("id");
        String remark = (String) payload.get("remark");
        String expectedShipDate = (String) payload.get("expectedShipDate");

        MaterialPurchase purchase = new MaterialPurchase();
        purchase.setId(id);
        purchase.setRemark(remark);
        if (expectedShipDate != null && !expectedShipDate.isEmpty()) {
            purchase.setExpectedShipDate(java.time.LocalDate.parse(expectedShipDate));
        }

        materialPurchaseOrchestrator.update(purchase);
        return Result.success();
    }
}
