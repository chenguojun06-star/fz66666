-- ============================================================
-- 云端数据库一次性补丁 (CynosDB 8.0 兼容版)
-- 覆盖39个缺失Flyway迁移  |  2026-02-25
-- ============================================================
-- 执行方式(分3步，每步单独粘贴执行):
--   第1步: 复制 PART 1 内容 -> 执行 (创建工具存储过程)
--   第2步: 复制 PART 2 内容 -> 执行 (应用所有迁移)
--   第3步: 复制 PART 3 内容 -> 执行 (写入Flyway历史+清理)
-- ============================================================

-- ======================== PART 1/3: 工具存储过程 ========================
-- ⚠️ 图形工具（TablePlus/DMS/Navicat）需支持 DELIMITER 指令，
--    或把整个 PART 1 整体粘贴执行（不要按语句逐条执行）。
--    若工具不支持 DELIMITER，请改用 MySQL CLI：
--      mysql -h<host> -P<port> -u<user> -p<pwd> <dbname> < patch_part1_procedures.sql

DROP PROCEDURE IF EXISTS _add_col;
DROP PROCEDURE IF EXISTS _add_idx;

DELIMITER $$

CREATE PROCEDURE _add_col(IN tbl VARCHAR(64), IN col VARCHAR(64), IN def TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=tbl AND COLUMN_NAME=col
  ) THEN
    SET @s = CONCAT('ALTER TABLE `',tbl,'` ADD COLUMN `',col,'` ',def);
    PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
END$$

CREATE PROCEDURE _add_idx(IN tbl VARCHAR(64), IN idx VARCHAR(64), IN def TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=tbl AND INDEX_NAME=idx
  ) THEN
    SET @s = CONCAT('ALTER TABLE `',tbl,'` ADD ',def);
    PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
END$$

DELIMITER ;

SELECT 'Part 1 DONE' AS status;
-- ======================== END PART 1 ========================
