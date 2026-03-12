-- 月度经营汇总查看权限（默认不分配给任何角色，由租户老板按需开放）
-- 幂等：permission_code 字段有 UNIQUE 约束，INSERT IGNORE 安全可重复执行
INSERT IGNORE INTO t_permission
  (permission_name, permission_code, permission_type, parent_id, parent_name, sort, status)
VALUES
  ('月度经营汇总', 'INTELLIGENCE_MONTHLY_VIEW', 'button', 1, '首页', 200, 'ENABLED');
