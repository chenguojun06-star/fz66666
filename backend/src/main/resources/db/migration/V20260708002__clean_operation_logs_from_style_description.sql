-- ========================================================
-- 清理 style_info.description 字段中的操作日志污染
-- 问题原因：StyleOperationAppendHelper 将操作日志（如"退回纸样开发"、"修改款式"等）
--          错误地追加到了 description 字段，而该字段是用来存储生产要求的。
-- 修复方案：移除 description 中所有以 "[YYYY-MM-DD HH:mm:ss]" 开头的操作日志行，
--          保留用户实际输入的生产要求内容。
-- ========================================================

DELIMITER $$

CREATE PROCEDURE CleanStyleDescriptionOperationLogs()
BEGIN
    DECLARE done INT DEFAULT FALSE;
    DECLARE v_id BIGINT;
    DECLARE v_desc TEXT;
    DECLARE v_cleaned TEXT;
    DECLARE v_line VARCHAR(4096);
    DECLARE cur CURSOR FOR
        SELECT id, description
        FROM style_info
        WHERE description IS NOT NULL
          AND description != ''
          AND description REGEXP '^\\[[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}\\]'
          AND delete_flag = 0;
    
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

    OPEN cur;

    read_loop: LOOP
        FETCH cur INTO v_id, v_desc;
        IF done THEN
            LEAVE read_loop;
        END IF;

        SET v_cleaned = '';
        
        SET @pos = 1;
        SET @len = CHAR_LENGTH(v_desc);
        
        WHILE @pos <= @len DO
            SET @nl_pos = LOCATE('\n', v_desc, @pos);
            IF @nl_pos = 0 THEN
                SET @nl_pos = @len + 1;
            END IF;
            
            SET v_line = TRIM(SUBSTRING(v_desc, @pos, @nl_pos - @pos));
            SET @pos = @nl_pos + 1;
            
            IF v_line REGEXP '^\\[[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}\\]' THEN
                ITERATE;
            END IF;
            
            IF v_cleaned != '' THEN
                SET v_cleaned = CONCAT(v_cleaned, '\n');
            END IF;
            SET v_cleaned = CONCAT(v_cleaned, v_line);
        END WHILE;

        SET v_cleaned = TRIM(v_cleaned);
        IF v_cleaned = '' THEN
            SET v_cleaned = NULL;
        END IF;

        UPDATE style_info
        SET description = v_cleaned
        WHERE id = v_id;
        
    END LOOP;

    CLOSE cur;
END$$

DELIMITER ;

CALL CleanStyleDescriptionOperationLogs();

DROP PROCEDURE IF EXISTS CleanStyleDescriptionOperationLogs;
