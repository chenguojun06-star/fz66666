package com.fashion.supplychain.integration.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.integration.config.AlipayProperties;
import com.fashion.supplychain.integration.config.SFExpressProperties;
import com.fashion.supplychain.integration.config.STOProperties;
import com.fashion.supplychain.integration.config.WechatPayProperties;
import com.fashion.supplychain.integration.record.entity.IntegrationCallbackLog;
import com.fashion.supplychain.integration.record.entity.LogisticsRecord;
import com.fashion.supplychain.integration.record.entity.PaymentRecord;
import com.fashion.supplychain.integration.record.service.IntegrationRecordService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 集成对接管理面板 API
 *
 * 提供前端集成中心页面所需的所有数据：
 * - 渠道状态（哪些已接入 / Mock 模式）
 * - 支付流水分页查询
 * - 物流运单分页查询
 * - 第三方回调日志分页查询
 */
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

    // =============================================
    // 渠道状态（首屏卡片数据）
    // =============================================

    @PostMapping("/channel-status")
    public Result<Map<String, Object>> channelStatus() {
        List<Map<String, Object>> channels = new ArrayList<>();
        channels.add(buildChannel("支付宝", "PAYMENT", "ALIPAY",
                alipayProps.isEnabled(), alipayProps.isConfigured(),
                "/api/webhook/payment/alipay"));
        channels.add(buildChannel("微信支付", "PAYMENT", "WECHAT_PAY",
                wechatPayProps.isEnabled(), wechatPayProps.isConfigured(),
                "/api/webhook/payment/wechat"));
        channels.add(buildChannel("顺丰速运", "LOGISTICS", "SF",
                sfProps.isEnabled(), sfProps.isConfigured(),
                "/api/webhook/logistics/sf"));
        channels.add(buildChannel("申通快递", "LOGISTICS", "STO",
                stoProps.isEnabled(), stoProps.isConfigured(),
                "/api/webhook/logistics/sto"));

        Map<String, Object> result = new HashMap<>();
        result.put("channels", channels);
        result.put("stats", recordService.getDashboardStats());
        return Result.success(result);
    }

    private Map<String, Object> buildChannel(String name, String category, String code,
                                              boolean enabled, boolean configured, String webhookPath) {
        Map<String, Object> ch = new HashMap<>();
        ch.put("name", name);
        ch.put("category", category);
        ch.put("code", code);
        ch.put("enabled", enabled);
        ch.put("configured", configured);
        ch.put("webhookPath", webhookPath);
        // mode: LIVE(接入) / MOCK(Mock模式) / DISABLED(未启用)
        if (!enabled) {
            ch.put("mode", "DISABLED");
        } else if (!configured) {
            ch.put("mode", "MOCK");
        } else {
            ch.put("mode", "LIVE");
        }
        return ch;
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
}
