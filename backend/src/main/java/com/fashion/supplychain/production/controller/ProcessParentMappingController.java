package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.ProcessParentMapping;
import com.fashion.supplychain.production.orchestration.ProcessParentMappingOrchestrator;
import com.fashion.supplychain.production.service.ProcessParentMappingService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 工序→父节点动态映射管理接口
 * <p>
 * GET  /list   — 前端获取全部映射（用于进度球匹配）
 * POST /       — 新增映射
 * DELETE /{id} — 删除映射
 * POST /reload — 刷新内存缓存
 * </p>
 */
@RestController
@RequestMapping("/api/production/process-mapping")
@PreAuthorize("isAuthenticated()")
public class ProcessParentMappingController {

    @Autowired
    private ProcessParentMappingService mappingService;

    @Autowired
    private ProcessParentMappingOrchestrator mappingOrchestrator;

    /** 获取全部映射（前端进度球匹配使用） */
    @GetMapping("/list")
    public Result<Map<String, String>> list() {
        return Result.success(mappingService.getAllMappings());
    }

    /** 新增映射 */
    @PostMapping
    public Result<String> create(@RequestBody ProcessParentMapping mapping) {
        ProcessParentMapping created = mappingOrchestrator.create(mapping);
        return Result.success("已添加: " + created.getProcessKeyword() + " → " + created.getParentNode());
    }

    /** 删除映射 */
    @DeleteMapping("/{id}")
    public Result<String> delete(@PathVariable Long id) {
        mappingOrchestrator.delete(id);
        return Result.success("已删除");
    }

    /** 手动刷新缓存 */
    @PostMapping("/reload")
    public Result<String> reload() {
        mappingService.reload();
        return Result.success("缓存已刷新，当前 " + mappingService.getAllMappings().size() + " 条映射");
    }
}
