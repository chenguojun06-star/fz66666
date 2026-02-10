-- =====================================================================
-- 角色模板 + 权限天花板 + 工人注册审批 - 数据库迁移脚本
-- 执行时间：2026-02-09
-- 说明：重新设计角色系统，支持角色模板、租户权限天花板、用户权限微调
-- =====================================================================

-- 安全添加列存储过程
DROP PROCEDURE IF EXISTS add_col;
DELIMITER $$
CREATE PROCEDURE add_col(IN p_table VARCHAR(128), IN p_col VARCHAR(128), IN p_def VARCHAR(512))
BEGIN
    SET @c = 0;
    SELECT COUNT(*) INTO @c FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND COLUMN_NAME = p_col;
    IF @c = 0 THEN
        SET @s = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_col, '` ', p_def);
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
DELIMITER ;

-- 安全删除唯一索引
DROP PROCEDURE IF EXISTS drop_idx;
DELIMITER $$
CREATE PROCEDURE drop_idx(IN p_table VARCHAR(128), IN p_idx VARCHAR(128))
BEGIN
    SET @c = 0;
    SELECT COUNT(*) INTO @c FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND INDEX_NAME = p_idx;
    IF @c > 0 THEN
        SET @s = CONCAT('ALTER TABLE `', p_table, '` DROP INDEX `', p_idx, '`');
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
DELIMITER ;

-- 安全添加索引
DROP PROCEDURE IF EXISTS add_idx;
DELIMITER $$
CREATE PROCEDURE add_idx(IN p_table VARCHAR(128), IN p_idx VARCHAR(128), IN p_cols VARCHAR(256))
BEGIN
    SET @c = 0;
    SELECT COUNT(*) INTO @c FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND INDEX_NAME = p_idx;
    IF @c = 0 THEN
        SET @s = CONCAT('ALTER TABLE `', p_table, '` ADD INDEX `', p_idx, '` (', p_cols, ')');
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
DELIMITER ;

-- 安全添加唯一索引
DROP PROCEDURE IF EXISTS add_uniq;
DELIMITER $$
CREATE PROCEDURE add_uniq(IN p_table VARCHAR(128), IN p_idx VARCHAR(128), IN p_cols VARCHAR(256))
BEGIN
    SET @c = 0;
    SELECT COUNT(*) INTO @c FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND INDEX_NAME = p_idx;
    IF @c = 0 THEN
        SET @s = CONCAT('ALTER TABLE `', p_table, '` ADD UNIQUE INDEX `', p_idx, '` (', p_cols, ')');
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
DELIMITER ;

-- =====================================================================
-- 1. 改造 t_role 表：添加租户归属 + 模板标记
-- =====================================================================
CALL add_col('t_role', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT ''所属租户(NULL=全局模板)''');
CALL add_col('t_role', 'is_template', 'TINYINT(1) DEFAULT 0 COMMENT ''是否为角色模板(1=模板,0=租户角色)''');
CALL add_col('t_role', 'source_template_id', 'BIGINT DEFAULT NULL COMMENT ''克隆来源模板ID''');
CALL add_col('t_role', 'sort_order', 'INT DEFAULT 0 COMMENT ''排序权重''');

-- 移除旧的全局唯一约束，改为租户内唯一
CALL drop_idx('t_role', 'role_name');
CALL drop_idx('t_role', 'role_code');
CALL add_uniq('t_role', 'uk_tenant_role_code', '`tenant_id`, `role_code`');
CALL add_idx('t_role', 'idx_role_tenant_id', '`tenant_id`');
CALL add_idx('t_role', 'idx_role_is_template', '`is_template`');

-- =====================================================================
-- 2. 创建租户权限天花板表
-- =====================================================================
CREATE TABLE IF NOT EXISTS t_tenant_permission_ceiling (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT NOT NULL COMMENT '租户ID',
    permission_id BIGINT NOT NULL COMMENT '权限ID',
    status VARCHAR(10) DEFAULT 'GRANTED' COMMENT 'GRANTED=开放, BLOCKED=限制',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_tenant_perm (tenant_id, permission_id),
    KEY idx_tpc_tenant_id (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='租户权限天花板（超管控制每个租户可用的最大权限范围）';

-- =====================================================================
-- 3. 创建用户权限微调表
-- =====================================================================
CREATE TABLE IF NOT EXISTS t_user_permission_override (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL COMMENT '用户ID',
    permission_id BIGINT NOT NULL COMMENT '权限ID',
    override_type VARCHAR(10) NOT NULL COMMENT 'GRANT=追加, REVOKE=移除',
    tenant_id BIGINT NOT NULL COMMENT '所属租户',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_perm (user_id, permission_id),
    KEY idx_upo_tenant_id (tenant_id),
    KEY idx_upo_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户权限微调表（角色基础上的个人权限覆盖）';

-- =====================================================================
-- 4. t_user 添加注册审批相关字段
-- =====================================================================
CALL add_col('t_user', 'registration_status', 'VARCHAR(20) DEFAULT ''ACTIVE'' COMMENT ''注册状态: PENDING=待审批, ACTIVE=已通过, REJECTED=已拒绝''');
CALL add_col('t_user', 'registration_tenant_code', 'VARCHAR(50) DEFAULT NULL COMMENT ''注册时填写的租户码''');
CALL add_col('t_user', 'reject_reason', 'VARCHAR(200) DEFAULT NULL COMMENT ''拒绝原因''');

-- =====================================================================
-- 5. 重新设计角色模板（删除旧的空壳角色，创建新模板）
-- =====================================================================

-- 先将现有角色标记为模板（保持ID不变避免外键问题）
UPDATE t_role SET is_template = 1, tenant_id = NULL WHERE id IN (1,2,3,4,5,6,7,8,9);

-- 删除旧角色权限分配（除了admin的84个权限）
DELETE FROM t_role_permission WHERE role_id IN (2,3,4,5,6,7,8,9);

-- 重命名旧角色为新模板
UPDATE t_role SET role_name = '全能管理', role_code = 'full_admin', description = '全部权限，适用于租户主账号', sort_order = 1, data_scope = 'ALL' WHERE id = 1;
UPDATE t_role SET role_name = '生产主管', role_code = 'production_supervisor', description = '生产+款式+订单+裁剪+进度+成品', sort_order = 2, data_scope = 'ALL' WHERE id = 3;
UPDATE t_role SET role_name = '生产跟单', role_code = 'merchandiser', description = '订单+裁剪+进度+款式查看', sort_order = 3, data_scope = 'ALL' WHERE id = 2;
UPDATE t_role SET role_name = '仓库管理', role_code = 'warehouse_mgr', description = '物料采购+入库+出库+库存', sort_order = 4, data_scope = 'ALL' WHERE id = 9;
UPDATE t_role SET role_name = '财务结算', role_code = 'finance', description = '对账+结算+审批+工资', sort_order = 5, data_scope = 'ALL' WHERE id = 4;
UPDATE t_role SET role_name = '车间工人', role_code = 'worker', description = '扫码+进度查看（小程序端）', sort_order = 6, data_scope = 'SELF' WHERE id = 6;

-- 停用不再需要的旧角色（采购员/裁剪员/包装员/质检员 → 合并入生产主管+车间工人）
UPDATE t_role SET status = 'DISABLED', description = '已合并至其他角色模板' WHERE id IN (5, 7, 8);

-- =====================================================================
-- 6. 为新角色模板分配权限
-- =====================================================================

-- 角色1: 全能管理 (id=1) - 已有全部权限，无需额外操作

-- 角色3: 生产主管 (id=3) - 仪表板+基础模块+生产模块+部分系统
-- 菜单权限
INSERT IGNORE INTO t_role_permission (role_id, permission_id) VALUES
-- 菜单
(3, 1),   -- MENU_DASHBOARD
(3, 2),   -- MENU_BASIC
(3, 3),   -- MENU_PRODUCTION
(3, 4),   -- MENU_FINANCE
(3, 6),   -- MENU_STYLE_INFO
(3, 7),   -- MENU_ORDER_MANAGEMENT
(3, 8),   -- MENU_DATA_CENTER
(3, 9),   -- MENU_TEMPLATE_CENTER
(3, 10),  -- MENU_PRODUCTION_LIST
(3, 11),  -- MENU_MATERIAL_PURCHASE
(3, 12),  -- MENU_CUTTING
(3, 13),  -- MENU_PROGRESS
(3, 14),  -- MENU_WAREHOUSING
(3, 15),  -- MENU_MATERIAL_RECON
(3, 16),  -- MENU_SHIPMENT_RECON
(3, 17),  -- MENU_PAYMENT_APPROVAL
(3, 18),  -- MENU_PAYROLL_OPERATOR_SUMMARY
(3, 8056), -- MENU_FINISHED_SETTLEMENT
-- 按钮权限
(3, 24), (3, 25), (3, 26), (3, 27), (3, 28),  -- STYLE_*
(3, 29), (3, 30), (3, 31), (3, 32), (3, 33), (3, 34), (3, 35), (3, 36),  -- ORDER_*
(3, 37), (3, 38), (3, 39), (3, 40), (3, 41), (3, 42),  -- PURCHASE_*
(3, 43), (3, 44), (3, 45), (3, 46),  -- CUTTING_*
(3, 47), (3, 48), (3, 49),  -- PROGRESS_*
(3, 50), (3, 51), (3, 52), (3, 53),  -- WAREHOUSING_*
(3, 54), (3, 55), (3, 56), (3, 57), (3, 58),  -- MATERIAL_RECON_*
(3, 59), (3, 60), (3, 61), (3, 62),  -- SHIPMENT_RECON_*
(3, 63), (3, 64), (3, 65),  -- PAYMENT_*
(3, 76), (3, 77),  -- DATA_IMPORT/EXPORT
(3, 78), (3, 79),  -- TEMPLATE_UPLOAD/DELETE
(3, 8057);  -- FINANCE_SETTLEMENT_VIEW

-- 角色2: 生产跟单 (id=2)
INSERT IGNORE INTO t_role_permission (role_id, permission_id) VALUES
(2, 1),   -- MENU_DASHBOARD
(2, 2),   -- MENU_BASIC
(2, 3),   -- MENU_PRODUCTION
(2, 6),   -- MENU_STYLE_INFO
(2, 7),   -- MENU_ORDER_MANAGEMENT
(2, 9),   -- MENU_TEMPLATE_CENTER
(2, 10),  -- MENU_PRODUCTION_LIST
(2, 12),  -- MENU_CUTTING
(2, 13),  -- MENU_PROGRESS
(2, 14),  -- MENU_WAREHOUSING
-- 按钮: 只读+创建编辑（无删除）
(2, 24), (2, 25), (2, 28),  -- STYLE: CREATE/EDIT/EXPORT
(2, 29), (2, 30), (2, 34), (2, 35),  -- ORDER: CREATE/EDIT/IMPORT/EXPORT
(2, 43), (2, 44), (2, 46),  -- CUTTING: CREATE/EDIT/SCAN
(2, 47),  -- PROGRESS_SCAN
(2, 50), (2, 51),  -- WAREHOUSING: CREATE/EDIT
(2, 76), (2, 77);  -- DATA: IMPORT/EXPORT

-- 角色9: 仓库管理 (id=9)
INSERT IGNORE INTO t_role_permission (role_id, permission_id) VALUES
(9, 1),   -- MENU_DASHBOARD
(9, 3),   -- MENU_PRODUCTION
(9, 11),  -- MENU_MATERIAL_PURCHASE
(9, 14),  -- MENU_WAREHOUSING
(9, 15),  -- MENU_MATERIAL_RECON
-- 按钮
(9, 37), (9, 38), (9, 39), (9, 40), (9, 41), (9, 42),  -- PURCHASE_*
(9, 50), (9, 51), (9, 52), (9, 53),  -- WAREHOUSING_*
(9, 54), (9, 55), (9, 56),  -- MATERIAL_RECON: CREATE/EDIT/DELETE
(9, 76), (9, 77);  -- DATA: IMPORT/EXPORT

-- 角色4: 财务结算 (id=4)
DELETE FROM t_role_permission WHERE role_id = 4;
INSERT IGNORE INTO t_role_permission (role_id, permission_id) VALUES
(4, 1),   -- MENU_DASHBOARD
(4, 4),   -- MENU_FINANCE
(4, 15),  -- MENU_MATERIAL_RECON
(4, 16),  -- MENU_SHIPMENT_RECON
(4, 17),  -- MENU_PAYMENT_APPROVAL
(4, 18),  -- MENU_PAYROLL_OPERATOR_SUMMARY
(4, 8056), -- MENU_FINISHED_SETTLEMENT
-- 按钮
(4, 54), (4, 55), (4, 56), (4, 57), (4, 58),  -- MATERIAL_RECON_*
(4, 59), (4, 60), (4, 61), (4, 62),  -- SHIPMENT_RECON_*
(4, 63), (4, 64), (4, 65),  -- PAYMENT_*
(4, 77),  -- DATA_EXPORT
(4, 8057), -- FINANCE_SETTLEMENT_VIEW
(4, 8454), (4, 8455), (4, 8456);  -- FINANCE_TOTAL/SEWING/BASIC

-- 角色6: 车间工人 (id=6) - 最精简，仅扫码和查看
DELETE FROM t_role_permission WHERE role_id = 6;
INSERT IGNORE INTO t_role_permission (role_id, permission_id) VALUES
(6, 1),   -- MENU_DASHBOARD
(6, 3),   -- MENU_PRODUCTION
(6, 13),  -- MENU_PROGRESS
(6, 46),  -- CUTTING_SCAN
(6, 47);  -- PROGRESS_SCAN

-- =====================================================================
-- 7. 验证
-- =====================================================================
SELECT '--- 角色模板列表 ---' AS info;
SELECT id, role_name, role_code, is_template, status, sort_order,
       (SELECT COUNT(*) FROM t_role_permission rp WHERE rp.role_id = r.id) AS perm_count
FROM t_role r ORDER BY sort_order;

SELECT '--- 新表状态 ---' AS info;
SELECT 'OK' AS t_tenant_permission_ceiling_exists FROM DUAL WHERE EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_permission_ceiling');
SELECT 'OK' AS t_user_permission_override_exists FROM DUAL WHERE EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_user_permission_override');

-- 清理存储过程
DROP PROCEDURE IF EXISTS add_col;
DROP PROCEDURE IF EXISTS drop_idx;
DROP PROCEDURE IF EXISTS add_idx;
DROP PROCEDURE IF EXISTS add_uniq;
