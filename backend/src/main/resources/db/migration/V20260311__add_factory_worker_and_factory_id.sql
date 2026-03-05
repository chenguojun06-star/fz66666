-- V20260311: 外发工厂账号体系 — 工厂ID绑定 + 工人台账
-- 1. t_user 新增 factory_id 列（普通账号=NULL，外发工厂账号=工厂ID）
-- 2. t_scan_record 新增 factory_id 列（记录扫码时的工厂归属）
-- 3. 创建 t_factory_worker 工厂工人台账表
-- 云端 FLYWAY_ENABLED=false，此脚本需手动在微信云托管控制台执行

ALTER TABLE t_user
    ADD COLUMN factory_id VARCHAR(36) DEFAULT NULL COMMENT '外发工厂ID，NULL=普通租户账号，非NULL=外发工厂账号';

ALTER TABLE t_scan_record
    ADD COLUMN factory_id VARCHAR(36) DEFAULT NULL COMMENT '扫码时归属的外发工厂ID';

CREATE TABLE IF NOT EXISTS t_factory_worker (
    id          VARCHAR(36)  NOT NULL PRIMARY KEY,
    factory_id  VARCHAR(36)  NOT NULL COMMENT '所属外发工厂ID（关联 t_factory.id）',
    tenant_id   BIGINT       NOT NULL COMMENT '租户ID（多租户隔离）',
    worker_no   VARCHAR(50)  DEFAULT NULL COMMENT '工人编号（工厂内部编号，可选）',
    worker_name VARCHAR(50)  NOT NULL    COMMENT '工人姓名',
    phone       VARCHAR(20)  DEFAULT NULL COMMENT '联系电话（可选）',
    status      VARCHAR(20)  NOT NULL DEFAULT 'active' COMMENT 'active=在职 inactive=离职',
    create_time DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME     DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    delete_flag INT          NOT NULL DEFAULT 0,
    INDEX idx_factory_worker_factory_id  (factory_id),
    INDEX idx_factory_worker_tenant_id   (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='外发工厂工人台账';
