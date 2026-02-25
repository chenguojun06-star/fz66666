-- ======================== PART 2/6 - 第1段 共4段 ========================

-- ---- V10: add sample review fields ----
-- 样衣审核字段
ALTER TABLE t_style_info
    ADD COLUMN sample_review_status  VARCHAR(20)  DEFAULT NULL COMMENT '样衣审核状态: PASS/REWORK/REJECT',
    ADD COLUMN sample_review_comment TEXT         DEFAULT NULL COMMENT '样衣审核评语（选填）',
    ADD COLUMN sample_reviewer       VARCHAR(100) DEFAULT NULL COMMENT '审核人',
    ADD COLUMN sample_review_time    DATETIME     DEFAULT NULL COMMENT '审核时间';



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
ALTER TABLE `t_material_stock`
    ADD COLUMN `version` INT DEFAULT 0
    COMMENT '乐观锁版本号（并发库存操作防覆盖）';

-- t_production_order 乐观锁版本号
ALTER TABLE `t_production_order`
    ADD COLUMN `version` INT DEFAULT 0
    COMMENT '乐观锁版本号';

-- 生产订单索引（ADD COLUMN 后补充）
CALL _add_idx('t_production_order', 'idx_created_by_id', 'INDEX `idx_created_by_id` (`created_by_id`)');
CALL _add_idx('t_production_order', 'idx_factory_id', 'INDEX `idx_factory_id` (`factory_id`)');

-- t_sample_stock 乐观锁版本号
ALTER TABLE `t_sample_stock`
    ADD COLUMN `version` INT DEFAULT 0
    COMMENT '乐观锁版本号（并发库存操作防覆盖）';


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
ALTER TABLE `t_user`
    ADD COLUMN `tenant_id`       BIGINT     DEFAULT NULL COMMENT '所属租户ID',
    ADD COLUMN `is_tenant_owner` TINYINT(1) DEFAULT 0   COMMENT '是否为租户主账号';
CALL _add_idx('t_user', 'idx_user_tenant_id', 'INDEX `idx_user_tenant_id` (`tenant_id`)');

-- ---- 生产模块 ----
ALTER TABLE `t_production_order`           ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CALL _add_idx('t_production_order', 'idx_po_tenant_id', 'INDEX `idx_po_tenant_id` (`tenant_id`)');

ALTER TABLE `t_production_process_tracking` ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CALL _add_idx('t_production_process_tracking', 'idx_ppt_tenant_id', 'INDEX `idx_ppt_tenant_id` (`tenant_id`)');

ALTER TABLE `t_cutting_task`               ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CALL _add_idx('t_cutting_task', 'idx_ct_tenant_id', 'INDEX `idx_ct_tenant_id` (`tenant_id`)');

ALTER TABLE `t_cutting_bundle`             ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CALL _add_idx('t_cutting_bundle', 'idx_cb_tenant_id', 'INDEX `idx_cb_tenant_id` (`tenant_id`)');

ALTER TABLE `t_scan_record`                ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CALL _add_idx('t_scan_record', 'idx_sr_tenant_id', 'INDEX `idx_sr_tenant_id` (`tenant_id`)');

ALTER TABLE `t_secondary_process`          ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CALL _add_idx('t_secondary_process', 'idx_sp_tenant_id', 'INDEX `idx_sp_tenant_id` (`tenant_id`)');

-- ---- 款式模块 ----
ALTER TABLE `t_style_info`                 ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CALL _add_idx('t_style_info', 'idx_si_tenant_id', 'INDEX `idx_si_tenant_id` (`tenant_id`)');

ALTER TABLE `t_style_bom`                  ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CALL _add_idx('t_style_bom', 'idx_sb_tenant_id', 'INDEX `idx_sb_tenant_id` (`tenant_id`)');

ALTER TABLE `t_style_process`              ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CALL _add_idx('t_style_process', 'idx_spr_tenant_id', 'INDEX `idx_spr_tenant_id` (`tenant_id`)');

ALTER TABLE `t_style_attachment`           ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CALL _add_idx('t_style_attachment', 'idx_sa_tenant_id', 'INDEX `idx_sa_tenant_id` (`tenant_id`)');

ALTER TABLE `t_style_size`                 ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CALL _add_idx('t_style_size', 'idx_ss_tenant_id', 'INDEX `idx_ss_tenant_id` (`tenant_id`)');

ALTER TABLE `t_style_size_price`           ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CALL _add_idx('t_style_size_price', 'idx_ssp_tenant_id', 'INDEX `idx_ssp_tenant_id` (`tenant_id`)');

ALTER TABLE `t_style_quotation`            ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CALL _add_idx('t_style_quotation', 'idx_sq_tenant_id', 'INDEX `idx_sq_tenant_id` (`tenant_id`)');

ALTER TABLE `t_style_operation_log`        ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CALL _add_idx('t_style_operation_log', 'idx_sol_tenant_id', 'INDEX `idx_sol_tenant_id` (`tenant_id`)');

-- ---- 面辅料/仓库模块 ----
ALTER TABLE `t_material_database`          ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CALL _add_idx('t_material_database', 'idx_md_tenant_id', 'INDEX `idx_md_tenant_id` (`tenant_id`)');

ALTER TABLE `t_material_stock`             ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CALL _add_idx('t_material_stock', 'idx_ms_tenant_id', 'INDEX `idx_ms_tenant_id` (`tenant_id`)');

ALTER TABLE `t_material_inbound`           ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CALL _add_idx('t_material_inbound', 'idx_mi_tenant_id', 'INDEX `idx_mi_tenant_id` (`tenant_id`)');

ALTER TABLE `t_material_inbound_sequence`  ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CALL _add_idx('t_material_inbound_sequence', 'idx_mis_tenant_id', 'INDEX `idx_mis_tenant_id` (`tenant_id`)');

ALTER TABLE `t_material_picking`           ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CALL _add_idx('t_material_picking', 'idx_mp_tenant_id', 'INDEX `idx_mp_tenant_id` (`tenant_id`)');

ALTER TABLE `t_material_picking_item`      ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CALL _add_idx('t_material_picking_item', 'idx_mpi_tenant_id', 'INDEX `idx_mpi_tenant_id` (`tenant_id`)');

ALTER TABLE `t_material_purchase`          ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CALL _add_idx('t_material_purchase', 'idx_mpu_tenant_id', 'INDEX `idx_mpu_tenant_id` (`tenant_id`)');

-- ---- 成品模块 ----
ALTER TABLE `t_product_sku`                ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CALL _add_idx('t_product_sku', 'idx_ps_tenant_id', 'INDEX `idx_ps_tenant_id` (`tenant_id`)');

ALTER TABLE `t_product_warehousing`        ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CALL _add_idx('t_product_warehousing', 'idx_pw_tenant_id', 'INDEX `idx_pw_tenant_id` (`tenant_id`)');

ALTER TABLE `t_product_outstock`           ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CALL _add_idx('t_product_outstock', 'idx_pos_tenant_id', 'INDEX `idx_pos_tenant_id` (`tenant_id`)');

-- ---- 样衣模块 ----
ALTER TABLE `t_sample_stock`               ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CALL _add_idx('t_sample_stock', 'idx_sst_tenant_id', 'INDEX `idx_sst_tenant_id` (`tenant_id`)');

ALTER TABLE `t_sample_loan`                ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CALL _add_idx('t_sample_loan', 'idx_sl_tenant_id', 'INDEX `idx_sl_tenant_id` (`tenant_id`)');

-- ---- 财务模块 ----
ALTER TABLE `t_material_reconciliation`         ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CALL _add_idx('t_material_reconciliation', 'idx_mr_tenant_id', 'INDEX `idx_mr_tenant_id` (`tenant_id`)');

ALTER TABLE `t_order_reconciliation_approval`   ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CALL _add_idx('t_order_reconciliation_approval', 'idx_ora_tenant_id', 'INDEX `idx_ora_tenant_id` (`tenant_id`)');

ALTER TABLE `t_shipment_reconciliation`         ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CALL _add_idx('t_shipment_reconciliation', 'idx_shr_tenant_id', 'INDEX `idx_shr_tenant_id` (`tenant_id`)');

ALTER TABLE `t_payroll_settlement`              ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CALL _add_idx('t_payroll_settlement', 'idx_pse_tenant_id', 'INDEX `idx_pse_tenant_id` (`tenant_id`)');

ALTER TABLE `t_payroll_settlement_item`         ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CALL _add_idx('t_payroll_settlement_item', 'idx_psi_tenant_id', 'INDEX `idx_psi_tenant_id` (`tenant_id`)');

ALTER TABLE `t_deduction_item`                  ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CALL _add_idx('t_deduction_item', 'idx_di_tenant_id', 'INDEX `idx_di_tenant_id` (`tenant_id`)');

-- ---- 工厂/基础数据 ----
ALTER TABLE `t_factory`                    ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CALL _add_idx('t_factory', 'idx_f_tenant_id', 'INDEX `idx_f_tenant_id` (`tenant_id`)');

-- ---- 版型模块 ----
ALTER TABLE `t_pattern_production`         ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CALL _add_idx('t_pattern_production', 'idx_pp_tenant_id', 'INDEX `idx_pp_tenant_id` (`tenant_id`)');

ALTER TABLE `t_pattern_revision`           ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CALL _add_idx('t_pattern_revision', 'idx_pr_tenant_id', 'INDEX `idx_pr_tenant_id` (`tenant_id`)');

-- ---- 模板库 ----
ALTER TABLE `t_template_library`           ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CALL _add_idx('t_template_library', 'idx_tl_tenant_id', 'INDEX `idx_tl_tenant_id` (`tenant_id`)');

ALTER TABLE `t_template_operation_log`     ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';


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

ALTER TABLE `order_transfer`
    ADD COLUMN `transfer_type`   VARCHAR(10)  NOT NULL DEFAULT 'user'
        COMMENT '转移类型: user=转人员, factory=转工厂',
    ADD COLUMN `to_factory_id`   VARCHAR(36)  NULL
        COMMENT '目标工厂ID（transfer_type=factory时使用）',
    ADD COLUMN `to_factory_name` VARCHAR(100) NULL
        COMMENT '目标工厂名称（冗余）';

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
ALTER TABLE `t_factory`
    ADD COLUMN `factory_type` VARCHAR(20) NOT NULL DEFAULT 'EXTERNAL'
    COMMENT '工厂类型: INTERNAL=本厂内部按人员结算, EXTERNAL=外部工厂按工厂结算';


-- ======================================================================
-- Part 10: 微信小程序 openid 字段
-- (来自 V20260221__add_user_wechat_openid.sql)
-- 注意: 该文件与 db/migration 已有 V20260221 文件名冲突，内容纳入本文件
-- ======================================================================

ALTER TABLE `t_user`
    ADD COLUMN `openid` VARCHAR(128) DEFAULT NULL
    COMMENT '微信小程序 openid（用于一键免密登录）';

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

