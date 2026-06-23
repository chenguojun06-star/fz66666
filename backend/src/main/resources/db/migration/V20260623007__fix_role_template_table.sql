-- =====================================================================
-- 修复 t_role_template 表：确保表和初始数据存在
-- 根因：前端调用 /api/role-template/list 500错误，可能是表不存在
-- 日期：2026-06-23
-- =====================================================================

-- 1. 创建 t_role_template 表（如果不存在）
SET @tb_exists = 0;
SELECT COUNT(*) INTO @tb_exists
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 't_role_template';

SET @sql = IF(@tb_exists = 0,
    'CREATE TABLE t_role_template (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      template_code VARCHAR(64) NOT NULL UNIQUE,
      template_name VARCHAR(128) NOT NULL,
      template_desc VARCHAR(512),
      category VARCHAR(32) DEFAULT ''CUSTOM'',
      is_default TINYINT DEFAULT 0,
      permissions_json TEXT,
      permission_range VARCHAR(32) DEFAULT ''team'',
      sort_order INT DEFAULT 0,
      enabled TINYINT DEFAULT 1,
      delete_flag TINYINT DEFAULT 0,
      create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_category (category),
      KEY idx_enabled (enabled)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
    'SELECT ''t_role_template already exists'' as result'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. 添加初始默认角色模板（如果不存在）
INSERT IGNORE INTO t_role_template (template_code, template_name, template_desc, category, is_default, permissions_json, permission_range, sort_order, enabled)
VALUES
    ('full_admin', '全能管理', '全部权限，适用于租户主账号', 'SYSTEM', 1, '[]', 'all', 1, 1),
    ('style_manager', '款式管理', '负责款式开发、样衣管理', 'INDUSTRY', 1, '[]', 'team', 2, 1),
    ('production_manager', '生产管理', '负责生产计划、订单跟踪', 'INDUSTRY', 1, '[]', 'team', 3, 1),
    ('qc_inspector', '质检员', '负责来料检验、过程检验、出货检验', 'INDUSTRY', 1, '[]', 'team', 4, 1),
    ('warehouse_keeper', '仓库管理', '负责物料入库、出库、盘点', 'INDUSTRY', 1, '[]', 'team', 5, 1);

-- 3. 验证表已创建
SELECT 't_role_template修复完成' AS status,
       (SELECT COUNT(*) FROM t_role_template) AS record_count;
