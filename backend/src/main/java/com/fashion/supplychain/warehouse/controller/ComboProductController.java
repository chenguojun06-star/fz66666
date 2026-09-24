package com.fashion.supplychain.warehouse.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.warehouse.dto.ComboProductVO;
import com.fashion.supplychain.warehouse.orchestration.ComboProductOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * D-529：组合商品（套装）——把任意两个及以上不同款式的 SKU 组合成一个组合SKU。
 * 销售/出库走 /api/warehouse/finished-inventory/combo-outbound：销售记录挂组合SKU，
 * 实际库存按子SKU逐个扣减（每个子SKU一行出库记录，共一张出库单号）。
 */
@RestController
@RequestMapping("/api/combo-product")
@PreAuthorize("isAuthenticated()")
public class ComboProductController {

    @Autowired
    private ComboProductOrchestrator comboProductOrchestrator;

    /** 分页列表（keyword 命中组合编码/名称/简码及子商品款号/款名/商品编码） */
    @PostMapping("/list")
    public Result<IPage<ComboProductVO>> list(@RequestBody Map<String, Object> params) {
        return Result.success(comboProductOrchestrator.pageList(params));
    }

    /** 详情（含子项明细与可用库存） */
    @GetMapping("/{id}")
    public Result<ComboProductVO> detail(@PathVariable Long id) {
        return Result.success(comboProductOrchestrator.getDetail(id));
    }

    /** 创建组合商品 */
    @PostMapping("/create")
    public Result<ComboProductVO> create(@RequestBody Map<String, Object> body) {
        return Result.success(comboProductOrchestrator.create(body));
    }

    /** 更新组合商品（items 传入时整组替换子项） */
    @PostMapping("/update")
    public Result<ComboProductVO> update(@RequestBody Map<String, Object> body) {
        Object idObj = body.get("id");
        if (idObj == null) {
            return Result.badRequest("缺少组合商品ID");
        }
        return Result.success(comboProductOrchestrator.update(Long.parseLong(String.valueOf(idObj)), body));
    }

    /** 删除（逻辑删除，子项一并删除） */
    @PostMapping("/delete")
    public Result<Boolean> delete(@RequestBody Map<String, Object> body) {
        Object idObj = body.get("id");
        if (idObj == null) {
            return Result.badRequest("缺少组合商品ID");
        }
        comboProductOrchestrator.remove(Long.parseLong(String.valueOf(idObj)));
        return Result.success(true);
    }

    /** 启用/停用 */
    @PostMapping("/set-status")
    public Result<Boolean> setStatus(@RequestBody Map<String, Object> body) {
        Object idObj = body.get("id");
        Object status = body.get("status");
        if (idObj == null || status == null) {
            return Result.badRequest("缺少参数");
        }
        comboProductOrchestrator.setStatus(Long.parseLong(String.valueOf(idObj)), String.valueOf(status));
        return Result.success(true);
    }

    /** 套装出库选择器：启用中的组合 + 子项明细 + 可用库存 */
    @PostMapping("/options")
    public Result<List<ComboProductVO>> options(@RequestBody Map<String, Object> params) {
        return Result.success(comboProductOrchestrator.options(params));
    }
}
