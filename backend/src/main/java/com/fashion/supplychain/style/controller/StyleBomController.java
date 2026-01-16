package com.fashion.supplychain.style.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.orchestration.StyleBomOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/style/bom")
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
}
