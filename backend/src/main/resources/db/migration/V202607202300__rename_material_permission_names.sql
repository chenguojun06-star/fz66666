-- 物料管理菜单改名：同步更新 t_permission 显示名称
-- 面辅料进销存 → 物料进销存
-- 面辅料数据库/物料资料库 → 物料新增
UPDATE t_permission SET permission_name='物料进销存' WHERE permission_code='MENU_MATERIAL_INVENTORY';
UPDATE t_permission SET permission_name='物料新增' WHERE permission_code='MENU_MATERIAL_DATABASE';
