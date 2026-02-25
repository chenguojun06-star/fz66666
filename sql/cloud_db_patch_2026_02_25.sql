-- ============================================================
-- 云端数据库一次性补丁 (CynosDB 8.0 兼容版)
-- 覆盖所有缺失Flyway迁移
-- 执行方式: 微信云托管 -> 数据库管理 -> 分三部分执行
-- ============================================================

-- ======================== PART 1/3: 工具存储过程 ========================
DROP PROCEDURE IF EXISTS _add_col;
DROP PROCEDURE IF EXISTS _add_idx;

CREATE PROCEDURE _add_col(IN tbl VARCHAR(64), IN col VARCHAR(64), IN def TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=tbl AND COLUMN_NAME=col
  ) THEN
    SET @s = CONCAT('ALTER TABLE `',tbl,'` ADD COLUMN `',col,'` ',def);
    PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
END;

CREATE PROCEDURE _add_idx(IN tbl VARCHAR(64), IN idx VARCHAR(64), IN def TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=tbl AND INDEX_NAME=idx
  ) THEN
    SET @s = CONCAT('ALTER TABLE `',tbl,'` ADD ',def);
    PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
END;

SELECT 'Part 1 DONE - helper procedures created' AS status;
-- ======================== END PART 1 ========================

-- ======================== PART 2/3: 执行迁移 ========================

-- ---- V10: add sample review fields ----
-- 样衣审核字段
CALL _add_col('t_style_info', 'sample_review_status', 'VARCHAR(20)  DEFAULT NULL COMMENT \'样衣审核状态: PASS/REWORK/REJECT\',
    ADD COLUMN sample_review_comment TEXT         DEFAULT NULL COMMENT \'样衣审核评语（选填）\',
    ADD COLUMN sample_reviewer       VARCHAR(100) DEFAULT NULL COMMENT \'审核人\',
    ADD COLUMN sample_review_time    DATETIME     DEFAULT NULL COMMENT \'审核时间\'');


-- ---- V20260131: add performance indexes ----
-- ============================================
-- 数据库性能优化索引脚本
-- 创建日期: 2026-01-31
-- 执行环境: MySQL 8.0+
-- ============================================

-- 建议在业务低峰期执行此脚本
-- 执行前请备份数据库

-- ============================================
-- 1. 生产订单表索引优化
-- ============================================

-- 订单编号索引（用于精确查询）
CALL _add_idx('t_production_order', 'idx_production_order_no', 'INDEX `idx_production_order_no` (order_no)');

-- 款式编号索引（用于关联查询）
CALL _add_idx('t_production_order', 'idx_production_style_no', 'INDEX `idx_production_style_no` (style_no)');

-- 工厂ID索引（用于工厂维度查询）
CALL _add_idx('t_production_order', 'idx_production_factory_id', 'INDEX `idx_production_factory_id` (factory_id)');

-- 状态索引（用于状态筛选）
CALL _add_idx('t_production_order', 'idx_production_status', 'INDEX `idx_production_status` (status)');

-- 创建时间索引（用于排序和范围查询）
CALL _add_idx('t_production_order', 'idx_production_create_time', 'INDEX `idx_production_create_time` (create_time)');

-- 复合索引：工厂+状态（常用查询组合）
CALL _add_idx('t_production_order', 'idx_production_factory_status', 'INDEX `idx_production_factory_status` (factory_id, status)');

-- 复合索引：款式+创建时间（用于款式历史查询）
CALL _add_idx('t_production_order', 'idx_production_style_create', 'INDEX `idx_production_style_create` (style_id, create_time)');

-- 复合索引：状态+创建时间（用于状态筛选排序）
CALL _add_idx('t_production_order', 'idx_production_status_create', 'INDEX `idx_production_status_create` (status, create_time)');

-- ============================================
-- 2. 入库表索引优化
-- ============================================

-- 订单ID索引（用于聚合查询）
CALL _add_idx('t_product_warehousing', 'idx_warehousing_order_id', 'INDEX `idx_warehousing_order_id` (order_id)');

-- 删除标记索引（用于软删除过滤）
CALL _add_idx('t_product_warehousing', 'idx_warehousing_delete_flag', 'INDEX `idx_warehousing_delete_flag` (delete_flag)');

-- 复合索引：订单+删除标记（覆盖常用查询）
CALL _add_idx('t_product_warehousing', 'idx_warehousing_order_delete', 'INDEX `idx_warehousing_order_delete` (order_id, delete_flag)');

-- 复合索引：订单+删除标记+合格数量（覆盖聚合查询）
CALL _add_idx('t_product_warehousing', 'idx_warehousing_order_delete_qualified', 'INDEX `idx_warehousing_order_delete_qualified` (order_id, delete_flag, qualified_quantity)');

-- ============================================
-- 3. 出库表索引优化
-- ============================================

-- 订单ID索引
CALL _add_idx('t_product_outstock', 'idx_outstock_order_id', 'INDEX `idx_outstock_order_id` (order_id)');

-- 删除标记索引
CALL _add_idx('t_product_outstock', 'idx_outstock_delete_flag', 'INDEX `idx_outstock_delete_flag` (delete_flag)');

-- 复合索引：订单+删除标记
CALL _add_idx('t_product_outstock', 'idx_outstock_order_delete', 'INDEX `idx_outstock_order_delete` (order_id, delete_flag)');

-- 复合索引：订单+删除标记+出库数量
CALL _add_idx('t_product_outstock', 'idx_outstock_order_delete_quantity', 'INDEX `idx_outstock_order_delete_quantity` (order_id, delete_flag, outstock_quantity)');

-- ============================================
-- 4. 裁剪菲号表索引优化
-- ============================================

-- 生产订单ID索引
CALL _add_idx('t_cutting_bundle', 'idx_cutting_order_id', 'INDEX `idx_cutting_order_id` (production_order_id)');

-- 菲号索引（用于菲号查询）
CALL _add_idx('t_cutting_bundle', 'idx_cutting_bundle_no', 'INDEX `idx_cutting_bundle_no` (bundle_no)');

-- 复合索引：订单+状态
CALL _add_idx('t_cutting_bundle', 'idx_cutting_order_status', 'INDEX `idx_cutting_order_status` (production_order_id, status)');

-- ============================================
-- 5. 款式表索引优化
-- ============================================

-- 款式编号唯一索引（如果不存在）
-- 注意：如果已存在唯一约束，此语句会报错，请根据实际情况调整
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_style_no
-- ON t_style_info(style_no);

-- 状态索引
CALL _add_idx('t_style_info', 'idx_style_status', 'INDEX `idx_style_status` (status)');

-- 创建时间索引
CALL _add_idx('t_style_info', 'idx_style_create_time', 'INDEX `idx_style_create_time` (create_time)');

-- 分类索引
CALL _add_idx('t_style_info', 'idx_style_category', 'INDEX `idx_style_category` (category)');

-- 复合索引：状态+创建时间
CALL _add_idx('t_style_info', 'idx_style_status_create', 'INDEX `idx_style_status_create` (status, create_time)');

-- ============================================
-- 6. 物料表索引优化
-- ============================================

-- 物料编号索引
CALL _add_idx('t_material_info', 'idx_material_no', 'INDEX `idx_material_no` (material_no)');

-- 物料名称索引（用于模糊查询）
CALL _add_idx('t_material_info', 'idx_material_name', 'INDEX `idx_material_name` (material_name)');

-- 分类索引
CALL _add_idx('t_material_info', 'idx_material_category', 'INDEX `idx_material_category` (category)');

-- ============================================
-- 7. 物料采购表索引优化
-- ============================================

-- 生产订单ID索引
CALL _add_idx('t_material_purchase', 'idx_material_purchase_order_id', 'INDEX `idx_material_purchase_order_id` (production_order_id)');

-- 物料ID索引
CALL _add_idx('t_material_purchase', 'idx_material_purchase_material_id', 'INDEX `idx_material_purchase_material_id` (material_id)');

-- 状态索引
CALL _add_idx('t_material_purchase', 'idx_material_purchase_status', 'INDEX `idx_material_purchase_status` (status)');

-- 复合索引：订单+物料
CALL _add_idx('t_material_purchase', 'idx_material_purchase_order_material', 'INDEX `idx_material_purchase_order_material` (production_order_id, material_id)');

-- ============================================
-- 8. 工序表索引优化
-- ============================================

-- 款式ID索引
CALL _add_idx('t_process_info', 'idx_process_style_id', 'INDEX `idx_process_style_id` (style_id)');

-- 工序编号索引
CALL _add_idx('t_process_info', 'idx_process_no', 'INDEX `idx_process_no` (process_no)');

-- 复合索引：款式+工序顺序
CALL _add_idx('t_process_info', 'idx_process_style_sequence', 'INDEX `idx_process_style_sequence` (style_id, sequence)');

-- ============================================
-- 9. 生产记录表索引优化
-- ============================================

-- 生产订单ID索引
CALL _add_idx('t_production_record', 'idx_production_record_order_id', 'INDEX `idx_production_record_order_id` (production_order_id)');

-- 工序ID索引
CALL _add_idx('t_production_record', 'idx_production_record_process_id', 'INDEX `idx_production_record_process_id` (process_id)');

-- 日期索引（用于日期范围查询）
CALL _add_idx('t_production_record', 'idx_production_record_date', 'INDEX `idx_production_record_date` (record_date)');

-- 复合索引：订单+工序
CALL _add_idx('t_production_record', 'idx_production_record_order_process', 'INDEX `idx_production_record_order_process` (production_order_id, process_id)');

-- 复合索引：订单+日期
CALL _add_idx('t_production_record', 'idx_production_record_order_date', 'INDEX `idx_production_record_order_date` (production_order_id, record_date)');

-- ============================================
-- 索引创建完成
-- ============================================

-- 查看所有创建的索引
-- SELECT
--     TABLE_NAME,
--     INDEX_NAME,
--     COLUMN_NAME,
--     CARDINALITY
-- FROM
--     INFORMATION_SCHEMA.STATISTICS
-- WHERE
--     TABLE_SCHEMA = DATABASE()
--     AND INDEX_NAME LIKE 'idx_%'
-- ORDER BY
--     TABLE_NAME, INDEX_NAME;

-- 分析表（更新统计信息）
-- ANALYZE TABLE t_production_order;
-- ANALYZE TABLE t_product_warehousing;
-- ANALYZE TABLE t_product_outstock;
-- ANALYZE TABLE t_cutting_bundle;
-- ANALYZE TABLE t_style_info;


-- ---- V20260201: add foreign key constraints ----
-- ============================================
-- 数据库外键约束添加脚本
-- 创建日期: 2026-02-01
-- 执行环境: MySQL 8.0+
-- ============================================

-- 建议在业务低峰期执行此脚本
-- 执行前请备份数据库

-- ============================================
-- 1. 生产订单表外键约束
-- ============================================

-- 生产订单关联款式
ALTER TABLE t_production_order
ADD CONSTRAINT fk_production_order_style
FOREIGN KEY (style_id) REFERENCES t_style_info(id)
ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================
-- 2. 物料采购表外键约束
-- ============================================

-- 物料采购关联生产订单
ALTER TABLE t_material_purchase
ADD CONSTRAINT fk_material_purchase_order
FOREIGN KEY (order_id) REFERENCES t_production_order(id)
ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================
-- 3. 裁剪任务表外键约束
-- ============================================

-- 裁剪任务关联生产订单
ALTER TABLE t_cutting_task
ADD CONSTRAINT fk_cutting_task_order
FOREIGN KEY (order_id) REFERENCES t_production_order(id)
ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================
-- 4. 裁剪菲号表外键约束
-- ============================================

-- 菲号关联裁剪任务
ALTER TABLE t_cutting_bundle
ADD CONSTRAINT fk_cutting_bundle_task
FOREIGN KEY (cutting_task_id) REFERENCES t_cutting_task(id)
ON DELETE CASCADE ON UPDATE CASCADE;

-- 菲号关联生产订单
ALTER TABLE t_cutting_bundle
ADD CONSTRAINT fk_cutting_bundle_order
FOREIGN KEY (production_order_id) REFERENCES t_production_order(id)
ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================
-- 5. 扫码记录表外键约束
-- ============================================

-- 扫码记录关联生产订单
ALTER TABLE t_scan_record
ADD CONSTRAINT fk_scan_record_order
FOREIGN KEY (order_id) REFERENCES t_production_order(id)
ON DELETE CASCADE ON UPDATE CASCADE;

-- 扫码记录关联菲号
ALTER TABLE t_scan_record
ADD CONSTRAINT fk_scan_record_bundle
FOREIGN KEY (cutting_bundle_id) REFERENCES t_cutting_bundle(id)
ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================
-- 6. 入库表外键约束
-- ============================================

-- 入库关联生产订单
ALTER TABLE t_product_warehousing
ADD CONSTRAINT fk_warehousing_order
FOREIGN KEY (order_id) REFERENCES t_production_order(id)
ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================
-- 7. 出库表外键约束
-- ============================================

-- 出库关联生产订单
ALTER TABLE t_product_outstock
ADD CONSTRAINT fk_outstock_order
FOREIGN KEY (order_id) REFERENCES t_production_order(id)
ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================
-- 8. 工资结算表外键约束
-- ============================================

-- 工资结算关联生产订单
ALTER TABLE t_payroll_settlement
ADD CONSTRAINT fk_payroll_order
FOREIGN KEY (order_id) REFERENCES t_production_order(id)
ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================
-- 9. 物料对账表外键约束
-- ============================================

-- 物料对账关联物料采购
ALTER TABLE t_material_reconciliation
ADD CONSTRAINT fk_material_recon_purchase
FOREIGN KEY (purchase_id) REFERENCES t_material_purchase(id)
ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================
-- 10. 款式BOM表外键约束
-- ============================================

-- BOM关联款式
ALTER TABLE t_style_bom
ADD CONSTRAINT fk_style_bom_style
FOREIGN KEY (style_id) REFERENCES t_style_info(id)
ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================
-- 11. 款式工序表外键约束
-- ============================================

-- 工序关联款式
ALTER TABLE t_style_process
ADD CONSTRAINT fk_style_process_style
FOREIGN KEY (style_id) REFERENCES t_style_info(id)
ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================
-- 12. 款式尺码表外键约束
-- ============================================

-- 尺码关联款式
ALTER TABLE t_style_size
ADD CONSTRAINT fk_style_size_style
FOREIGN KEY (style_id) REFERENCES t_style_info(id)
ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================
-- 13. 用户表外键约束
-- ============================================

-- 用户关联角色
ALTER TABLE t_user
ADD CONSTRAINT fk_user_role
FOREIGN KEY (role_id) REFERENCES t_role(id)
ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================
-- 14. 角色权限关联表外键约束
-- ============================================

-- 角色权限关联角色
ALTER TABLE t_role_permission
ADD CONSTRAINT fk_role_perm_role
FOREIGN KEY (role_id) REFERENCES t_role(id)
ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================
-- 外键约束添加完成
-- ============================================

-- 查看所有外键约束
-- SELECT 
--     TABLE_NAME,
--     CONSTRAINT_NAME,
--     COLUMN_NAME,
--     REFERENCED_TABLE_NAME,
--     REFERENCED_COLUMN_NAME
-- FROM 
--     INFORMATION_SCHEMA.KEY_COLUMN_USAGE
-- WHERE 
--     TABLE_SCHEMA = DATABASE()
--     AND REFERENCED_TABLE_NAME IS NOT NULL
-- ORDER BY 
--     TABLE_NAME, CONSTRAINT_NAME;


-- ---- V20260205: add order management fields ----
-- 添加订单管理新字段（跟单员、公司、品类、纸样师）
-- 日期: 2026-02-05
-- 说明: 为生产订单添加跟单员、公司、品类、纸样师字段，支持从样衣开发自动带入

ALTER TABLE t_production_order
    ADD COLUMN merchandiser VARCHAR(100) COMMENT '跟单员' AFTER factory_name,
    ADD COLUMN company VARCHAR(200) COMMENT '公司/客户' AFTER merchandiser,
    ADD COLUMN product_category VARCHAR(100) COMMENT '品类' AFTER company,
    ADD COLUMN pattern_maker VARCHAR(100) COMMENT '纸样师' AFTER product_category;

-- 添加索引以提高查询性能
CREATE INDEX idx_production_merchandiser ON t_production_order(merchandiser);
CREATE INDEX idx_production_company ON t_production_order(company);
CREATE INDEX idx_production_category ON t_production_order(product_category);
CREATE INDEX idx_production_pattern_maker ON t_production_order(pattern_maker);


-- ---- V20260219: fix permission structure ----
-- ============================================================
-- 修复权限数据结构
-- 1. 修复3条乱码权限名称
-- 2. 新增"仓库管理"顶级分组
-- 3. 修正各级权限的 parent_id（button权限归入对应菜单）
-- 4. 统一显示名称与前端一致
-- 日期：2026-02-19
-- ============================================================

-- 0. 先新增"仓库管理"顶级分组（如果不存在）
INSERT INTO t_permission (permission_name, permission_code, permission_type, parent_id, status)
SELECT '仓库管理', 'MENU_WAREHOUSE', 'MENU', 0, 'ENABLED'
WHERE NOT EXISTS (SELECT 1 FROM t_permission WHERE permission_code = 'MENU_WAREHOUSE');

-- 1. 修复3条乱码名称
UPDATE t_permission SET permission_name = '工资支付管理' WHERE id = 28713;
UPDATE t_permission SET permission_name = '工资支付查看' WHERE id = 28714;
UPDATE t_permission SET permission_name = '结算审批'     WHERE id = 28715;

-- 2. 统一顶级分组名称（与前端菜单标题一致）
UPDATE t_permission SET permission_name = '样衣管理' WHERE permission_code = 'MENU_BASIC';
UPDATE t_permission SET permission_name = '样衣开发' WHERE permission_code = 'MENU_STYLE_INFO';
UPDATE t_permission SET permission_name = '单价维护' WHERE permission_code = 'MENU_TEMPLATE_CENTER';

-- 3. 将"仓库管理"下的菜单归入新分组
UPDATE t_permission
SET parent_id = (SELECT id FROM (SELECT id FROM t_permission WHERE permission_code = 'MENU_WAREHOUSE') t)
WHERE permission_code IN (
    'MENU_WAREHOUSE_DASHBOARD',
    'MENU_MATERIAL_INVENTORY',
    'MENU_MATERIAL_DATABASE',
    'MENU_FINISHED_INVENTORY',
    'MENU_SAMPLE_INVENTORY'
);

-- 4. 将"样衣管理"下的菜单归入正确父级（parent_id=样衣管理id=2）
UPDATE t_permission SET parent_id = 2 WHERE permission_code = 'MENU_PATTERN_PRODUCTION';
UPDATE t_permission SET parent_id = 2 WHERE permission_code = 'MENU_PATTERN_REVISION';

-- 5. 将"生产管理"下的菜单归入正确父级（parent_id=3）
UPDATE t_permission SET parent_id = 3 WHERE permission_code = 'MENU_MATERIAL_PICKING';

-- 6. 将"财务管理"下的新权限归入正确父级（parent_id=4）
UPDATE t_permission SET parent_id = 4 WHERE id IN (28713, 28714, 28715);

-- 7. 将"系统设置"下的菜单归入正确父级（parent_id=5）
UPDATE t_permission SET parent_id = 5 WHERE permission_code = 'MENU_DICT';
UPDATE t_permission SET parent_id = 5 WHERE permission_code = 'MENU_TUTORIAL';
UPDATE t_permission SET parent_id = 5 WHERE permission_code = 'MENU_USER_APPROVAL';

-- 8. 应用商店：子权限归入父级
UPDATE t_permission SET parent_id = (
    SELECT id FROM (SELECT id FROM t_permission WHERE permission_code = 'MENU_APP_STORE_VIEW') t
) WHERE permission_code = 'MENU_APP_STORE_BUY';

-- 9. 按钮级权限归入对应子菜单

-- 样衣/款号按钮 → 款号资料(样衣开发) id=6
UPDATE t_permission SET parent_id = 6
WHERE permission_code IN ('STYLE_CREATE','STYLE_EDIT','STYLE_DELETE','STYLE_IMPORT','STYLE_EXPORT');

-- 下单管理按钮 → 下单管理 id=7
UPDATE t_permission SET parent_id = 7
WHERE permission_code IN ('ORDER_CREATE','ORDER_EDIT','ORDER_DELETE','ORDER_CANCEL',
                          'ORDER_COMPLETE','ORDER_IMPORT','ORDER_EXPORT','ORDER_TRANSFER');

-- 模板中心按钮 → 模板/单价维护 id=9
UPDATE t_permission SET parent_id = 9
WHERE permission_code IN ('TEMPLATE_UPLOAD','TEMPLATE_DELETE');

-- 物料采购按钮 → 物料采购 id=11
UPDATE t_permission SET parent_id = 11
WHERE permission_code IN ('PURCHASE_CREATE','PURCHASE_EDIT','PURCHASE_DELETE',
                          'PURCHASE_RECEIVE','PURCHASE_RETURN_CONFIRM','PURCHASE_GENERATE');

-- 裁剪管理按钮 → 裁剪管理 id=12
UPDATE t_permission SET parent_id = 12
WHERE permission_code IN ('CUTTING_CREATE','CUTTING_EDIT','CUTTING_DELETE','CUTTING_SCAN');

-- 生产进度按钮 → 生产进度 id=13
UPDATE t_permission SET parent_id = 13
WHERE permission_code IN ('PROGRESS_SCAN','PROGRESS_EDIT','PROGRESS_DELETE');

-- 质检入库按钮 → 质检入库 id=14
UPDATE t_permission SET parent_id = 14
WHERE permission_code IN ('WAREHOUSING_CREATE','WAREHOUSING_EDIT','WAREHOUSING_DELETE','WAREHOUSING_ROLLBACK');

-- 物料对账按钮 → 物料对账 id=15
UPDATE t_permission SET parent_id = 15
WHERE permission_code IN ('MATERIAL_RECON_CREATE','MATERIAL_RECON_EDIT','MATERIAL_RECON_DELETE',
                          'MATERIAL_RECON_AUDIT','MATERIAL_RECON_SETTLEMENT');

-- 成品结算按钮 → 成品结算 id=16
UPDATE t_permission SET parent_id = 16
WHERE permission_code IN ('SHIPMENT_RECON_CREATE','SHIPMENT_RECON_EDIT','SHIPMENT_RECON_DELETE','SHIPMENT_RECON_AUDIT');

-- 审批付款按钮 → 审批付款 id=17
UPDATE t_permission SET parent_id = 17
WHERE permission_code IN ('PAYMENT_APPROVE','PAYMENT_REJECT','PAYMENT_CANCEL');

-- 人员管理按钮 → 人员管理 id=19
UPDATE t_permission SET parent_id = 19
WHERE permission_code IN ('USER_CREATE','USER_EDIT','USER_DELETE','USER_RESET_PASSWORD');

-- 角色管理按钮 → 角色管理 id=20
UPDATE t_permission SET parent_id = 20
WHERE permission_code IN ('ROLE_CREATE','ROLE_EDIT','ROLE_DELETE');

-- 供应商管理按钮 → 供应商管理 id=21
UPDATE t_permission SET parent_id = 21
WHERE permission_code IN ('FACTORY_CREATE','FACTORY_EDIT','FACTORY_DELETE');

-- 数据导入导出 → 系统设置 id=5
UPDATE t_permission SET parent_id = 5
WHERE permission_code IN ('DATA_IMPORT','DATA_EXPORT');

COMMIT;


-- ---- V20260221: init role templates and superadmin ----
-- =====================================================================
-- 补齐云端缺失的基础数据：角色模板 + 超管账号
-- 问题：V20260209__role_template_permission_system.sql 在 backend/sql/ 目录
--       未被纳入 Flyway 迁移，导致云端缺失 full_admin 角色模板，
--       审批通过时 createTenantAdminRole 抛出异常，租户账号无法创建。
-- 安全：全部使用幂等写法，已存在则跳过，不影响本地环境。
-- 日期：2026-02-21
-- =====================================================================

-- ----------------------------------------------------------------
-- 1. 确保 t_role 有 is_template 列（旧结构可能没有）
-- ----------------------------------------------------------------
SET @col_exists = 0;
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 't_role'
  AND COLUMN_NAME  = 'is_template';

SET @sql = IF(@col_exists = 0,
    "ALTER TABLE `t_role` ADD COLUMN `is_template` TINYINT(1) DEFAULT 0 COMMENT '是否为角色模板(1=模板,0=租户角色)'",
    "SELECT 'is_template column already exists'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ----------------------------------------------------------------
-- 2. 确保 t_role 有 source_template_id 列
-- ----------------------------------------------------------------
SET @col2 = 0;
SELECT COUNT(*) INTO @col2
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 't_role'
  AND COLUMN_NAME  = 'source_template_id';

SET @sql2 = IF(@col2 = 0,
    "ALTER TABLE `t_role` ADD COLUMN `source_template_id` BIGINT DEFAULT NULL COMMENT '来源模板角色ID'",
    "SELECT 'source_template_id column already exists'"
);
PREPARE stmt FROM @sql2; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ----------------------------------------------------------------
-- 3. 确保 t_user 有 is_super_admin 列
-- ----------------------------------------------------------------
SET @col3 = 0;
SELECT COUNT(*) INTO @col3
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 't_user'
  AND COLUMN_NAME  = 'is_super_admin';

SET @sql3 = IF(@col3 = 0,
    "ALTER TABLE `t_user` ADD COLUMN `is_super_admin` TINYINT(1) DEFAULT 0 COMMENT '是否超级管理员'",
    "SELECT 'is_super_admin column already exists'"
);
PREPARE stmt FROM @sql3; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ----------------------------------------------------------------
-- 4. 确保 t_user 有 is_tenant_owner 列
-- ----------------------------------------------------------------
SET @col4 = 0;
SELECT COUNT(*) INTO @col4
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 't_user'
  AND COLUMN_NAME  = 'is_tenant_owner';

SET @sql4 = IF(@col4 = 0,
    "ALTER TABLE `t_user` ADD COLUMN `is_tenant_owner` TINYINT(1) DEFAULT 0 COMMENT '是否租户主账号'",
    "SELECT 'is_tenant_owner column already exists'"
);
PREPARE stmt FROM @sql4; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ----------------------------------------------------------------
-- 5. 确保 t_user 有 approval_status 列
-- ----------------------------------------------------------------
SET @col5 = 0;
SELECT COUNT(*) INTO @col5
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 't_user'
  AND COLUMN_NAME  = 'approval_status';

SET @sql5 = IF(@col5 = 0,
    "ALTER TABLE `t_user` ADD COLUMN `approval_status` VARCHAR(20) DEFAULT 'approved' COMMENT '审批状态: pending/approved/rejected'",
    "SELECT 'approval_status column already exists'"
);
PREPARE stmt FROM @sql5; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ----------------------------------------------------------------
-- 6. 插入 full_admin 角色模板（已存在则跳过）
--    role_code='full_admin', is_template=1, tenant_id=NULL
-- ----------------------------------------------------------------
INSERT INTO t_role (role_name, role_code, description, status, is_template, tenant_id, sort_order)
SELECT '全能管理', 'full_admin', '全部权限，适用于租户主账号', 'active', 1, NULL, 1
WHERE NOT EXISTS (
    SELECT 1 FROM t_role WHERE role_code = 'full_admin' AND is_template = 1
);

-- ----------------------------------------------------------------
-- 7. 将已有 role_code='full_admin' 但 is_template=0 的记录标记为模板
--    （兼容本地环境通过 V20260209 脚本更新的情况）
-- ----------------------------------------------------------------
UPDATE t_role
SET is_template = 1, tenant_id = NULL
WHERE role_code = 'full_admin'
  AND is_template = 0
  AND tenant_id IS NULL;

-- ----------------------------------------------------------------
-- 8. 为 full_admin 模板批量绑定所有权限（如果尚未绑定）
--    这样新租户审批通过后拥有完整权限
-- ----------------------------------------------------------------
INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM t_role r
CROSS JOIN t_permission p
WHERE r.role_code = 'full_admin'
  AND r.is_template = 1
  AND p.status = 'ENABLED'
  AND NOT EXISTS (
      SELECT 1 FROM t_role_permission rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- ----------------------------------------------------------------
-- 9. 确保超级管理员账号存在
--    初始密码明文 "admin@2026"（系统首次登录时自动升级为 BCrypt）
--    如果已有 is_super_admin=1 的账号则跳过，不重复创建
-- ----------------------------------------------------------------
INSERT INTO t_user (username, password, name, status, is_super_admin, is_tenant_owner, approval_status, role_name, permission_range)
SELECT
    'superadmin',
    'admin@2026',
    '超级管理员',
    'active',
    1,
    0,
    'approved',
    'superadmin',
    'all'
WHERE NOT EXISTS (
    SELECT 1 FROM t_user WHERE is_super_admin = 1
);


-- ---- V20260221b: consolidate all missing migrations ----
-- ======================================================================
-- V20260221b: 合并所有遗漏迁移 (永久修复)
-- 说明: 此文件将 backend/sql/ 下从未被 Flyway 执行的 12 个 SQL 文件
--       统一纳入迁移管理，所有语句均已做幂等处理。
-- 涵盖文件:
--   V20260205__audit_and_version.sql        (t_operation_log + version列)
--   V20260205b__sample_stock_version.sql    (t_sample_stock version列)
--   V20260206__multi_tenant_saas.sql        (t_tenant + 全表 tenant_id)
--   V20260210__app_store.sql                (应用商店4张表 + 初始数据)
--   V20260210__tenant_app.sql               (t_tenant_app + t_tenant_app_log)
--   V20260210__add_material_supply_app.sql  (面辅料供应对接应用数据)
--   V20260215__finished_settlement_approval_status.sql (成品结算审批表)
--   V20260219__fix_settlement_view_price_and_cancelled.sql (视图修复)
--   V20260219_order_transfer_factory.sql     (订单转工厂字段)
--   V20260219b__material_roll.sql            (料卷/箱管理表)
--   V20260220_factory_type_payment_method.sql (工厂类型 + 支付方式默认值)
--   V20260221__add_user_wechat_openid.sql    (微信openid字段)
-- 最后更新: 2026-02-21
-- ======================================================================

-- ======================================================================
-- Part 1: 审计日志表 + 乐观锁版本字段
-- (来自 V20260205__audit_and_version.sql + V20260205b__sample_stock_version.sql)
-- ======================================================================

CREATE TABLE IF NOT EXISTS `t_operation_log` (
    `id`           BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    `tenant_id`    BIGINT       DEFAULT NULL COMMENT '租户ID',
    `user_id`      VARCHAR(64)  DEFAULT NULL COMMENT '操作人ID',
    `user_name`    VARCHAR(100) DEFAULT NULL COMMENT '操作人名称',
    `module`       VARCHAR(50)  DEFAULT NULL COMMENT '操作模块',
    `operation`    VARCHAR(100) DEFAULT NULL COMMENT '操作描述',
    `method`       VARCHAR(200) DEFAULT NULL COMMENT '请求方法',
    `params`       TEXT         DEFAULT NULL COMMENT '请求参数',
    `result`       VARCHAR(20)  DEFAULT NULL COMMENT '操作结果: SUCCESS/FAILED',
    `error_msg`    TEXT         DEFAULT NULL COMMENT '错误信息',
    `ip`           VARCHAR(50)  DEFAULT NULL COMMENT '客户端IP',
    `cost_ms`      BIGINT       DEFAULT NULL COMMENT '耗时(毫秒)',
    `create_time`  DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (`id`),
    KEY `idx_tenant_id` (`tenant_id`),
    KEY `idx_user_id` (`user_id`),
    KEY `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='操作审计日志';

-- t_material_stock 乐观锁版本号
CALL _add_col('t_material_stock', 'version', 'INT DEFAULT 0
    COMMENT \'乐观锁版本号（并发库存操作防覆盖）\'');

-- t_production_order 乐观锁版本号
CALL _add_col('t_production_order', 'version', 'INT DEFAULT 0
    COMMENT \'乐观锁版本号\'');

-- 生产订单索引（ADD COLUMN 后补充）
CALL _add_idx('t_production_order', 'idx_created_by_id', 'INDEX `idx_created_by_id` (`created_by_id`)');
CALL _add_idx('t_production_order', 'idx_factory_id', 'INDEX `idx_factory_id` (`factory_id`)');

-- t_sample_stock 乐观锁版本号
CALL _add_col('t_sample_stock', 'version', 'INT DEFAULT 0
    COMMENT \'乐观锁版本号（并发库存操作防覆盖）\'');


-- ======================================================================
-- Part 2: 多租户SaaS架构 - t_tenant 表 + 全业务表 tenant_id 字段
-- (来自 V20260206__multi_tenant_saas.sql)
-- 注意: 使用 MySQL 8.0 的 ADD COLUMN 语法代替存储过程
-- ======================================================================

CREATE TABLE IF NOT EXISTS `t_tenant` (
    `id`             BIGINT       NOT NULL AUTO_INCREMENT COMMENT '租户ID',
    `tenant_name`    VARCHAR(100) NOT NULL COMMENT '租户名称（公司/工厂名）',
    `tenant_code`    VARCHAR(50)  NOT NULL COMMENT '租户编码（唯一标识）',
    `owner_user_id`  BIGINT       DEFAULT NULL COMMENT '租户主账号用户ID',
    `contact_name`   VARCHAR(50)  DEFAULT NULL COMMENT '联系人',
    `contact_phone`  VARCHAR(20)  DEFAULT NULL COMMENT '联系电话',
    `status`         VARCHAR(20)  NOT NULL DEFAULT 'active' COMMENT '状态: active/disabled/expired',
    `max_users`      INT          DEFAULT 50 COMMENT '最大用户数限制（0=不限制）',
    `expire_time`    DATETIME     DEFAULT NULL COMMENT '过期时间（null=永不过期）',
    `remark`         VARCHAR(500) DEFAULT NULL COMMENT '备注',
    `create_time`    DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time`    DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY `uk_tenant_code` (`tenant_code`),
    KEY `idx_status` (`status`),
    KEY `idx_owner_user_id` (`owner_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='租户表';

-- ---- 为 t_user 添加租户相关字段 ----
CALL _add_col('t_user', 'tenant_id', 'BIGINT     DEFAULT NULL COMMENT \'所属租户ID\',
    ADD COLUMN `is_tenant_owner` TINYINT(1) DEFAULT 0   COMMENT \'是否为租户主账号\'');
CALL _add_idx('t_user', 'idx_user_tenant_id', 'INDEX `idx_user_tenant_id` (`tenant_id`)');

-- ---- 生产模块 ----
CALL _add_col('t_production_order', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT \'租户ID\'');
CALL _add_idx('t_production_order', 'idx_po_tenant_id', 'INDEX `idx_po_tenant_id` (`tenant_id`)');

CALL _add_col('t_production_process_tracking', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT \'租户ID\'');
CALL _add_idx('t_production_process_tracking', 'idx_ppt_tenant_id', 'INDEX `idx_ppt_tenant_id` (`tenant_id`)');

CALL _add_col('t_cutting_task', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT \'租户ID\'');
CALL _add_idx('t_cutting_task', 'idx_ct_tenant_id', 'INDEX `idx_ct_tenant_id` (`tenant_id`)');

CALL _add_col('t_cutting_bundle', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT \'租户ID\'');
CALL _add_idx('t_cutting_bundle', 'idx_cb_tenant_id', 'INDEX `idx_cb_tenant_id` (`tenant_id`)');

CALL _add_col('t_scan_record', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT \'租户ID\'');
CALL _add_idx('t_scan_record', 'idx_sr_tenant_id', 'INDEX `idx_sr_tenant_id` (`tenant_id`)');

CALL _add_col('t_secondary_process', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT \'租户ID\'');
CALL _add_idx('t_secondary_process', 'idx_sp_tenant_id', 'INDEX `idx_sp_tenant_id` (`tenant_id`)');

-- ---- 款式模块 ----
CALL _add_col('t_style_info', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT \'租户ID\'');
CALL _add_idx('t_style_info', 'idx_si_tenant_id', 'INDEX `idx_si_tenant_id` (`tenant_id`)');

CALL _add_col('t_style_bom', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT \'租户ID\'');
CALL _add_idx('t_style_bom', 'idx_sb_tenant_id', 'INDEX `idx_sb_tenant_id` (`tenant_id`)');

CALL _add_col('t_style_process', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT \'租户ID\'');
CALL _add_idx('t_style_process', 'idx_spr_tenant_id', 'INDEX `idx_spr_tenant_id` (`tenant_id`)');

CALL _add_col('t_style_attachment', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT \'租户ID\'');
CALL _add_idx('t_style_attachment', 'idx_sa_tenant_id', 'INDEX `idx_sa_tenant_id` (`tenant_id`)');

CALL _add_col('t_style_size', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT \'租户ID\'');
CALL _add_idx('t_style_size', 'idx_ss_tenant_id', 'INDEX `idx_ss_tenant_id` (`tenant_id`)');

CALL _add_col('t_style_size_price', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT \'租户ID\'');
CALL _add_idx('t_style_size_price', 'idx_ssp_tenant_id', 'INDEX `idx_ssp_tenant_id` (`tenant_id`)');

CALL _add_col('t_style_quotation', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT \'租户ID\'');
CALL _add_idx('t_style_quotation', 'idx_sq_tenant_id', 'INDEX `idx_sq_tenant_id` (`tenant_id`)');

CALL _add_col('t_style_operation_log', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT \'租户ID\'');
CALL _add_idx('t_style_operation_log', 'idx_sol_tenant_id', 'INDEX `idx_sol_tenant_id` (`tenant_id`)');

-- ---- 面辅料/仓库模块 ----
CALL _add_col('t_material_database', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT \'租户ID\'');
CALL _add_idx('t_material_database', 'idx_md_tenant_id', 'INDEX `idx_md_tenant_id` (`tenant_id`)');

CALL _add_col('t_material_stock', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT \'租户ID\'');
CALL _add_idx('t_material_stock', 'idx_ms_tenant_id', 'INDEX `idx_ms_tenant_id` (`tenant_id`)');

CALL _add_col('t_material_inbound', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT \'租户ID\'');
CALL _add_idx('t_material_inbound', 'idx_mi_tenant_id', 'INDEX `idx_mi_tenant_id` (`tenant_id`)');

CALL _add_col('t_material_inbound_sequence', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT \'租户ID\'');
CALL _add_idx('t_material_inbound_sequence', 'idx_mis_tenant_id', 'INDEX `idx_mis_tenant_id` (`tenant_id`)');

CALL _add_col('t_material_picking', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT \'租户ID\'');
CALL _add_idx('t_material_picking', 'idx_mp_tenant_id', 'INDEX `idx_mp_tenant_id` (`tenant_id`)');

CALL _add_col('t_material_picking_item', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT \'租户ID\'');
CALL _add_idx('t_material_picking_item', 'idx_mpi_tenant_id', 'INDEX `idx_mpi_tenant_id` (`tenant_id`)');

CALL _add_col('t_material_purchase', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT \'租户ID\'');
CALL _add_idx('t_material_purchase', 'idx_mpu_tenant_id', 'INDEX `idx_mpu_tenant_id` (`tenant_id`)');

-- ---- 成品模块 ----
CALL _add_col('t_product_sku', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT \'租户ID\'');
CALL _add_idx('t_product_sku', 'idx_ps_tenant_id', 'INDEX `idx_ps_tenant_id` (`tenant_id`)');

CALL _add_col('t_product_warehousing', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT \'租户ID\'');
CALL _add_idx('t_product_warehousing', 'idx_pw_tenant_id', 'INDEX `idx_pw_tenant_id` (`tenant_id`)');

CALL _add_col('t_product_outstock', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT \'租户ID\'');
CALL _add_idx('t_product_outstock', 'idx_pos_tenant_id', 'INDEX `idx_pos_tenant_id` (`tenant_id`)');

-- ---- 样衣模块 ----
CALL _add_col('t_sample_stock', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT \'租户ID\'');
CALL _add_idx('t_sample_stock', 'idx_sst_tenant_id', 'INDEX `idx_sst_tenant_id` (`tenant_id`)');

CALL _add_col('t_sample_loan', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT \'租户ID\'');
CALL _add_idx('t_sample_loan', 'idx_sl_tenant_id', 'INDEX `idx_sl_tenant_id` (`tenant_id`)');

-- ---- 财务模块 ----
CALL _add_col('t_material_reconciliation', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT \'租户ID\'');
CALL _add_idx('t_material_reconciliation', 'idx_mr_tenant_id', 'INDEX `idx_mr_tenant_id` (`tenant_id`)');

CALL _add_col('t_order_reconciliation_approval', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT \'租户ID\'');
CALL _add_idx('t_order_reconciliation_approval', 'idx_ora_tenant_id', 'INDEX `idx_ora_tenant_id` (`tenant_id`)');

CALL _add_col('t_shipment_reconciliation', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT \'租户ID\'');
CALL _add_idx('t_shipment_reconciliation', 'idx_shr_tenant_id', 'INDEX `idx_shr_tenant_id` (`tenant_id`)');

CALL _add_col('t_payroll_settlement', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT \'租户ID\'');
CALL _add_idx('t_payroll_settlement', 'idx_pse_tenant_id', 'INDEX `idx_pse_tenant_id` (`tenant_id`)');

CALL _add_col('t_payroll_settlement_item', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT \'租户ID\'');
CALL _add_idx('t_payroll_settlement_item', 'idx_psi_tenant_id', 'INDEX `idx_psi_tenant_id` (`tenant_id`)');

CALL _add_col('t_deduction_item', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT \'租户ID\'');
CALL _add_idx('t_deduction_item', 'idx_di_tenant_id', 'INDEX `idx_di_tenant_id` (`tenant_id`)');

-- ---- 工厂/基础数据 ----
CALL _add_col('t_factory', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT \'租户ID\'');
CALL _add_idx('t_factory', 'idx_f_tenant_id', 'INDEX `idx_f_tenant_id` (`tenant_id`)');

-- ---- 版型模块 ----
CALL _add_col('t_pattern_production', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT \'租户ID\'');
CALL _add_idx('t_pattern_production', 'idx_pp_tenant_id', 'INDEX `idx_pp_tenant_id` (`tenant_id`)');

CALL _add_col('t_pattern_revision', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT \'租户ID\'');
CALL _add_idx('t_pattern_revision', 'idx_pr_tenant_id', 'INDEX `idx_pr_tenant_id` (`tenant_id`)');

-- ---- 模板库 ----
CALL _add_col('t_template_library', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT \'租户ID\'');
CALL _add_idx('t_template_library', 'idx_tl_tenant_id', 'INDEX `idx_tl_tenant_id` (`tenant_id`)');

CALL _add_col('t_template_operation_log', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT \'租户ID\'');


-- ======================================================================
-- Part 3: 应用商店系统（4 张表 + 初始应用数据）
-- (来自 V20260210__app_store.sql)
-- ======================================================================

-- 1. 应用商店表
CREATE TABLE IF NOT EXISTS `t_app_store` (
    `id`           BIGINT        NOT NULL AUTO_INCREMENT COMMENT '主键',
    `app_code`     VARCHAR(50)   NOT NULL COMMENT '应用编码',
    `app_name`     VARCHAR(100)  NOT NULL COMMENT '应用名称',
    `app_icon`     VARCHAR(200)  DEFAULT NULL COMMENT '应用图标',
    `app_desc`     VARCHAR(500)  DEFAULT NULL COMMENT '应用简介',
    `app_detail`   TEXT          DEFAULT NULL COMMENT '应用详细说明',
    `category`     VARCHAR(50)   DEFAULT NULL COMMENT '应用分类',
    `price_type`   VARCHAR(20)   NOT NULL DEFAULT 'MONTHLY' COMMENT '计费类型: FREE/MONTHLY/YEARLY/ONCE',
    `price_monthly` DECIMAL(10,2) DEFAULT 0.00 COMMENT '月付价格',
    `price_yearly`  DECIMAL(10,2) DEFAULT 0.00 COMMENT '年付价格',
    `price_once`    DECIMAL(10,2) DEFAULT 0.00 COMMENT '买断价格',
    `sort_order`   INT           DEFAULT 0 COMMENT '排序',
    `is_hot`       TINYINT       DEFAULT 0 COMMENT '是否热门',
    `is_new`       TINYINT       DEFAULT 0 COMMENT '是否新应用',
    `status`       VARCHAR(20)   NOT NULL DEFAULT 'PUBLISHED' COMMENT '状态: DRAFT/PUBLISHED/OFFLINE',
    `features`     TEXT          DEFAULT NULL COMMENT '功能列表JSON',
    `screenshots`  TEXT          DEFAULT NULL COMMENT '应用截图JSON',
    `min_users`    INT           DEFAULT 1 COMMENT '最少用户数',
    `max_users`    INT           DEFAULT 999 COMMENT '最大用户数',
    `trial_days`   INT           DEFAULT 0 COMMENT '试用天数',
    `remark`       VARCHAR(500)  DEFAULT NULL COMMENT '备注',
    `create_time`  DATETIME      DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time`  DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    `delete_flag`  TINYINT       DEFAULT 0 COMMENT '逻辑删除',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_app_code` (`app_code`),
    KEY `idx_category` (`category`),
    KEY `idx_status` (`status`),
    KEY `idx_sort_order` (`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='应用商店-可购买应用列表';

-- 2. 租户订阅表
CREATE TABLE IF NOT EXISTS `t_tenant_subscription` (
    `id`                BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    `subscription_no`  VARCHAR(50)   NOT NULL COMMENT '订阅编号',
    `tenant_id`         BIGINT       NOT NULL COMMENT '租户ID',
    `tenant_name`       VARCHAR(100) DEFAULT NULL COMMENT '租户名称',
    `app_id`            BIGINT       NOT NULL COMMENT '应用ID',
    `app_code`          VARCHAR(50)  NOT NULL COMMENT '应用编码',
    `app_name`          VARCHAR(100) NOT NULL COMMENT '应用名称',
    `subscription_type` VARCHAR(20)  NOT NULL COMMENT '订阅类型: TRIAL/MONTHLY/YEARLY/PERPETUAL',
    `price`             DECIMAL(10,2) DEFAULT 0.00 COMMENT '订阅价格',
    `user_count`        INT          DEFAULT 1 COMMENT '购买用户数',
    `start_time`        DATETIME     NOT NULL COMMENT '生效时间',
    `end_time`          DATETIME     DEFAULT NULL COMMENT '到期时间',
    `status`            VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE' COMMENT '状态: TRIAL/ACTIVE/EXPIRED/CANCELED',
    `auto_renew`        TINYINT      DEFAULT 0 COMMENT '是否自动续费',
    `order_id`          BIGINT       DEFAULT NULL COMMENT '关联订单ID',
    `remark`            VARCHAR(500) DEFAULT NULL COMMENT '备注',
    `created_by`        VARCHAR(64)  DEFAULT NULL COMMENT '创建人',
    `create_time`       DATETIME     DEFAULT CURRENT_TIMESTAMP,
    `update_time`       DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `delete_flag`       TINYINT      DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_subscription_no` (`subscription_no`),
    KEY `idx_tenant_id` (`tenant_id`),
    KEY `idx_app_id` (`app_id`),
    KEY `idx_status` (`status`),
    KEY `idx_end_time` (`end_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='租户应用订阅';

-- 3. 应用订单表
CREATE TABLE IF NOT EXISTS `t_app_order` (
    `id`               BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    `order_no`         VARCHAR(50)  NOT NULL COMMENT '订单号',
    `tenant_id`        BIGINT       NOT NULL COMMENT '租户ID',
    `tenant_name`      VARCHAR(100) DEFAULT NULL,
    `app_id`           BIGINT       NOT NULL COMMENT '应用ID',
    `app_code`         VARCHAR(50)  NOT NULL,
    `app_name`         VARCHAR(100) NOT NULL,
    `order_type`       VARCHAR(20)  NOT NULL COMMENT '订单类型: NEW/RENEW/UPGRADE',
    `subscription_type` VARCHAR(20) NOT NULL COMMENT '订阅类型: TRIAL/MONTHLY/YEARLY/PERPETUAL',
    `user_count`       INT          DEFAULT 1,
    `unit_price`       DECIMAL(10,2) DEFAULT 0.00,
    `total_amount`     DECIMAL(10,2) NOT NULL,
    `discount_amount`  DECIMAL(10,2) DEFAULT 0.00,
    `actual_amount`    DECIMAL(10,2) NOT NULL,
    `status`           VARCHAR(20)  NOT NULL DEFAULT 'PENDING' COMMENT '状态: PENDING/PAID/CANCELED/REFUNDED',
    `payment_method`   VARCHAR(20)  DEFAULT NULL,
    `payment_time`     DATETIME     DEFAULT NULL,
    `contact_name`     VARCHAR(100) DEFAULT NULL,
    `contact_phone`    VARCHAR(20)  DEFAULT NULL,
    `contact_email`    VARCHAR(100) DEFAULT NULL,
    `company_name`     VARCHAR(200) DEFAULT NULL,
    `invoice_required` TINYINT      DEFAULT 0,
    `invoice_title`    VARCHAR(200) DEFAULT NULL,
    `invoice_tax_no`   VARCHAR(50)  DEFAULT NULL,
    `remark`           VARCHAR(500) DEFAULT NULL,
    `created_by`       VARCHAR(64)  DEFAULT NULL,
    `create_time`      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    `update_time`      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `delete_flag`      TINYINT      DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_order_no` (`order_no`),
    KEY `idx_tenant_id` (`tenant_id`),
    KEY `idx_app_id` (`app_id`),
    KEY `idx_status` (`status`),
    KEY `idx_payment_time` (`payment_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='应用购买订单';

-- 4. 支付记录表
CREATE TABLE IF NOT EXISTS `t_app_payment` (
    `id`                   BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
    `payment_no`           VARCHAR(50) NOT NULL COMMENT '支付流水号',
    `order_id`             BIGINT      NOT NULL,
    `order_no`             VARCHAR(50) NOT NULL,
    `tenant_id`            BIGINT      NOT NULL,
    `payment_method`       VARCHAR(20) NOT NULL COMMENT '支付方式: WECHAT/ALIPAY/BANK/OFFLINE',
    `payment_channel`      VARCHAR(50) DEFAULT NULL,
    `amount`               DECIMAL(10,2) NOT NULL,
    `status`               VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT '状态: PENDING/SUCCESS/FAILED/REFUNDED',
    `third_party_no`       VARCHAR(100) DEFAULT NULL,
    `third_party_response` TEXT         DEFAULT NULL,
    `payment_time`         DATETIME     DEFAULT NULL,
    `refund_time`          DATETIME     DEFAULT NULL,
    `refund_reason`        VARCHAR(500) DEFAULT NULL,
    `remark`               VARCHAR(500) DEFAULT NULL,
    `create_time`          DATETIME     DEFAULT CURRENT_TIMESTAMP,
    `update_time`          DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_payment_no` (`payment_no`),
    KEY `idx_order_id` (`order_id`),
    KEY `idx_tenant_id` (`tenant_id`),
    KEY `idx_status` (`status`),
    KEY `idx_third_party_no` (`third_party_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='应用支付记录';

-- 初始应用数据（INSERT IGNORE 保证幂等）
INSERT IGNORE INTO `t_app_store` (`app_code`, `app_name`, `app_icon`, `app_desc`, `category`, `price_type`, `price_monthly`, `price_yearly`, `price_once`, `sort_order`, `is_hot`, `trial_days`, `status`, `features`) VALUES
('ORDER_SYNC',       '下单对接',       '📦', '与客户系统对接，自动同步订单数据，减少人工录入',                 '核心对接', 'MONTHLY', 299.00,  2990.00, 19999.00, 1, 1, 7, 'PUBLISHED', '["自动接收客户订单","订单状态同步","订单变更通知","批量导入导出","订单数据校验"]'),
('QUALITY_FEEDBACK', '质检反馈',       '✅', '质检结果实时同步，不良品反馈，质量数据分析',                     '核心对接', 'MONTHLY', 199.00,  1990.00, 19999.00, 2, 0, 7, 'PUBLISHED', '["质检结果推送","不良品反馈","质检报告生成","质量数据统计","异常预警通知"]'),
('LOGISTICS_SYNC',   '物流对接',       '🚚', '物流信息实时同步，发货通知，物流轨迹跟踪',                       '核心对接', 'MONTHLY', 149.00,  1490.00, 19999.00, 3, 1, 7, 'PUBLISHED', '["发货信息同步","物流轨迹跟踪","签收状态通知","退货物流对接","批量发货管理"]'),
('PAYMENT_SYNC',     '付款对接',       '💰', '付款信息自动同步，对账管理，结算数据对接',                       '核心对接', 'MONTHLY', 199.00,  1990.00, 19999.00, 4, 0, 7, 'PUBLISHED', '["付款信息同步","自动对账","结算数据推送","账单生成","付款状态跟踪"]'),
('MATERIAL_SUPPLY',  '面辅料供应对接', '🧵', '采购单自动同步、库存实时查询、价格自动更新、物流跟踪',           '核心对接', 'MONTHLY', 249.00,  2490.00, 19999.00, 5, 0, 7, 'PUBLISHED', '["采购订单自动推送","供应商库存实时查询","价格自动更新同步","发货物流跟踪","批量采购管理"]');

-- 修复已存在的数据（INSERT IGNORE不会更新已有记录，所以需要UPDATE）
UPDATE `t_app_store` SET `price_monthly`=299.00,  `price_yearly`=2990.00, `price_once`=19999.00 WHERE `app_code`='ORDER_SYNC';
UPDATE `t_app_store` SET `price_monthly`=199.00,  `price_yearly`=1990.00, `price_once`=19999.00 WHERE `app_code`='QUALITY_FEEDBACK';
UPDATE `t_app_store` SET `price_monthly`=149.00,  `price_yearly`=1490.00, `price_once`=19999.00 WHERE `app_code`='LOGISTICS_SYNC';
UPDATE `t_app_store` SET `price_monthly`=199.00,  `price_yearly`=1990.00, `price_once`=19999.00 WHERE `app_code`='PAYMENT_SYNC';
UPDATE `t_app_store` SET `price_monthly`=249.00,  `price_yearly`=2490.00, `price_once`=19999.00 WHERE `app_code`='MATERIAL_SUPPLY';


-- ======================================================================
-- Part 4: 客户应用管理（t_tenant_app + t_tenant_app_log）
-- (来自 V20260210__tenant_app.sql)
-- ======================================================================

CREATE TABLE IF NOT EXISTS `t_tenant_app` (
    `id`                    VARCHAR(64)  NOT NULL COMMENT '主键UUID',
    `tenant_id`             BIGINT       NOT NULL COMMENT '租户ID',
    `app_name`              VARCHAR(100) NOT NULL COMMENT '应用名称',
    `app_type`              VARCHAR(50)  NOT NULL COMMENT '应用类型: ORDER_SYNC/QUALITY_FEEDBACK/LOGISTICS_SYNC/PAYMENT_SYNC',
    `app_key`               VARCHAR(64)  NOT NULL COMMENT '应用密钥ID',
    `app_secret`            VARCHAR(128) NOT NULL COMMENT '应用密钥',
    `status`                VARCHAR(20)  NOT NULL DEFAULT 'active' COMMENT '状态: active/disabled/expired',
    `callback_url`          VARCHAR(500) DEFAULT NULL COMMENT '客户回调URL',
    `callback_secret`       VARCHAR(64)  DEFAULT NULL COMMENT '回调签名密钥',
    `external_api_url`      VARCHAR(500) DEFAULT NULL COMMENT '客户系统API地址',
    `config_json`           TEXT         DEFAULT NULL COMMENT '对接配置JSON',
    `daily_quota`           INT          DEFAULT 0 COMMENT '日调用上限',
    `daily_used`            INT          DEFAULT 0 COMMENT '今日已调用次数',
    `last_quota_reset_time` DATETIME     DEFAULT NULL,
    `total_calls`           BIGINT       DEFAULT 0 COMMENT '总调用次数',
    `last_call_time`        DATETIME     DEFAULT NULL,
    `expire_time`           DATETIME     DEFAULT NULL COMMENT '过期时间',
    `remark`                VARCHAR(500) DEFAULT NULL,
    `created_by`            VARCHAR(64)  DEFAULT NULL,
    `create_time`           DATETIME     DEFAULT CURRENT_TIMESTAMP,
    `update_time`           DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `delete_flag`           TINYINT      DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_app_key` (`app_key`),
    KEY `idx_tenant_id` (`tenant_id`),
    KEY `idx_app_type` (`app_type`),
    KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='客户应用管理';

CREATE TABLE IF NOT EXISTS `t_tenant_app_log` (
    `id`           VARCHAR(64)  NOT NULL COMMENT '主键UUID',
    `app_id`       VARCHAR(64)  DEFAULT NULL COMMENT '应用ID',
    `tenant_id`    BIGINT       DEFAULT NULL COMMENT '租户ID',
    `app_type`     VARCHAR(50)  DEFAULT NULL COMMENT '应用类型',
    `direction`    VARCHAR(20)  DEFAULT NULL COMMENT '方向: INBOUND/OUTBOUND',
    `http_method`  VARCHAR(10)  DEFAULT NULL,
    `request_path` VARCHAR(500) DEFAULT NULL,
    `request_body` TEXT         DEFAULT NULL,
    `response_code` INT         DEFAULT NULL,
    `response_body` TEXT        DEFAULT NULL,
    `cost_ms`      BIGINT       DEFAULT NULL COMMENT '耗时(毫秒)',
    `result`       VARCHAR(20)  DEFAULT NULL COMMENT '结果: SUCCESS/FAILED/ERROR',
    `error_message` VARCHAR(500) DEFAULT NULL,
    `client_ip`    VARCHAR(50)  DEFAULT NULL,
    `create_time`  DATETIME     DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_app_id`     (`app_id`),
    KEY `idx_tenant_id`  (`tenant_id`),
    KEY `idx_create_time`(`create_time`),
    KEY `idx_result`     (`result`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='客户应用调用日志';


-- ======================================================================
-- Part 5: 成品结算审批状态持久化表
-- (来自 V20260215__finished_settlement_approval_status.sql)
-- ======================================================================

CREATE TABLE IF NOT EXISTS `t_finished_settlement_approval` (
    `settlement_id`    VARCHAR(64)  NOT NULL COMMENT '成品结算ID',
    `status`           VARCHAR(20)  NOT NULL DEFAULT 'pending' COMMENT '审批状态: pending/approved',
    `approved_by_id`   VARCHAR(64)  DEFAULT NULL COMMENT '审批人ID',
    `approved_by_name` VARCHAR(100) DEFAULT NULL COMMENT '审批人名称',
    `approved_time`    DATETIME     DEFAULT NULL COMMENT '审批时间',
    `tenant_id`        BIGINT       DEFAULT NULL COMMENT '租户ID',
    `create_time`      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    `update_time`      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`settlement_id`),
    KEY `idx_tenant_id` (`tenant_id`),
    KEY `idx_status`    (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='成品结算审批状态';


-- ======================================================================
-- Part 6: 修复成品结算视图（使用含利润率的报价价格，排除已取消订单）
-- (来自 V20260219__fix_settlement_view_price_and_cancelled.sql)
-- 注意: 该文件与 db/migration 中已有 V20260219 文件名冲突，内容纳入本文件
-- ======================================================================

DROP VIEW IF EXISTS `v_finished_product_settlement`;

CREATE VIEW `v_finished_product_settlement` AS
SELECT
    `po`.`id`             AS `order_id`,
    `po`.`order_no`       AS `order_no`,
    `po`.`status`         AS `status`,
    `po`.`style_no`       AS `style_no`,
    `po`.`factory_id`     AS `factory_id`,
    `po`.`factory_name`   AS `factory_name`,
    `po`.`order_quantity` AS `order_quantity`,

    -- 款式单价：优先使用含利润率的报价，没有报价时退回到 t_style_info.price
    COALESCE(`sq`.`total_price`, `si`.`price`, 0)         AS `style_final_price`,
    COALESCE(`sq`.`profit_rate`, 0)                        AS `target_profit_rate`,
    COALESCE(`wh`.`total_warehoused`, 0)                   AS `warehoused_quantity`,
    COALESCE(`wh`.`total_defects`, 0)                      AS `defect_quantity`,
    COALESCE(`wh`.`colors`, '')                            AS `colors`,
    COALESCE(`mat`.`total_material_cost`, 0)               AS `material_cost`,
    COALESCE(`scan`.`total_production_cost`, 0)            AS `production_cost`,

    (CASE
        WHEN (`po`.`order_quantity` > 0)
        THEN ROUND(COALESCE(`wh`.`total_defects`, 0)
            * ((COALESCE(`mat`.`total_material_cost`, 0) + COALESCE(`scan`.`total_production_cost`, 0))
               / `po`.`order_quantity`), 2)
        ELSE 0
    END) AS `defect_loss`,

    ROUND(COALESCE(`sq`.`total_price`, `si`.`price`, 0)
          * COALESCE(`wh`.`total_warehoused`, 0), 2) AS `total_amount`,

    ROUND(
        (COALESCE(`sq`.`total_price`, `si`.`price`, 0) * COALESCE(`wh`.`total_warehoused`, 0))
        - COALESCE(`mat`.`total_material_cost`, 0)
        - COALESCE(`scan`.`total_production_cost`, 0)
        - (CASE
            WHEN (`po`.`order_quantity` > 0)
            THEN COALESCE(`wh`.`total_defects`, 0)
                 * ((COALESCE(`mat`.`total_material_cost`, 0) + COALESCE(`scan`.`total_production_cost`, 0))
                    / `po`.`order_quantity`)
            ELSE 0
           END)
    , 2) AS `profit`,

    (CASE
        WHEN (COALESCE(`sq`.`total_price`, `si`.`price`, 0) * COALESCE(`wh`.`total_warehoused`, 0)) > 0
        THEN ROUND(
            (
                (COALESCE(`sq`.`total_price`, `si`.`price`, 0) * COALESCE(`wh`.`total_warehoused`, 0))
                - COALESCE(`mat`.`total_material_cost`, 0)
                - COALESCE(`scan`.`total_production_cost`, 0)
                - (CASE
                    WHEN (`po`.`order_quantity` > 0)
                    THEN COALESCE(`wh`.`total_defects`, 0)
                         * ((COALESCE(`mat`.`total_material_cost`, 0) + COALESCE(`scan`.`total_production_cost`, 0))
                            / `po`.`order_quantity`)
                    ELSE 0
                   END)
            )
            / (COALESCE(`sq`.`total_price`, `si`.`price`, 0) * COALESCE(`wh`.`total_warehoused`, 0))
            * 100
        , 2)
        ELSE 0
    END) AS `profit_margin`,

    `po`.`create_time` AS `create_time`,
    `po`.`update_time` AS `update_time`,
    `po`.`tenant_id`   AS `tenant_id`

FROM `t_production_order` `po`
LEFT JOIN `t_style_info` `si`
    ON `po`.`style_no` = `si`.`style_no`
LEFT JOIN (
    SELECT sq1.`style_id`, sq1.`total_price`, sq1.`profit_rate`
    FROM `t_style_quotation` sq1
    INNER JOIN (
        SELECT `style_id`, MAX(`update_time`) AS max_update_time
        FROM `t_style_quotation`
        GROUP BY `style_id`
    ) sq_latest ON sq1.`style_id` = sq_latest.`style_id`
               AND sq1.`update_time` = sq_latest.`max_update_time`
) `sq` ON `sq`.`style_id` = `si`.`id`
LEFT JOIN (
    SELECT `pw`.`order_no`,
           SUM(CASE WHEN `pw`.`quality_status` = 'QUALIFIED'                THEN `pw`.`warehousing_quantity` ELSE 0 END) AS `total_warehoused`,
           SUM(CASE WHEN `pw`.`quality_status` IN ('UNQUALIFIED','DEFECTIVE') THEN `pw`.`warehousing_quantity` ELSE 0 END) AS `total_defects`,
           GROUP_CONCAT(DISTINCT CASE WHEN `cb`.`color` IS NOT NULL THEN `cb`.`color` ELSE '' END
                        ORDER BY `cb`.`color` ASC SEPARATOR ', ') AS `colors`
    FROM `t_product_warehousing` `pw`
    LEFT JOIN `t_cutting_bundle` `cb` ON `pw`.`cutting_bundle_id` = `cb`.`id`
    GROUP BY `pw`.`order_no`
) `wh` ON `po`.`order_no` = `wh`.`order_no`
LEFT JOIN (
    SELECT `order_no`, SUM(`total_amount`) AS `total_material_cost`
    FROM `t_material_purchase`
    WHERE `status` IN ('RECEIVED','COMPLETED')
    GROUP BY `order_no`
) `mat` ON `po`.`order_no` = `mat`.`order_no`
LEFT JOIN (
    SELECT `order_no`, SUM(`scan_cost`) AS `total_production_cost`
    FROM `t_scan_record`
    WHERE `scan_cost` IS NOT NULL
    GROUP BY `order_no`
) `scan` ON `po`.`order_no` = `scan`.`order_no`
-- 排除已取消/报废的订单
WHERE `po`.`status` NOT IN ('CANCELLED','cancelled','DELETED','deleted','废弃','已取消')
ORDER BY `po`.`create_time` DESC;


-- ======================================================================
-- Part 7: 订单转移功能 - 增加转工厂能力
-- (来自 V20260219_order_transfer_factory.sql)
-- ======================================================================

CALL _add_col('order_transfer', 'transfer_type', 'VARCHAR(10)  NOT NULL DEFAULT \'user\'
        COMMENT \'转移类型: user=转人员, factory=转工厂\',
    ADD COLUMN `to_factory_id`   VARCHAR(36)  NULL
        COMMENT \'目标工厂ID（transfer_type=factory时使用）\',
    ADD COLUMN `to_factory_name` VARCHAR(100) NULL
        COMMENT \'目标工厂名称（冗余）\'');

CALL _add_idx('order_transfer', 'idx_order_transfer_tenant_type', 'INDEX `idx_order_transfer_tenant_type` (`tenant_id`, `transfer_type`, `status`)');


-- ======================================================================
-- Part 8: 面辅料料卷/箱管理表
-- (来自 V20260219b__material_roll.sql)
-- ======================================================================

CREATE TABLE IF NOT EXISTS `t_material_roll` (
    `id`               VARCHAR(32)   NOT NULL COMMENT '主键ID',
    `roll_code`        VARCHAR(30)   NOT NULL COMMENT '料卷/箱编号（二维码内容）',
    `inbound_id`       VARCHAR(32)   DEFAULT NULL COMMENT '关联入库单ID',
    `inbound_no`       VARCHAR(50)   DEFAULT NULL COMMENT '入库单号（冗余）',
    `material_code`    VARCHAR(50)   NOT NULL COMMENT '物料编码',
    `material_name`    VARCHAR(100)  NOT NULL COMMENT '物料名称',
    `material_type`    VARCHAR(20)   DEFAULT NULL COMMENT '物料类型: 面料/辅料/其他',
    `color`            VARCHAR(50)   DEFAULT NULL COMMENT '颜色',
    `specifications`   VARCHAR(100)  DEFAULT NULL COMMENT '规格',
    `unit`             VARCHAR(20)   DEFAULT NULL COMMENT '单位',
    `quantity`         DECIMAL(10,2) NOT NULL COMMENT '本卷/箱数量',
    `warehouse_location` VARCHAR(50) NOT NULL DEFAULT '默认仓' COMMENT '存放仓库',
    `status`           VARCHAR(20)   NOT NULL DEFAULT 'IN_STOCK'
                       COMMENT '状态: IN_STOCK-在库/ISSUED-已发料/RETURNED-已退回',
    `issued_order_id`  VARCHAR(32)   DEFAULT NULL COMMENT '发料关联裁剪单ID',
    `issued_order_no`  VARCHAR(50)   DEFAULT NULL COMMENT '发料关联裁剪单号',
    `issued_time`      DATETIME      DEFAULT NULL COMMENT '发料时间',
    `issued_by_id`     VARCHAR(32)   DEFAULT NULL COMMENT '发料操作人ID',
    `issued_by_name`   VARCHAR(50)   DEFAULT NULL COMMENT '发料操作人姓名',
    `supplier_name`    VARCHAR(100)  DEFAULT NULL COMMENT '供应商名称',
    `remark`           VARCHAR(255)  DEFAULT NULL COMMENT '备注',
    `tenant_id`        VARCHAR(32)   DEFAULT NULL COMMENT '租户ID',
    `creator_id`       VARCHAR(32)   DEFAULT NULL COMMENT '创建人ID',
    `creator_name`     VARCHAR(50)   DEFAULT NULL COMMENT '创建人姓名',
    `create_time`      DATETIME      DEFAULT CURRENT_TIMESTAMP,
    `update_time`      DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `delete_flag`      TINYINT       DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_roll_code` (`roll_code`, `tenant_id`),
    INDEX `idx_inbound_id`    (`inbound_id`),
    INDEX `idx_material_code` (`material_code`),
    INDEX `idx_status`        (`status`),
    INDEX `idx_tenant_id`     (`tenant_id`),
    INDEX `idx_create_time`   (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='面辅料料卷/箱明细 - 每行对应一张二维码标签';

-- 料卷编号日序列表（生成唯一流水号）
CREATE TABLE IF NOT EXISTS `t_material_roll_sequence` (
    `id`        INT  NOT NULL AUTO_INCREMENT COMMENT '主键',
    `roll_date` DATE NOT NULL COMMENT '日期',
    `seq`       INT  NOT NULL DEFAULT 1 COMMENT '当日序号',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_roll_date` (`roll_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='料卷编号日序列表';


-- ======================================================================
-- Part 9: 工厂类型区分 + 工资支付方式默认值修复
-- (来自 V20260220_factory_type_payment_method.sql)
-- ======================================================================

-- 修复 payment_method 缺少默认值（修复创建 pending 记录 500 错误）
ALTER TABLE `t_wage_payment`
    MODIFY COLUMN `payment_method` VARCHAR(20) NOT NULL DEFAULT 'OFFLINE'
    COMMENT '支付方式: OFFLINE=线下, BANK=银行转账, WECHAT=微信, ALIPAY=支付宝';

-- 新增工厂类型字段（默认所有工厂为 EXTERNAL 外部工厂）
CALL _add_col('t_factory', 'factory_type', 'VARCHAR(20) NOT NULL DEFAULT \'EXTERNAL\'
    COMMENT \'工厂类型: INTERNAL=本厂内部按人员结算, EXTERNAL=外部工厂按工厂结算\'');


-- ======================================================================
-- Part 10: 微信小程序 openid 字段
-- (来自 V20260221__add_user_wechat_openid.sql)
-- 注意: 该文件与 db/migration 已有 V20260221 文件名冲突，内容纳入本文件
-- ======================================================================

CALL _add_col('t_user', 'openid', 'VARCHAR(128) DEFAULT NULL
    COMMENT \'微信小程序 openid（用于一键免密登录）\'');

CALL _add_idx('t_user', 'idx_t_user_openid', 'INDEX `idx_t_user_openid` (`openid`)');


-- ---- V2026022201: fix views and appstore prices ----
-- V10: 修复云端视图（含 secondary_process_quantity）+ 修复应用商店买断价格
-- 根因1: FASHION_DB_INITIALIZER_ENABLED=false 导致 ViewMigrator 从未在云端执行
--        云端视图可能是旧版，缺少 secondary_process_quantity 字段
-- 根因2: 同样原因，SystemTableMigrator.fixAppStorePrices() 也从未在云端执行
--        t_app_store 表的 price_once 字段全部为默认值 0.00

-- =====================================================
-- 1. 重建视图 v_production_order_flow_stage_snapshot
-- =====================================================
CREATE OR REPLACE VIEW v_production_order_flow_stage_snapshot AS
SELECT
  sr.order_id AS order_id,
  sr.tenant_id AS tenant_id,
  MIN(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '下单' THEN sr.scan_time END) AS order_start_time,
  MAX(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '下单' THEN sr.scan_time END) AS order_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '下单' THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS order_operator_name,
  MAX(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '采购' THEN sr.scan_time END) AS procurement_scan_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '采购' THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS procurement_scan_operator_name,
  MIN(CASE WHEN sr.scan_type = 'cutting' THEN sr.scan_time END) AS cutting_start_time,
  MAX(CASE WHEN sr.scan_type = 'cutting' THEN sr.scan_time END) AS cutting_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'cutting' THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS cutting_operator_name,
  SUM(CASE WHEN sr.scan_type = 'cutting' THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS cutting_quantity,
  MIN(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT IN ('下单', '采购')
        AND IFNULL(sr.process_code, '') <> 'quality_warehousing'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%质检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%检验%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%品检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%验货%'
      THEN sr.scan_time END) AS sewing_start_time,
  MAX(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT IN ('下单', '采购')
        AND IFNULL(sr.process_code, '') <> 'quality_warehousing'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%质检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%检验%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%品检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%验货%'
      THEN sr.scan_time END) AS sewing_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT IN ('下单', '采购')
        AND IFNULL(sr.process_code, '') <> 'quality_warehousing'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%质检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%检验%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%品检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%验货%'
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS sewing_operator_name,
  MIN(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%车缝%'
      THEN sr.scan_time END) AS car_sewing_start_time,
  MAX(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%车缝%'
      THEN sr.scan_time END) AS car_sewing_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%车缝%'
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS car_sewing_operator_name,
  SUM(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%车缝%'
      THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS car_sewing_quantity,
  MIN(CASE WHEN sr.scan_type = 'production'
        AND (COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%烫%')
      THEN sr.scan_time END) AS ironing_start_time,
  MAX(CASE WHEN sr.scan_type = 'production'
        AND (COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%烫%')
      THEN sr.scan_time END) AS ironing_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'production'
        AND (COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%烫%')
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS ironing_operator_name,
  SUM(CASE WHEN sr.scan_type = 'production'
        AND (COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%烫%')
      THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS ironing_quantity,
  MIN(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('secondaryProcess', 'secondary_process')
             OR TRIM(sr.process_name) = '二次工艺'
             OR TRIM(sr.process_name) LIKE '%绣花%'
             OR TRIM(sr.process_name) LIKE '%印花%'
             OR TRIM(sr.process_name) LIKE '%二次%')
      THEN sr.scan_time END) AS secondary_process_start_time,
  MAX(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('secondaryProcess', 'secondary_process')
             OR TRIM(sr.process_name) = '二次工艺'
             OR TRIM(sr.process_name) LIKE '%绣花%'
             OR TRIM(sr.process_name) LIKE '%印花%'
             OR TRIM(sr.process_name) LIKE '%二次%')
      THEN sr.scan_time END) AS secondary_process_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('secondaryProcess', 'secondary_process')
             OR TRIM(sr.process_name) = '二次工艺'
             OR TRIM(sr.process_name) LIKE '%绣花%'
             OR TRIM(sr.process_name) LIKE '%印花%'
             OR TRIM(sr.process_name) LIKE '%二次%')
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS secondary_process_operator_name,
  SUM(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('secondaryProcess', 'secondary_process')
             OR TRIM(sr.process_name) = '二次工艺'
             OR TRIM(sr.process_name) LIKE '%绣花%'
             OR TRIM(sr.process_name) LIKE '%印花%'
             OR TRIM(sr.process_name) LIKE '%二次%')
      THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS secondary_process_quantity,
  MIN(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
      THEN sr.scan_time END) AS packaging_start_time,
  MAX(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
      THEN sr.scan_time END) AS packaging_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS packaging_operator_name,
  SUM(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
      THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS packaging_quantity,
  MIN(CASE WHEN (sr.scan_type = 'quality'
        OR IFNULL(sr.process_code, '') = 'quality_warehousing'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%质检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%检验%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%品检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%验货%')
      THEN sr.scan_time END) AS quality_start_time,
  MAX(CASE WHEN (sr.scan_type = 'quality'
        OR IFNULL(sr.process_code, '') = 'quality_warehousing'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%质检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%检验%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%品检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%验货%')
      THEN sr.scan_time END) AS quality_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN (sr.scan_type = 'quality'
        OR IFNULL(sr.process_code, '') = 'quality_warehousing'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%质检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%检验%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%品检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%验货%')
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS quality_operator_name,
  SUM(CASE WHEN (sr.scan_type = 'quality'
        OR IFNULL(sr.process_code, '') = 'quality_warehousing'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%质检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%检验%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%品检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%验货%')
      THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS quality_quantity,
  MIN(CASE WHEN sr.scan_type = 'warehouse' AND IFNULL(sr.process_code, '') <> 'warehouse_rollback' THEN sr.scan_time END) AS warehousing_start_time,
  MAX(CASE WHEN sr.scan_type = 'warehouse' AND IFNULL(sr.process_code, '') <> 'warehouse_rollback' THEN sr.scan_time END) AS warehousing_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'warehouse' AND IFNULL(sr.process_code, '') <> 'warehouse_rollback' THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS warehousing_operator_name,
  SUM(CASE WHEN sr.scan_type = 'warehouse' AND IFNULL(sr.process_code, '') <> 'warehouse_rollback' THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS warehousing_quantity
FROM t_scan_record sr
WHERE sr.scan_result = 'success'
GROUP BY sr.order_id, sr.tenant_id;

-- =====================================================
-- 2. 修复应用商店买断价格（price_once 默认为 0.00）
-- =====================================================
UPDATE `t_app_store` SET `price_monthly` = 299.00, `price_yearly` = 2990.00, `price_once` = 19999.00 WHERE `app_code` = 'ORDER_SYNC';
UPDATE `t_app_store` SET `price_monthly` = 199.00, `price_yearly` = 1990.00, `price_once` = 19999.00 WHERE `app_code` = 'QUALITY_FEEDBACK';
UPDATE `t_app_store` SET `price_monthly` = 149.00, `price_yearly` = 1490.00, `price_once` = 19999.00 WHERE `app_code` = 'LOGISTICS_SYNC';
UPDATE `t_app_store` SET `price_monthly` = 199.00, `price_yearly` = 1990.00, `price_once` = 19999.00 WHERE `app_code` = 'PAYMENT_SYNC';
UPDATE `t_app_store` SET `price_monthly` = 249.00, `price_yearly` = 2490.00, `price_once` = 19999.00 WHERE `app_code` = 'MATERIAL_SUPPLY';


-- ---- V20260222: fix superadmin bcrypt password ----
-- =====================================================================
-- 修复 V20260221 中超管账号使用明文密码的错误
-- 问题：V20260221 插入 superadmin 时 password 字段存储了明文 "admin@2026"，
--       Spring Security 使用 BCryptPasswordEncoder 验密，明文永远无法通过校验，
--       导致超管账号登录 400 错误。
-- 修复：将密码替换为 BCrypt 哈希（密码仍是 admin@2026）
-- 日期：2026-02-22
-- =====================================================================

UPDATE t_user
SET password = '$2a$10$dcJNHdmr2M5iZCSHkvj/2ud5.vOf8ci80dFcArUf21dmpvg7qVmBy'
WHERE username = 'superadmin'
  AND is_super_admin = 1
  AND password = 'admin@2026';


-- ---- V20260222b: tenant storage billing ----
-- ==================================================================
-- 租户存储与收费管理（幂等：跳过已存在的列/表）
-- ==================================================================

-- 1. 给 t_tenant 增加套餐与存储字段（逐列添加，已存在则忽略）
SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='plan_type');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant ADD COLUMN plan_type VARCHAR(20) NOT NULL DEFAULT ''TRIAL'' COMMENT ''套餐类型: TRIAL/BASIC/PRO/ENTERPRISE'' AFTER paid_status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='monthly_fee');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant ADD COLUMN monthly_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT ''月费(元)'' AFTER plan_type');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='storage_quota_mb');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant ADD COLUMN storage_quota_mb BIGINT NOT NULL DEFAULT 1024 COMMENT ''存储配额(MB)，默认1GB'' AFTER monthly_fee');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='storage_used_mb');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant ADD COLUMN storage_used_mb BIGINT NOT NULL DEFAULT 0 COMMENT ''已用存储(MB)'' AFTER storage_quota_mb');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. 创建计费记录表
CREATE TABLE IF NOT EXISTS t_tenant_billing_record (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    billing_no      VARCHAR(50)     NOT NULL COMMENT '账单编号 BILL20260222001',
    tenant_id       BIGINT          NOT NULL COMMENT '租户ID',
    tenant_name     VARCHAR(100)    NULL COMMENT '租户名称(冗余)',
    billing_month   VARCHAR(7)      NOT NULL COMMENT '账单月份 2026-02',
    plan_type       VARCHAR(20)     NOT NULL COMMENT '套餐类型',
    base_fee        DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT '套餐基础费',
    storage_fee     DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT '超额存储费',
    user_fee        DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT '超额用户费',
    total_amount    DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT '合计金额',
    status          VARCHAR(20)     NOT NULL DEFAULT 'PENDING' COMMENT '状态: PENDING/PAID/OVERDUE/WAIVED',
    paid_time       DATETIME        NULL COMMENT '支付时间',
    remark          VARCHAR(500)    NULL COMMENT '备注',
    created_by      VARCHAR(50)     NULL COMMENT '创建人',
    create_time     DATETIME        DEFAULT CURRENT_TIMESTAMP,
    update_time     DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    delete_flag     TINYINT         DEFAULT 0,
    UNIQUE KEY uk_tenant_month (tenant_id, billing_month),
    INDEX idx_billing_no (billing_no),
    INDEX idx_status (status),
    INDEX idx_billing_month (billing_month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='租户计费记录';

-- 3. 套餐定义参考表（后端硬编码即可，这里仅做参考说明）
-- TRIAL:      免费试用,   0元/月,   1GB存储,  5用户
-- BASIC:      基础版,   199元/月,   5GB存储,  20用户
-- PRO:        专业版,   499元/月,  20GB存储,  50用户
-- ENTERPRISE: 企业版,   999元/月, 100GB存储, 200用户


-- ---- V20260222c: billing cycle ----
-- ==================================================================
-- 支持月付/年付计费周期（幂等：跳过已存在的列）
-- ==================================================================

-- 1. 给 t_tenant 增加计费周期字段
SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='billing_cycle');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant ADD COLUMN billing_cycle VARCHAR(10) NOT NULL DEFAULT ''MONTHLY'' COMMENT ''计费周期: MONTHLY/YEARLY'' AFTER storage_used_mb');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. 给 t_tenant_billing_record 增加计费周期字段
SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record' AND COLUMN_NAME='billing_cycle');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant_billing_record ADD COLUMN billing_cycle VARCHAR(10) NOT NULL DEFAULT ''MONTHLY'' COMMENT ''计费周期: MONTHLY/YEARLY'' AFTER plan_type');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ---- V20260222d: add tenant app permission ----
-- ============================================================
-- 新增 MENU_TENANT_APP 权限码（API对接管理菜单）
-- 该菜单归属系统设置分组，租户主账号和有权限的角色可见
-- 日期：2026-02-22
-- ============================================================

-- 新增 API对接管理 菜单权限（parent_id=5 即系统设置分组）
INSERT INTO t_permission (permission_name, permission_code, permission_type, parent_id, status)
SELECT 'API对接管理', 'MENU_TENANT_APP', 'menu', 5, 'ENABLED'
WHERE NOT EXISTS (SELECT 1 FROM t_permission WHERE permission_code = 'MENU_TENANT_APP');


-- ---- V20260222e: user feedback ----
-- =============================================
-- 用户问题反馈表
-- 小程序和PC端双端提交，超管在客户管理页面查看
-- =============================================

CREATE TABLE IF NOT EXISTS `t_user_feedback` (
  `id`            BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
  `tenant_id`     BIGINT       NULL     COMMENT '租户ID',
  `user_id`       BIGINT       NULL     COMMENT '提交人ID',
  `user_name`     VARCHAR(100) NULL     COMMENT '提交人姓名',
  `tenant_name`   VARCHAR(200) NULL     COMMENT '租户名称（冗余，方便查询）',
  `source`        VARCHAR(20)  NOT NULL DEFAULT 'PC' COMMENT '来源：PC / MINIPROGRAM',
  `category`      VARCHAR(50)  NOT NULL DEFAULT 'BUG' COMMENT '分类：BUG / SUGGESTION / QUESTION / OTHER',
  `title`         VARCHAR(200) NOT NULL COMMENT '标题',
  `content`       TEXT         NOT NULL COMMENT '详细描述',
  `screenshot_urls` TEXT       NULL     COMMENT '截图URL（JSON数组）',
  `contact`       VARCHAR(100) NULL     COMMENT '联系方式（选填）',
  `status`        VARCHAR(20)  NOT NULL DEFAULT 'PENDING' COMMENT '状态：PENDING / PROCESSING / RESOLVED / CLOSED',
  `reply`         TEXT         NULL     COMMENT '管理员回复',
  `reply_time`    DATETIME     NULL     COMMENT '回复时间',
  `reply_user_id` BIGINT       NULL     COMMENT '回复人ID',
  `create_time`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_tenant_id` (`tenant_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_status` (`status`),
  KEY `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户问题反馈';


-- ---- V20260223: unit price audit and pattern version ----
-- ======================================================================
-- 单价审计日志 + 纸样版本管理 (来自错误放置的 db/V2026012101 文件)
-- 原文件位于 db/ 根目录，Flyway 未能识别，本文件将其正式纳入迁移管理
-- 日期：2026-02-23
-- ======================================================================

-- 1. 单价修改审计日志表
CREATE TABLE IF NOT EXISTS `t_unit_price_audit_log` (
    `id`            VARCHAR(36)   NOT NULL PRIMARY KEY COMMENT '主键ID',
    `style_no`      VARCHAR(50)   NOT NULL COMMENT '款号',
    `process_name`  VARCHAR(50)   NOT NULL COMMENT '工序名称',
    `old_price`     DECIMAL(10,2) DEFAULT 0.00 COMMENT '修改前单价',
    `new_price`     DECIMAL(10,2) DEFAULT 0.00 COMMENT '修改后单价',
    `change_source` VARCHAR(30)   NOT NULL COMMENT '变更来源: template/scan/reconciliation',
    `related_id`    VARCHAR(36)   DEFAULT NULL COMMENT '关联ID',
    `operator`      VARCHAR(50)   DEFAULT NULL COMMENT '操作人',
    `create_time`   DATETIME      DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `remark`        VARCHAR(200)  DEFAULT NULL COMMENT '备注',
    INDEX `idx_style_no`    (`style_no`),
    INDEX `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='单价修改审计日志表';

-- 2. 为款号附件表添加版本管理字段（ADD COLUMN 保证幂等）
CALL _add_col('t_style_attachment', 'biz_type', 'VARCHAR(30)  DEFAULT \'general\'
        COMMENT \'业务类型: general/pattern/pattern_grading/workorder\',
    ADD COLUMN `version`        INT          DEFAULT 1
        COMMENT \'版本号\',
    ADD COLUMN `version_remark` VARCHAR(200) DEFAULT NULL
        COMMENT \'版本说明\',
    ADD COLUMN `status`         VARCHAR(20)  DEFAULT \'active\'
        COMMENT \'状态: active/archived\',
    ADD COLUMN `uploader`       VARCHAR(50)  DEFAULT NULL
        COMMENT \'上传人\',
    ADD COLUMN `parent_id`      VARCHAR(36)  DEFAULT NULL
        COMMENT \'父版本ID\'');

CALL _add_idx('t_style_attachment', 'idx_style_attachment_biz_type', 'INDEX `idx_style_attachment_biz_type` (`biz_type`)');
CALL _add_idx('t_style_attachment', 'idx_style_attachment_status', 'INDEX `idx_style_attachment_status` (`status`)');

-- 3. 纸样检查配置表
CREATE TABLE IF NOT EXISTS `t_pattern_check_config` (
    `id`                    VARCHAR(36) NOT NULL PRIMARY KEY COMMENT '主键ID',
    `style_no`              VARCHAR(50) NOT NULL COMMENT '款号',
    `require_pattern`       TINYINT     DEFAULT 1 COMMENT '是否需要纸样',
    `require_grading`       TINYINT     DEFAULT 1 COMMENT '是否需要放码文件',
    `require_marker`        TINYINT     DEFAULT 0 COMMENT '是否需要排料图',
    `check_on_order_create` TINYINT     DEFAULT 1 COMMENT '创建订单时检查',
    `check_on_cutting`      TINYINT     DEFAULT 1 COMMENT '裁剪时检查',
    `create_time`           DATETIME    DEFAULT CURRENT_TIMESTAMP,
    `update_time`           DATETIME    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `uk_style_no` (`style_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='纸样检查配置表';

-- 4. 为款号信息表添加纸样相关字段
CALL _add_col('t_style_info', 'pattern_status', 'VARCHAR(20) DEFAULT \'pending\'
        COMMENT \'纸样状态: pending/in_progress/completed\',
    ADD COLUMN `pattern_started_at`   DATETIME DEFAULT NULL
        COMMENT \'纸样开始时间\',
    ADD COLUMN `pattern_completed_at` DATETIME DEFAULT NULL
        COMMENT \'纸样完成时间\',
    ADD COLUMN `grading_status`       VARCHAR(20) DEFAULT \'pending\'
        COMMENT \'放码状态: pending/in_progress/completed\',
    ADD COLUMN `grading_completed_at` DATETIME DEFAULT NULL
        COMMENT \'放码完成时间\'');


-- ---- V20260223b: remaining tables and operator fields ----
-- ======================================================================
-- 遗漏的建表 + 字段补全 (来自 backend/sql/ 下8个从未执行的手工脚本)
-- 涵盖文件:
--   20260131_create_material_inbound.sql      (入库表)
--   20260131_create_operation_log.sql         (操作日志表 - 兼容V20260221b)
--   20260131_create_pattern_revision_table.sql (纸样修改记录表)
--   20260131_alter_style_bom_add_stock_fields.sql (BOM库存字段)
--   20260131_enhance_material_reconciliation_fields.sql (对账表字段)
--   20260131_add_operator_fields_system_wide.sql (操作人字段)
--   20260201_add_production_order_creator_tracking.sql (创建人追踪)
--   create_expense_reimbursement.sql          (费用报销表)
-- 日期：2026-02-23
-- ======================================================================

-- ======================================================================
-- Part 1：面辅料入库记录表（含序号表）
-- ======================================================================
CREATE TABLE IF NOT EXISTS `t_material_inbound` (
    `id`                VARCHAR(32)  NOT NULL PRIMARY KEY COMMENT '主键ID',
    `inbound_no`        VARCHAR(50)  NOT NULL UNIQUE COMMENT '入库单号 IB+日期+序号',
    `purchase_id`       VARCHAR(32)  DEFAULT NULL COMMENT '关联采购单ID',
    `material_code`     VARCHAR(50)  NOT NULL COMMENT '物料编码',
    `material_name`     VARCHAR(100) NOT NULL COMMENT '物料名称',
    `material_type`     VARCHAR(20)  DEFAULT NULL COMMENT '物料类型',
    `color`             VARCHAR(50)  DEFAULT NULL COMMENT '颜色',
    `size`              VARCHAR(50)  DEFAULT NULL COMMENT '规格',
    `inbound_quantity`  INT          NOT NULL COMMENT '入库数量',
    `warehouse_location` VARCHAR(100) DEFAULT '默认仓' COMMENT '仓库位置',
    `supplier_name`     VARCHAR(100) DEFAULT NULL COMMENT '供应商名称',
    `operator_id`       VARCHAR(32)  DEFAULT NULL COMMENT '操作人ID',
    `operator_name`     VARCHAR(50)  DEFAULT NULL COMMENT '操作人姓名',
    `inbound_time`      DATETIME     NOT NULL COMMENT '入库时间',
    `remark`            TEXT         DEFAULT NULL COMMENT '备注',
    `tenant_id`         BIGINT       DEFAULT NULL COMMENT '租户ID',
    `create_time`       DATETIME     DEFAULT CURRENT_TIMESTAMP,
    `update_time`       DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `delete_flag`       TINYINT      DEFAULT 0,
    INDEX `idx_purchase_id`   (`purchase_id`),
    INDEX `idx_material_code` (`material_code`),
    INDEX `idx_inbound_time`  (`inbound_time`),
    INDEX `idx_tenant_id`     (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='面辅料入库记录表';

CREATE TABLE IF NOT EXISTS `t_material_inbound_sequence` (
    `id`              INT  NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `inbound_date`    DATE NOT NULL COMMENT '入库日期',
    `sequence_number` INT  NOT NULL DEFAULT 1 COMMENT '当日序号',
    UNIQUE KEY `uk_inbound_date` (`inbound_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='入库单号序列表';

-- 采购表补充入库记录关联字段
CALL _add_col('t_material_purchase', 'inbound_record_id', 'VARCHAR(32) DEFAULT NULL
    COMMENT \'最新入库单ID\'');
CALL _add_idx('t_material_purchase', 'idx_mpu_inbound_record_id', 'INDEX `idx_mpu_inbound_record_id` (`inbound_record_id`)');


-- ======================================================================
-- Part 2：纸样修改记录表
-- ======================================================================
CREATE TABLE IF NOT EXISTS `t_pattern_revision` (
    `id`                    VARCHAR(64)  NOT NULL PRIMARY KEY COMMENT '主键ID',
    `style_id`              VARCHAR(64)  DEFAULT NULL COMMENT '款号ID',
    `style_no`              VARCHAR(100) DEFAULT NULL COMMENT '款号',
    `revision_no`           VARCHAR(100) DEFAULT NULL COMMENT '修改版本号（V1.0/V1.1/V2.0）',
    `revision_type`         VARCHAR(50)  DEFAULT NULL COMMENT '修改类型: MINOR/MAJOR/URGENT',
    `revision_reason`       TEXT         DEFAULT NULL COMMENT '修改原因',
    `revision_content`      TEXT         DEFAULT NULL COMMENT '修改内容详情',
    `before_changes`        TEXT         DEFAULT NULL COMMENT '修改前信息JSON',
    `after_changes`         TEXT         DEFAULT NULL COMMENT '修改后信息JSON',
    `attachment_urls`       TEXT         DEFAULT NULL COMMENT '附件URL列表JSON',
    `status`                VARCHAR(50)  DEFAULT 'DRAFT'
        COMMENT '状态: DRAFT/SUBMITTED/APPROVED/REJECTED/COMPLETED',
    `revision_date`         DATE         DEFAULT NULL COMMENT '修改日期',
    `expected_complete_date` DATE        DEFAULT NULL COMMENT '预计完成日期',
    `actual_complete_date`  DATE         DEFAULT NULL COMMENT '实际完成日期',
    `maintainer_id`         VARCHAR(64)  DEFAULT NULL COMMENT '维护人ID',
    `maintainer_name`       VARCHAR(100) DEFAULT NULL COMMENT '维护人姓名',
    `maintain_time`         DATETIME     DEFAULT NULL COMMENT '维护时间',
    `submitter_id`          VARCHAR(64)  DEFAULT NULL COMMENT '提交人ID',
    `submitter_name`        VARCHAR(100) DEFAULT NULL COMMENT '提交人姓名',
    `submit_time`           DATETIME     DEFAULT NULL COMMENT '提交时间',
    `approver_id`           VARCHAR(64)  DEFAULT NULL COMMENT '审核人ID',
    `approver_name`         VARCHAR(100) DEFAULT NULL COMMENT '审核人姓名',
    `approval_time`         DATETIME     DEFAULT NULL COMMENT '审核时间',
    `approval_comment`      TEXT         DEFAULT NULL COMMENT '审核意见',
    `pattern_maker_id`      VARCHAR(64)  DEFAULT NULL COMMENT '纸样师傅ID',
    `pattern_maker_name`    VARCHAR(100) DEFAULT NULL COMMENT '纸样师傅姓名',
    `factory_id`            VARCHAR(64)  DEFAULT NULL COMMENT '工厂ID',
    `tenant_id`             BIGINT       DEFAULT NULL COMMENT '租户ID',
    `remark`                TEXT         DEFAULT NULL COMMENT '备注',
    `create_time`           DATETIME     DEFAULT CURRENT_TIMESTAMP,
    `update_time`           DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `create_by`             VARCHAR(100) DEFAULT NULL COMMENT '创建人',
    `update_by`             VARCHAR(100) DEFAULT NULL COMMENT '更新人',
    INDEX `idx_style_no`       (`style_no`),
    INDEX `idx_style_id`       (`style_id`),
    INDEX `idx_maintainer`     (`maintainer_id`),
    INDEX `idx_status`         (`status`),
    INDEX `idx_revision_date`  (`revision_date`),
    INDEX `idx_tenant_id`      (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='纸样修改记录表';


-- ======================================================================
-- Part 3：费用报销表
-- ======================================================================
CREATE TABLE IF NOT EXISTS `t_expense_reimbursement` (
    `id`                VARCHAR(64)   NOT NULL PRIMARY KEY COMMENT '主键UUID',
    `reimbursement_no`  VARCHAR(64)   NOT NULL UNIQUE COMMENT '报销单号 EX+日期+序号',
    `applicant_id`      BIGINT        NOT NULL COMMENT '申请人ID',
    `applicant_name`    VARCHAR(64)   NOT NULL COMMENT '申请人姓名',
    `expense_type`      VARCHAR(32)   NOT NULL
        COMMENT '费用类型: taxi/travel/material_advance/office/other',
    `title`             VARCHAR(200)  NOT NULL COMMENT '报销标题/事由',
    `amount`            DECIMAL(12,2) NOT NULL COMMENT '报销金额',
    `expense_date`      DATE          NOT NULL COMMENT '费用发生日期',
    `description`       TEXT          DEFAULT NULL COMMENT '详细说明',
    `order_no`          VARCHAR(64)   DEFAULT NULL COMMENT '关联订单号',
    `supplier_name`     VARCHAR(128)  DEFAULT NULL COMMENT '供应商名称',
    `payment_account`   VARCHAR(128)  DEFAULT NULL COMMENT '收款账号',
    `payment_method`    VARCHAR(32)   DEFAULT 'bank_transfer'
        COMMENT '付款方式: bank_transfer/alipay/wechat',
    `account_name`      VARCHAR(64)   DEFAULT NULL COMMENT '收款户名',
    `bank_name`         VARCHAR(128)  DEFAULT NULL COMMENT '开户银行',
    `attachments`       TEXT          DEFAULT NULL COMMENT '附件URL列表JSON',
    `status`            VARCHAR(20)   NOT NULL DEFAULT 'pending'
        COMMENT '状态: pending/approved/rejected/paid',
    `approver_id`       BIGINT        DEFAULT NULL COMMENT '审批人ID',
    `approver_name`     VARCHAR(64)   DEFAULT NULL COMMENT '审批人姓名',
    `approval_time`     DATETIME      DEFAULT NULL COMMENT '审批时间',
    `approval_remark`   VARCHAR(500)  DEFAULT NULL COMMENT '审批备注',
    `payment_time`      DATETIME      DEFAULT NULL COMMENT '付款时间',
    `payment_by`        VARCHAR(64)   DEFAULT NULL COMMENT '付款操作人',
    `create_time`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `update_time`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `create_by`         VARCHAR(64)   DEFAULT NULL,
    `update_by`         VARCHAR(64)   DEFAULT NULL,
    `delete_flag`       INT           NOT NULL DEFAULT 0,
    `tenant_id`         BIGINT        DEFAULT NULL COMMENT '租户ID',
    KEY `idx_applicant_id` (`applicant_id`),
    KEY `idx_status`       (`status`),
    KEY `idx_expense_type` (`expense_type`),
    KEY `idx_create_time`  (`create_time`),
    KEY `idx_tenant_id`    (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='费用报销表';


-- ======================================================================
-- Part 4：t_style_bom 库存检查字段
-- ======================================================================
CALL _add_col('t_style_bom', 'stock_status', 'VARCHAR(20) DEFAULT NULL
        COMMENT \'库存状态: sufficient/insufficient/none/unchecked\',
    ADD COLUMN `available_stock`   INT         DEFAULT NULL
        COMMENT \'可用库存（quantity - locked_quantity）\',
    ADD COLUMN `required_purchase` INT         DEFAULT NULL
        COMMENT \'需采购数量（需求量 - 可用库存，最小为0）\'');


-- ======================================================================
-- Part 5：物料对账表补充字段
-- ======================================================================
CALL _add_col('t_material_reconciliation', 'source_type', 'VARCHAR(20)  DEFAULT NULL
        COMMENT \'采购类型: order=批量订单, sample=样衣开发\',
    ADD COLUMN `pattern_production_id`    VARCHAR(36)  DEFAULT NULL
        COMMENT \'样衣生产ID（source_type=sample时使用）\',
    ADD COLUMN `expected_arrival_date`    DATETIME     DEFAULT NULL
        COMMENT \'预计到货日期\',
    ADD COLUMN `actual_arrival_date`      DATETIME     DEFAULT NULL
        COMMENT \'实际到货日期\',
    ADD COLUMN `inbound_date`             DATETIME     DEFAULT NULL
        COMMENT \'入库日期\',
    ADD COLUMN `warehouse_location`       VARCHAR(100) DEFAULT NULL
        COMMENT \'仓库库区\'');


-- ======================================================================
-- Part 6：各业务表操作人/创建人字段（全系统统一）
-- ======================================================================

-- t_material_purchase 创建人/更新人
CALL _add_col('t_material_purchase', 'creator_id', 'VARCHAR(32)  DEFAULT NULL COMMENT \'创建人ID\',
    ADD COLUMN `creator_name` VARCHAR(100) DEFAULT NULL COMMENT \'创建人姓名\',
    ADD COLUMN `updater_id`   VARCHAR(32)  DEFAULT NULL COMMENT \'更新人ID\',
    ADD COLUMN `updater_name` VARCHAR(100) DEFAULT NULL COMMENT \'更新人姓名\'');
CALL _add_idx('t_material_purchase', 'idx_mpu_creator_id', 'INDEX `idx_mpu_creator_id` (`creator_id`)');

-- t_product_outstock 出库操作人/创建人
CALL _add_col('t_product_outstock', 'operator_id', 'VARCHAR(32)  DEFAULT NULL COMMENT \'出库操作人ID\',
    ADD COLUMN `operator_name` VARCHAR(100) DEFAULT NULL COMMENT \'出库操作人姓名\',
    ADD COLUMN `creator_id`    VARCHAR(32)  DEFAULT NULL COMMENT \'创建人ID\',
    ADD COLUMN `creator_name`  VARCHAR(100) DEFAULT NULL COMMENT \'创建人姓名\'');
CALL _add_idx('t_product_outstock', 'idx_pos_operator_id', 'INDEX `idx_pos_operator_id` (`operator_id`)');
CALL _add_idx('t_product_outstock', 'idx_pos_creator_id', 'INDEX `idx_pos_creator_id` (`creator_id`)');

-- t_cutting_bundle 创建人/操作人
CALL _add_col('t_cutting_bundle', 'creator_id', 'VARCHAR(32)  DEFAULT NULL COMMENT \'创建人ID\',
    ADD COLUMN `creator_name`  VARCHAR(100) DEFAULT NULL COMMENT \'创建人姓名\',
    ADD COLUMN `operator_id`   VARCHAR(32)  DEFAULT NULL COMMENT \'最后扫码操作人ID\',
    ADD COLUMN `operator_name` VARCHAR(100) DEFAULT NULL COMMENT \'操作人姓名\'');
CALL _add_idx('t_cutting_bundle', 'idx_cb_creator_id', 'INDEX `idx_cb_creator_id` (`creator_id`)');
CALL _add_idx('t_cutting_bundle', 'idx_cb_operator_id', 'INDEX `idx_cb_operator_id` (`operator_id`)');

-- t_style_quotation 创建/更新/审核人
CALL _add_col('t_style_quotation', 'creator_id', 'VARCHAR(32)  DEFAULT NULL COMMENT \'创建人ID\',
    ADD COLUMN `creator_name` VARCHAR(100) DEFAULT NULL COMMENT \'创建人姓名\',
    ADD COLUMN `updater_id`   VARCHAR(32)  DEFAULT NULL COMMENT \'更新人ID\',
    ADD COLUMN `updater_name` VARCHAR(100) DEFAULT NULL COMMENT \'更新人姓名\',
    ADD COLUMN `auditor_id`   VARCHAR(32)  DEFAULT NULL COMMENT \'审核人ID\',
    ADD COLUMN `auditor_name` VARCHAR(100) DEFAULT NULL COMMENT \'审核人姓名\',
    ADD COLUMN `audit_time`   DATETIME     DEFAULT NULL COMMENT \'审核时间\'');
CALL _add_idx('t_style_quotation', 'idx_sq_creator_id', 'INDEX `idx_sq_creator_id` (`creator_id`)');
CALL _add_idx('t_style_quotation', 'idx_sq_auditor_id', 'INDEX `idx_sq_auditor_id` (`auditor_id`)');

-- t_payroll_settlement 审核/确认人
CALL _add_col('t_payroll_settlement', 'auditor_id', 'VARCHAR(32)  DEFAULT NULL COMMENT \'审核人ID\',
    ADD COLUMN `auditor_name`  VARCHAR(100) DEFAULT NULL COMMENT \'审核人姓名\',
    ADD COLUMN `audit_time`    DATETIME     DEFAULT NULL COMMENT \'审核时间\',
    ADD COLUMN `confirmer_id`  VARCHAR(32)  DEFAULT NULL COMMENT \'确认人ID\',
    ADD COLUMN `confirmer_name` VARCHAR(100) DEFAULT NULL COMMENT \'确认人姓名\',
    ADD COLUMN `confirm_time`  DATETIME     DEFAULT NULL COMMENT \'确认时间\'');
CALL _add_idx('t_payroll_settlement', 'idx_pse_auditor_id', 'INDEX `idx_pse_auditor_id` (`auditor_id`)');
CALL _add_idx('t_payroll_settlement', 'idx_pse_confirmer_id', 'INDEX `idx_pse_confirmer_id` (`confirmer_id`)');

-- t_cutting_task 创建/更新人
CALL _add_col('t_cutting_task', 'creator_id', 'VARCHAR(32)  DEFAULT NULL COMMENT \'创建人ID\',
    ADD COLUMN `creator_name` VARCHAR(100) DEFAULT NULL COMMENT \'创建人姓名\',
    ADD COLUMN `updater_id`   VARCHAR(32)  DEFAULT NULL COMMENT \'更新人ID\',
    ADD COLUMN `updater_name` VARCHAR(100) DEFAULT NULL COMMENT \'更新人姓名\'');
CALL _add_idx('t_cutting_task', 'idx_ct_creator_id', 'INDEX `idx_ct_creator_id` (`creator_id`)');

-- t_secondary_process 创建/领取/操作人
CALL _add_col('t_secondary_process', 'creator_id', 'VARCHAR(32)  DEFAULT NULL COMMENT \'创建人ID\',
    ADD COLUMN `creator_name`  VARCHAR(100) DEFAULT NULL COMMENT \'创建人姓名\',
    ADD COLUMN `assignee_id`   VARCHAR(32)  DEFAULT NULL COMMENT \'领取人ID\',
    ADD COLUMN `operator_id`   VARCHAR(32)  DEFAULT NULL COMMENT \'完成操作人ID\',
    ADD COLUMN `operator_name` VARCHAR(100) DEFAULT NULL COMMENT \'完成操作人姓名\'');
CALL _add_idx('t_secondary_process', 'idx_spc_creator_id', 'INDEX `idx_spc_creator_id` (`creator_id`)');
CALL _add_idx('t_secondary_process', 'idx_spc_assignee_id', 'INDEX `idx_spc_assignee_id` (`assignee_id`)');

-- t_pattern_production 领取/纸样师傅ID
CALL _add_col('t_pattern_production', 'receiver_id', 'VARCHAR(32) DEFAULT NULL COMMENT \'领取人ID\',
    ADD COLUMN `pattern_maker_id` VARCHAR(32) DEFAULT NULL COMMENT \'纸样师傅ID\'');
CALL _add_idx('t_pattern_production', 'idx_pp_receiver_id', 'INDEX `idx_pp_receiver_id` (`receiver_id`)');
CALL _add_idx('t_pattern_production', 'idx_pp_pattern_maker_id', 'INDEX `idx_pp_pattern_maker_id` (`pattern_maker_id`)');

-- t_shipment_reconciliation 对账/审核人
CALL _add_col('t_shipment_reconciliation', 'reconciliation_operator_id', 'VARCHAR(32)  DEFAULT NULL COMMENT \'对账操作人ID\',
    ADD COLUMN `reconciliation_operator_name` VARCHAR(100) DEFAULT NULL COMMENT \'对账操作人姓名\',
    ADD COLUMN `reconciliation_time`          DATETIME     DEFAULT NULL COMMENT \'对账时间\',
    ADD COLUMN `auditor_id`                   VARCHAR(32)  DEFAULT NULL COMMENT \'审核人ID\',
    ADD COLUMN `auditor_name`                 VARCHAR(100) DEFAULT NULL COMMENT \'审核人姓名\',
    ADD COLUMN `audit_time`                   DATETIME     DEFAULT NULL COMMENT \'审核时间\'');
CALL _add_idx('t_shipment_reconciliation', 'idx_shr_reconciliation_operator_id', 'INDEX `idx_shr_reconciliation_operator_id` (`reconciliation_operator_id`)');
CALL _add_idx('t_shipment_reconciliation', 'idx_shr_auditor_id', 'INDEX `idx_shr_auditor_id` (`auditor_id`)');


-- ======================================================================
-- Part 7：生产订单创建人追踪（来自 20260201 脚本）
-- ======================================================================
CALL _add_col('t_production_order', 'created_by_id', 'VARCHAR(50)  DEFAULT NULL COMMENT \'创建人ID\',
    ADD COLUMN `created_by_name` VARCHAR(100) DEFAULT NULL COMMENT \'创建人姓名\'');

CALL _add_idx('t_production_order', 'idx_po_created_by_id', 'INDEX `idx_po_created_by_id` (`created_by_id`)');

-- 为已有数据设置默认创建人标记（只对 NULL 记录执行，幂等）
UPDATE `t_production_order`
SET `created_by_id`   = 'system_migration',
    `created_by_name` = '系统迁移'
WHERE `created_by_id` IS NULL;


-- ---- V20260223c: add payment approval permissions ----
-- 添加付款审批管理和查看权限
-- WagePaymentController 方法级 @PreAuthorize 引用了这两个权限码
-- 如果不存在则插入，避免重复

INSERT IGNORE INTO t_permission (name, code, type, parent_id, status, created_at, updated_at)
SELECT '付款审批管理', 'MENU_FINANCE_PAYROLL_APPROVAL_MANAGE', 'menu',
       (SELECT id FROM (SELECT id FROM t_permission WHERE code = 'MENU_FINANCE') tmp), 'active', NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM t_permission WHERE code = 'MENU_FINANCE_PAYROLL_APPROVAL_MANAGE');

INSERT IGNORE INTO t_permission (name, code, type, parent_id, status, created_at, updated_at)
SELECT '待付款查看', 'MENU_FINANCE_PAYROLL_APPROVAL_VIEW', 'menu',
       (SELECT id FROM (SELECT id FROM t_permission WHERE code = 'MENU_FINANCE') tmp), 'active', NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM t_permission WHERE code = 'MENU_FINANCE_PAYROLL_APPROVAL_VIEW');

-- 为所有角色模板分配新权限（确保租户主账号可用）
INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM t_role r
CROSS JOIN t_permission p
WHERE p.code IN ('MENU_FINANCE_PAYROLL_APPROVAL_MANAGE', 'MENU_FINANCE_PAYROLL_APPROVAL_VIEW')
  AND r.is_system = 1
  AND NOT EXISTS (
    SELECT 1 FROM t_role_permission rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );


-- ---- V20260223d: billing invoice and tenant self service ----
-- ============================================================
-- V20260223d: 账单发票字段 + 租户开票信息
-- 1. t_tenant_billing_record 增加发票相关字段
-- 2. t_tenant 增加默认开票信息（租户自助维护）
-- ============================================================

-- 1. 账单增加发票字段
SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record' AND COLUMN_NAME='invoice_required');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant_billing_record ADD COLUMN invoice_required TINYINT DEFAULT 0 COMMENT ''是否需要发票'' AFTER remark');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record' AND COLUMN_NAME='invoice_status');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant_billing_record ADD COLUMN invoice_status VARCHAR(20) DEFAULT ''NOT_REQUIRED'' COMMENT ''发票状态: NOT_REQUIRED/PENDING/ISSUED/MAILED'' AFTER invoice_required');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record' AND COLUMN_NAME='invoice_title');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant_billing_record ADD COLUMN invoice_title VARCHAR(200) DEFAULT NULL COMMENT ''发票抬头'' AFTER invoice_status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record' AND COLUMN_NAME='invoice_tax_no');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant_billing_record ADD COLUMN invoice_tax_no VARCHAR(50) DEFAULT NULL COMMENT ''纳税人识别号'' AFTER invoice_title');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record' AND COLUMN_NAME='invoice_no');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant_billing_record ADD COLUMN invoice_no VARCHAR(50) DEFAULT NULL COMMENT ''发票号码'' AFTER invoice_tax_no');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record' AND COLUMN_NAME='invoice_amount');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant_billing_record ADD COLUMN invoice_amount DECIMAL(12,2) DEFAULT NULL COMMENT ''发票金额'' AFTER invoice_no');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record' AND COLUMN_NAME='invoice_issued_time');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant_billing_record ADD COLUMN invoice_issued_time DATETIME DEFAULT NULL COMMENT ''开票时间'' AFTER invoice_amount');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record' AND COLUMN_NAME='invoice_bank_name');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant_billing_record ADD COLUMN invoice_bank_name VARCHAR(100) DEFAULT NULL COMMENT ''开户银行'' AFTER invoice_issued_time');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record' AND COLUMN_NAME='invoice_bank_account');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant_billing_record ADD COLUMN invoice_bank_account VARCHAR(50) DEFAULT NULL COMMENT ''银行账号'' AFTER invoice_bank_name');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record' AND COLUMN_NAME='invoice_address');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant_billing_record ADD COLUMN invoice_address VARCHAR(200) DEFAULT NULL COMMENT ''注册地址'' AFTER invoice_bank_account');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record' AND COLUMN_NAME='invoice_phone');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant_billing_record ADD COLUMN invoice_phone VARCHAR(30) DEFAULT NULL COMMENT ''注册电话'' AFTER invoice_address');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. t_tenant 增加默认开票信息（租户可自助维护，生成账单时自动填充）
SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='invoice_title');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant ADD COLUMN invoice_title VARCHAR(200) DEFAULT NULL COMMENT ''默认发票抬头'' AFTER contact_phone');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='invoice_tax_no');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant ADD COLUMN invoice_tax_no VARCHAR(50) DEFAULT NULL COMMENT ''默认纳税人识别号'' AFTER invoice_title');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='invoice_bank_name');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant ADD COLUMN invoice_bank_name VARCHAR(100) DEFAULT NULL COMMENT ''开户银行'' AFTER invoice_tax_no');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='invoice_bank_account');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant ADD COLUMN invoice_bank_account VARCHAR(50) DEFAULT NULL COMMENT ''银行账号'' AFTER invoice_bank_name');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='invoice_address');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant ADD COLUMN invoice_address VARCHAR(200) DEFAULT NULL COMMENT ''注册地址'' AFTER invoice_bank_account');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='invoice_phone');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant ADD COLUMN invoice_phone VARCHAR(30) DEFAULT NULL COMMENT ''注册电话'' AFTER invoice_address');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ---- V20260224: add data import permission ----
-- 添加数据导入菜单权限
INSERT INTO t_permission (permission_code, permission_name, permission_type, description, create_time, update_time)
SELECT 'MENU_DATA_IMPORT', '数据导入', 'MENU', 'Excel批量导入基础数据（款式、供应商、员工、工序）', NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (
    SELECT 1 FROM t_permission WHERE permission_code = 'MENU_DATA_IMPORT'
);

-- 为所有租户主账号角色分配数据导入权限（租户主账号=租户内最高权限）
INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM t_role r
CROSS JOIN (SELECT id FROM t_permission WHERE permission_code = 'MENU_DATA_IMPORT') p
WHERE r.role_name = 'tenant_owner';


-- ---- V20260225: add user avatar url ----
-- 给 t_user 表添加头像 URL 字段
CALL _add_col('t_user', 'avatar_url', 'VARCHAR(500) DEFAULT NULL COMMENT \'用户头像URL（COS存储路径）\'');


-- ---- V2026022601: sync flow stage view latest ----
-- V2026022601: 同步 v_production_order_flow_stage_snapshot 视图至最新定义
-- 原因: V2026022201 的视图定义已落后于 ViewMigrator 内联 SQL：
--   1. ironing_* 列原来只匹配 '%大烫%/%整烫%/%烫%'，现改为「尾部」父节点聚合
--   2. packaging_* 列原来只匹配 '%包装%'，现改为「尾部」父节点聚合（与 ironing_* 值相同）
--   3. car_sewing_* 列增加 progress_stage IN ('carSewing','car_sewing','车缝') 匹配
-- 此迁移确保生产环境（FASHION_DB_INITIALIZER_ENABLED=false）也能用到最新视图

CREATE OR REPLACE VIEW v_production_order_flow_stage_snapshot AS
SELECT
  sr.order_id AS order_id,
  sr.tenant_id AS tenant_id,
  MIN(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '下单' THEN sr.scan_time END) AS order_start_time,
  MAX(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '下单' THEN sr.scan_time END) AS order_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '下单' THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS order_operator_name,
  MAX(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '采购' THEN sr.scan_time END) AS procurement_scan_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '采购' THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS procurement_scan_operator_name,
  MIN(CASE WHEN sr.scan_type = 'cutting' THEN sr.scan_time END) AS cutting_start_time,
  MAX(CASE WHEN sr.scan_type = 'cutting' THEN sr.scan_time END) AS cutting_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'cutting' THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS cutting_operator_name,
  SUM(CASE WHEN sr.scan_type = 'cutting' THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS cutting_quantity,
  MIN(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT IN ('下单', '采购')
        AND IFNULL(sr.process_code, '') <> 'quality_warehousing'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%质检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%检验%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%品检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%验货%'
      THEN sr.scan_time END) AS sewing_start_time,
  MAX(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT IN ('下单', '采购')
        AND IFNULL(sr.process_code, '') <> 'quality_warehousing'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%质检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%检验%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%品检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%验货%'
      THEN sr.scan_time END) AS sewing_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT IN ('下单', '采购')
        AND IFNULL(sr.process_code, '') <> 'quality_warehousing'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%质检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%检验%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%品检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%验货%'
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS sewing_operator_name,
  MIN(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('carSewing', 'car_sewing', '车缝')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%车缝%')
      THEN sr.scan_time END) AS car_sewing_start_time,
  MAX(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('carSewing', 'car_sewing', '车缝')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%车缝%')
      THEN sr.scan_time END) AS car_sewing_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('carSewing', 'car_sewing', '车缝')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%车缝%')
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS car_sewing_operator_name,
  SUM(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('carSewing', 'car_sewing', '车缝')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%车缝%')
      THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS car_sewing_quantity,
  -- ★ ironing_* 列实际存「尾部」父节点聚合（大烫/整烫/剪线/包装/尾工均归尾部）
  MIN(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('尾部', 'ironing', 'packaging', 'tailProcess', 'tail_process')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾部%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%剪线%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾工%')
      THEN sr.scan_time END) AS ironing_start_time,
  MAX(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('尾部', 'ironing', 'packaging', 'tailProcess', 'tail_process')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾部%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%剪线%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾工%')
      THEN sr.scan_time END) AS ironing_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('尾部', 'ironing', 'packaging', 'tailProcess', 'tail_process')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾部%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%剪线%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾工%')
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS ironing_operator_name,
  SUM(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('尾部', 'ironing', 'packaging', 'tailProcess', 'tail_process')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾部%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%剪线%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾工%')
      THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS ironing_quantity,
  MIN(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('secondaryProcess', 'secondary_process', '二次工艺')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%二次%'
             OR TRIM(sr.process_name) LIKE '%绣花%'
             OR TRIM(sr.process_name) LIKE '%印花%')
      THEN sr.scan_time END) AS secondary_process_start_time,
  MAX(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('secondaryProcess', 'secondary_process', '二次工艺')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%二次%'
             OR TRIM(sr.process_name) LIKE '%绣花%'
             OR TRIM(sr.process_name) LIKE '%印花%')
      THEN sr.scan_time END) AS secondary_process_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('secondaryProcess', 'secondary_process', '二次工艺')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%二次%'
             OR TRIM(sr.process_name) LIKE '%绣花%'
             OR TRIM(sr.process_name) LIKE '%印花%')
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS secondary_process_operator_name,
  SUM(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('secondaryProcess', 'secondary_process', '二次工艺')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%二次%'
             OR TRIM(sr.process_name) LIKE '%绣花%'
             OR TRIM(sr.process_name) LIKE '%印花%')
      THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS secondary_process_quantity,
  -- ★ packaging_* 列实际存「尾部」父节点聚合（与 ironing_* 值相同）
  MIN(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('尾部', 'ironing', 'packaging', 'tailProcess', 'tail_process')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾部%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%剪线%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾工%')
      THEN sr.scan_time END) AS packaging_start_time,
  MAX(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('尾部', 'ironing', 'packaging', 'tailProcess', 'tail_process')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾部%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%剪线%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾工%')
      THEN sr.scan_time END) AS packaging_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('尾部', 'ironing', 'packaging', 'tailProcess', 'tail_process')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾部%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%剪线%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾工%')
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS packaging_operator_name,
  SUM(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('尾部', 'ironing', 'packaging', 'tailProcess', 'tail_process')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾部%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%剪线%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾工%')
      THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS packaging_quantity,
  MIN(CASE WHEN (sr.scan_type = 'quality'
        OR IFNULL(sr.process_code, '') = 'quality_warehousing'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%质检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%检验%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%品检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%验货%')
      THEN sr.scan_time END) AS quality_start_time,
  MAX(CASE WHEN (sr.scan_type = 'quality'
        OR IFNULL(sr.process_code, '') = 'quality_warehousing'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%质检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%检验%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%品检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%验货%')
      THEN sr.scan_time END) AS quality_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN (sr.scan_type = 'quality'
        OR IFNULL(sr.process_code, '') = 'quality_warehousing'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%质检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%检验%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%品检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%验货%')
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS quality_operator_name,
  SUM(CASE WHEN (sr.scan_type = 'quality'
        OR IFNULL(sr.process_code, '') = 'quality_warehousing'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%质检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%检验%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%品检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%验货%')
      THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS quality_quantity,
  MIN(CASE WHEN sr.scan_type = 'warehouse' AND IFNULL(sr.process_code, '') <> 'warehouse_rollback' THEN sr.scan_time END) AS warehousing_start_time,
  MAX(CASE WHEN sr.scan_type = 'warehouse' AND IFNULL(sr.process_code, '') <> 'warehouse_rollback' THEN sr.scan_time END) AS warehousing_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'warehouse' AND IFNULL(sr.process_code, '') <> 'warehouse_rollback' THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS warehousing_operator_name,
  SUM(CASE WHEN sr.scan_type = 'warehouse' AND IFNULL(sr.process_code, '') <> 'warehouse_rollback' THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS warehousing_quantity
FROM t_scan_record sr
WHERE sr.scan_result = 'success'
GROUP BY sr.order_id, sr.tenant_id;


-- ---- V2026022602: fix process tracking id types ----
-- =====================================================================================
-- Migration: V2026022602__fix_process_tracking_id_types.sql
--
-- 【根本原因】V34 migration 将 t_production_process_tracking 所有 ID 字段错误定义为 BIGINT，
-- 但 Java 实体类 ProductionProcessTracking 使用 @TableId(type=IdType.ASSIGN_UUID) 和
-- String 类型存储 UUID。云端执行 V34 后建出的是 BIGINT 列，写入 UUID 字符串时 MySQL
-- 静默截断为 0，导致：
--   1. 所有 process_tracking 行的外键都是 0（关联全部断裂）
--   2. 按真实 UUID 查询永远返回空（扫码更新 process_tracking 全部无效）
--   3. 工序进度、工资结算依赖该表的功能全部失效
--
-- 本地开发从未跑过 V34（FLYWAY_ENABLED=false，手动建表且字段正确为 VARCHAR(64)），
-- 所以本地正常，一上云就全部失效。
--
-- 【修复策略】
--   - 不修改 V34（修改会导致 Flyway checksum 校验失败，阻断所有已部署环境）
--   - 本迁移：TRUNCATE 清理 BIGINT 截断的垃圾数据 + ALTER 修正所有 ID 列类型
--   - 新鲜环境：V34 建 BIGINT → 本脚本立即 ALTER 为 VARCHAR(64) → 最终正确
--   - 已部署云端：直接修正列类型 + 清理垃圾数据 → 重新初始化 process_tracking
--
-- 【注意】TRUNCATE 是安全的：云端已有的 BIGINT 数据是被截断的垃圾（UUID→BIGINT=0），
-- 无任何有价值的数据，可以且应当清除后重新从裁剪单数据初始化。
-- =====================================================================================

-- Step 1: 清理被 BIGINT 截断导致的垃圾数据（UUID→BIGINT 全部截断为 0，无法恢复，必须清除）
TRUNCATE TABLE t_production_process_tracking;

-- Step 2: 移除 id 列的 AUTO_INCREMENT（BIGINT AUTO_INCREMENT 不允许直接改为 VARCHAR，须先去掉自增）
ALTER TABLE t_production_process_tracking
    MODIFY COLUMN id BIGINT NOT NULL COMMENT '临时移除AUTO_INCREMENT';

-- Step 3: 删除主键约束（更换主键列类型时必须先删除主键再重建）
ALTER TABLE t_production_process_tracking
    DROP PRIMARY KEY;

-- Step 4: 将所有 BIGINT ID 字段改为 VARCHAR(64) 以匹配 UUID 类型
ALTER TABLE t_production_process_tracking
    MODIFY COLUMN id                  VARCHAR(64)  NOT NULL    COMMENT '主键ID（UUID）',
    MODIFY COLUMN production_order_id VARCHAR(64)  NOT NULL    COMMENT '生产订单ID（UUID）',
    MODIFY COLUMN cutting_bundle_id   VARCHAR(64)  NOT NULL    COMMENT '菲号ID（裁剪单ID，UUID）',
    MODIFY COLUMN scan_record_id      VARCHAR(64)  DEFAULT NULL COMMENT '关联的扫码记录ID（UUID）',
    MODIFY COLUMN operator_id         VARCHAR(64)  DEFAULT NULL COMMENT '操作人ID（UUID）',
    MODIFY COLUMN factory_id          VARCHAR(64)  DEFAULT NULL COMMENT '执行工厂ID（UUID）';

-- Step 5: 重新添加主键
ALTER TABLE t_production_process_tracking
    ADD PRIMARY KEY (id);

-- =====================================================================================
-- 执行完本迁移后，t_production_process_tracking 表结构与本地开发库完全一致：
--   id                 VARCHAR(64) NOT NULL (PRIMARY KEY)
--   production_order_id VARCHAR(64) NOT NULL
--   cutting_bundle_id   VARCHAR(64) NOT NULL
--   scan_record_id      VARCHAR(64) DEFAULT NULL
--   operator_id         VARCHAR(64) DEFAULT NULL
--   factory_id          VARCHAR(64) DEFAULT NULL
--
-- 【部署后操作】表数据已清空，需要重新初始化 process_tracking 记录：
--   对所有「裁剪完成」状态的裁剪单，调用后端初始化接口，或重新触发扫码初始化逻辑。
--   可以通过业务接口 POST /api/internal/maintenance/reinit-process-tracking 重新初始化。
-- =====================================================================================


-- ---- V20260226: add notify config ----
-- V20260226: 添加通知配置（Server酱微信推送Key）
-- 管理员可在后台"应用订单管理"中配置，客户购买后自动推送微信通知

INSERT INTO t_param_config (param_key, param_value, param_desc)
VALUES ('notify.serverchan.key', '', 'Server酱微信推送Key（在 sct.ftqq.com 获取，配置后客户购买App时自动推送通知到管理员微信）')
ON DUPLICATE KEY UPDATE param_desc = VALUES(param_desc);


-- ---- V25: create logistics tables ----
-- ========================================================
-- 物流管理模块数据库表结构
-- 创建时间: 2026-02-01
-- 说明: 物流管理预留模块的数据库表
-- ========================================================

-- 快递单主表
CREATE TABLE IF NOT EXISTS t_express_order (
    id VARCHAR(64) NOT NULL COMMENT '主键ID',
    tracking_no VARCHAR(64) NOT NULL COMMENT '快递单号',
    tracking_no_sub VARCHAR(64) DEFAULT NULL COMMENT '快递单号（备用）',
    express_company INT DEFAULT NULL COMMENT '快递公司(1-顺丰,2-京东,3-EMS,4-中通,5-圆通,6-申通,7-韵达,8-德邦,9-九曳,10-百世,11-天天,12-优速,99-其他)',
    shipment_type INT DEFAULT 1 COMMENT '发货类型(1-普通,2-加急,3-样品,4-退货,5-换货,6-批发,7-零售)',
    logistics_status INT DEFAULT 0 COMMENT '物流状态(0-待发货,1-已发货,2-运输中,3-已到达,4-已签收,5-异常,6-已退回,7-已取消)',
    order_id VARCHAR(64) DEFAULT NULL COMMENT '关联订单ID',
    order_no VARCHAR(64) DEFAULT NULL COMMENT '关联订单号',
    style_id VARCHAR(64) DEFAULT NULL COMMENT '款式ID',
    style_no VARCHAR(64) DEFAULT NULL COMMENT '款式编号',
    style_name VARCHAR(255) DEFAULT NULL COMMENT '款式名称',
    shipment_quantity INT DEFAULT 0 COMMENT '发货数量',
    weight DECIMAL(10,3) DEFAULT NULL COMMENT '发货重量(kg)',
    freight_amount DECIMAL(12,2) DEFAULT NULL COMMENT '运费金额',
    freight_pay_type INT DEFAULT 1 COMMENT '运费支付方式(1-寄付,2-到付)',
    shipper_id VARCHAR(64) DEFAULT NULL COMMENT '发货人ID',
    shipper_name VARCHAR(64) DEFAULT NULL COMMENT '发货人姓名',
    ship_time DATETIME DEFAULT NULL COMMENT '发货时间',
    receiver_name VARCHAR(64) NOT NULL COMMENT '收货人姓名',
    receiver_phone VARCHAR(32) NOT NULL COMMENT '收货人电话',
    receiver_address VARCHAR(500) NOT NULL COMMENT '收货人地址',
    receiver_province VARCHAR(64) DEFAULT NULL COMMENT '收货人省份',
    receiver_city VARCHAR(64) DEFAULT NULL COMMENT '收货人城市',
    receiver_district VARCHAR(64) DEFAULT NULL COMMENT '收货人区县',
    estimated_arrival_time DATETIME DEFAULT NULL COMMENT '预计到达时间',
    actual_sign_time DATETIME DEFAULT NULL COMMENT '实际签收时间',
    sign_person VARCHAR(64) DEFAULT NULL COMMENT '签收人',
    track_update_time DATETIME DEFAULT NULL COMMENT '物流轨迹最后更新时间',
    track_data TEXT DEFAULT NULL COMMENT '物流轨迹数据(JSON格式)',
    platform_order_no VARCHAR(128) DEFAULT NULL COMMENT '电商平台订单号（预留）',
    platform_code VARCHAR(32) DEFAULT NULL COMMENT '电商平台标识（预留）',
    remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    creator_id VARCHAR(64) DEFAULT NULL COMMENT '创建人ID',
    creator_name VARCHAR(64) DEFAULT NULL COMMENT '创建人姓名',
    updater_id VARCHAR(64) DEFAULT NULL COMMENT '更新人ID',
    updater_name VARCHAR(64) DEFAULT NULL COMMENT '更新人姓名',
    delete_flag INT NOT NULL DEFAULT 0 COMMENT '删除标志(0-未删除,1-已删除)',
    PRIMARY KEY (id),
    UNIQUE KEY uk_tracking_no (tracking_no),
    KEY idx_order_id (order_id),
    KEY idx_order_no (order_no),
    KEY idx_style_no (style_no),
    KEY idx_express_company (express_company),
    KEY idx_logistics_status (logistics_status),
    KEY idx_ship_time (ship_time),
    KEY idx_platform_order_no (platform_order_no),
    KEY idx_platform_code (platform_code),
    KEY idx_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='快递单主表（物流管理预留）';

-- 物流轨迹明细表
CREATE TABLE IF NOT EXISTS t_logistics_track (
    id VARCHAR(64) NOT NULL COMMENT '主键ID',
    express_order_id VARCHAR(64) NOT NULL COMMENT '快递单ID',
    tracking_no VARCHAR(64) NOT NULL COMMENT '快递单号',
    track_time DATETIME NOT NULL COMMENT '轨迹时间',
    track_desc VARCHAR(500) NOT NULL COMMENT '轨迹描述',
    track_location VARCHAR(255) DEFAULT NULL COMMENT '轨迹地点',
    action_code VARCHAR(64) DEFAULT NULL COMMENT '操作码',
    action_name VARCHAR(128) DEFAULT NULL COMMENT '操作名称',
    courier_name VARCHAR(64) DEFAULT NULL COMMENT '快递员名称',
    courier_phone VARCHAR(32) DEFAULT NULL COMMENT '快递员电话',
    signed TINYINT(1) DEFAULT 0 COMMENT '是否已签收(0-否,1-是)',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    data_source INT DEFAULT 1 COMMENT '数据来源(1-API推送,2-手动录入)',
    PRIMARY KEY (id),
    KEY idx_express_order_id (express_order_id),
    KEY idx_tracking_no (tracking_no),
    KEY idx_track_time (track_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物流轨迹明细表（物流管理预留）';

-- 物流服务商配置表
CREATE TABLE IF NOT EXISTS t_logistics_provider (
    id VARCHAR(64) NOT NULL COMMENT '主键ID',
    provider_code VARCHAR(64) NOT NULL COMMENT '服务商编码',
    provider_name VARCHAR(128) NOT NULL COMMENT '服务商名称',
    express_company_code VARCHAR(32) DEFAULT NULL COMMENT '快递公司代码',
    api_url VARCHAR(255) DEFAULT NULL COMMENT 'API接口地址',
    api_key VARCHAR(255) DEFAULT NULL COMMENT 'API密钥',
    api_secret VARCHAR(255) DEFAULT NULL COMMENT 'API密钥（备用）',
    merchant_id VARCHAR(128) DEFAULT NULL COMMENT '商户ID',
    ebill_account VARCHAR(128) DEFAULT NULL COMMENT '电子面单账号',
    ebill_password VARCHAR(128) DEFAULT NULL COMMENT '电子面单密码',
    monthly_account VARCHAR(128) DEFAULT NULL COMMENT '月结账号',
    enabled TINYINT(1) DEFAULT 1 COMMENT '是否启用(0-禁用,1-启用)',
    is_default TINYINT(1) DEFAULT 0 COMMENT '是否默认(0-否,1-是)',
    timeout INT DEFAULT 30 COMMENT '请求超时时间(秒)',
    daily_query_limit INT DEFAULT 1000 COMMENT '每日查询限额',
    used_query_count INT DEFAULT 0 COMMENT '已使用查询次数',
    remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    delete_flag INT NOT NULL DEFAULT 0 COMMENT '删除标志(0-未删除,1-已删除)',
    PRIMARY KEY (id),
    UNIQUE KEY uk_provider_code (provider_code),
    KEY idx_express_company_code (express_company_code),
    KEY idx_enabled (enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物流服务商配置表（物流管理预留）';

-- 初始化物流服务商配置数据（预留）
INSERT INTO t_logistics_provider (id, provider_code, provider_name, express_company_code, enabled, is_default, remark) VALUES
('1', 'SF_EXPRESS', '顺丰速运', 'SF', 1, 1, '顺丰速运接口配置（预留）'),
('2', 'JD_LOGISTICS', '京东物流', 'JD', 1, 0, '京东物流接口配置（预留）'),
('3', 'EMS_EXPRESS', '中国邮政', 'EMS', 1, 0, '中国邮政接口配置（预留）'),
('4', 'ZTO_EXPRESS', '中通快递', 'ZTO', 1, 0, '中通快递接口配置（预留）'),
('5', 'YTO_EXPRESS', '圆通速递', 'YTO', 1, 0, '圆通速递接口配置（预留）')
ON DUPLICATE KEY UPDATE update_time = CURRENT_TIMESTAMP;


-- ---- V26: add scan record phase3 6 fields ----
-- ========================================================
-- ScanRecord Phase 3-6 字段新增
-- 创建时间: 2026-02-01
-- 说明: 为扫码记录表添加Phase 3-6阶段的新字段
-- ========================================================

-- 检查表是否存在
SET @table_exists = (SELECT COUNT(*) FROM information_schema.tables 
                     WHERE table_schema = DATABASE() 
                     AND table_name = 't_scan_record');

-- 添加Phase 3字段（进度相关）
CALL _add_col('t_scan_record', 'current_progress_stage', 'VARCHAR(64) DEFAULT NULL COMMENT \'当前工序阶段（Phase 3新增）\',
    ADD COLUMN progress_node_unit_prices TEXT DEFAULT NULL COMMENT \'工序节点单价列表，JSON格式（Phase 3新增）\',
    ADD COLUMN cumulative_scan_count INT DEFAULT 0 COMMENT \'累计扫码次数（Phase 3新增）\',
    ADD COLUMN total_scan_count INT DEFAULT 0 COMMENT \'总扫码次数（Phase 3新增）\',
    ADD COLUMN progress_percentage DECIMAL(5,2) DEFAULT NULL COMMENT \'进度百分比（Phase 3新增）\'');

-- 添加Phase 4字段（成本相关）
CALL _add_col('t_scan_record', 'total_piece_cost', 'DECIMAL(12,2) DEFAULT NULL COMMENT \'总成本（Phase 4新增）\',
    ADD COLUMN average_piece_cost DECIMAL(12,2) DEFAULT NULL COMMENT \'平均成本（Phase 4新增）\'');

-- 添加Phase 5-6字段（指派相关）
CALL _add_col('t_scan_record', 'assignment_id', 'BIGINT DEFAULT NULL COMMENT \'工序指派ID（Phase 5-6新增）\',
    ADD COLUMN assigned_operator_name VARCHAR(64) DEFAULT NULL COMMENT \'指派操作员名称（Phase 5-6新增）\'');

-- 添加索引优化查询性能
CALL _add_idx('t_scan_record', 'idx_current_progress_stage', 'INDEX `idx_current_progress_stage` (current_progress_stage)');
CALL _add_idx('t_scan_record', 'idx_assignment_id', 'INDEX `idx_assignment_id` (assignment_id)');


-- ---- V2: baseline marker ----
SELECT 1;



-- ---- V30: create system config and audit log tables ----
-- 系统参数配置表
CREATE TABLE IF NOT EXISTS t_system_config (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    config_key VARCHAR(100) NOT NULL COMMENT '配置键',
    config_name VARCHAR(200) NOT NULL COMMENT '配置名称',
    config_value TEXT COMMENT '配置值',
    default_value TEXT COMMENT '默认值',
    config_type VARCHAR(20) DEFAULT 'string' COMMENT '配置类型: string-字符串, number-数字, boolean-布尔, json-JSON对象',
    category VARCHAR(100) COMMENT '配置分类',
    description TEXT COMMENT '配置描述',
    editable TINYINT DEFAULT 1 COMMENT '是否可编辑: 0-不可编辑, 1-可编辑',
    is_system TINYINT DEFAULT 0 COMMENT '是否系统内置: 0-否, 1-是',
    sort_order INT DEFAULT 0 COMMENT '排序号',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    create_by VARCHAR(50) COMMENT '创建人',
    update_by VARCHAR(50) COMMENT '更新人',
    UNIQUE KEY uk_config_key (config_key),
    INDEX idx_category (category),
    INDEX idx_is_system (is_system)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统参数配置表';

-- 操作审计日志表
CREATE TABLE IF NOT EXISTS t_audit_log (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    operation_type VARCHAR(50) COMMENT '操作类型: CREATE-创建, UPDATE-更新, DELETE-删除, QUERY-查询, EXPORT-导出, LOGIN-登录, LOGOUT-登出',
    module VARCHAR(50) COMMENT '业务模块: system-系统, style-款式, production-生产, finance-财务, warehouse-仓库',
    biz_type VARCHAR(100) COMMENT '业务类型',
    biz_id VARCHAR(100) COMMENT '业务ID',
    biz_desc VARCHAR(500) COMMENT '业务描述',
    operation_content TEXT COMMENT '操作内容',
    before_data LONGTEXT COMMENT '变更前数据(JSON)',
    after_data LONGTEXT COMMENT '变更后数据(JSON)',
    operator_id VARCHAR(50) COMMENT '操作人ID',
    operator_name VARCHAR(100) COMMENT '操作人名称',
    operator_ip VARCHAR(50) COMMENT '操作人IP',
    user_agent VARCHAR(500) COMMENT '操作人设备信息',
    request_url VARCHAR(500) COMMENT '请求URL',
    request_method VARCHAR(10) COMMENT '请求方法: GET, POST, PUT, DELETE',
    request_params LONGTEXT COMMENT '请求参数',
    response_result LONGTEXT COMMENT '响应结果',
    status TINYINT DEFAULT 1 COMMENT '执行状态: 0-失败, 1-成功',
    error_msg TEXT COMMENT '错误信息',
    execution_time BIGINT COMMENT '执行耗时(ms)',
    operation_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
    remark VARCHAR(500) COMMENT '备注',
    INDEX idx_operation_type (operation_type),
    INDEX idx_module (module),
    INDEX idx_operator_id (operator_id),
    INDEX idx_status (status),
    INDEX idx_operation_time (operation_time),
    INDEX idx_biz_type_biz_id (biz_type, biz_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='操作审计日志表';

-- 插入默认系统配置
INSERT INTO t_system_config (config_key, config_name, config_value, config_type, category, description, editable, is_system, sort_order) VALUES
('system.name', '系统名称', '服装供应链管理系统', 'string', '基础配置', '系统显示名称', 1, 1, 1),
('system.logo', '系统Logo', '', 'string', '基础配置', '系统Logo URL', 1, 1, 2),
('system.copyright', '版权信息', '© 2024 服装供应链管理系统', 'string', '基础配置', '页面底部版权信息', 1, 1, 3),
('system.login.captcha', '登录验证码', 'true', 'boolean', '安全设置', '是否开启登录验证码', 1, 1, 10),
('system.login.maxRetry', '登录最大重试次数', '5', 'number', '安全设置', '登录失败最大重试次数', 1, 1, 11),
('system.login.lockTime', '登录锁定时间(分钟)', '30', 'number', '安全设置', '登录失败锁定时间', 1, 1, 12),
('system.password.minLength', '密码最小长度', '6', 'number', '安全设置', '密码最小长度要求', 1, 1, 13),
('system.password.complexity', '密码复杂度', 'false', 'boolean', '安全设置', '是否要求密码包含字母和数字', 1, 1, 14),
('system.session.timeout', '会话超时时间(分钟)', '120', 'number', '安全设置', '用户会话超时时间', 1, 1, 15),
('system.file.maxSize', '文件上传最大大小(MB)', '50', 'number', '文件设置', '允许上传的文件最大大小', 1, 1, 20),
('system.file.allowedTypes', '允许的文件类型', 'jpg,png,gif,pdf,doc,docx,xls,xlsx', 'string', '文件设置', '允许上传的文件类型', 1, 1, 21),
('system.auditLog.retentionDays', '审计日志保留天数', '90', 'number', '日志设置', '审计日志保留天数', 1, 1, 30),
('system.order.autoComplete', '订单自动完成天数', '7', 'number', '业务设置', '订单完成后自动确认天数', 1, 1, 40),
('system.order.reminderDays', '订单提醒提前天数', '3', 'number', '业务设置', '交期提醒提前天数', 1, 1, 41);


-- ---- V31: create logistics ecommerce tables ----
-- 快递单表
CREATE TABLE IF NOT EXISTS t_express_order (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    tracking_no VARCHAR(100) NOT NULL COMMENT '快递单号',
    company_code VARCHAR(50) COMMENT '快递公司编码',
    company_name VARCHAR(100) COMMENT '快递公司名称',
    order_no VARCHAR(100) COMMENT '关联订单号',
    shipment_type TINYINT DEFAULT 1 COMMENT '发货类型: 1-成品发货, 2-样衣发货, 3-物料发货',
    receiver_name VARCHAR(100) COMMENT '收件人姓名',
    receiver_phone VARCHAR(50) COMMENT '收件人电话',
    receiver_address TEXT COMMENT '收件人地址',
    sender_name VARCHAR(100) COMMENT '寄件人姓名',
    sender_phone VARCHAR(50) COMMENT '寄件人电话',
    sender_address TEXT COMMENT '寄件人地址',
    goods_name VARCHAR(200) COMMENT '货物名称',
    goods_quantity INT DEFAULT 1 COMMENT '货物数量',
    weight DECIMAL(10,2) COMMENT '重量(kg)',
    freight DECIMAL(10,2) COMMENT '运费',
    status TINYINT DEFAULT 0 COMMENT '状态: 0-待发货, 1-已发货, 2-运输中, 3-已到达, 4-已签收, 5-异常, 6-已退回',
    ship_time DATETIME COMMENT '发货时间',
    sign_time DATETIME COMMENT '签收时间',
    sign_person VARCHAR(100) COMMENT '签收人',
    remark TEXT COMMENT '备注',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    create_by VARCHAR(50) COMMENT '创建人',
    update_by VARCHAR(50) COMMENT '更新人',
    INDEX idx_tracking_no (tracking_no),
    INDEX idx_order_no (order_no),
    INDEX idx_status (status),
    INDEX idx_company_code (company_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='快递单表';

-- 电商订单表
CREATE TABLE IF NOT EXISTS t_ecommerce_order (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    order_no VARCHAR(100) NOT NULL COMMENT '订单编号',
    platform VARCHAR(20) COMMENT '电商平台: TB-淘宝, JD-京东, PDD-拼多多, DY-抖音',
    platform_order_no VARCHAR(100) COMMENT '平台订单号',
    shop_name VARCHAR(200) COMMENT '店铺名称',
    buyer_nick VARCHAR(100) COMMENT '买家昵称',
    status TINYINT DEFAULT 0 COMMENT '状态: 0-待付款, 1-待发货, 2-已发货, 3-已完成, 4-已取消, 5-退款中',
    total_amount DECIMAL(12,2) COMMENT '订单金额',
    pay_amount DECIMAL(12,2) COMMENT '实付金额',
    freight DECIMAL(10,2) COMMENT '运费',
    discount DECIMAL(10,2) COMMENT '优惠金额',
    pay_type VARCHAR(50) COMMENT '支付方式',
    pay_time DATETIME COMMENT '支付时间',
    ship_time DATETIME COMMENT '发货时间',
    complete_time DATETIME COMMENT '完成时间',
    receiver_name VARCHAR(100) COMMENT '收件人姓名',
    receiver_phone VARCHAR(50) COMMENT '收件人电话',
    receiver_address TEXT COMMENT '收件人地址',
    tracking_no VARCHAR(100) COMMENT '快递单号',
    express_company VARCHAR(100) COMMENT '快递公司',
    buyer_remark TEXT COMMENT '买家备注',
    seller_remark TEXT COMMENT '卖家备注',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_order_no (order_no),
    INDEX idx_platform (platform),
    INDEX idx_status (status),
    INDEX idx_shop_name (shop_name),
    INDEX idx_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='电商订单表';


-- ---- V32: add logistics ecommerce permissions ----
-- 添加物流管理和电商管理权限
INSERT INTO t_permission (permission_code, permission_name, type, description, create_time, update_time) VALUES
-- 物流管理权限
('MENU_LOGISTICS', '物流管理菜单', 'MENU', '物流管理模块菜单权限', NOW(), NOW()),
('LOGISTICS_EXPRESS_VIEW', '查看快递单', 'BUTTON', '查看快递单列表和详情', NOW(), NOW()),
('LOGISTICS_EXPRESS_CREATE', '创建快递单', 'BUTTON', '创建新的快递单', NOW(), NOW()),
('LOGISTICS_EXPRESS_UPDATE', '更新快递单', 'BUTTON', '修改快递单信息', NOW(), NOW()),
('LOGISTICS_EXPRESS_DELETE', '删除快递单', 'BUTTON', '删除快递单', NOW(), NOW()),

-- 电商管理权限
('MENU_ECOMMERCE', '电商管理菜单', 'MENU', '电商管理模块菜单权限', NOW(), NOW()),
('ECOMMERCE_ORDER_VIEW', '查看电商订单', 'BUTTON', '查看电商订单列表和详情', NOW(), NOW()),
('ECOMMERCE_ORDER_CREATE', '创建电商订单', 'BUTTON', '创建新的电商订单', NOW(), NOW()),
('ECOMMERCE_ORDER_UPDATE', '更新电商订单', 'BUTTON', '修改电商订单信息', NOW(), NOW()),
('ECOMMERCE_ORDER_DELETE', '删除电商订单', 'BUTTON', '删除电商订单', NOW(), NOW());

-- 给管理员角色添加权限（假设角色ID为1是管理员）
INSERT INTO t_role_permission (role_id, permission_id, create_time)
SELECT 1, id, NOW() FROM t_permission 
WHERE permission_code IN (
    'MENU_LOGISTICS', 'LOGISTICS_EXPRESS_VIEW', 'LOGISTICS_EXPRESS_CREATE', 
    'LOGISTICS_EXPRESS_UPDATE', 'LOGISTICS_EXPRESS_DELETE',
    'MENU_ECOMMERCE', 'ECOMMERCE_ORDER_VIEW', 'ECOMMERCE_ORDER_CREATE',
    'ECOMMERCE_ORDER_UPDATE', 'ECOMMERCE_ORDER_DELETE'
)
AND NOT EXISTS (
    SELECT 1 FROM t_role_permission rp 
    WHERE rp.role_id = 1 AND rp.permission_id = t_permission.id
);


-- ---- V33: order transfer ----
-- 订单转移表
CREATE TABLE IF NOT EXISTS `order_transfer` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '转移ID',
  `order_id` bigint(20) NOT NULL COMMENT '订单ID',
  `from_user_id` bigint(20) NOT NULL COMMENT '发起人ID',
  `to_user_id` bigint(20) NOT NULL COMMENT '接收人ID',
  `status` varchar(20) NOT NULL DEFAULT 'pending' COMMENT '转移状态: pending-待处理, accepted-已接受, rejected-已拒绝',
  `message` varchar(500) DEFAULT NULL COMMENT '转移留言',
  `reject_reason` varchar(500) DEFAULT NULL COMMENT '拒绝原因',
  `created_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `handled_time` datetime DEFAULT NULL COMMENT '处理时间',
  PRIMARY KEY (`id`),
  KEY `idx_order_id` (`order_id`),
  KEY `idx_from_user_id` (`from_user_id`),
  KEY `idx_to_user_id` (`to_user_id`),
  KEY `idx_status` (`status`),
  KEY `idx_created_time` (`created_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单转移记录表';


-- ---- V34: add production process tracking table ----
-- 生产工序跟踪表（用于工资结算和进度跟踪）
-- 裁剪完成后自动生成：菲号 × 工序 = N条记录
-- 扫码时更新状态，作为工资结算依据

CREATE TABLE IF NOT EXISTS t_production_process_tracking (
  id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',

  -- 订单关联
  production_order_id BIGINT NOT NULL COMMENT '生产订单ID',
  production_order_no VARCHAR(50) NOT NULL COMMENT '订单号',

  -- 菲号关联
  cutting_bundle_id BIGINT NOT NULL COMMENT '菲号ID（裁剪单ID）',
  bundle_no VARCHAR(50) COMMENT '菲号编号',

  -- SKU信息（从菲号带入）
  sku VARCHAR(50) COMMENT 'SKU号',
  color VARCHAR(50) COMMENT '颜色',
  size VARCHAR(20) COMMENT '尺码',
  quantity INT COMMENT '数量',

  -- 工序信息（从订单 progressNodeUnitPrices 带入）
  process_code VARCHAR(50) NOT NULL COMMENT '工序编号（如：sewing_001）',
  process_name VARCHAR(50) NOT NULL COMMENT '工序名称（如：车缝）',
  process_order INT COMMENT '工序顺序（1,2,3...）',
  unit_price DECIMAL(10,2) COMMENT '单价（元/件，用于工资结算）',

  -- 扫码状态
  scan_status VARCHAR(20) DEFAULT 'pending' COMMENT '状态：pending=待扫码, scanned=已扫码, reset=已重置',
  scan_time DATETIME COMMENT '扫码时间',
  scan_record_id BIGINT COMMENT '关联的扫码记录ID（t_scan_record）',

  -- 操作人信息
  operator_id BIGINT COMMENT '操作人ID',
  operator_name VARCHAR(50) COMMENT '操作人姓名',
  factory_id BIGINT COMMENT '执行工厂ID',
  factory_name VARCHAR(100) COMMENT '执行工厂名称',

  -- 工资结算
  settlement_amount DECIMAL(10,2) COMMENT '结算金额（quantity × unit_price）',
  is_settled TINYINT(1) DEFAULT 0 COMMENT '是否已结算（0=未结算，1=已结算）',
  settlement_time DATETIME COMMENT '结算时间',

  -- 审计字段
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  creator VARCHAR(50) COMMENT '创建人',
  updater VARCHAR(50) COMMENT '更新人',

  -- 索引
  INDEX idx_order (production_order_id),
  INDEX idx_bundle (cutting_bundle_id),
  INDEX idx_process (process_code),
  INDEX idx_status (scan_status),
  INDEX idx_operator (operator_id),
  UNIQUE KEY uk_bundle_process (cutting_bundle_id, process_code) COMMENT '菲号+工序唯一（防重复扫码）'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='生产工序跟踪表（工资结算依据）';

-- 索引说明
-- 1. idx_order: 查询某订单的所有跟踪记录
-- 2. idx_bundle: 查询某菲号的所有工序记录
-- 3. idx_process: 查询某工序的所有扫码情况
-- 4. idx_status: 查询待扫码/已扫码记录
-- 5. idx_operator: 查询某工人的工作量
-- 6. uk_bundle_process: 唯一键防止重复扫码（核心约束）


-- ---- V35: add tenant id to pattern scan record ----
-- V35: 修复 t_pattern_scan_record 缺少 tenant_id 列
-- 原因：PatternScanRecord 实体类有 tenantId 字段（@TableField(fill=INSERT)），
--       MyBatisPlusMetaObjectHandler 在 INSERT 时自动填充，但表结构缺少该列，导致
--       INSERT/SELECT 均报 "Unknown column 'tenant_id' in 'field list'"

CALL _add_col('t_pattern_scan_record', 'tenant_id', 'BIGINT NULL COMMENT \'租户ID，多租户数据隔离\' AFTER delete_flag');

-- 避免重复创建索引
SET @exist := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE table_schema = DATABASE()
      AND table_name = 't_pattern_scan_record'
      AND index_name = 'idx_psr_tenant_id'
);
SET @sql = IF(@exist = 0,
    'ALTER TABLE t_pattern_scan_record ADD INDEX idx_psr_tenant_id (tenant_id)',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- ---- V36: create integration tracking tables ----
-- ============================================================
-- V36: 第三方集成跟踪表（支付流水 / 物流运单 / 回调日志）
-- ============================================================

-- 支付流水表
CREATE TABLE IF NOT EXISTS t_payment_record (
    id              BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    tenant_id       BIGINT       NOT NULL                COMMENT '租户ID',
    order_id        VARCHAR(64)  NOT NULL                COMMENT '业务订单号',
    order_type      VARCHAR(32)  NOT NULL DEFAULT 'production' COMMENT '业务类型: production/sample/material',
    channel         VARCHAR(20)  NOT NULL                COMMENT '支付渠道: ALIPAY/WECHAT_PAY',
    amount          BIGINT       NOT NULL                COMMENT '应付金额（分）',
    actual_amount   BIGINT                               COMMENT '实付金额（分，支付成功后回填）',
    status          VARCHAR(20)  NOT NULL DEFAULT 'PENDING' COMMENT '状态: PENDING/SUCCESS/FAILED/REFUNDED/CANCELLED',
    third_party_order_id VARCHAR(128)                    COMMENT '第三方平台交易号',
    pay_url         VARCHAR(512)                         COMMENT '支付跳转链接',
    qr_code         VARCHAR(512)                         COMMENT '二维码内容',
    error_message   VARCHAR(512)                         COMMENT '失败原因',
    paid_time       DATETIME                             COMMENT '实际支付时间',
    created_time    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_time    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_tenant_order (tenant_id, order_id),
    INDEX idx_third_party (third_party_order_id),
    INDEX idx_status (status),
    INDEX idx_created (created_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='支付流水记录';

-- 物流运单表
CREATE TABLE IF NOT EXISTS t_logistics_record (
    id              BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    tenant_id       BIGINT       NOT NULL                COMMENT '租户ID',
    order_id        VARCHAR(64)  NOT NULL                COMMENT '业务订单号',
    company_code    VARCHAR(20)  NOT NULL                COMMENT '快递公司编码: SF/STO',
    company_name    VARCHAR(32)  NOT NULL                COMMENT '快递公司名称',
    tracking_number VARCHAR(64)                          COMMENT '运单号（下单成功后填入）',
    status          VARCHAR(20)  NOT NULL DEFAULT 'CREATED' COMMENT '状态: CREATED/IN_TRANSIT/ARRIVED/DELIVERED/CANCELLED/FAILED',
    sender_name     VARCHAR(64)                          COMMENT '寄件人姓名',
    sender_phone    VARCHAR(20)                          COMMENT '寄件人电话',
    sender_address  VARCHAR(256)                         COMMENT '寄件地址',
    receiver_name   VARCHAR(64)                          COMMENT '收件人姓名',
    receiver_phone  VARCHAR(20)                          COMMENT '收件人电话',
    receiver_address VARCHAR(256)                        COMMENT '收件地址',
    weight          DECIMAL(8,2)                         COMMENT '重量（kg）',
    estimated_fee   BIGINT                               COMMENT '预估运费（分）',
    actual_fee      BIGINT                               COMMENT '实际运费（分，结算后填入）',
    error_message   VARCHAR(512)                         COMMENT '失败原因',
    last_event      VARCHAR(256)                         COMMENT '最新物流事件描述',
    last_event_time DATETIME                             COMMENT '最新物流事件时间',
    delivered_time  DATETIME                             COMMENT '签收时间',
    created_time    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_time    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_tenant_order (tenant_id, order_id),
    INDEX idx_tracking (tracking_number),
    INDEX idx_status (status),
    INDEX idx_created (created_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物流运单记录';

-- 第三方回调日志表（存储所有原始 Webhook 报文，便于排查问题）
CREATE TABLE IF NOT EXISTS t_integration_callback_log (
    id              BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    type            VARCHAR(20)  NOT NULL                COMMENT '类型: PAYMENT/LOGISTICS',
    channel         VARCHAR(20)  NOT NULL                COMMENT '渠道: ALIPAY/WECHAT_PAY/SF/STO',
    raw_body        MEDIUMTEXT                           COMMENT '原始回调报文',
    headers         TEXT                                 COMMENT '请求头（JSON格式，含签名字段）',
    verified        TINYINT(1)   NOT NULL DEFAULT 0      COMMENT '签名验证是否通过: 0=否 1=是',
    processed       TINYINT(1)   NOT NULL DEFAULT 0      COMMENT '业务处理是否完成: 0=否 1=是',
    related_order_id VARCHAR(64)                         COMMENT '关联业务订单号（解析后填入）',
    error_message   VARCHAR(512)                         COMMENT '处理失败原因',
    created_time    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_type_channel (type, channel),
    INDEX idx_order (related_order_id),
    INDEX idx_verified (verified),
    INDEX idx_created (created_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='第三方回调日志';


-- ---- V3: add defect fields to product warehousing ----
ALTER TABLE t_product_warehousing
  ADD COLUMN defect_category VARCHAR(64) NULL COMMENT '次品类别' AFTER unqualified_image_urls,
  ADD COLUMN defect_remark VARCHAR(500) NULL COMMENT '次品备注' AFTER defect_category;


-- ---- V4: add missing fields for frontend ----
-- V4: 添加前端新增字段支持
-- 创建时间: 2026-01-20
-- 说明: 为支持PC端新增的29个字段，添加数据库字段

-- ==================== 1. 物料采购表 - 添加到货日期 ====================
ALTER TABLE t_material_purchase 
ADD COLUMN expected_arrival_date DATETIME COMMENT '预计到货日期',
ADD COLUMN actual_arrival_date DATETIME COMMENT '实际到货日期';

-- ==================== 2. 物料对账表 - 添加付款和责任人字段 ====================
ALTER TABLE t_material_reconciliation 
ADD COLUMN paid_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '已付金额',
ADD COLUMN period_start_date DATETIME COMMENT '对账周期开始日期',
ADD COLUMN period_end_date DATETIME COMMENT '对账周期结束日期',
ADD COLUMN reconciliation_operator_id VARCHAR(50) COMMENT '对账人ID',
ADD COLUMN reconciliation_operator_name VARCHAR(50) COMMENT '对账人姓名',
ADD COLUMN audit_operator_id VARCHAR(50) COMMENT '审核人ID',
ADD COLUMN audit_operator_name VARCHAR(50) COMMENT '审核人姓名';

-- ==================== 3. 质检入库表 - 添加质检人员字段 ====================
ALTER TABLE t_product_warehousing 
ADD COLUMN quality_operator_id VARCHAR(50) COMMENT '质检人员ID',
ADD COLUMN quality_operator_name VARCHAR(50) COMMENT '质检人员姓名';

-- ==================== 说明 ====================
-- ProductionOrder表不需要ALTER TABLE，因为新增字段都是通过聚合查询得到的临时字段(@TableField(exist = false))
-- 车缝、大烫、包装环节数据从t_scan_record表聚合
-- 质量统计数据从t_product_warehousing表聚合


-- ---- V5: update flow stage snapshot view ----
-- V5: 更新v_production_order_flow_stage_snapshot视图 - 添加车缝、大烫、包装环节
-- 创建时间: 2026-01-20
-- 说明: 为支持PC端新增的车缝、大烫、包装三个环节的字段，更新视图定义

CREATE OR REPLACE VIEW v_production_order_flow_stage_snapshot AS
SELECT
  sr.order_id AS order_id,
  
  -- ============ 下单环节 ============
  MIN(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '下单' THEN sr.scan_time END) AS order_start_time,
  MAX(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '下单' THEN sr.scan_time END) AS order_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '下单' THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS order_operator_name,
  
  -- ============ 采购环节 ============
  MAX(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '采购' THEN sr.scan_time END) AS procurement_scan_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '采购' THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS procurement_scan_operator_name,
  
  -- ============ 裁剪环节 ============
  MIN(CASE WHEN sr.scan_type = 'cutting' THEN sr.scan_time END) AS cutting_start_time,
  MAX(CASE WHEN sr.scan_type = 'cutting' THEN sr.scan_time END) AS cutting_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'cutting' THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS cutting_operator_name,
  SUM(CASE WHEN sr.scan_type = 'cutting' THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS cutting_quantity,
  
  -- ============ 缝制环节 ============
  MIN(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT IN ('下单', '采购', '车缝', '大烫', '包装')
        AND IFNULL(sr.process_code, '') <> 'quality_warehousing'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%质检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%检验%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%品检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%验货%'
      THEN sr.scan_time END) AS sewing_start_time,
  MAX(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT IN ('下单', '采购', '车缝', '大烫', '包装')
        AND IFNULL(sr.process_code, '') <> 'quality_warehousing'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%质检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%检验%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%品检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%验货%'
      THEN sr.scan_time END) AS sewing_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT IN ('下单', '采购', '车缝', '大烫', '包装')
        AND IFNULL(sr.process_code, '') <> 'quality_warehousing'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%质检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%检验%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%品检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%验货%'
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS sewing_operator_name,
  
  -- ============ 车缝环节（新增）============
  MIN(CASE WHEN COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '车缝' THEN sr.scan_time END) AS car_sewing_start_time,
  MAX(CASE WHEN COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '车缝' THEN sr.scan_time END) AS car_sewing_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '车缝' THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS car_sewing_operator_name,
  
  -- ============ 大烫环节（新增）============
  MIN(CASE WHEN COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '大烫' THEN sr.scan_time END) AS ironing_start_time,
  MAX(CASE WHEN COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '大烫' THEN sr.scan_time END) AS ironing_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '大烫' THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS ironing_operator_name,
  
  -- ============ 包装环节（新增）============
  MIN(CASE WHEN COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '包装' THEN sr.scan_time END) AS packaging_start_time,
  MAX(CASE WHEN COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '包装' THEN sr.scan_time END) AS packaging_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '包装' THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS packaging_operator_name,
  
  -- ============ 质检环节 ============
  MIN(CASE WHEN (sr.scan_type = 'quality'
        OR IFNULL(sr.process_code, '') = 'quality_warehousing'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%质检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%检验%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%品检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%验货%')
      THEN sr.scan_time END) AS quality_start_time,
  MAX(CASE WHEN (sr.scan_type = 'quality'
        OR IFNULL(sr.process_code, '') = 'quality_warehousing'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%质检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%检验%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%品检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%验货%')
      THEN sr.scan_time END) AS quality_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN (sr.scan_type = 'quality'
        OR IFNULL(sr.process_code, '') = 'quality_warehousing'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%质检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%检验%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%品检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%验货%')
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS quality_operator_name,
  SUM(CASE WHEN (sr.scan_type = 'quality'
        OR IFNULL(sr.process_code, '') = 'quality_warehousing'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%质检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%检验%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%品检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%验货%')
      THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS quality_quantity,
  
  -- ============ 入库环节 ============
  MIN(CASE WHEN sr.scan_type = 'warehouse' AND IFNULL(sr.process_code, '') <> 'warehouse_rollback' THEN sr.scan_time END) AS warehousing_start_time,
  MAX(CASE WHEN sr.scan_type = 'warehouse' AND IFNULL(sr.process_code, '') <> 'warehouse_rollback' THEN sr.scan_time END) AS warehousing_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'warehouse' AND IFNULL(sr.process_code, '') <> 'warehouse_rollback' THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS warehousing_operator_name,
  SUM(CASE WHEN sr.scan_type = 'warehouse' AND IFNULL(sr.process_code, '') <> 'warehouse_rollback' THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS warehousing_quantity
FROM t_scan_record sr
WHERE sr.scan_result = 'success'
  AND sr.quantity > 0
GROUP BY sr.order_id;


-- ---- V6: add sku fields to production order ----
-- V6: 补全生产订单表SKU相关字段
-- 创建时间: 2026-01-23
-- 说明: 补全 t_production_order 表中缺失的 color, size, order_details 字段

CALL _add_col('t_production_order', 'color', 'VARCHAR(100) COMMENT \'颜色(多色以逗号分隔)\',
ADD COLUMN size VARCHAR(100) COMMENT \'尺码(多码以逗号分隔)\',
ADD COLUMN order_details TEXT COMMENT \'订单SKU明细(JSON格式)\'');


-- ---- V7: create product sku table ----
CREATE TABLE t_product_sku (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    sku_code VARCHAR(64) NOT NULL COMMENT 'SKU编码 (规则: 款号-颜色-尺码)',
    style_id BIGINT NOT NULL COMMENT '关联款号ID',
    style_no VARCHAR(64) NOT NULL COMMENT '款号',
    color VARCHAR(32) NOT NULL COMMENT '颜色',
    size VARCHAR(32) NOT NULL COMMENT '尺码',
    barcode VARCHAR(64) COMMENT '条形码/69码',
    external_sku_id VARCHAR(128) COMMENT '外部电商平台SKU ID',
    external_platform VARCHAR(32) COMMENT '外部平台标识 (如: taobao, shopify)',
    cost_price DECIMAL(10, 2) COMMENT '成本价',
    sales_price DECIMAL(10, 2) COMMENT '销售价',
    status VARCHAR(20) DEFAULT 'ENABLED' COMMENT '状态: ENABLED-启用, DISABLED-禁用',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    UNIQUE KEY uk_sku_code (sku_code),
    UNIQUE KEY uk_style_color_size (style_id, color, size),
    INDEX idx_external_sku (external_sku_id),
    INDEX idx_style_no (style_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商品SKU主表 (电商对接核心)';


-- ---- V8: add index scan stats ----
-- V8: Add index for Scan SKU optimization
-- 优化扫码进度统计查询性能
CALL _add_idx('t_scan_record', 'idx_scan_stats', 'INDEX `idx_scan_stats` (order_no, scan_result, color, size)');


-- ---- V9: add stock quantity to product sku ----
ALTER TABLE t_product_sku ADD COLUMN stock_quantity INT DEFAULT 0 COMMENT '库存数量';
CREATE INDEX idx_sku_code ON t_product_sku (sku_code);


SELECT 'Part 2 DONE - all migrations applied' AS status;
-- ======================== END PART 2 ========================

-- ======================== PART 3/3: 写入Flyway历史 ========================

INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '10', 'add sample review fields', 'SQL', 'V10__add_sample_review_fields.sql',
    532763561, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '20260131', 'add performance indexes', 'SQL', 'V20260131__add_performance_indexes.sql',
    1589020182, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '20260201', 'add foreign key constraints', 'SQL', 'V20260201__add_foreign_key_constraints.sql',
    945885247, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '20260205', 'add order management fields', 'SQL', 'V20260205__add_order_management_fields.sql',
    1955627210, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '20260219', 'fix permission structure', 'SQL', 'V20260219__fix_permission_structure.sql',
    334147478, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '20260221', 'init role templates and superadmin', 'SQL', 'V20260221__init_role_templates_and_superadmin.sql',
    1910109729, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '20260221b', 'consolidate all missing migrations', 'SQL', 'V20260221b__consolidate_all_missing_migrations.sql',
    1675407364, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '2026022201', 'fix views and appstore prices', 'SQL', 'V2026022201__fix_views_and_appstore_prices.sql',
    508587043, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '20260222', 'fix superadmin bcrypt password', 'SQL', 'V20260222__fix_superadmin_bcrypt_password.sql',
    120880284, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '20260222b', 'tenant storage billing', 'SQL', 'V20260222b__tenant_storage_billing.sql',
    399961870, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '20260222c', 'billing cycle', 'SQL', 'V20260222c__billing_cycle.sql',
    874439899, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '20260222d', 'add tenant app permission', 'SQL', 'V20260222d__add_tenant_app_permission.sql',
    589664686, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '20260222e', 'user feedback', 'SQL', 'V20260222e__user_feedback.sql',
    488628244, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '20260223', 'unit price audit and pattern version', 'SQL', 'V20260223__unit_price_audit_and_pattern_version.sql',
    829059325, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '20260223b', 'remaining tables and operator fields', 'SQL', 'V20260223b__remaining_tables_and_operator_fields.sql',
    1664242280, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '20260223c', 'add payment approval permissions', 'SQL', 'V20260223c__add_payment_approval_permissions.sql',
    903773650, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '20260223d', 'billing invoice and tenant self service', 'SQL', 'V20260223d__billing_invoice_and_tenant_self_service.sql',
    581536559, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '20260224', 'add data import permission', 'SQL', 'V20260224__add_data_import_permission.sql',
    1456374412, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '20260225', 'add user avatar url', 'SQL', 'V20260225__add_user_avatar_url.sql',
    1308810172, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '2026022601', 'sync flow stage view latest', 'SQL', 'V2026022601__sync_flow_stage_view_latest.sql',
    724059481, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '2026022602', 'fix process tracking id types', 'SQL', 'V2026022602__fix_process_tracking_id_types.sql',
    1267772775, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '20260226', 'add notify config', 'SQL', 'V20260226__add_notify_config.sql',
    1673972799, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '25', 'create logistics tables', 'SQL', 'V25__create_logistics_tables.sql',
    1158892023, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '26', 'add scan record phase3 6 fields', 'SQL', 'V26__add_scan_record_phase3_6_fields.sql',
    1241590840, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '2', 'baseline marker', 'SQL', 'V2__baseline_marker.sql',
    100890307, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '30', 'create system config and audit log tables', 'SQL', 'V30__create_system_config_and_audit_log_tables.sql',
    641276829, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '31', 'create logistics ecommerce tables', 'SQL', 'V31__create_logistics_ecommerce_tables.sql',
    1714838010, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '32', 'add logistics ecommerce permissions', 'SQL', 'V32__add_logistics_ecommerce_permissions.sql',
    1487550913, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '33', 'order transfer', 'SQL', 'V33__order_transfer.sql',
    1732396461, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '34', 'add production process tracking table', 'SQL', 'V34__add_production_process_tracking_table.sql',
    768364785, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '35', 'add tenant id to pattern scan record', 'SQL', 'V35__add_tenant_id_to_pattern_scan_record.sql',
    1164526224, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '36', 'create integration tracking tables', 'SQL', 'V36__create_integration_tracking_tables.sql',
    517310354, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '3', 'add defect fields to product warehousing', 'SQL', 'V3__add_defect_fields_to_product_warehousing.sql',
    1256201442, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '4', 'add missing fields for frontend', 'SQL', 'V4__add_missing_fields_for_frontend.sql',
    556062725, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '5', 'update flow stage snapshot view', 'SQL', 'V5__update_flow_stage_snapshot_view.sql',
    1074806824, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '6', 'add sku fields to production order', 'SQL', 'V6__add_sku_fields_to_production_order.sql',
    1016559376, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '7', 'create product sku table', 'SQL', 'V7__create_product_sku_table.sql',
    494785532, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '8', 'add index scan stats', 'SQL', 'V8__add_index_scan_stats.sql',
    917512734, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '9', 'add stock quantity to product sku', 'SQL', 'V9__add_stock_quantity_to_product_sku.sql',
    273931317, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;

-- 清理工具存储过程
DROP PROCEDURE IF EXISTS _add_col;
DROP PROCEDURE IF EXISTS _add_idx;

SELECT 'Part 3 DONE - Flyway history updated!' AS result;
SELECT version, description, success, installed_on
FROM flyway_schema_history ORDER BY installed_rank;
-- ======================== END PART 3 ========================
