package com.fashion.supplychain.system.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.system.entity.Dict;
import com.fashion.supplychain.system.orchestration.DictOrchestrator;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/system/dict")
@PreAuthorize("isAuthenticated()")
public class DictController {

    @Autowired
    private DictOrchestrator dictOrchestrator;

    @PreAuthorize("hasAuthority('MENU_SYSTEM_DICT_VIEW')")
    @GetMapping("/list")
    public Result<?> list(@RequestParam Map<String, Object> params) {
        IPage<Dict> page = dictOrchestrator.list(params);
        return Result.success(page);
    }
}
