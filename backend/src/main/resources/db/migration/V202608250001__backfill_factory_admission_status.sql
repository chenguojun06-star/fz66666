-- D-126: 供应商准入历史数据回填
-- 准入功能上线前的老供应商（admission_status 为空）一直在正常合作，一律视为已准入。
-- 幂等：UPDATE 天然可重复执行，第二次匹配 0 行。
UPDATE t_factory SET admission_status = 'approved'
WHERE admission_status IS NULL OR admission_status = '';
