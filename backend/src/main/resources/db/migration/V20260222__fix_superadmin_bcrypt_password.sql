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
