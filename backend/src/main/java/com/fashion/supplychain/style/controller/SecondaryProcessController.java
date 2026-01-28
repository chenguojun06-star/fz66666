package com.fashion.supplychain.style.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.style.entity.SecondaryProcess;
import com.fashion.supplychain.style.service.SecondaryProcessService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 二次工艺Controller
 */
@Tag(name = "二次工艺管理")
@RestController
@RequestMapping("/api/style/secondary-process")
@RequiredArgsConstructor
public class SecondaryProcessController {

    private final SecondaryProcessService secondaryProcessService;

    @Operation(summary = "根据款号ID查询二次工艺列表")
    @GetMapping("/list")
    public Result<List<SecondaryProcess>> listByStyleId(@RequestParam Long styleId) {
        List<SecondaryProcess> list = secondaryProcessService.listByStyleId(styleId);
        return Result.success(list);
    }

    @Operation(summary = "根据ID查询二次工艺")
    @GetMapping("/{id}")
    public Result<SecondaryProcess> getById(@PathVariable Long id) {
        SecondaryProcess process = secondaryProcessService.getById(id);
        return Result.success(process);
    }

    @Operation(summary = "新建二次工艺")
    @PostMapping
    public Result<SecondaryProcess> create(@RequestBody SecondaryProcess process) {
        secondaryProcessService.save(process);
        return Result.success(process);
    }

    @Operation(summary = "更新二次工艺")
    @PutMapping("/{id}")
    public Result<SecondaryProcess> update(@PathVariable Long id, @RequestBody SecondaryProcess process) {
        process.setId(id);
        secondaryProcessService.updateById(process);
        return Result.success(process);
    }

    @Operation(summary = "删除二次工艺")
    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable Long id) {
        secondaryProcessService.removeById(id);
        return Result.success(null);
    }
}
