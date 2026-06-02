-- ============================================================
-- 修复 t_process_parent_mapping 中 40 条历史种子的 parent_node 双重编码
--
-- 根因：
--   1. V20260302c 迁移首次插入 40 条系统默认种子（尾部 17 + 二次工艺 6 +
--      车缝 10 + 裁剪 3 + 采购 4）
--   2. 这些数据在 V20260412001（添加 tenant_id 列）前后某个时点，
--      经历了"UTF-8 字节 → latin1 解读 → 再 UTF-8 编码"的双重编码
--   3. 表现为 HEX(parent_node) 以 "C3" 开头（如 C3A5C2B0... = "å°¾éƒ¨"），
--      实际正确的 HEX 应为 E5B0BEE983A8（"尾部"）
--   4. 严重影响前端父子工序匹配：用户配置的"钉扣"会指向乱码父节点
--
-- 修复：
--   三层 CONVERT：latin1 → binary → utf8
--   第一层：把当前字符（双重编码后的字符）按 latin1 解读为字节
--   第二层：把字节当 binary 保留（防止 MySQL 自动转回 utf8）
--   第三层：把字节按 utf8 解读为正确字符
--
-- 幂等性：
--   仅修复 HEX(parent_node) 以 C3 开头的行（双重编码特征），
--   已修复的行会被 WHERE 条件跳过。
--
-- 数据影响：
--   40 条历史种子的 parent_node 从双重编码恢复为正确 UTF-8
--   业务功能完全等价（语义无变化，只是字符编码正确）
-- ============================================================

UPDATE t_process_parent_mapping
SET parent_node = CONVERT(CONVERT(CONVERT(parent_node USING latin1) USING binary) USING utf8)
WHERE HEX(parent_node) REGEXP '^C3'
  AND tenant_id IS NULL;
