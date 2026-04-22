package com.fashion.supplychain.system.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.system.entity.EcPlatformConfig;
import com.fashion.supplychain.system.service.EcPlatformConfigService;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 电商平台凭证配置 Controller
 *
 * 接口路径：/api/ec-config
 *   POST  /api/ec-config/save           保存（新增或更新）某平台凭证
 *   GET   /api/ec-config/{platformCode} 获取某平台凭证
 *   GET   /api/ec-config/all            获取当前租户所有已配置平台
 *   POST  /api/ec-config/{platformCode}/disconnect 断开某平台连接
 */
@Slf4j
@RestController
@RequestMapping("/api/ec-config")
@PreAuthorize("isAuthenticated()")
public class EcPlatformConfigController {

    @Autowired
    private EcPlatformConfigService ecPlatformConfigService;

    // ——————————————————————————————————————————
    // 接口 DTO
    // ——————————————————————————————————————————

    @Data
    static class SaveRequest {
        /** 平台编码：TAOBAO / TMALL / JD / DOUYIN / PINDUODUO / XIAOHONGSHU / WECHAT_SHOP / SHOPIFY */
        private String platformCode;
        /** 店铺名称 */
        private String shopName;
        /** AppKey / Client ID / App ID */
        private String appKey;
        /** AppSecret / Client Secret */
        private String appSecret;
        /** 扩展字段，如 Shopify 店铺域名 */
        private String extraField;
    }

    @Data
    static class ConfigVO {
        private String platformCode;
        private String shopName;
        private String appKey;
        /** AppSecret 脱敏显示，仅显示前4位 */
        private String appSecretMasked;
        private String extraField;
        private String status;
        private String updatedAt;
    }

    // ——————————————————————————————————————————
    // 保存凭证（新增 or 更新）
    // ——————————————————————————————————————————

    /** RESTful 风格入口（POST /api/ec-config） */
    @PreAuthorize("isAuthenticated()")
    @PostMapping
    public Result<ConfigVO> create(@RequestBody SaveRequest req) {
        Long tenantId = UserContext.tenantId();
        if (!StringUtils.hasText(req.getPlatformCode())) {
            return Result.fail("platformCode 不能为空");
        }
        if (!StringUtils.hasText(req.getAppKey())) {
            return Result.fail("AppKey 不能为空");
        }
        EcPlatformConfig saved = ecPlatformConfigService.saveOrUpdate(
                tenantId,
                req.getPlatformCode().toUpperCase(),
                req.getShopName(),
                req.getAppKey(),
                req.getAppSecret(),
                req.getExtraField()
        );
        return Result.success(toVO(saved));
    }

    // ——————————————————————————————————————————
    // 获取单个平台凭证（脱敏）
    // ——————————————————————————————————————————

    @GetMapping("/{platformCode}")
    public Result<ConfigVO> getOne(@PathVariable String platformCode) {
        Long tenantId = UserContext.tenantId();
        EcPlatformConfig config = ecPlatformConfigService
                .getByTenantAndPlatform(tenantId, platformCode.toUpperCase());
        if (config == null) {
            return Result.success(null);
        }
        return Result.success(toVO(config));
    }

    // ——————————————————————————————————————————
    // 获取所有已配置平台（Map：platformCode → ConfigVO）
    // ——————————————————————————————————————————

    @GetMapping("/all")
    public Result<Map<String, ConfigVO>> getAll() {
        Long tenantId = UserContext.tenantId();
        List<EcPlatformConfig> list = ecPlatformConfigService.listByTenant(tenantId);
        Map<String, ConfigVO> result = list.stream()
                .collect(Collectors.toMap(EcPlatformConfig::getPlatformCode, this::toVO));
        return Result.success(result);
    }

    // ——————————————————————————————————————————
    // 断开平台连接
    // ——————————————————————————————————————————

    @PreAuthorize("isAuthenticated()")
    @PostMapping("/{platformCode}/disconnect")
    public Result<Void> disconnect(@PathVariable String platformCode) {
        Long tenantId = UserContext.tenantId();
        ecPlatformConfigService.disconnect(tenantId, platformCode.toUpperCase());
        return Result.success(null);
    }

    // ——————————————————————————————————————————
    // VO 转换：AppSecret 脱敏
    // ——————————————————————————————————————————

    private ConfigVO toVO(EcPlatformConfig config) {
        ConfigVO vo = new ConfigVO();
        vo.setPlatformCode(config.getPlatformCode());
        vo.setShopName(config.getShopName());
        vo.setAppKey(config.getAppKey());
        // AppSecret 脱敏：显示前4位 + "****"
        if (StringUtils.hasText(config.getAppSecret())) {
            String s = config.getAppSecret();
            vo.setAppSecretMasked(s.length() > 4 ? s.substring(0, 4) + "****" : "****");
        }
        vo.setExtraField(config.getExtraField());
        vo.setStatus(config.getStatus());
        if (config.getUpdatedAt() != null) {
            vo.setUpdatedAt(config.getUpdatedAt().toString());
        }
        return vo;
    }
}
