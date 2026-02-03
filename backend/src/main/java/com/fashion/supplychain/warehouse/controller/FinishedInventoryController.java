package com.fashion.supplychain.warehouse.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.warehouse.dto.FinishedInventoryDTO;
import com.fashion.supplychain.warehouse.orchestration.FinishedInventoryOrchestrator;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 成品库存管理Controller
 */
@RestController
@RequestMapping("/api/warehouse/finished-inventory")
@RequiredArgsConstructor
public class FinishedInventoryController {

    private final FinishedInventoryOrchestrator finishedInventoryOrchestrator;

    /**
     * 分页查询成品库存
     *
     * @param params 查询参数
     * @return 分页结果
     */
    @PostMapping("/list")
    // @PreAuthorize("hasAuthority('MENU_WAREHOUSE')") // TODO: 临时移除权限检查，用于测试
    public Result<IPage<FinishedInventoryDTO>> list(@RequestBody Map<String, Object> params) {
        IPage<FinishedInventoryDTO> page = finishedInventoryOrchestrator.getFinishedInventoryPage(params);
        return Result.success(page);
    }

    /**
     * 兼容GET方式的查询（适配标准列表组件）
     */
    @GetMapping("/list")
    // @PreAuthorize("hasAuthority('MENU_WAREHOUSE')") // TODO: 临时移除权限检查，用于测试
    public Result<IPage<FinishedInventoryDTO>> listGet(@RequestParam Map<String, Object> params) {
        IPage<FinishedInventoryDTO> page = finishedInventoryOrchestrator.getFinishedInventoryPage(params);
        return Result.success(page);
    }
}
