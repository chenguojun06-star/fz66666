package com.fashion.supplychain.warehouse.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.service.MaterialStockService;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.service.ProductSkuService;
import com.fashion.supplychain.warehouse.entity.InventoryCheck;
import com.fashion.supplychain.warehouse.entity.InventoryCheckItem;
import com.fashion.supplychain.warehouse.service.InventoryCheckItemService;
import com.fashion.supplychain.warehouse.service.InventoryCheckService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.ThreadLocalRandom;

@Slf4j
@Service
public class InventoryCheckOrchestrator {

    @Autowired
    private InventoryCheckService checkService;

    @Autowired
    private InventoryCheckItemService itemService;

    @Autowired
    private MaterialStockService materialStockService;

    @Autowired
    private ProductSkuService productSkuService;

    @Transactional(rollbackFor = Exception.class)
    public InventoryCheck createCheck(Map<String, Object> params) {
        Long tenantId = UserContext.tenantId();
        String checkType = (String) params.getOrDefault("checkType", "MATERIAL");
        LocalDate checkDate = params.containsKey("checkDate")
                ? LocalDate.parse((String) params.get("checkDate"))
                : LocalDate.now();
        String warehouseLocation = (String) params.get("warehouseLocation");
        String remark = (String) params.get("remark");

        InventoryCheck check = new InventoryCheck();
        check.setId(UUID.randomUUID().toString().replace("-", ""));
        check.setCheckNo(generateCheckNo(tenantId));
        check.setCheckType(checkType);
        check.setStatus("draft");
        check.setCheckDate(checkDate);
        check.setWarehouseLocation(warehouseLocation);
        check.setRemark(remark);
        check.setTotalItems(0);
        check.setDiffItems(0);
        check.setTotalBookQty(0);
        check.setTotalActualQty(0);
        check.setTotalDiffQty(0);
        check.setTotalDiffAmount(BigDecimal.ZERO);
        check.setCreatedById(UserContext.userId());
        check.setCreatedByName(UserContext.username());
        check.setTenantId(tenantId);
        check.setDeleteFlag(0);
        check.setCreateTime(LocalDateTime.now());
        check.setUpdateTime(LocalDateTime.now());

        List<InventoryCheckItem> items = new ArrayList<>();
        if ("MATERIAL".equals(checkType)) {
            loadMaterialStockItems(tenantId, warehouseLocation, items);
        } else {
            loadFinishedProductItems(tenantId, items);
        }

        check.setTotalItems(items.size());
        int totalBook = items.stream().mapToInt(i -> i.getBookQuantity() != null ? i.getBookQuantity() : 0).sum();
        check.setTotalBookQty(totalBook);

        checkService.save(check);
        if (!items.isEmpty()) {
            items.forEach(i -> i.setCheckId(check.getId()));
            itemService.saveBatch(items, 100);
        }

        check.setItems(items);
        return check;
    }

    private void loadMaterialStockItems(Long tenantId, String warehouseLocation, List<InventoryCheckItem> items) {
        LambdaQueryWrapper<MaterialStock> qw = new LambdaQueryWrapper<>();
        qw.eq(MaterialStock::getTenantId, tenantId);
        qw.eq(MaterialStock::getDeleteFlag, 0);
        qw.gt(MaterialStock::getQuantity, 0);
        if (StringUtils.hasText(warehouseLocation)) {
            qw.eq(MaterialStock::getLocation, warehouseLocation);
        }
        List<MaterialStock> stocks = materialStockService.list(qw);
        for (MaterialStock stock : stocks) {
            InventoryCheckItem item = new InventoryCheckItem();
            item.setId(UUID.randomUUID().toString().replace("-", ""));
            item.setStockId(stock.getId());
            item.setMaterialCode(stock.getMaterialCode());
            item.setMaterialName(stock.getMaterialName());
            item.setColor(stock.getColor());
            item.setSize(stock.getSize());
            item.setSpecifications(stock.getSpecifications());
            item.setUnit(stock.getUnit());
            item.setUnitPrice(stock.getUnitPrice());
            item.setBookQuantity(stock.getQuantity() != null ? stock.getQuantity() : 0);
            item.setCheckStatus("pending");
            item.setTenantId(tenantId);
            item.setDeleteFlag(0);
            item.setCreateTime(LocalDateTime.now());
            item.setUpdateTime(LocalDateTime.now());
            items.add(item);
        }
    }

    private void loadFinishedProductItems(Long tenantId, List<InventoryCheckItem> items) {
        LambdaQueryWrapper<ProductSku> qw = new LambdaQueryWrapper<>();
        qw.eq(ProductSku::getTenantId, tenantId);
        qw.gt(ProductSku::getStockQuantity, 0);
        List<ProductSku> skus = productSkuService.list(qw);
        for (ProductSku sku : skus) {
            InventoryCheckItem item = new InventoryCheckItem();
            item.setId(UUID.randomUUID().toString().replace("-", ""));
            item.setStockId(sku.getId() != null ? sku.getId().toString() : null);
            item.setSkuCode(sku.getSkuCode());
            item.setColor(sku.getColor());
            item.setSize(sku.getSize());
            item.setUnitPrice(sku.getCostPrice());
            item.setBookQuantity(sku.getStockQuantity() != null ? sku.getStockQuantity() : 0);
            item.setCheckStatus("pending");
            item.setTenantId(tenantId);
            item.setDeleteFlag(0);
            item.setCreateTime(LocalDateTime.now());
            item.setUpdateTime(LocalDateTime.now());
            items.add(item);
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public InventoryCheck fillActualQuantities(String checkId, List<Map<String, Object>> actualData) {
        InventoryCheck check = checkService.getById(checkId);
        if (check == null) {
            throw new IllegalArgumentException("盘点单不存在");
        }
        Long tenantId = UserContext.tenantId();
        if (!tenantId.equals(check.getTenantId())) {
            throw new SecurityException("无权操作该盘点单");
        }
        if ("confirmed".equals(check.getStatus()) || "cancelled".equals(check.getStatus())) {
            throw new IllegalArgumentException("盘点单已确认/已取消，不可修改");
        }

        List<InventoryCheckItem> allItems = itemService.list(
                new LambdaQueryWrapper<InventoryCheckItem>()
                        .eq(InventoryCheckItem::getCheckId, checkId)
                        .eq(InventoryCheckItem::getDeleteFlag, 0));

        Map<String, InventoryCheckItem> itemMap = new HashMap<>();
        allItems.forEach(i -> itemMap.put(i.getId(), i));

        for (Map<String, Object> data : actualData) {
            String itemId = (String) data.get("itemId");
            Integer actualQty = data.get("actualQuantity") instanceof Number
                    ? ((Number) data.get("actualQuantity")).intValue() : null;
            String itemRemark = (String) data.get("remark");

            InventoryCheckItem item = itemMap.get(itemId);
            if (item == null) continue;

            item.setActualQuantity(actualQty);
            item.setRemark(itemRemark);
            if (actualQty != null) {
                int bookQty = item.getBookQuantity() != null ? item.getBookQuantity() : 0;
                int diff = actualQty - bookQty;
                item.setDiffQuantity(diff);
                BigDecimal price = item.getUnitPrice() != null ? item.getUnitPrice() : BigDecimal.ZERO;
                item.setDiffAmount(price.multiply(BigDecimal.valueOf(diff)));
                item.setDiffType(diff > 0 ? "PROFIT" : (diff < 0 ? "LOSS" : "EQUAL"));
            }
            item.setCheckStatus("checked");
            item.setUpdateTime(LocalDateTime.now());
        }

        itemService.updateBatchById(allItems, 100);
        recalculateSummary(check, allItems);
        checkService.updateById(check);
        check.setItems(allItems);
        return check;
    }

    private void recalculateSummary(InventoryCheck check, List<InventoryCheckItem> items) {
        int diffItems = 0;
        int totalActual = 0;
        int totalDiff = 0;
        BigDecimal totalDiffAmount = BigDecimal.ZERO;

        for (InventoryCheckItem item : items) {
            if (item.getActualQuantity() != null) {
                totalActual += item.getActualQuantity();
                int diff = item.getDiffQuantity() != null ? item.getDiffQuantity() : 0;
                totalDiff += diff;
                if (diff != 0) diffItems++;
                totalDiffAmount = totalDiffAmount.add(item.getDiffAmount() != null ? item.getDiffAmount() : BigDecimal.ZERO);
            }
        }

        check.setDiffItems(diffItems);
        check.setTotalActualQty(totalActual);
        check.setTotalDiffQty(totalDiff);
        check.setTotalDiffAmount(totalDiffAmount);
        check.setUpdateTime(LocalDateTime.now());
    }

    @Transactional(rollbackFor = Exception.class)
    public InventoryCheck confirmCheck(String checkId) {
        InventoryCheck check = checkService.getById(checkId);
        if (check == null) {
            throw new IllegalArgumentException("盘点单不存在");
        }
        Long tenantId = UserContext.tenantId();
        if (!tenantId.equals(check.getTenantId())) {
            throw new SecurityException("无权操作该盘点单");
        }
        if (!"draft".equals(check.getStatus())) {
            throw new IllegalArgumentException("只有草稿状态可确认");
        }

        List<InventoryCheckItem> items = itemService.list(
                new LambdaQueryWrapper<InventoryCheckItem>()
                        .eq(InventoryCheckItem::getCheckId, checkId)
                        .eq(InventoryCheckItem::getDeleteFlag, 0));

        long unchecked = items.stream().filter(i -> "pending".equals(i.getCheckStatus())).count();
        if (unchecked > 0) {
            throw new IllegalArgumentException("还有" + unchecked + "项未盘点，请先完成盘点");
        }

        recalculateSummary(check, items);
        check.setStatus("confirmed");
        check.setConfirmedBy(UserContext.userId());
        check.setConfirmedName(UserContext.username());
        check.setConfirmedTime(LocalDateTime.now());
        checkService.updateById(check);

        applyStockAdjustments(check, items);
        log.info("库存盘点确认: checkNo={}, diffItems={}, totalDiff={}", check.getCheckNo(), check.getDiffItems(), check.getTotalDiffQty());
        check.setItems(items);
        return check;
    }

    private void applyStockAdjustments(InventoryCheck check, List<InventoryCheckItem> items) {
        Long tenantId = UserContext.tenantId();
        for (InventoryCheckItem item : items) {
            if (item.getDiffQuantity() == null || item.getDiffQuantity() == 0) continue;
            if ("MATERIAL".equals(check.getCheckType()) && StringUtils.hasText(item.getStockId())) {
                int delta = item.getDiffQuantity();
                if (delta < 0) {
                    int rows = ((com.fashion.supplychain.production.mapper.MaterialStockMapper) materialStockService.getBaseMapper())
                            .decreaseStockWithCheck(item.getStockId(), Math.abs(delta), tenantId);
                    if (rows == 0) {
                        log.warn("[盘点调整] 物料库存不足，跳过扣减: stockId={}, delta={}, 可能为并发消耗所致",
                                item.getStockId(), delta);
                    }
                } else {
                    int rows = ((com.fashion.supplychain.production.mapper.MaterialStockMapper) materialStockService.getBaseMapper())
                            .updateStockQuantity(item.getStockId(), delta, tenantId);
                    if (rows == 0) {
                        throw new IllegalStateException("盘点调整物料库存失败: stockId=" + item.getStockId());
                    }
                }
                log.info("盘点调整物料库存: stockId={}, delta={}", item.getStockId(), delta);
            } else if ("FINISHED".equals(check.getCheckType()) && StringUtils.hasText(item.getStockId())) {
                int delta = item.getDiffQuantity();
                productSkuService.updateStockById(Long.valueOf(item.getStockId()), delta);
                log.info("盘点调整成品库存: skuId={}, delta={}", item.getStockId(), delta);
            }
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void cancelCheck(String checkId) {
        InventoryCheck check = checkService.getById(checkId);
        if (check == null) throw new IllegalArgumentException("盘点单不存在");
        Long tenantId = UserContext.tenantId();
        if (!tenantId.equals(check.getTenantId())) {
            throw new SecurityException("无权操作该盘点单");
        }
        if ("confirmed".equals(check.getStatus())) throw new IllegalArgumentException("已确认的盘点单不可取消");
        check.setStatus("cancelled");
        check.setUpdateTime(LocalDateTime.now());
        checkService.updateById(check);
    }

    public IPage<InventoryCheck> listChecks(Map<String, Object> params) {
        int page = params.containsKey("page") ? ((Number) params.get("page")).intValue() : 1;
        int pageSize = params.containsKey("pageSize") ? ((Number) params.get("pageSize")).intValue() : 20;

        LambdaQueryWrapper<InventoryCheck> qw = new LambdaQueryWrapper<>();
        qw.eq(InventoryCheck::getDeleteFlag, 0);
        qw.eq(InventoryCheck::getTenantId, UserContext.tenantId());

        if (params.containsKey("checkType")) {
            qw.eq(InventoryCheck::getCheckType, params.get("checkType"));
        }
        if (params.containsKey("status")) {
            qw.eq(InventoryCheck::getStatus, params.get("status"));
        }
        qw.orderByDesc(InventoryCheck::getCreateTime);

        return checkService.page(new Page<>(page, pageSize), qw);
    }

    public InventoryCheck getDetail(String checkId) {
        InventoryCheck check = checkService.getById(checkId);
        if (check != null) {
            Long tenantId = UserContext.tenantId();
            if (!tenantId.equals(check.getTenantId())) {
                throw new SecurityException("无权查看该盘点单");
            }
            List<InventoryCheckItem> items = itemService.list(
                    new LambdaQueryWrapper<InventoryCheckItem>()
                            .eq(InventoryCheckItem::getCheckId, checkId)
                            .eq(InventoryCheckItem::getDeleteFlag, 0)
                            .orderByAsc(InventoryCheckItem::getCreateTime));
            check.setItems(items);
        }
        return check;
    }

    public Map<String, Object> getInventorySummary() {
        Long tenantId = UserContext.tenantId();
        Map<String, Object> result = new HashMap<>();

        long materialCount = materialStockService.count(
                new LambdaQueryWrapper<MaterialStock>()
                        .eq(MaterialStock::getTenantId, tenantId)
                        .eq(MaterialStock::getDeleteFlag, 0)
                        .gt(MaterialStock::getQuantity, 0));
        result.put("materialStockCount", materialCount);

        long skuCount = productSkuService.count(
                new LambdaQueryWrapper<ProductSku>()
                        .eq(ProductSku::getTenantId, tenantId)
                        .gt(ProductSku::getStockQuantity, 0));
        result.put("skuStockCount", skuCount);

        long pendingChecks = checkService.count(
                new LambdaQueryWrapper<InventoryCheck>()
                        .eq(InventoryCheck::getTenantId, tenantId)
                        .eq(InventoryCheck::getDeleteFlag, 0)
                        .eq(InventoryCheck::getStatus, "draft"));
        result.put("pendingChecks", pendingChecks);

        return result;
    }

    private String generateCheckNo(Long tenantId) {
        String date = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        String rand = String.format("%04d", ThreadLocalRandom.current().nextInt(10000));
        return "IC" + date + rand;
    }
}
