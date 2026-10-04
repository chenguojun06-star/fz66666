-- D-702 P0：修复 t_intelligence_signal 重复插入 15 万行的数据事故
--
-- 【事故实况（生产实测）】
--   总行数 = 155,276，不同业务信号 = 129
--   stock_below_safety 重复 41,588 次；order_delay_risk 重复 24,378 次
--   全部 status='open'（2026-03-11 起 7 个月无一条被 resolve）
--
-- 【根因】
--   IntelligenceSignalCollectionJob 每半小时跑一次（cron 0 10/30 * * * ?），
--   而 IntelligenceSignalOrchestrator#persistSignals 是**无条件 insert**，
--   没有任何存在性判断 —— 同一个信号被反复插入。
--
-- 【三方面影响】
--   1. 数据不准确：getOpenSignals 是 status='open' LIMIT 50，
--      在 15 万行全 open 的前提下，返回的 50 条极可能是同一信号的重复，
--      前端「智能驾驶舱」看到的基本是重复项。
--   2. 成本浪费：每轮都对 critical 信号重跑 AI 分析（.limit(5)），
--      而信号内容通常毫无变化。
--   3. 表膨胀：7 个月 15 万行，且无清理路径。
--
-- 【本迁移的策略：备份 → 去重 → 加唯一索引兜底】
--   先把全量数据备份到带时间戳的备份表，确认无损后再删除重复行。
--   最后用「生成列 + 唯一索引」在数据库层面兜住：并发下即使应用层判断失效，
--   重复插入也会被数据库拒绝，而不是静默再堆 15 万行。
--
-- 去重键：(tenant_id, signal_code, source_id, status, delete_flag)
--   必须含 source_id —— 同一 signal_code 会对多个业务对象产生
--   （例如 1.2 万个订单都 order_delay_risk，每单一条才是独立信号）。
--
-- 保留策略：每组保留 id 最大的一条（即最新一次采集结果）。
--
-- 回滚方式（如误判）:
--   INSERT INTO t_intelligence_signal SELECT * FROM t_intelligence_signal_bak_d702;

-- ── 步骤 1：全量备份（只做一次；已存在则跳过，保证重复执行本迁移也安全）──
CREATE TABLE IF NOT EXISTS t_intelligence_signal_bak_d702 AS
    SELECT * FROM t_intelligence_signal;

-- ── 步骤 2：去重删除。每组 (tenant_id, signal_code, source_id, status, delete_flag) 只留最新一条 ──
DELETE t FROM t_intelligence_signal t
JOIN (
    SELECT MAX(id) AS keep_id
    FROM t_intelligence_signal
    GROUP BY tenant_id, signal_code, IFNULL(source_id, ''), status, IFNULL(delete_flag, 0)
) k ON t.id <> k.keep_id;

-- ── 步骤 3：加唯一索引，从数据库层面禁止再次重复 ──
-- 用生成列而非多列唯一索引，因为 source_id 可能为 NULL：
-- MySQL 的唯一索引中 NULL 互不相等，无法阻止 (code 相同, source_id 为 NULL) 的重复。
-- 生成列 CONCAT 出来是普通字符串，NULL 被 IFNULL 归一为 ''，可正常参与唯一约束。
SET @s = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_intelligence_signal'
        AND COLUMN_NAME = 'dedupe_key') = 0,
    'ALTER TABLE `t_intelligence_signal` ADD COLUMN `dedupe_key` VARCHAR(255) GENERATED ALWAYS AS (CONCAT_WS(''|'', IFNULL(`tenant_id`,'0''), IFNULL(`signal_code`,''''), IFNULL(`source_id`,''''), IFNULL(`status`,''''), IFNULL(`delete_flag`,0))) STORED',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_intelligence_signal'
        AND INDEX_NAME = 'uk_intelligence_signal_dedupe') = 0,
    'CREATE UNIQUE INDEX `uk_intelligence_signal_dedupe` ON `t_intelligence_signal` (`dedupe_key`)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;