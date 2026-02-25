package com.fashion.supplychain.style.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.orchestration.StyleBomOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/style/bom")
@PreAuthorize("isAuthenticated()")
public class StyleBomController {

    @Autowired
    private StyleBomOrchestrator styleBomOrchestrator;

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

    /**
     * 统一的物料数据库同步端点（替代2个分散端点）
     *
     * @param styleId 款式ID
     * @param force 是否强制更新已完成状态（0/1/true/false/yes/no）
     * @param async 是否异步执行（true=异步，false=同步，默认false）
     * @return 同步结果或任务ID
     */
    @PostMapping("/{styleId}/sync-material-database")
    public Result<Map<String, Object>> syncMaterialDatabase(
            @PathVariable Long styleId,
            @RequestParam(required = false, defaultValue = "0") String force,
            @RequestParam(required = false, defaultValue = "false") boolean async) {

        boolean forceUpdateCompleted = force != null
                && ("1".equals(force.trim()) || "true".equalsIgnoreCase(force.trim()) || "yes".equalsIgnoreCase(force.trim()));

        // 智能路由：根据async参数选择同步或异步执行
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

    /**
     * 根据BOM配置手动生成物料采购记录
     * 用于样衣开发阶段的物料采购
     * @param force 是否强制重新生成（先软删除已有记录）
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

            // 2. 检查库存并更新状态（通过Orchestrator编排跨模块逻辑）
            List<StyleBom> checkedBomList = styleBomOrchestrator.saveBomWithStockCheck(bomList, productionQty);

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
            Map<String, Object> summary = styleBomOrchestrator.getBomStockSummary(styleId, productionQty);

            log.debug("✅ BOM库存汇总查询成功: styleId={}, productionQty={}", styleId, productionQty);

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
                    List<StyleBom> checkedBomList = styleBomOrchestrator.saveBomWithStockCheck(bomList, productionQty);
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
