-- =====================================================================
-- 订单转移功能扩展：增加转工厂能力 + 备注时间戳
-- 执行日期: 2026-02-19
-- 说明: 在现有 order_transfer 表上增加转移类型、目标工厂字段；
--       备注时间戳由业务层自动在message中植入 [时间] 前缀
-- =====================================================================

-- 1. 新增转移类型字段（user=转人员，factory=转工厂）
ALTER TABLE order_transfer
    ADD COLUMN IF NOT EXISTS transfer_type VARCHAR(10) NOT NULL DEFAULT 'user'
        COMMENT '转移类型: user=转人员, factory=转工厂';

-- 2. 新增目标工厂ID
ALTER TABLE order_transfer
    ADD COLUMN IF NOT EXISTS to_factory_id VARCHAR(36) NULL
        COMMENT '目标工厂ID（transfer_type=factory时使用）';

-- 3. 新增目标工厂名称（冗余字段方便展示）
ALTER TABLE order_transfer
    ADD COLUMN IF NOT EXISTS to_factory_name VARCHAR(100) NULL
        COMMENT '目标工厂名称（冗余）';

-- 4. 索引优化（租户+类型联合查询）
CREATE INDEX IF NOT EXISTS idx_order_transfer_tenant_type
    ON order_transfer (tenant_id, transfer_type, status);

-- 5. 验证
SELECT
    COLUMN_NAME,
    COLUMN_TYPE,
    IS_NULLABLE,
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'order_transfer'
ORDER BY ORDINAL_POSITION;
