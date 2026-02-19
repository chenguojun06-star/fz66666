-- ========================================
-- 新增应用商店模块：面辅料供应对接
-- 创建时间：2026-02-10
-- 说明：允许客户对接其面辅料供应商ERP系统
-- ========================================

-- 插入新应用：面辅料供应对接
INSERT INTO `t_app_store` (
    `app_code`,
    `app_name`,
    `app_icon`,
    `app_desc`,
    `category`,
    `price_type`,
    `price_monthly`,
    `price_yearly`,
    `price_once`,
    `sort_order`,
    `is_hot`,
    `is_new`,
    `trial_days`,
    `status`,
    `features`
) VALUES (
    'MATERIAL_SUPPLY',
    '面辅料供应对接',
    '🧵',
    '采购单自动同步、库存实时查询、价格自动更新、物流跟踪',
    '核心对接',
    'MONTHLY',
    899.00,
    8990.00,
    19990.00,
    5,
    0,
    1,
    7,
    'PUBLISHED',
    '["采购订单自动推送","供应商库存查询","价格自动更新","发货物流跟踪","批量采购管理"]'
);

-- 验证插入结果
SELECT
    app_code,
    app_name,
    app_icon,
    CONCAT('¥', price_monthly, '/月') as 月付价格,
    trial_days as 试用天数,
    status as 状态
FROM t_app_store
WHERE app_code = 'MATERIAL_SUPPLY';
