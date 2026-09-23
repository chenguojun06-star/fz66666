package com.fashion.supplychain.integration.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.integration.config.AlipayProperties;
import com.fashion.supplychain.integration.config.SFExpressProperties;
import com.fashion.supplychain.integration.config.STOProperties;
import com.fashion.supplychain.integration.config.WechatPayProperties;
import com.fashion.supplychain.integration.logistics.LogisticsService;
import com.fashion.supplychain.integration.record.entity.IntegrationCallbackLog;
import com.fashion.supplychain.integration.record.entity.IntegrationChannelConfig;
import com.fashion.supplychain.integration.record.entity.LogisticsRecord;
import com.fashion.supplychain.integration.record.entity.PaymentRecord;
import com.fashion.supplychain.integration.record.service.IntegrationRecordService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.*;

/**
 * 集成对接管理面板 API
 *
 * 提供前端集成中心页面所需的所有数据：
 * - 渠道状态（哪些已接入 / Mock 模式）
 * - 渠道配置（保存/读取 API 密钥）
 * - 支付流水分页查询
 * - 物流运单分页查询
 * - 第三方回调日志分页查询
 */
@Slf4j
@RestController
@RequestMapping("/api/integration")
@PreAuthorize("isAuthenticated()")
@RequiredArgsConstructor
public class IntegrationDashboardController {

    private final AlipayProperties alipayProps;
    private final WechatPayProperties wechatPayProps;
    private final SFExpressProperties sfProps;
    private final STOProperties stoProps;
    private final IntegrationRecordService recordService;
    private final com.fashion.supplychain.integration.orchestration.ChannelConfigOrchestrator channelConfigOrchestrator;

    /** 物流渠道实现（用于判断该渠道是否已真正接入第三方API） */
    private final List<LogisticsService> logisticsServices;

    /**
     * 渠道元数据定义。
     *
     * <p>物流渠道的 {@code webhook} 只有在<b>回调端点真实存在</b>时才填写——
     * 未建端点却对外展示回调地址，会让运营误以为配好地址就能收到推送。
     */
    private static final List<Map<String, String>> CHANNEL_META = List.of(
            Map.of("name", "支付宝", "category", "PAYMENT", "code", "ALIPAY", "webhook", "/api/webhook/payment/alipay"),
            Map.of("name", "微信支付", "category", "PAYMENT", "code", "WECHAT_PAY", "webhook", "/api/webhook/payment/wechat"),
            Map.of("name", "顺丰速运", "category", "LOGISTICS", "code", "SF", "webhook", "/api/webhook/logistics/sf"),
            Map.of("name", "申通快递", "category", "LOGISTICS", "code", "STO", "webhook", "/api/webhook/logistics/sto"),
            // 以下 6 家尚未建回调端点，webhook 留空；接入时补端点再填地址
            Map.of("name", "圆通速递", "category", "LOGISTICS", "code", "YTO", "webhook", ""),
            Map.of("name", "中通快递", "category", "LOGISTICS", "code", "ZTO", "webhook", ""),
            Map.of("name", "中国邮政", "category", "LOGISTICS", "code", "EMS", "webhook", ""),
            Map.of("name", "京东物流", "category", "LOGISTICS", "code", "JD", "webhook", ""),
            Map.of("name", "韵达快递", "category", "LOGISTICS", "code", "YD", "webhook", ""),
            Map.of("name", "极兔速递", "category", "LOGISTICS", "code", "JT", "webhook", "")
    );

    // =============================================
    // 渠道状态（首屏卡片数据）
    // =============================================

    @PostMapping("/channel-status")
    public Result<Map<String, Object>> channelStatus() {
        Long tenantId = UserContext.tenantId();
        // 加载该租户的所有渠道配置
        Map<String, IntegrationChannelConfig> dbConfigs = loadDbConfigs(tenantId);

        List<Map<String, Object>> channels = new ArrayList<>();
        for (Map<String, String> meta : CHANNEL_META) {
            String code = meta.get("code");
            IntegrationChannelConfig dbCfg = dbConfigs.get(code);

            // 优先：DB 配置 > yml 配置
            boolean enabled;
            boolean configured;
            if (dbCfg != null) {
                enabled = Boolean.TRUE.equals(dbCfg.getEnabled());
                configured = enabled && hasText(dbCfg.getAppId());
            } else {
                enabled = isYmlEnabled(code);
                configured = isYmlConfigured(code);
            }

            channels.add(buildChannel(meta.get("name"), meta.get("category"), code,
                    enabled, configured, meta.get("webhook"), dbCfg != null,
                    isLogisticsImplemented(code)));
        }

        Map<String, Object> result = new HashMap<>();
        result.put("channels", channels);
        result.put("stats", recordService.getDashboardStats());
        return Result.success(result);
    }

    /**
     * 物流渠道是否已真正接入第三方 API。
     *
     * <p>非物流渠道返回 {@code true}（不受此维度约束）；物流渠道以适配器的
     * {@code isRealImplementation()} 为准——它表示"真实调用代码是否已写好"，
     * 与"密钥是否填了"是两件事。
     */
    private boolean isLogisticsImplemented(String code) {
        if (logisticsServices == null) return false;
        return logisticsServices.stream()
                .filter(s -> s.getLogisticsType() != null && code.equals(s.getLogisticsType().name()))
                .findFirst()
                .map(LogisticsService::isRealImplementation)
                .orElse(true); // 未登记为物流渠道 → 不适用该维度
    }

    private boolean isYmlEnabled(String code) {
        switch (code) {
            case "ALIPAY": return alipayProps.isEnabled();
            case "WECHAT_PAY": return wechatPayProps.isEnabled();
            case "SF": return sfProps.isEnabled();
            case "STO": return stoProps.isEnabled();
            default: return false;
        }
    }

    private boolean isYmlConfigured(String code) {
        switch (code) {
            case "ALIPAY": return alipayProps.isConfigured();
            case "WECHAT_PAY": return wechatPayProps.isConfigured();
            case "SF": return sfProps.isConfigured();
            case "STO": return stoProps.isConfigured();
            default: return false;
        }
    }

    private Map<String, IntegrationChannelConfig> loadDbConfigs(Long tenantId) {
        if (tenantId == null) return Collections.emptyMap();
        try {
            List<IntegrationChannelConfig> list = channelConfigOrchestrator.selectList(
                    new LambdaQueryWrapper<IntegrationChannelConfig>()
                            .eq(IntegrationChannelConfig::getTenantId, tenantId));
            Map<String, IntegrationChannelConfig> map = new HashMap<>();
            for (IntegrationChannelConfig cfg : list) {
                map.put(cfg.getChannelCode(), cfg);
            }
            return map;
        } catch (Exception e) {
            // 表不存在时降级，不影响页面加载
            log.warn("加载渠道配置失败(表可能不存在): {}", e.getMessage());
            return Collections.emptyMap();
        }
    }

    private Map<String, Object> buildChannel(String name, String category, String code,
                                              boolean enabled, boolean configured, String webhookPath,
                                              boolean hasDbConfig, boolean implemented) {
        Map<String, Object> ch = new HashMap<>();
        ch.put("name", name);
        ch.put("category", category);
        ch.put("code", code);
        ch.put("enabled", enabled);
        ch.put("configured", configured);
        ch.put("webhookPath", webhookPath);
        ch.put("hasDbConfig", hasDbConfig);
        ch.put("implemented", implemented);
        ch.put("mode", resolveMode(category, enabled, configured, implemented));
        return ch;
    }

    /**
     * 渠道状态判定。
     *
     * <p><b>关键点</b>：物流渠道"填了密钥"≠"能用"。适配器没实现真实调用时，
     * 调用会被 {@code LogisticsManager} 守卫拒绝——所以物流渠道必须先看 {@code implemented}，
     * 且该判断优先于 enabled（即便渠道是禁用的，"接口未接入"也是更重要的信息，
     * 否则运营会以为"开启开关就能用"）。
     *
     * <p>支付渠道保留了真实的 Mock 模式（密钥未配置时返回 MOCK_ 前缀的模拟响应），
     * 故沿用 DISABLED / MOCK / LIVE 三态。
     */
    private static String resolveMode(String category, boolean enabled, boolean configured, boolean implemented) {
        boolean logistics = "LOGISTICS".equals(category);
        if (logistics && !implemented) {
            return "NOT_IMPLEMENTED";
        }
        if (!enabled) {
            return "DISABLED";
        }
        if (!configured) {
            return logistics ? "NOT_CONFIGURED" : "MOCK";
        }
        return "LIVE";
    }

    // =============================================
    // 渠道配置 CRUD（前端界面开通）
    // =============================================

    /**
     * 获取单个渠道配置（脱敏返回）
     */
    @GetMapping("/channel-config/{channelCode}")
    public Result<Map<String, Object>> getChannelConfig(@PathVariable String channelCode) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) return Result.fail("未登录");

        try {
            IntegrationChannelConfig cfg = channelConfigOrchestrator.selectOne(
                    new LambdaQueryWrapper<IntegrationChannelConfig>()
                            .eq(IntegrationChannelConfig::getTenantId, tenantId)
                            .eq(IntegrationChannelConfig::getChannelCode, channelCode)
                            .last("LIMIT 1"));

            Map<String, Object> data = new HashMap<>();
            if (cfg != null) {
                data.put("channelCode", cfg.getChannelCode());
                data.put("enabled", cfg.getEnabled());
                data.put("appId", cfg.getAppId());
                // 密钥脱敏：只显示前4位和后4位
                data.put("appSecret", maskSecret(cfg.getAppSecret()));
                data.put("privateKey", maskSecret(cfg.getPrivateKey()));
                data.put("publicKey", maskSecret(cfg.getPublicKey()));
                data.put("notifyUrl", cfg.getNotifyUrl());
                data.put("extraConfig", cfg.getExtraConfig());
                data.put("hasConfig", true);
                // 标记哪些字段已填写（不返回原文）
                data.put("hasAppSecret", hasText(cfg.getAppSecret()));
                data.put("hasPrivateKey", hasText(cfg.getPrivateKey()));
                data.put("hasPublicKey", hasText(cfg.getPublicKey()));
            } else {
                data.put("channelCode", channelCode);
                data.put("enabled", false);
                data.put("hasConfig", false);
            }
            return Result.success(data);
        } catch (Exception e) {
            log.warn("获取渠道配置失败: {}", e.getMessage());
            return Result.success(Map.of("channelCode", channelCode, "enabled", false, "hasConfig", false));
        }
    }

    /**
     * 保存/更新渠道配置（upsert）
     * POST /api/integration/channel-config  body: { "channelCode": "xxx", ... }
     */
    @PostMapping("/channel-config")
    public Result<String> upsertChannelConfig(@RequestBody Map<String, Object> params) {
        return doSaveChannelConfig(params);
    }

    /** @deprecated 使用 POST /channel-config 替代 */
    @Deprecated // 计划于 2026-08-10 移除，请使用新端点替代
    @PostMapping("/channel-config/save")
    public Result<String> saveChannelConfig(@RequestBody Map<String, Object> params) {
        return doSaveChannelConfig(params);
    }

    private Result<String> doSaveChannelConfig(Map<String, Object> params) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) return Result.fail("未登录");

        String channelCode = (String) params.get("channelCode");
        if (!hasText(channelCode)) return Result.fail("渠道编码不能为空");

        Boolean enabled = (Boolean) params.getOrDefault("enabled", false);
        String appId = (String) params.get("appId");
        String appSecret = (String) params.get("appSecret");
        String privateKey = (String) params.get("privateKey");
        String publicKey = (String) params.get("publicKey");
        String notifyUrl = (String) params.get("notifyUrl");
        String extraConfig = (String) params.get("extraConfig");

        try {
            IntegrationChannelConfig existing = channelConfigOrchestrator.selectOne(
                    new LambdaQueryWrapper<IntegrationChannelConfig>()
                            .eq(IntegrationChannelConfig::getTenantId, tenantId)
                            .eq(IntegrationChannelConfig::getChannelCode, channelCode)
                            .last("LIMIT 1"));

            if (existing != null) {
                // 更新：只更新非空字段（密钥字段传空字符串=不修改）
                existing.setEnabled(enabled);
                if (hasText(appId)) existing.setAppId(appId);
                if (hasText(appSecret)) existing.setAppSecret(appSecret);
                if (hasText(privateKey)) existing.setPrivateKey(privateKey);
                if (hasText(publicKey)) existing.setPublicKey(publicKey);
                if (notifyUrl != null) existing.setNotifyUrl(notifyUrl);
                if (extraConfig != null) existing.setExtraConfig(extraConfig);
                existing.setUpdateTime(LocalDateTime.now());
                channelConfigOrchestrator.updateById(existing);
                log.info("更新渠道配置: tenant={}, channel={}, enabled={}", tenantId, channelCode, enabled);
            } else {
                // 新增
                IntegrationChannelConfig cfg = IntegrationChannelConfig.builder()
                        .tenantId(tenantId)
                        .channelCode(channelCode)
                        .enabled(enabled)
                        .appId(appId)
                        .appSecret(appSecret)
                        .privateKey(privateKey)
                        .publicKey(publicKey)
                        .notifyUrl(notifyUrl)
                        .extraConfig(extraConfig)
                        .createTime(LocalDateTime.now())
                        .updateTime(LocalDateTime.now())
                        .deleteFlag(0)
                        .build();
                channelConfigOrchestrator.insert(cfg);
                log.info("新增渠道配置: tenant={}, channel={}, enabled={}", tenantId, channelCode, enabled);
            }

            return Result.success("保存成功");
        } catch (Exception e) {
            log.error("保存渠道配置失败: {}", e.getMessage(), e);
            return Result.fail("保存失败: " + e.getMessage());
        }
    }

    // =============================================
    // 支付流水分页
    // =============================================

    @PostMapping("/payment-records/list")
    public Result<IPage<PaymentRecord>> paymentRecordList(@RequestBody Map<String, Object> params) {
        return Result.success(recordService.getPaymentRecordsPage(params));
    }

    // =============================================
    // 物流运单分页
    // =============================================

    @PostMapping("/logistics-records/list")
    public Result<IPage<LogisticsRecord>> logisticsRecordList(@RequestBody Map<String, Object> params) {
        return Result.success(recordService.getLogisticsRecordsPage(params));
    }

    // =============================================
    // 回调日志分页
    // =============================================

    @PostMapping("/callback-logs/list")
    public Result<IPage<IntegrationCallbackLog>> callbackLogList(@RequestBody Map<String, Object> params) {
        return Result.success(recordService.getCallbackLogsPage(params));
    }

    // =============================================
    // 工具方法
    // =============================================

    private static boolean hasText(String s) {
        return s != null && !s.isBlank();
    }

    /** 密钥脱敏：显示前4位...后4位 */
    private static String maskSecret(String secret) {
        if (secret == null || secret.length() <= 8) return secret == null ? null : "****";
        return secret.substring(0, 4) + "****" + secret.substring(secret.length() - 4);
    }
}
