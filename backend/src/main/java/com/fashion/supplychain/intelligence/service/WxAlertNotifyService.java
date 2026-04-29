package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.mapper.UserMapper;
import com.fashion.supplychain.wechat.client.WeChatMiniProgramClient;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 微信订阅消息推送 — 逾期/停滞/风险等预警主动推给跟单员与工厂主账号。
 * 推送前提：用户已在小程序内订阅对应模板，且 t_user.openid 已存入。
 */
@Slf4j
@Service
public class WxAlertNotifyService {

    @Autowired
    private WeChatMiniProgramClient wxClient;

    @Autowired
    private UserMapper userMapper;

    /** 微信公众平台申请的订阅消息模板 ID（3个文本变量：thing1标题/thing2订单号/thing3内容） */
    @Value("${wechat.mini-program.alert-template-id:}")
    private String alertTemplateId;

    /** access_token 内存缓存（有效期 90 分钟） */
    private volatile String cachedToken = null;
    private volatile long   tokenExpireAt = 0L;

    /**
     * 向租户下所有跟单员与工厂主账号推送预警订阅消息。
     *
     * @param tenantId  租户 ID
     * @param title     消息标题（thing1）
     * @param content   消息内容（thing3）
     * @param orderNo   相关订单号（thing2），可为 null
     * @param page      跳转小程序页面路径，null 时默认 pages/order/index
     */
    public void notifyAlert(Long tenantId, String title, String content,
                            String orderNo, String page) {
        if (!StringUtils.hasText(alertTemplateId)) {
            log.debug("[WxAlert] alert-template-id 未配置，跳过微信推送");
            return;
        }
        String token = getOrRefreshToken();
        if (!StringUtils.hasText(token)) {
            log.warn("[WxAlert] access_token 获取失败，跳过推送 tenantId={}", tenantId);
            return;
        }
        List<User> targets = findTargetUsers(tenantId);
        if (targets.isEmpty()) {
            log.debug("[WxAlert] 无可推送目标用户 tenantId={}", tenantId);
            return;
        }

        Map<String, String> data    = buildMsgData(title, content, orderNo);
        String              jumpPage = StringUtils.hasText(page) ? page : "pages/order/index";

        int sent = 0;
        for (User u : targets) {
            if (!StringUtils.hasText(u.getOpenid())) continue;
            boolean ok = wxClient.sendSubscribeMessage(token, u.getOpenid(),
                    alertTemplateId, jumpPage, data);
            if (ok) sent++;
        }
        log.info("[WxAlert] 推送完成: tenantId={}, title={}, targets={}, sent={}",
                tenantId, title, targets.size(), sent);
    }

    // ──────────────────────────────── 私有辅助 ────────────────────────────────

    /** 查找跟单员 + 工厂主账号（openid 不为空） */
    private List<User> findTargetUsers(Long tenantId) {
        return userMapper.selectList(new QueryWrapper<User>()
                .eq("tenant_id", tenantId)
                .isNotNull("openid")
                .ne("openid", "")
                .and(w -> w.eq("is_tenant_owner", 1)
                           .or().like("role_name", "跟单")
                           .or().like("role_name", "管理")));
    }

    /** 构造模板参数（WeChat 限制：每字段 ≤ 20 个字符） */
    private Map<String, String> buildMsgData(String title, String content, String orderNo) {
        Map<String, String> data = new LinkedHashMap<>();
        data.put("thing1", trunc(title != null ? title : "预警通知", 20));
        data.put("thing2", StringUtils.hasText(orderNo) ? trunc(orderNo, 20) : "—");
        data.put("thing3", trunc(content != null ? content : "", 20));
        return data;
    }

    private final java.util.concurrent.locks.ReentrantLock tokenLock = new java.util.concurrent.locks.ReentrantLock();

    private String getOrRefreshToken() {
        if (StringUtils.hasText(cachedToken)
                && System.currentTimeMillis() < tokenExpireAt) {
            return cachedToken;
        }
        tokenLock.lock();
        try {
            if (StringUtils.hasText(cachedToken)
                    && System.currentTimeMillis() < tokenExpireAt) {
                return cachedToken;
            }
            String token = wxClient.fetchAccessToken();
            if (StringUtils.hasText(token)) {
                cachedToken   = token;
                tokenExpireAt = System.currentTimeMillis() + 90L * 60 * 1000;
            }
            return StringUtils.hasText(token) ? token : null;
        } finally {
            tokenLock.unlock();
        }
    }

    private String trunc(String s, int max) {
        if (s == null || s.length() <= max) return s == null ? "" : s;
        return s.substring(0, max);
    }
}
