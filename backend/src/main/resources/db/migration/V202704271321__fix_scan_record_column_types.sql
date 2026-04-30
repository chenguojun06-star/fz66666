-- V202704271321: 统一 t_scan_record 列类型对齐云端生产环境
-- 背景：V26 Flyway 迁移与 cloud_db_patch_20260304 对同名字段定义了不同类型
--       云端（生产）已应用 cloud patch，本地需对齐以避免类型不一致导致的运行时错误
-- 策略：全部 MODIFY COLUMN 对齐到云端类型，幂等执行（不存在的列跳过）

-- 1. assignment_id：云端 VARCHAR(64)，V26 为 BIGINT
--    Java 实体 ScanRecord.assignmentId 为 String，VARCHAR(64) 匹配
ALTER TABLE `t_scan_record`
    MODIFY COLUMN `assignment_id` VARCHAR(64) DEFAULT NULL COMMENT '工序指派ID（Phase 5-6新增）';

-- 2. progress_node_unit_prices：云端 JSON，V26 为 TEXT
--    云端 JSON 类型会校验合法性，本地对齐后可提前发现写入错误
ALTER TABLE `t_scan_record`
    MODIFY COLUMN `progress_node_unit_prices` JSON DEFAULT NULL COMMENT '工序节点单价列表，JSON格式（Phase 3新增）';

-- 3. total_piece_cost：云端 DECIMAL(10,2)，V26 为 DECIMAL(12,2)
ALTER TABLE `t_scan_record`
    MODIFY COLUMN `total_piece_cost` DECIMAL(10,2) DEFAULT NULL COMMENT '总成本（Phase 4新增）';

-- 4. average_piece_cost：云端 DECIMAL(10,4)，V26 为 DECIMAL(12,2)
ALTER TABLE `t_scan_record`
    MODIFY COLUMN `average_piece_cost` DECIMAL(10,4) DEFAULT NULL COMMENT '平均成本（Phase 4新增）';
