package com.fashion.supplychain.system.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.system.orchestration.SerialOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/system/serial")
@PreAuthorize("isAuthenticated()")
public class SerialController {

    @Autowired
    private SerialOrchestrator serialOrchestrator;

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/generate")
    public Result<String> generate(@RequestParam(required = false) String ruleCode) {
        return Result.success(serialOrchestrator.generate(ruleCode));
    }
}
