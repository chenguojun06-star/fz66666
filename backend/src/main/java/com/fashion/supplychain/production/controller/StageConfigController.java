package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.BusinessException;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.StageConfig;
import com.fashion.supplychain.production.orchestration.StageConfigOrchestrator;
import com.fashion.supplychain.production.service.StageConfigService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 生产环节配置（可操作人 + 预计时长 + 监控开关）
 * <ul>
 *   <li>GET：读取生效配置（PC配置页 + 小程序/H5 只读展示共用）</li>
 *   <li>PUT：保存（仅顶级管理员）</li>
 * </ul>
 */
@Slf4j
@RestController
@RequestMapping("/api/production/stage-config")
@PreAuthorize("isAuthenticated()")
public class StageConfigController {

    @Autowired
    private StageConfigService stageConfigService;

    @Autowired
    private StageConfigOrchestrator stageConfigOrchestrator;

    /** 读取全部生效环节配置（按固定顺序：采购/裁剪/二次工艺/车缝/尾部/入库） */
    @GetMapping
    public Result<List<StageConfig>> list() {
        return Result.success(stageConfigService.getEffectiveConfigs());
    }

    /** 保存环节配置（整表覆盖式，仅顶级管理员可操作） */
    @PutMapping
    @PreAuthorize("isAuthenticated()")
    public Result<Void> save(@RequestBody List<StageConfig> configs) {
        if (!UserContext.isTopAdmin()) {
            throw new BusinessException("无权限修改环节配置，仅管理员可操作");
        }
        stageConfigOrchestrator.save(configs);
        return Result.successMessage("环节配置已保存");
    }
}