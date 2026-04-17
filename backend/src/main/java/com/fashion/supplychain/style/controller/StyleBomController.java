package com.fashion.supplychain.style.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.orchestration.StyleBomOrchestrator;
import com.fashion.supplychain.style.service.StyleInfoService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.Collections;
import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/style/bom")
@PreAuthorize("isAuthenticated()")
public class StyleBomController {

    @Autowired
    private StyleBomOrchestrator styleBomOrchestrator;

    @Autowired
    private StyleInfoService styleInfoService;

    @GetMapping("/list")
    public Result<List<StyleBom>> listByStyleId(
            @RequestParam(required = false) String styleId,
            @RequestParam(required = false) String styleNo) {
        Long resolvedStyleId = StyleIdResolver.resolve(styleId, styleNo);
        if (resolvedStyleId == null) {
            return Result.success(Collections.emptyList());
        }
        return Result.success(styleBomOrchestrator.listByStyleId(resolvedStyleId));
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
    public Result<Map<String, Object>> syncMaterialDatabase(
            @PathVariable Long styleId,
            @RequestParam(required = false, defaultValue = "0") String force,
            @RequestParam(required = false, defaultValue = "false") boolean async) {

        boolean forceUpdateCompleted = force != null
                && ("1".equals(force.trim()) || "true".equalsIgnoreCase(force.trim()) || "yes".equalsIgnoreCase(force.trim()));

        if (async) {
            return Result.success(styleBomOrchestrator.startSyncToMaterialDatabaseJob(styleId, forceUpdateCompleted));
        } else {
            return Result.success(styleBomOrchestrator.syncToMaterialDatabase(styleId, forceUpdateCompleted));
        }
    }

    @GetMapping("/sync-jobs/{jobId}")
    public Result<Map<String, Object>> getSyncJob(@PathVariable String jobId) {
        return Result.success(styleBomOrchestrator.getSyncJob(jobId));
    }

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

            boolean force = Boolean.TRUE.equals(params.get("force")) ||
                    "true".equalsIgnoreCase(String.valueOf(params.getOrDefault("force", "false")));

            int createdCount = styleBomOrchestrator.generatePurchase(styleId, force);
            return Result.success(createdCount);

        } catch (IllegalArgumentException | IllegalStateException e) {
            return Result.fail(e.getMessage());
        } catch (java.util.NoSuchElementException e) {
            return Result.fail(e.getMessage());
        } catch (Exception e) {
            log.error("Failed to generate material purchase", e);
            return Result.fail("生成失败：" + e.getMessage());
        }
    }

    @PostMapping("/check-stock/{styleId}")
    public Result<List<StyleBom>> checkBomStock(
            @PathVariable Long styleId,
            @RequestParam(required = false, defaultValue = "1") Integer productionQty) {
        try {
            List<StyleBom> bomList = styleBomOrchestrator.listByStyleId(styleId);

            if (bomList == null || bomList.isEmpty()) {
                return Result.success(bomList);
            }

            List<StyleBom> checkedBomList = styleBomOrchestrator.saveBomWithStockCheck(bomList, productionQty);

            log.info("BOM库存检查完成: styleId={}, productionQty={}, bomCount={}",
                    styleId, productionQty, checkedBomList.size());

            return Result.success(checkedBomList);
        } catch (Exception e) {
            log.error("BOM库存检查失败: styleId={}, productionQty={}", styleId, productionQty, e);
            return Result.fail("库存检查失败: " + e.getMessage());
        }
    }

    @GetMapping("/stock-summary/{styleId}")
    public Result<Map<String, Object>> getBomStockSummary(
            @PathVariable Long styleId,
            @RequestParam(required = false, defaultValue = "1") Integer productionQty) {
        try {
            Map<String, Object> summary = styleBomOrchestrator.getBomStockSummary(styleId, productionQty);
            return Result.success(summary);
        } catch (Exception e) {
            log.error("BOM库存汇总查询失败: styleId={}, productionQty={}", styleId, productionQty, e);
            return Result.fail("库存汇总查询失败: " + e.getMessage());
        }
    }

    @PostMapping("/batch-check-stock")
    public Result<Map<Long, List<StyleBom>>> batchCheckBomStock(
            @RequestBody List<Long> styleIds,
            @RequestParam(required = false, defaultValue = "1") Integer productionQty) {
        try {
            Map<Long, List<StyleBom>> resultMap = new java.util.HashMap<>();

            for (Long styleId : styleIds) {
                List<StyleBom> bomList = styleBomOrchestrator.listByStyleId(styleId);
                if (bomList != null && !bomList.isEmpty()) {
                    List<StyleBom> checkedBomList = styleBomOrchestrator.saveBomWithStockCheck(bomList, productionQty);
                    resultMap.put(styleId, checkedBomList);
                }
            }

            log.info("批量BOM库存检查完成: styleCount={}, productionQty={}",
                    styleIds.size(), productionQty);

            return Result.success(resultMap);
        } catch (Exception e) {
            log.error("批量BOM库存检查失败: styleIds={}, productionQty={}", styleIds, productionQty, e);
            return Result.fail("批量库存检查失败: " + e.getMessage());
        }
    }
}
