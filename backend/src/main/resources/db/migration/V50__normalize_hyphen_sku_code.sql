-- V50__normalize_hyphen_sku_code.sql
-- 将 t_product_sku 残留的历史「横线」格式 SKU 编码归一化为「直拼」格式
--
-- 背景：
--   D-228 起 SKU 编码统一为直拼格式（款号+颜色+尺码，如 BR26X1K0651A棕色XS）。
--   出入库链路 6 处代码已全部改为直拼，但款式档案里仍残留历史横线格式数据
--   （款号-颜色-尺码）。因 upsert 有「按款色码二次查找」兜底，库存归集一直正确、
--   功能不受影响，仅显示格式不统一。
--
-- 安全策略（四道闸门，宁可少改也不错改）：
--   1. 只处理含 '-' 的编码
--   2. 归一化结果必须**严格等于** CONCAT(style_no, color, size)
--      —— 防止「颜色名本身含横线」（如 米-白）被 REPLACE 破坏成错误编码
--   3. 归一化后不得撞唯一索引 uk_sku_code（直拼编码已存在则跳过）
--   4. 不得撞唯一索引 uk_style_color_size(style_id, color, size)（同款同色同码已存在则跳过）
--
-- 幂等性：改过的编码不再含 '-'，WHERE 条件自然不满足，重复执行无副作用。
--
-- 影响范围说明（重要）：
--   本迁移**只改 t_product_sku 主表**，不联动其他 21 张含 sku_code 的表。
--   ① 出入库明细的 sku_code 已由 D-228 的回填 Runner 统一为直拼，不存在旧编码残留；
--   ② 其余表（盘点/电商库存/AI 资产等）若仍引用旧横线编码，靠 upsert 的
--      「按款色码二次查找」兜底，功能不受影响；
--   ③ 联动改 21 张表的风险远大于收益，故不在此处理。
--   若日后需要彻底清理，请先跑 scripts/diagnose_hyphen_sku_code.sql 查看各表分布。
--
-- 撞号未处理的行不会静默丢失：诊断脚本会列出它们，需人工合并（累加库存后删旧行）。

UPDATE t_product_sku a
LEFT JOIN t_product_sku b
       ON b.sku_code = REPLACE(a.sku_code, '-', '')
      AND b.id <> a.id
LEFT JOIN t_product_sku c
       ON c.style_id = a.style_id
      AND c.color    = a.color
      AND c.size     = a.size
      AND c.id <> a.id
SET a.sku_code = REPLACE(a.sku_code, '-', '')
WHERE a.sku_code LIKE '%-%'
  AND REPLACE(a.sku_code, '-', '') = CONCAT(IFNULL(a.style_no, ''), IFNULL(a.color, ''), IFNULL(a.size, ''))
  AND b.id IS NULL
  AND c.id IS NULL;
