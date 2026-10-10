-- 每租户收款配置（微信支付 / 支付宝）
--
-- ============================================================
-- 为什么必须「每个租户一套商户号」，而不是平台一个账号收所有钱
-- ============================================================
-- 微信支付/支付宝的商户号是企业资质，资金结算到该企业的银行账户。
-- 如果平台用一个商户号收所有商家的钱、再转给商家，就是**二次清算（二清）**：
-- 无《支付业务许可证》属于非法经营，且平台要承担资金池风险与税务风险。
-- 所以只有一种合规做法：**商家用自己申请的商户号收款，平台只提供技术通道**。
-- 这也正好与已定方向一致（各租户直收、平台不抽成）。
--
-- ============================================================
-- 密钥怎么存
-- ============================================================
-- 应用私钥 / 支付宝公钥 / APIv3 密钥都是**能直接动钱的凭据**，一律用
-- AesEncryptor（AES-256-GCM）加密后存 *_cipher 列，明文绝不落库、绝不回传前端。
-- 读取时按需解密，仅用于签名与验签，不进日志。
--
-- 幂等：CREATE TABLE IF NOT EXISTS。

SET @schema = DATABASE();

CREATE TABLE IF NOT EXISTS `t_payment_config` (
  `id`                BIGINT       NOT NULL AUTO_INCREMENT,
  `tenant_id`         BIGINT       NOT NULL                COMMENT '所属租户（每个租户自己的商户号）',
  `channel`           VARCHAR(20)  NOT NULL                COMMENT '渠道: ALIPAY / WECHAT_PAY',
  `enabled`           TINYINT      NOT NULL DEFAULT 0      COMMENT '是否启用（启用且参数完整才允许发起支付）',
  `app_id`            VARCHAR(64)  NULL                    COMMENT '支付宝AppID / 微信AppID',
  `mch_id`            VARCHAR(64)  NULL                    COMMENT '微信支付商户号',
  `private_key_cipher`     TEXT    NULL                    COMMENT '应用私钥/商户私钥（AES-GCM 密文）',
  `public_key_cipher`      TEXT    NULL                    COMMENT '支付宝公钥（AES-GCM 密文，仅支付宝用）',
  `api_v3_key_cipher`      TEXT    NULL                    COMMENT '微信 APIv3 密钥（AES-GCM 密文，仅微信用）',
  `serial_no`         VARCHAR(64)  NULL                    COMMENT '微信商户证书序列号',
  `notify_url`        VARCHAR(255) NULL                    COMMENT '异步通知地址（须公网可达且备案）',
  `gateway_url`       VARCHAR(255) NULL                    COMMENT '网关地址（支付宝可指向沙箱）',
  `sandbox`           TINYINT      NOT NULL DEFAULT 0      COMMENT '是否沙箱环境（1=沙箱，仅支付宝支持）',
  `verified_time`     DATETIME     NULL                    COMMENT '最近一次连通性验证通过时间',
  `create_time`       DATETIME     DEFAULT CURRENT_TIMESTAMP,
  `update_time`       DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_channel` (`tenant_id`, `channel`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '每租户收款配置（商户号 + 加密密钥）';
