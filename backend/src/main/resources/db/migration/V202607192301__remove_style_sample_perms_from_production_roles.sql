-- BUG FIX: 普通生产人员（worker, production_supervisor）不应看到样衣管理和EC销售等模块
-- worker / production_supervisor 角色移除 MENU_STYLE_INFO、MENU_SAMPLE_INVENTORY 权限
-- 这两个权限分别控制「款式信息/单价维护」和「样衣库存」菜单，普通工人无需访问

DELETE rp FROM t_role_permission rp
JOIN t_role r ON r.id = rp.role_id
JOIN t_permission p ON p.id = rp.permission_id
WHERE r.role_code IN ('worker', 'production_supervisor')
  AND p.permission_code IN ('MENU_STYLE_INFO', 'MENU_SAMPLE_INVENTORY', 'MENU_FINANCE_EXPORT');
