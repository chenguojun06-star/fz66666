-- D-384：样板工序指派明细表
-- 背景：同一道工序（如「车缝」）任务量 3 件，可分配给多个工人（张三 2 件 / 李四 1 件），
--       每人只能报自己那份额度，工资也按各自实际报工件数计。
-- 原实现只有一个 receiver 字段（记录级），多人指派会互相覆盖，且无分配留痕。
-- 幂等：CREATE TABLE IF NOT EXISTS + 存储过程 CONTINUE HANDLER（沿用项目迁移规范）
DROP PROCEDURE IF EXISTS `__mig_V202709120500__create_pattern_process_assignment`;
DELIMITER $$
CREATE PROCEDURE `__mig_V202709120500__create_pattern_process_assignment`()
BEGIN
    DECLARE CONTINUE HANDLER FOR SQLEXCEPTION BEGIN END;
    CREATE TABLE IF NOT EXISTS t_pattern_process_assignment (
        id VARCHAR(64) NOT NULL COMMENT '主键ID',
        tenant_id BIGINT NULL COMMENT '租户ID',
        pattern_production_id VARCHAR(64) NOT NULL COMMENT '样板生产记录ID（一个色码一条）',
        style_no VARCHAR(64) NULL COMMENT '款号（冗余，便于列表展示）',
        color VARCHAR(64) NULL COMMENT '颜色（冗余，便于展示）',
        size VARCHAR(64) NULL COMMENT '尺码（冗余，便于展示）',
        process_name VARCHAR(128) NOT NULL COMMENT '工序名（子工序，如「车缝」「整件」）',
        process_code VARCHAR(64) NULL COMMENT '工序编码 / 所属阶段',
        assignee VARCHAR(64) NOT NULL COMMENT '被指派人姓名',
        assignee_id VARCHAR(64) NULL COMMENT '被指派人ID（若有）',
        assignment_quantity INT NOT NULL DEFAULT 0 COMMENT '指派数量（该工人负责的件数）',
        unit_price DECIMAL(18, 4) NULL COMMENT '指派时的工序单价快照（工资参考）',
        remark VARCHAR(255) NULL COMMENT '备注',
        creator_id VARCHAR(64) NULL COMMENT '创建人ID',
        creator_name VARCHAR(64) NULL COMMENT '创建人姓名',
        create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
        update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
        delete_flag TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除：0正常 1删除',
        PRIMARY KEY (id),
        INDEX idx_pat_proc (pattern_production_id, process_name),
        INDEX idx_tenant (tenant_id),
        INDEX idx_assignee (assignee)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='样板工序指派明细（一个工序可指派多人，各自件数额度）';
END$$
DELIMITER ;
CALL `__mig_V202709120500__create_pattern_process_assignment`();
DROP PROCEDURE IF EXISTS `__mig_V202709120500__create_pattern_process_assignment`;
