package com.fashion.supplychain.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

@Slf4j
@Component
@Order(1)
public class ProductionSecurityValidator implements ApplicationRunner {

    @Value("${app.auth.jwt-secret:}")
    private String jwtSecret;

    @Value("${app.auth.header-auth-enabled:false}")
    private boolean headerAuthEnabled;

    @Value("${spring.datasource.password:}")
    private String dbPassword;

    @Value("${wechat.mini-program.mock-enabled:false}")
    private boolean wechatMockEnabled;

    @Value("${app.cors.allowed-origin-patterns:}")
    private String corsPatterns;

    @Value("${app.security.trust-all-certs:false}")
    private boolean trustAllCerts;

    private final Environment env;

    private static final List<String> WEAK_JWT_SECRETS = Arrays.asList(
            "", "changeme", "secret", "ThisIsA_LocalJwtSecret_OnlyForDev_0123456789",
            "your-secret-key", "jwt-secret", "my-secret"
    );

    private static final List<String> WEAK_DB_PASSWORDS = Arrays.asList(
            "", "changeme", "password", "root", "123456", "admin"
    );

    public ProductionSecurityValidator(Environment env) {
        this.env = env;
    }

    @Override
    public void run(ApplicationArguments args) {
        boolean isProd = isProductionEnvironment();
        List<String> errors = new ArrayList<>();
        List<String> warnings = new ArrayList<>();

        validateJwtSecret(errors, warnings, isProd);
        validateDbPassword(errors, warnings, isProd);
        validateHeaderAuth(errors, warnings, isProd);
        validateWechatMock(errors, warnings, isProd);
        validateCorsConfig(warnings, isProd);
        validateTrustAllCerts(warnings, isProd);
        validateCallbackUrls(warnings, isProd);

        if (!errors.isEmpty()) {
            log.error("\n" + "=".repeat(80) +
                    "\n  🚨 生产环境安全校验失败！应用存在严重安全风险，请立即修复：\n" +
                    "=".repeat(80));
            for (int i = 0; i < errors.size(); i++) {
                log.error("  {}. {}", i + 1, errors.get(i));
            }
            log.error("=".repeat(80));

            if (isProd) {
                throw new IllegalStateException(
                        "生产环境安全校验未通过！共 " + errors.size() + " 项严重问题，应用拒绝启动。请修复后重试。");
            }
        }

        if (!warnings.isEmpty()) {
            log.warn("\n" + "─".repeat(80) +
                    "\n  ⚠️  安全配置警告：\n" +
                    "─".repeat(80));
            for (int i = 0; i < warnings.size(); i++) {
                log.warn("  {}. {}", i + 1, warnings.get(i));
            }
            log.warn("─".repeat(80));
        }

        if (errors.isEmpty() && warnings.isEmpty()) {
            log.info("✅ 生产环境安全校验通过，所有配置符合安全要求");
        }
    }

    private boolean isProductionEnvironment() {
        String[] activeProfiles = env.getActiveProfiles();
        for (String profile : activeProfiles) {
            if ("prod".equalsIgnoreCase(profile) || "production".equalsIgnoreCase(profile)) {
                return true;
            }
        }
        String envFlag = env.getProperty("APP_ENV", "").toLowerCase();
        return "prod".equals(envFlag) || "production".equals(envFlag);
    }

    private void validateJwtSecret(List<String> errors, List<String> warnings, boolean isProd) {
        if (!StringUtils.hasText(jwtSecret) || WEAK_JWT_SECRETS.contains(jwtSecret.trim())) {
            String msg = "JWT密钥(app.auth.jwt-secret)为空或使用弱密钥，存在Token伪造风险。" +
                    "请通过环境变量 APP_AUTH_JWT_SECRET 设置强随机密钥(≥32字符)";
            if (isProd) {
                errors.add(msg);
            } else {
                warnings.add(msg + " [开发环境可忽略，上线前必须修复]");
            }
        } else if (jwtSecret.trim().length() < 32) {
            warnings.add("JWT密钥长度不足32字符，建议使用更长的随机密钥");
        }
    }

    private void validateDbPassword(List<String> errors, List<String> warnings, boolean isProd) {
        if (WEAK_DB_PASSWORDS.contains(dbPassword.trim())) {
            String msg = "数据库密码(spring.datasource.password)为空或使用弱密码('" + dbPassword + "')" +
                    "请通过环境变量 SPRING_DATASOURCE_PASSWORD 设置强密码";
            if (isProd) {
                errors.add(msg);
            } else {
                warnings.add(msg + " [开发环境可忽略，上线前必须修复]");
            }
        }
    }

    private void validateHeaderAuth(List<String> errors, List<String> warnings, boolean isProd) {
        if (headerAuthEnabled) {
            String msg = "Header认证(app.auth.header-auth-enabled)已开启，任何人可通过HTTP Header伪造用户身份" +
                    "请确认环境变量 APP_AUTH_HEADER_AUTH_ENABLED=false";
            if (isProd) {
                errors.add(msg);
            } else {
                warnings.add(msg + " [仅开发环境允许开启]");
            }
        }
    }

    private void validateWechatMock(List<String> errors, List<String> warnings, boolean isProd) {
        if (wechatMockEnabled) {
            String msg = "微信Mock模式(wechat.mini-program.mock-enabled)已开启，小程序将跳过真实微信鉴权" +
                    "请确认环境变量 WECHAT_MINI_PROGRAM_MOCK_ENABLED=false";
            if (isProd) {
                errors.add(msg);
            } else {
                warnings.add(msg + " [仅开发环境允许开启]");
            }
        }
    }

    private void validateCorsConfig(List<String> warnings, boolean isProd) {
        if (isProd && corsPatterns.contains("localhost")) {
            warnings.add("CORS配置(app.cors.allowed-origin-patterns)包含localhost，" +
                    "生产环境应仅允许正式域名。请通过环境变量 APP_CORS_ALLOWED_ORIGIN_PATTERNS 设置");
        }
        if (isProd && corsPatterns.contains("http://")) {
            warnings.add("CORS配置包含HTTP协议源，生产环境应全部使用HTTPS。" +
                    "请检查 APP_CORS_ALLOWED_ORIGIN_PATTERNS 配置");
        }
    }

    private void validateTrustAllCerts(List<String> warnings, boolean isProd) {
        if (trustAllCerts && isProd) {
            warnings.add("SSL证书验证已全局禁用(app.security.trust-all-certs=true)，" +
                    "存在中间人攻击风险。微信云托管环境因自签名证书需要开启，请确认风险可接受");
        }
    }

    private void validateCallbackUrls(List<String> warnings, boolean isProd) {
        if (!isProd) return;
        String[] callbackKeys = {
                "app.alipay.notify-url",
                "app.alipay.return-url",
                "app.payment.wechat.notify-url",
                "app.logistics.sf.notify-url",
                "app.logistics.sto.notify-url"
        };
        for (String key : callbackKeys) {
            String url = env.getProperty(key, "");
            if (url.contains("你的域名") || url.contains("localhost") || url.contains("example.com")) {
                warnings.add("回调地址(" + key + ")使用占位符或无效域名: " + url + "，启用前必须替换为生产域名");
            }
        }
    }
}
