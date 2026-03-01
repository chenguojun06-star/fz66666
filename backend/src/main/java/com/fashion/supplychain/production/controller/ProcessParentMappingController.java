package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.ProcessParentMapping;
import com.fashion.supplychain.production.mapper.ProcessParentMappingMapper;
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
    private ProcessParentMappingMapper mappingMapper;

    /** 获取全部映射（前端进度球匹配使用） */
    @GetMapping("/list")
    public Result<Map<String, String>> list() {
        return Result.success(mappingService.getAllMappings());
    }

    /** 新增映射 */
    @PostMapping
    public Result<String> create(@RequestBody ProcessParentMapping mapping) {
        if (mapping.getProcessKeyword() == null || mapping.getProcessKeyword().trim().isEmpty()) {
            return Result.fail("processKeyword 不能为空");
        }
        if (mapping.getParentNode() == null || mapping.getParentNode().trim().isEmpty()) {
            return Result.fail("parentNode 不能为空");
        }
        mapping.setProcessKeyword(mapping.getProcessKeyword().trim());
        mapping.setParentNode(mapping.getParentNode().trim());
        mappingMapper.insert(mapping);
        mappingService.reload();
        return Result.success("已添加: " + mapping.getProcessKeyword() + " → " + mapping.getParentNode());
    }

    /** 删除映射 */
    @DeleteMapping("/{id}")
    public Result<String> delete(@PathVariable Long id) {
        mappingMapper.deleteById(id);
        mappingService.reload();
        return Result.success("已删除");
    }

    /** 手动刷新缓存 */
    @PostMapping("/reload")
    public Result<String> reload() {
        mappingService.reload();
        return Result.success("缓存已刷新，当前 " + mappingService.getAllMappings().size() + " 条映射");
    }
}
