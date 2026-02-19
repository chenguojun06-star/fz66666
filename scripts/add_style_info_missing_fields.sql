-- 为 t_style_info 表添加样衣开发缺失字段
-- 执行时间：2026-01-28

USE fashion_supplychain;

-- 添加设计师字段（复用 sample_no）
ALTER TABLE t_style_info ADD COLUMN sample_no VARCHAR(100) COMMENT '设计师';

-- 添加设计号字段（复用 vehicle_supplier）
ALTER TABLE t_style_info ADD COLUMN vehicle_supplier VARCHAR(100) COMMENT '设计号';

-- 添加纸样师字段（复用 sample_supplier）
ALTER TABLE t_style_info ADD COLUMN sample_supplier VARCHAR(100) COMMENT '纸样师';

-- 添加纸样号字段
ALTER TABLE t_style_info ADD COLUMN pattern_no VARCHAR(100) COMMENT '纸样号';

-- 添加车板师字段
ALTER TABLE t_style_info ADD COLUMN plate_worker VARCHAR(100) COMMENT '车板师';

-- 添加板类字段
ALTER TABLE t_style_info ADD COLUMN plate_type VARCHAR(50) COMMENT '板类（首单/复板/公司版等）';

-- 添加跟单员字段（复用 order_type）
ALTER TABLE t_style_info ADD COLUMN order_type VARCHAR(100) COMMENT '跟单员';

-- 添加客户字段
ALTER TABLE t_style_info ADD COLUMN customer VARCHAR(100) COMMENT '客户';

-- 添加订单号字段
ALTER TABLE t_style_info ADD COLUMN order_no VARCHAR(50) COMMENT '订单号（关联的最新订单号）';

-- 验证字段添加结果
SELECT
    COLUMN_NAME,
    DATA_TYPE,
    COLUMN_COMMENT
FROM
    INFORMATION_SCHEMA.COLUMNS
WHERE
    TABLE_SCHEMA = 'fashion_supplychain'
    AND TABLE_NAME = 't_style_info'
    AND COLUMN_NAME IN (
        'sample_no',
        'vehicle_supplier',
        'sample_supplier',
        'pattern_no',
        'plate_worker',
        'plate_type',
        'order_type',
        'customer',
        'order_no'
    )
ORDER BY
    ORDINAL_POSITION;
