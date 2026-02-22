package com.fashion.supplychain.system.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.system.entity.Dict;
import com.fashion.supplychain.system.orchestration.DictOrchestrator;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/system/dict")
@PreAuthorize("isAuthenticated()")
public class DictController {

    @Autowired
    private DictOrchestrator dictOrchestrator;

    @GetMapping("/list")
    public Result<?> list(@RequestParam Map<String, Object> params) {
        IPage<Dict> page = dictOrchestrator.list(params);
        return Result.success(page);
    }

    @PostMapping
    public Result<?> create(@RequestBody Dict dict) {
        return Result.success(dictOrchestrator.create(dict));
    }

    @PutMapping("/{id}")
    public Result<?> update(@PathVariable Long id, @RequestBody Dict dict) {
        return Result.success(dictOrchestrator.update(id, dict));
    }

    @DeleteMapping("/{id}")
    public Result<?> delete(@PathVariable Long id) {
        dictOrchestrator.delete(id);
        return Result.success("删除成功");
    }
}
