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
@PreAuthorize("isAuthenticated()")
public class FinishedInventoryController {

    private final FinishedInventoryOrchestrator finishedInventoryOrchestrator;

    /**
     * 分页查询成品库存
     *
     * @param params 查询参数
     * @return 分页结果
     */
    @PreAuthorize("hasAuthority('MENU_WAREHOUSE')")
    @PostMapping("/list")
    public Result<IPage<FinishedInventoryDTO>> list(@RequestBody Map<String, Object> params) {
        IPage<FinishedInventoryDTO> page = finishedInventoryOrchestrator.getFinishedInventoryPage(params);
        return Result.success(page);
    }

    /**
     * 兼容GET方式的查询（适配标准列表组件）
     */
    @PreAuthorize("hasAuthority('MENU_WAREHOUSE')")
    @GetMapping("/list")
    public Result<IPage<FinishedInventoryDTO>> listGet(@RequestParam Map<String, Object> params) {
        IPage<FinishedInventoryDTO> page = finishedInventoryOrchestrator.getFinishedInventoryPage(params);
        return Result.success(page);
    }
}
