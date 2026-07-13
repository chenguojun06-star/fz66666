package com.fashion.supplychain.style.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.orchestration.StyleProcessOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.Collections;
import java.util.List;

@RestController
@RequestMapping("/api/style/process")
@PreAuthorize("isAuthenticated()")
public class StyleProcessController {

    @Autowired
    private StyleProcessOrchestrator styleProcessOrchestrator;

    @GetMapping("/list")
    public Result<List<StyleProcess>> listByStyleId(
            @RequestParam(required = false) String styleId,
            @RequestParam(required = false) String styleNo) {
        Long resolvedStyleId = StyleIdResolver.resolve(styleId, styleNo);
        if (resolvedStyleId == null) {
            return Result.success(Collections.emptyList());
        }
        return Result.success(styleProcessOrchestrator.listByStyleId(resolvedStyleId));
    }

    @PostMapping
    public Result<Boolean> save(@RequestBody StyleProcess styleProcess) {
        if (!UserContext.isSupervisorOrAbove()) {
            return Result.fail("仅主管以上可添加工序");
        }
        return Result.success(styleProcessOrchestrator.save(styleProcess));
    }

    @PutMapping
    public Result<Boolean> update(@RequestBody StyleProcess styleProcess) {
        if (!UserContext.isSupervisorOrAbove()) {
            return Result.fail("仅主管以上可修改工序");
        }
        return Result.success(styleProcessOrchestrator.update(styleProcess));
    }

    @DeleteMapping("/{id}")
    public Result<Boolean> delete(@PathVariable String id) {
        if (!UserContext.isSupervisorOrAbove()) {
            return Result.fail("仅主管以上可删除工序");
        }
        return Result.success(styleProcessOrchestrator.delete(id));
    }
}
