-- 补充常见车缝子工序映射（侧缝、下摆、袖口等）
-- 这些工序名在 t_process_parent_mapping 中缺失，导致样衣开发工序列表全部归入"尾部"
-- 参考 t_style_process 中已有的 progress_stage='车缝' 的子工序

DROP PROCEDURE IF EXISTS _add_sewing_mappings;
DELIMITER //
CREATE PROCEDURE _add_sewing_mappings()
BEGIN
    -- 车缝子工序
    IF NOT EXISTS (SELECT 1 FROM t_process_parent_mapping WHERE process_keyword = '侧缝') THEN
        INSERT INTO t_process_parent_mapping (process_keyword, parent_node, tenant_id, create_time)
        VALUES ('侧缝', '车缝', NULL, NOW());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM t_process_parent_mapping WHERE process_keyword = '下摆') THEN
        INSERT INTO t_process_parent_mapping (process_keyword, parent_node, tenant_id, create_time)
        VALUES ('下摆', '车缝', NULL, NOW());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM t_process_parent_mapping WHERE process_keyword = '袖口') THEN
        INSERT INTO t_process_parent_mapping (process_keyword, parent_node, tenant_id, create_time)
        VALUES ('袖口', '车缝', NULL, NOW());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM t_process_parent_mapping WHERE process_keyword = '合侧缝') THEN
        INSERT INTO t_process_parent_mapping (process_keyword, parent_node, tenant_id, create_time)
        VALUES ('合侧缝', '车缝', NULL, NOW());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM t_process_parent_mapping WHERE process_keyword = '合肩缝') THEN
        INSERT INTO t_process_parent_mapping (process_keyword, parent_node, tenant_id, create_time)
        VALUES ('合肩缝', '车缝', NULL, NOW());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM t_process_parent_mapping WHERE process_keyword = '前片') THEN
        INSERT INTO t_process_parent_mapping (process_keyword, parent_node, tenant_id, create_time)
        VALUES ('前片', '车缝', NULL, NOW());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM t_process_parent_mapping WHERE process_keyword = '后片') THEN
        INSERT INTO t_process_parent_mapping (process_keyword, parent_node, tenant_id, create_time)
        VALUES ('后片', '车缝', NULL, NOW());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM t_process_parent_mapping WHERE process_keyword = '前片车缝') THEN
        INSERT INTO t_process_parent_mapping (process_keyword, parent_node, tenant_id, create_time)
        VALUES ('前片车缝', '车缝', NULL, NOW());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM t_process_parent_mapping WHERE process_keyword = '后片车缝') THEN
        INSERT INTO t_process_parent_mapping (process_keyword, parent_node, tenant_id, create_time)
        VALUES ('后片车缝', '车缝', NULL, NOW());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM t_process_parent_mapping WHERE process_keyword = '下摆卷边') THEN
        INSERT INTO t_process_parent_mapping (process_keyword, parent_node, tenant_id, create_time)
        VALUES ('下摆卷边', '车缝', NULL, NOW());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM t_process_parent_mapping WHERE process_keyword = '下脚卷边') THEN
        INSERT INTO t_process_parent_mapping (process_keyword, parent_node, tenant_id, create_time)
        VALUES ('下脚卷边', '车缝', NULL, NOW());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM t_process_parent_mapping WHERE process_keyword = '上袖埋夹') THEN
        INSERT INTO t_process_parent_mapping (process_keyword, parent_node, tenant_id, create_time)
        VALUES ('上袖埋夹', '车缝', NULL, NOW());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM t_process_parent_mapping WHERE process_keyword = '袖口领口波边') THEN
        INSERT INTO t_process_parent_mapping (process_keyword, parent_node, tenant_id, create_time)
        VALUES ('袖口领口波边', '车缝', NULL, NOW());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM t_process_parent_mapping WHERE process_keyword = '领口隧道穿绳') THEN
        INSERT INTO t_process_parent_mapping (process_keyword, parent_node, tenant_id, create_time)
        VALUES ('领口隧道穿绳', '车缝', NULL, NOW());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM t_process_parent_mapping WHERE process_keyword = '剪橡筋车橡筋') THEN
        INSERT INTO t_process_parent_mapping (process_keyword, parent_node, tenant_id, create_time)
        VALUES ('剪橡筋车橡筋', '车缝', NULL, NOW());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM t_process_parent_mapping WHERE process_keyword = '车板') THEN
        INSERT INTO t_process_parent_mapping (process_keyword, parent_node, tenant_id, create_time)
        VALUES ('车板', '车缝', NULL, NOW());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM t_process_parent_mapping WHERE process_keyword = '卷边') THEN
        INSERT INTO t_process_parent_mapping (process_keyword, parent_node, tenant_id, create_time)
        VALUES ('卷边', '车缝', NULL, NOW());
    END IF;

    -- 裁剪子工序
    IF NOT EXISTS (SELECT 1 FROM t_process_parent_mapping WHERE process_keyword = '裁床分包') THEN
        INSERT INTO t_process_parent_mapping (process_keyword, parent_node, tenant_id, create_time)
        VALUES ('裁床分包', '裁剪', NULL, NOW());
    END IF;

    -- 尾部子工序
    IF NOT EXISTS (SELECT 1 FROM t_process_parent_mapping WHERE process_keyword = '整烫剪线包装') THEN
        INSERT INTO t_process_parent_mapping (process_keyword, parent_node, tenant_id, create_time)
        VALUES ('整烫剪线包装', '尾部', NULL, NOW());
    END IF;
END //
DELIMITER ;
CALL _add_sewing_mappings();
DROP PROCEDURE IF EXISTS _add_sewing_mappings;
