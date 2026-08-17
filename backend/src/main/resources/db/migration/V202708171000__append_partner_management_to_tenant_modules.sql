-- D-106：合作企业管理菜单从"系统设置"迁移到"供应商管理"分组（路径 /system/partner-management 不变）
-- 背景：该路径此前不在租户模块白名单（tenantModuleConfig.ALL_MODULE_PATHS）中，超管无法给租户勾选；
--      已按白名单配置 enabled_modules 的租户因此看不到该菜单。
-- 兜底：凡已启用供应商管理(/production/partners)且未含合作企业管理的租户，自动追加该路径。
-- 幂等：WHERE NOT JSON_CONTAINS 保证重复执行不重复追加。
UPDATE t_tenant
SET enabled_modules = JSON_ARRAY_APPEND(enabled_modules, '$', '/system/partner-management')
WHERE enabled_modules IS NOT NULL
  AND JSON_VALID(enabled_modules)
  AND JSON_CONTAINS(enabled_modules, JSON_QUOTE('/production/partners'))
  AND NOT JSON_CONTAINS(enabled_modules, JSON_QUOTE('/system/partner-management'));
