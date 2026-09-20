package com.fashion.supplychain.finance.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.finance.entity.EmployeeSalaryConfig;
import com.fashion.supplychain.finance.service.EmployeeSalaryConfigService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * D-474：员工薪资配置（计时/计件/固定三种类型的规则都由管理员在后台设定）。
 */
@RestController
@RequestMapping("/api/finance/salary-config")
public class EmployeeSalaryConfigController {

    @Autowired
    private EmployeeSalaryConfigService salaryConfigService;

    /** 配置列表 */
    @GetMapping("/list")
    public Result<List<EmployeeSalaryConfig>> list() {
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
        return Result.success(salaryConfigService.listConfigs(tenantId));
    }

    /** 新增或更新配置（按员工唯一） */
    @PostMapping("/save")
    public Result<EmployeeSalaryConfig> save(@RequestBody EmployeeSalaryConfig config) {
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
        return Result.success(salaryConfigService.saveConfig(config, tenantId));
    }

    /** 删除（逻辑删除） */
    @DeleteMapping("/{id}")
    public Result<Boolean> delete(@PathVariable String id) {
        return Result.success(salaryConfigService.removeById(id));
    }

    /**
     * 一键生成当月工资单：给每个配了薪资规则的员工算工资并推送成应付账单。
     * 幂等——重复调用不会重复生成（按 SALARY-员工-月份 去重）。
     */
    @PostMapping("/generate")
    public Result<Map<String, Object>> generate(@RequestParam String month) {
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
        return Result.success(salaryConfigService.generateMonthlyBills(month, tenantId));
    }

    /**
     * 试算某员工某月工资（汇总考勤后按配置计算，不落库，用于核对）
     * 例：GET /api/finance/salary-config/calculate?userId=xxx&month=2026-09
     */
    @GetMapping("/calculate")
    public Result<Map<String, Object>> calculate(@RequestParam String userId,
                                                 @RequestParam String month) {
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
        return Result.success(salaryConfigService.calculate(userId, month, tenantId));
    }
}
