-- ==========================================
-- 面辅料入库记录表创建脚本
-- 创建时间: 2026-01-31
-- 用途: 支持采购到货入库追溯、完善库存管理流程
-- ==========================================

-- 1. 创建入库记录表
CREATE TABLE IF NOT EXISTS t_material_inbound (
    id VARCHAR(32) PRIMARY KEY COMMENT '主键ID',
    inbound_no VARCHAR(50) UNIQUE NOT NULL COMMENT '入库单号，格式：IB+YYYYMMDD+序号',
    purchase_id VARCHAR(32) COMMENT '关联采购单ID（可为空，支持无采购单入库）',
    material_code VARCHAR(50) NOT NULL COMMENT '物料编码',
    material_name VARCHAR(100) NOT NULL COMMENT '物料名称',
    material_type VARCHAR(20) COMMENT '物料类型：面料/辅料/其他',
    color VARCHAR(50) COMMENT '颜色',
    size VARCHAR(50) COMMENT '规格/尺寸',
    inbound_quantity INT NOT NULL COMMENT '入库数量',
    warehouse_location VARCHAR(100) DEFAULT '默认仓' COMMENT '仓库位置',
    supplier_name VARCHAR(100) COMMENT '供应商名称',
    operator_id VARCHAR(32) COMMENT '操作人ID',
    operator_name VARCHAR(50) COMMENT '操作人姓名',
    inbound_time DATETIME NOT NULL COMMENT '入库时间',
    remark TEXT COMMENT '备注说明',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    delete_flag TINYINT DEFAULT 0 COMMENT '删除标记：0-未删除，1-已删除',
    INDEX idx_purchase_id (purchase_id),
    INDEX idx_material_code (material_code),
    INDEX idx_inbound_time (inbound_time),
    INDEX idx_inbound_no (inbound_no),
    INDEX idx_delete_flag (delete_flag)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='面辅料入库记录表';

-- 2. 修改采购表，添加入库记录关联字段（先检查字段是否存在）
-- 如果字段已存在则跳过，否则添加
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = 'fashion_supplychain'
    AND TABLE_NAME = 't_material_purchase'
    AND COLUMN_NAME = 'inbound_record_id');

SET @sql = IF(@col_exists = 0,
    'ALTER TABLE t_material_purchase ADD COLUMN inbound_record_id VARCHAR(32) COMMENT ''入库记录ID，关联最新入库单'' AFTER arrived_quantity',
    'SELECT ''字段 inbound_record_id 已存在'' AS message');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 添加索引（如果不存在）
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = 'fashion_supplychain'
    AND TABLE_NAME = 't_material_purchase'
    AND INDEX_NAME = 'idx_inbound_record_id');

SET @sql_idx = IF(@idx_exists = 0,
    'ALTER TABLE t_material_purchase ADD INDEX idx_inbound_record_id (inbound_record_id)',
    'SELECT ''索引 idx_inbound_record_id 已存在'' AS message');
PREPARE stmt_idx FROM @sql_idx;
EXECUTE stmt_idx;
DEALLOCATE PREPARE stmt_idx;

-- 3. 创建入库单号生成序列表（用于生成唯一单号）
CREATE TABLE IF NOT EXISTS t_material_inbound_sequence (
    id INT PRIMARY KEY AUTO_INCREMENT,
    inbound_date DATE NOT NULL COMMENT '入库日期',
    sequence_number INT NOT NULL DEFAULT 1 COMMENT '当日序号',
    UNIQUE KEY uk_inbound_date (inbound_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='入库单号序列表';

-- 验证表结构
SELECT
    '入库记录表创建成功' AS status,
    (SELECT COUNT(*) FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = 'fashion_supplychain'
     AND TABLE_NAME = 't_material_inbound') AS table_exists,
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = 'fashion_supplychain'
     AND TABLE_NAME = 't_material_purchase'
     AND COLUMN_NAME = 'inbound_record_id') AS column_exists;
