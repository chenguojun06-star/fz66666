package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.BusinessException;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.StageConfig;
import com.fashion.supplychain.production.mapper.StageConfigMapper;
import com.fashion.supplychain.production.service.StageConfigService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;

/**
 * 环节配置编排（D-001：事务边界在 Orchestrator 层）
 * <p>
 * 保存写入「当前租户覆盖层」（tenant_id = 当前租户），生效时合并系统默认。
 * 仅顶级管理员可保存，保证配置受控。
 * </p>
 */
@Slf4j
@Service
public class StageConfigOrchestrator {

    @Autowired
    private StageConfigMapper stageConfigMapper;

    @Autowired
    private StageConfigService stageConfigService;

    /** 合法父环节名 */
    private static final java.util.Set<String> VALID_STAGES = java.util.Collections.unmodifiableSet(
            new java.util.LinkedHashSet<>(java.util.Arrays.asList("采购", "裁剪", "二次工艺", "车缝", "尾部", "入库")));

    /**
     * 保存环节配置（整表覆盖式 upsert 到当前租户覆盖层）。
     *
     * @param configs 前端提交的配置列表，使用字段：stageName / expectedDays / operatorsJson / monitorSwitch
     */
    @Transactional(rollbackFor = Exception.class)
    public void save(List<StageConfig> configs) {
        UserContext ctx = UserContext.get();
        if (ctx == null || !UserContext.isTopAdmin()) {
            throw new BusinessException("无权限修改环节配置，仅管理员可操作");
        }
        if (configs == null || configs.isEmpty()) {
            throw new BusinessException("配置列表不能为空");
        }
        Long tenantId = TenantAssert.requireTenantId();
        for (StageConfig cfg : configs) {
            if (cfg.getStageName() == null || !VALID_STAGES.contains(cfg.getStageName().trim())) {
                throw new BusinessException("非法环节名: " + cfg.getStageName());
            }
            String stageName = cfg.getStageName().trim();
            BigDecimal days = StageConfigService.toDays(cfg.getExpectedDays());
            if (days.signum() < 0) {
                throw new BusinessException("预计时长不能为负数: " + stageName);
            }
            String operatorsJson = cfg.getOperatorsJson();
            Integer monitorSwitch = cfg.getMonitorSwitch() == null ? 1 : cfg.getMonitorSwitch();

            StageConfig existing = stageConfigMapper.selectOne(new LambdaQueryWrapper<StageConfig>()
                    .eq(StageConfig::getTenantId, tenantId)
                    .eq(StageConfig::getStageName, stageName));
            int defaultStage = resolveDefaultStage(stageName);
            if (existing != null) {
                existing.setExpectedDays(days);
                existing.setOperatorsJson(operatorsJson);
                existing.setMonitorSwitch(monitorSwitch);
                existing.setEnabled(1);
                existing.setDeleteFlag(0);
                existing.setDefaultStage(defaultStage);
                stageConfigMapper.updateById(existing);
            } else {
                StageConfig fresh = new StageConfig();
                fresh.setTenantId(tenantId);
                fresh.setStageName(stageName);
                fresh.setExpectedDays(days);
                fresh.setOperatorsJson(operatorsJson);
                fresh.setMonitorSwitch(monitorSwitch);
                fresh.setDefaultStage(defaultStage);
                fresh.setEnabled(1);
                fresh.setDeleteFlag(0);
                stageConfigMapper.insert(fresh);
            }
        }
        stageConfigService.reload(tenantId);
        log.info("[StageConfig] 管理员保存环节配置完成 tenantId={} 共{}项", tenantId, configs.size());
    }

    private int resolveDefaultStage(String stageName) {
        // 从系统默认行继承 default_stage（采购/入库=1）
        StageConfig sys = stageConfigMapper.selectOne(new LambdaQueryWrapper<StageConfig>()
                .isNull(StageConfig::getTenantId)
                .eq(StageConfig::getStageName, stageName));
        if (sys != null && sys.getDefaultStage() != null) {
            return sys.getDefaultStage();
        }
        return "采购".equals(stageName) || "入库".equals(stageName) ? 1 : 0;
    }
}