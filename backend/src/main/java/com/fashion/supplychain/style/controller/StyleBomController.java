package com.fashion.supplychain.style.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.orchestration.StyleBomOrchestrator;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.style.service.StyleInfoService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/style/bom")
public class StyleBomController {

    @Autowired
    private StyleBomOrchestrator styleBomOrchestrator;

    @Autowired
    private StyleBomService styleBomService;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @GetMapping("/list")
    public Result<List<StyleBom>> listByStyleId(@RequestParam Long styleId) {
        return Result.success(styleBomOrchestrator.listByStyleId(styleId));
    }

    @PostMapping
    public Result<Boolean> save(@RequestBody StyleBom styleBom) {
        return Result.success(styleBomOrchestrator.save(styleBom));
    }

    @PutMapping
    public Result<Boolean> update(@RequestBody StyleBom styleBom) {
        return Result.success(styleBomOrchestrator.update(styleBom));
    }

    @DeleteMapping("/{id}")
    public Result<Boolean> delete(@PathVariable String id) {
        return Result.success(styleBomOrchestrator.delete(id));
    }

    @PostMapping("/{styleId}/sync-material-database")
    public Result<Map<String, Object>> syncMaterialDatabase(@PathVariable Long styleId,
            @RequestParam(required = false, defaultValue = "0") String force) {
        boolean forceUpdateCompleted = force != null
                && ("1".equals(force.trim()) || "true".equalsIgnoreCase(force.trim()) || "yes".equalsIgnoreCase(force.trim()));
        return Result.success(styleBomOrchestrator.syncToMaterialDatabase(styleId, forceUpdateCompleted));
    }

    @PostMapping("/{styleId}/sync-material-database/async")
    public Result<Map<String, Object>> syncMaterialDatabaseAsync(@PathVariable Long styleId,
            @RequestParam(required = false, defaultValue = "0") String force) {
        boolean forceUpdateCompleted = force != null
                && ("1".equals(force.trim()) || "true".equalsIgnoreCase(force.trim()) || "yes".equalsIgnoreCase(force.trim()));
        return Result.success(styleBomOrchestrator.startSyncToMaterialDatabaseJob(styleId, forceUpdateCompleted));
    }

    @GetMapping("/sync-jobs/{jobId}")
    public Result<Map<String, Object>> getSyncJob(@PathVariable String jobId) {
        return Result.success(styleBomOrchestrator.getSyncJob(jobId));
    }

    /**
     * 根据BOM配置手动生成物料采购记录
     * 用于样衣开发阶段的物料采购
     */
    @PostMapping("/generate-purchase")
    public Result<Integer> generatePurchase(@RequestBody Map<String, Object> params) {
        try {
            Long styleId = null;
            Object styleIdObj = params.get("styleId");
            if (styleIdObj instanceof Number) {
                styleId = ((Number) styleIdObj).longValue();
            } else if (styleIdObj instanceof String) {
                try {
                    styleId = Long.parseLong((String) styleIdObj);
                } catch (NumberFormatException e) {
                    return Result.fail("无效的款式ID");
                }
            }

            if (styleId == null || styleId <= 0) {
                return Result.fail("款式ID不能为空");
            }

            // 查询款式信息
            StyleInfo styleInfo = styleInfoService.getById(styleId);
            if (styleInfo == null) {
                return Result.fail("款式不存在");
            }

            // 查询BOM配置
            List<StyleBom> bomList = styleBomOrchestrator.listByStyleId(styleId);
            if (bomList == null || bomList.isEmpty()) {
                return Result.fail("该款式尚未配置BOM");
            }

            // 检查是否已经生成过采购记录（样衣类型）
            LambdaQueryWrapper<MaterialPurchase> existsWrapper = new LambdaQueryWrapper<>();
            existsWrapper.eq(MaterialPurchase::getStyleId, String.valueOf(styleId))
                    .eq(MaterialPurchase::getSourceType, "sample")
                    .eq(MaterialPurchase::getDeleteFlag, 0);
            long existsCount = materialPurchaseService.count(existsWrapper);

            if (existsCount > 0) {
                return Result.fail("该款式已生成过样衣采购记录，请勿重复生成");
            }

            // 为每个BOM项创建采购记录
            int createdCount = 0;
            for (StyleBom bom : bomList) {
                try {
                    MaterialPurchase purchase = new MaterialPurchase();

                    // 生成采购单号：MP + 时间戳后8位
                    String purchaseNo = "MP" + System.currentTimeMillis() % 100000000;
                    purchase.setPurchaseNo(purchaseNo);

                    // 物料信息
                    purchase.setMaterialCode(bom.getMaterialCode());
                    purchase.setMaterialName(bom.getMaterialName());
                    purchase.setMaterialType(bom.getMaterialType());
                    purchase.setSpecifications(bom.getSpecification());
                    purchase.setUnit(bom.getUnit());

                    // 采购数量 = 用量（样衣阶段默认数量为1）
                    BigDecimal usageAmount = bom.getUsageAmount() != null ? bom.getUsageAmount() : BigDecimal.ZERO;
                    int purchaseQty = usageAmount.intValue();
                    if (purchaseQty <= 0) {
                        purchaseQty = 1; // 最小采购数量为1
                    }
                    purchase.setPurchaseQuantity(purchaseQty);
                    purchase.setArrivedQuantity(0);

                    // 供应商和价格
                    purchase.setSupplierName(bom.getSupplier());
                    purchase.setUnitPrice(bom.getUnitPrice());
                    BigDecimal totalAmount = bom.getUnitPrice() != null
                            ? bom.getUnitPrice().multiply(BigDecimal.valueOf(purchaseQty))
                            : BigDecimal.ZERO;
                    purchase.setTotalAmount(totalAmount);

                    // 款式信息
                    purchase.setStyleId(String.valueOf(styleId));
                    purchase.setStyleNo(styleInfo.getStyleNo());
                    purchase.setStyleName(styleInfo.getStyleName());
                    purchase.setStyleCover(styleInfo.getCover());

                    // 采购来源：样衣
                    purchase.setSourceType("sample");

                    // 状态
                    purchase.setStatus("PENDING");
                    purchase.setDeleteFlag(0);
                    purchase.setCreateTime(LocalDateTime.now());
                    purchase.setUpdateTime(LocalDateTime.now());

                    materialPurchaseService.save(purchase);
                    createdCount++;

                } catch (Exception e) {
                    log.error("Failed to create material purchase for bom: bomId={}", bom.getId(), e);
                }
            }

            log.info("Generated {} material purchase records for styleId={}", createdCount, styleId);
            return Result.success(createdCount);

        } catch (Exception e) {
            log.error("Failed to generate material purchase", e);
            return Result.fail("生成失败：" + e.getMessage());
        }
    }

    // ==================== 库存检查相关API ====================

    /**
     * 检查款号BOM库存状态
     */
    @PostMapping("/check-stock/{styleId}")
    public Result<List<StyleBom>> checkBomStock(
            @PathVariable Long styleId,
            @RequestParam(required = false, defaultValue = "1") Integer productionQty) {
        try {
            // 1. 查询BOM列表
            List<StyleBom> bomList = styleBomOrchestrator.listByStyleId(styleId);

            if (bomList == null || bomList.isEmpty()) {
                return Result.success(bomList);
            }

            // 2. 检查库存并更新状态
            List<StyleBom> checkedBomList = styleBomService.saveBomWithStockCheck(bomList, productionQty);

            log.info("✅ BOM库存检查完成: styleId={}, productionQty={}, bomCount={}",
                    styleId, productionQty, checkedBomList.size());

            return Result.success(checkedBomList);
        } catch (Exception e) {
            log.error("❌ BOM库存检查失败: styleId={}, productionQty={}", styleId, productionQty, e);
            return Result.fail("库存检查失败: " + e.getMessage());
        }
    }

    /**
     * 获取BOM库存汇总信息
     */
    @GetMapping("/stock-summary/{styleId}")
    public Result<Map<String, Object>> getBomStockSummary(
            @PathVariable Long styleId,
            @RequestParam(required = false, defaultValue = "1") Integer productionQty) {
        try {
            Map<String, Object> summary = styleBomService.getBomStockSummary(styleId, productionQty);

            log.info("✅ BOM库存汇总查询成功: styleId={}, productionQty={}", styleId, productionQty);

            return Result.success(summary);
        } catch (Exception e) {
            log.error("❌ BOM库存汇总查询失败: styleId={}, productionQty={}", styleId, productionQty, e);
            return Result.fail("库存汇总查询失败: " + e.getMessage());
        }
    }

    /**
     * 批量检查多个款号的BOM库存
     */
    @PostMapping("/batch-check-stock")
    public Result<Map<Long, List<StyleBom>>> batchCheckBomStock(
            @RequestBody List<Long> styleIds,
            @RequestParam(required = false, defaultValue = "1") Integer productionQty) {
        try {
            Map<Long, List<StyleBom>> resultMap = new java.util.HashMap<>();

            for (Long styleId : styleIds) {
                List<StyleBom> bomList = styleBomOrchestrator.listByStyleId(styleId);
                if (bomList != null && !bomList.isEmpty()) {
                    List<StyleBom> checkedBomList = styleBomService.saveBomWithStockCheck(bomList, productionQty);
                    resultMap.put(styleId, checkedBomList);
                }
            }

            log.info("✅ 批量BOM库存检查完成: styleCount={}, productionQty={}",
                    styleIds.size(), productionQty);

            return Result.success(resultMap);
        } catch (Exception e) {
            log.error("❌ 批量BOM库存检查失败: styleIds={}, productionQty={}", styleIds, productionQty, e);
            return Result.fail("批量库存检查失败: " + e.getMessage());
        }
    }
}
