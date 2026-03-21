-- 移除普通工人对「公司大盘」菜单的访问权限
-- 原因：MENU_DASHBOARD 展示全公司汇总运营数据（逾期订单/高风险单/整体进度），
--       普通工人（worker）不应获取公司级别的整体运营视图。
-- 保留：production_supervisor 保留 MENU_DASHBOARD / MENU_WAREHOUSE_DASHBOARD
--       主管需要掌握全局生产进度与仓储概览。
-- 执行范围：仅删除 worker 角色对 MENU_DASHBOARD 的授权，不影响其他角色。

DELETE rp FROM t_role_permission rp
JOIN t_role r ON r.id = rp.role_id
JOIN t_permission p ON p.id = rp.permission_id
WHERE r.role_code = 'worker'
  AND p.permission_code = 'MENU_DASHBOARD';
