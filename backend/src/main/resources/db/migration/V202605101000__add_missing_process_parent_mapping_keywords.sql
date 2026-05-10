-- ============================================================
-- 补充 t_process_parent_mapping 中缺失的车缝/尾部/二次工艺子工序关键词
-- 数据来源：t_style_process 表中实际模板 progressStage 字段
-- 这些关键词在上次会话中通过 docker exec 直接插入，未走 Flyway，
-- 新部署会丢失。本次正式纳入迁移。
-- ============================================================

-- ── 车缝子工序补充（幂等 INSERT IGNORE）──
INSERT IGNORE INTO t_process_parent_mapping (process_keyword, parent_node) VALUES
('合肩缝', '车缝'),
('合侧缝', '车缝'),
('前片',   '车缝'),
('后片',   '车缝'),
('下脚卷边', '车缝'),
('卷边',   '车缝'),
('剪橡筋车橡筋', '车缝'),
('袖口领口波边', '车缝'),
('领口隧道穿绳', '车缝'),
('整件',   '车缝');

-- ── 尾部子工序补充 ──
INSERT IGNORE INTO t_process_parent_mapping (process_keyword, parent_node) VALUES
('整烫剪线包装',   '尾部'),
('整烫包装剪线头', '尾部');

-- ── 二次工艺子工序补充 ──
INSERT IGNORE INTO t_process_parent_mapping (process_keyword, parent_node) VALUES
('打揽', '二次工艺');

-- ── 清理重复数据：上袖/上领已在 V20260302c 初始种子中存在（tenant_id=1），
--    上次会话误用 tenant_id=NULL 重复插入，删除多余行 ──
DELETE FROM t_process_parent_mapping
WHERE process_keyword IN ('上袖', '上领')
  AND tenant_id IS NULL
  AND EXISTS (
    SELECT 1 FROM (
      SELECT 1 FROM t_process_parent_mapping
      WHERE process_keyword IN ('上袖', '上领')
        AND tenant_id IS NOT NULL
      LIMIT 1
    ) AS chk
  );
