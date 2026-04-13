package com.fashion.supplychain.system.orchestration;

import com.fashion.supplychain.integration.config.TencentSmsProperties;
import com.tencentcloudapi.common.Credential;
import com.tencentcloudapi.common.exception.TencentCloudSDKException;
import com.tencentcloudapi.common.profile.ClientProfile;
import com.tencentcloudapi.common.profile.HttpProfile;
import com.tencentcloudapi.sms.v20210111.SmsClient;
import com.tencentcloudapi.sms.v20210111.models.SendSmsRequest;
import com.tencentcloudapi.sms.v20210111.models.SendSmsResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;

import lombok.extern.slf4j.Slf4j;

/**
 * 短信登录辅助类 — 从 UserOrchestrator 提取。
 * 负责验证码生成、发送（腾讯云短信）、Redis/本地缓存存储与校验。
 */
@Component
@Slf4j
public class SmsLoginHelper {

    private static final String REDIS_SMS_LOGIN_CODE_PREFIX = "fashion:auth:sms-login:code:";
    private static final String REDIS_SMS_LOGIN_SEND_PREFIX = "fashion:auth:sms-login:send:";
    private static final String PHONE_PATTERN = "^1[3-9]\\d{9}$";

    @Autowired(required = false)
    private StringRedisTemplate stringRedisTemplate;

    @Autowired
    private TencentSmsProperties tencentSmsProperties;

    @org.springframework.beans.factory.annotation.Value("${app.auth.sms-login.code-ttl-seconds:300}")
    private long smsLoginCodeTtlSeconds;

    @org.springframework.beans.factory.annotation.Value("${app.auth.sms-login.send-interval-seconds:60}")
    private long smsLoginSendIntervalSeconds;

    private final Map<String, ExpiringValue> smsLoginCodeFallbackStore = new ConcurrentHashMap<>();
    private final Map<String, ExpiringValue> smsLoginSendFallbackStore = new ConcurrentHashMap<>();

    public long getCodeTtlSeconds() {
        return smsLoginCodeTtlSeconds;
    }

    public long getSendIntervalSeconds() {
        return smsLoginSendIntervalSeconds;
    }

    public boolean isGatewayConfigured() {
        return tencentSmsProperties != null && tencentSmsProperties.isConfigured();
    }

    // --- Phone validation / normalization ---

    public void validatePhone(String phone) {
        if (!StringUtils.hasText(phone)) {
            throw new IllegalStateException("请输入手机号");
        }
        if (!phone.matches(PHONE_PATTERN)) {
            throw new IllegalStateException("请输入正确的手机号");
        }
    }

    public String normalizePhone(String phone) {
        return safeTrim(phone);
    }

    public String maskPhone(String phone) {
        String normalizedPhone = normalizePhone(phone);
        if (!StringUtils.hasText(normalizedPhone) || normalizedPhone.length() < 7) {
            return "******";
        }
        return normalizedPhone.substring(0, 3) + "****" + normalizedPhone.substring(normalizedPhone.length() - 4);
    }

    // --- SMS code generation / dispatch / storage / verification ---

    public void assertSmsLoginCodeCanSend(String phone, Long tenantId) {
        String cacheKey = smsLoginCacheKey(phone, tenantId);
        String redisKey = REDIS_SMS_LOGIN_SEND_PREFIX + cacheKey;
        if (stringRedisTemplate != null) {
            try {
                if (Boolean.TRUE.equals(stringRedisTemplate.hasKey(redisKey))) {
                    throw new IllegalStateException("验证码发送过于频繁，请稍后再试");
                }
                return;
            } catch (IllegalStateException e) {
                throw e;
            } catch (Exception e) {
                log.warn("[SmsLogin] Redis发送频控检查失败，使用本地缓存: {}", e.getMessage());
            }
        }
        ExpiringValue localValue = smsLoginSendFallbackStore.get(cacheKey);
        if (localValue != null && !localValue.expired()) {
            throw new IllegalStateException("验证码发送过于频繁，请稍后再试");
        }
        smsLoginSendFallbackStore.remove(cacheKey);
    }

    public String generateSmsCode() {
        return String.format("%06d", ThreadLocalRandom.current().nextInt(100000, 1000000));
    }

    public void dispatchSmsLoginCode(String phone, String code) {
        if (tencentSmsProperties == null || !tencentSmsProperties.isConfigured()) {
            log.warn("[SmsLogin] 未配置腾讯云短信，验证码已生成 phone={}, code=***", maskPhone(phone));
            return;
        }
        try {
            Credential credential = new Credential(
                    tencentSmsProperties.getSecretId().trim(),
                    tencentSmsProperties.getSecretKey().trim());
            HttpProfile httpProfile = new HttpProfile();
            httpProfile.setReqMethod("POST");
            httpProfile.setEndpoint(tencentSmsProperties.getEndpoint().trim());
            httpProfile.setConnTimeout(tencentSmsProperties.getConnectTimeoutSeconds());
            httpProfile.setReadTimeout(tencentSmsProperties.getReadTimeoutSeconds());
            httpProfile.setWriteTimeout(tencentSmsProperties.getWriteTimeoutSeconds());

            ClientProfile clientProfile = new ClientProfile();
            clientProfile.setSignMethod("TC3-HMAC-SHA256");
            clientProfile.setHttpProfile(httpProfile);

            SmsClient client = new SmsClient(credential, tencentSmsProperties.getRegion().trim(), clientProfile);
            SendSmsRequest request = new SendSmsRequest();
            request.setSmsSdkAppId(tencentSmsProperties.getSdkAppId().trim());
            request.setSignName(tencentSmsProperties.getSignName().trim());
            request.setTemplateId(tencentSmsProperties.getTemplateId().trim());
            request.setPhoneNumberSet(new String[] { toTencentPhoneNumber(phone) });
            request.setTemplateParamSet(new String[] { code });
            request.setSessionContext("pc-login:" + maskPhone(phone));

            SendSmsResponse response = client.SendSms(request);
            if (response == null || response.getSendStatusSet() == null || response.getSendStatusSet().length == 0) {
                throw new IllegalStateException("短信发送失败，请稍后重试");
            }
            String sendCode = safeTrim(response.getSendStatusSet()[0].getCode());
            if (!"Ok".equalsIgnoreCase(sendCode)) {
                String sendMessage = safeTrim(response.getSendStatusSet()[0].getMessage());
                log.error("[SmsLogin] 腾讯云短信发送失败 code={}, message={}, requestId={}",
                        sendCode, sendMessage, response.getRequestId());
                throw new IllegalStateException("短信发送失败，请稍后重试");
            }
        } catch (IllegalStateException e) {
            throw e;
        } catch (TencentCloudSDKException e) {
            log.error("[SmsLogin] 腾讯云短信发送异常 phone={}, err={}", maskPhone(phone), e.getMessage(), e);
            throw new IllegalStateException("短信发送失败，请稍后重试");
        } catch (Exception e) {
            log.error("[SmsLogin] 短信发送异常 phone={}, err={}", maskPhone(phone), e.getMessage(), e);
            throw new IllegalStateException("短信发送失败，请稍后重试");
        }
    }

    public void saveSmsLoginCode(String phone, Long tenantId, String code) {
        String cacheKey = smsLoginCacheKey(phone, tenantId);
        String hashedCode = String.valueOf(hashSmsLoginCode(phone, tenantId, code));
        if (stringRedisTemplate != null) {
            try {
                stringRedisTemplate.opsForValue().set(
                        REDIS_SMS_LOGIN_CODE_PREFIX + cacheKey,
                        hashedCode,
                        smsLoginCodeTtlSeconds,
                        TimeUnit.SECONDS);
                stringRedisTemplate.opsForValue().set(
                        REDIS_SMS_LOGIN_SEND_PREFIX + cacheKey,
                        "1",
                        smsLoginSendIntervalSeconds,
                        TimeUnit.SECONDS);
                return;
            } catch (Exception e) {
                log.warn("[SmsLogin] Redis写入失败，使用本地缓存: {}", e.getMessage());
            }
        }
        long now = System.currentTimeMillis();
        smsLoginCodeFallbackStore.put(cacheKey, new ExpiringValue(hashedCode, now + smsLoginCodeTtlSeconds * 1000));
        smsLoginSendFallbackStore.put(cacheKey, new ExpiringValue("1", now + smsLoginSendIntervalSeconds * 1000));
    }

    public boolean verifySmsLoginCode(String phone, Long tenantId, String code) {
        String cacheKey = smsLoginCacheKey(phone, tenantId);
        String expectedHash = hashSmsLoginCode(phone, tenantId, code);
        String storedHash = null;
        if (stringRedisTemplate != null) {
            try {
                storedHash = stringRedisTemplate.opsForValue().get(REDIS_SMS_LOGIN_CODE_PREFIX + cacheKey);
            } catch (Exception e) {
                log.warn("[SmsLogin] Redis读取失败，使用本地缓存: {}", e.getMessage());
            }
        }
        if (!StringUtils.hasText(storedHash)) {
            ExpiringValue localValue = smsLoginCodeFallbackStore.get(cacheKey);
            if (localValue != null && !localValue.expired()) {
                storedHash = localValue.value();
            } else {
                smsLoginCodeFallbackStore.remove(cacheKey);
            }
        }
        if (!StringUtils.hasText(storedHash)) {
            return false;
        }
        String verifiedHash = storedHash;
        return MessageDigest.isEqual(
                verifiedHash.getBytes(StandardCharsets.UTF_8),
                expectedHash.getBytes(StandardCharsets.UTF_8));
    }

    public void clearSmsLoginCode(String phone, Long tenantId) {
        String cacheKey = smsLoginCacheKey(phone, tenantId);
        smsLoginCodeFallbackStore.remove(cacheKey);
        if (stringRedisTemplate == null) {
            return;
        }
        try {
            stringRedisTemplate.delete(REDIS_SMS_LOGIN_CODE_PREFIX + cacheKey);
        } catch (Exception e) {
            log.warn("[SmsLogin] Redis删除验证码失败: {}", e.getMessage());
        }
    }

    // --- Internal helpers ---

    private String toTencentPhoneNumber(String phone) {
        String normalizedPhone = normalizePhone(phone);
        if (!StringUtils.hasText(normalizedPhone)) {
            return phone;
        }
        if (normalizedPhone.startsWith("+")) {
            return normalizedPhone;
        }
        return "+86" + normalizedPhone;
    }

    private String smsLoginCacheKey(String phone, Long tenantId) {
        return (tenantId == null ? "platform" : String.valueOf(tenantId)) + ":" + phone;
    }

    private String hashSmsLoginCode(String phone, Long tenantId, String code) {
        String raw = smsLoginCacheKey(phone, tenantId) + ":" + safeTrim(code);
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(raw.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("验证码处理失败");
        }
    }

    private static String safeTrim(String s) {
        if (s == null) {
            return null;
        }
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    private record ExpiringValue(String value, long expireAtMillis) {
        private boolean expired() {
            return System.currentTimeMillis() >= expireAtMillis;
        }
    }
}
