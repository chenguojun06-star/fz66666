package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.orchestration.ProductWarehousingOrchestrator;
import com.baomidou.mybatisplus.core.metadata.IPage;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/production/warehousing")
public class ProductWarehousingController {

    @Autowired
    private ProductWarehousingOrchestrator productWarehousingOrchestrator;

    @GetMapping("/list")
    public Result<?> list(@RequestParam Map<String, Object> params) {
        IPage<ProductWarehousing> page = productWarehousingOrchestrator.list(params);
        return Result.success(page);
    }

    @GetMapping("/{id}")
    public Result<ProductWarehousing> getById(@PathVariable String id) {
        return Result.success(productWarehousingOrchestrator.getById(id));
    }

    @PostMapping
    public Result<Boolean> save(@RequestBody ProductWarehousing productWarehousing) {
        return Result.success(productWarehousingOrchestrator.save(productWarehousing));
    }

    @PostMapping("/batch")
    public Result<?> batchSave(@RequestBody Map<String, Object> body) {
        return Result.success(productWarehousingOrchestrator.batchSave(body));
    }

    @PutMapping
    public Result<Boolean> update(@RequestBody ProductWarehousing productWarehousing) {
        return Result.success(productWarehousingOrchestrator.update(productWarehousing));
    }

    @DeleteMapping("/{id}")
    public Result<Boolean> delete(@PathVariable String id) {
        return Result.success(productWarehousingOrchestrator.delete(id));
    }

    @PostMapping("/rollback-by-bundle")
    public Result<?> rollbackByBundle(@RequestBody Map<String, Object> body) {
        return Result.success(productWarehousingOrchestrator.rollbackByBundle(body));
    }

    /**
     * 统一的报修统计端点（支持单个和批量）
     *
     * @param params 查询参数（GET方式，用于单个查询）
     * @param body 请求体（POST方式，用于批量查询）
     * @return 统计结果
     */
    @RequestMapping(value = "/repair-stats", method = {RequestMethod.GET, RequestMethod.POST})
    public Result<?> repairStats(
            @RequestParam(required = false) Map<String, Object> params,
            @RequestBody(required = false) Map<String, Object> body) {

        // 智能路由：根据请求方式和参数选择单个或批量处理
        if (body != null && !body.isEmpty()) {
            // POST请求 + body存在 = 批量处理
            return Result.success(productWarehousingOrchestrator.batchRepairStats(body));
        } else {
            // GET请求或POST无body = 单个处理
            return Result.success(productWarehousingOrchestrator.repairStats(params != null ? params : body));
        }
    }

    /**
     * @deprecated 请使用 POST /repair-stats（统一端点支持批量）
     * 将在 2026-05-01 移除
     */
    @Deprecated
    @PostMapping("/repair-stats/batch")
    public Result<?> batchRepairStats(@RequestBody Map<String, Object> body) {
        return repairStats(null, body);
    }
}
