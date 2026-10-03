-- D-737：补建应收回款流水表 t_receivable_receipt_log
--
-- 背景：ReceivableReceiptLog 的实体 / Mapper / Orchestrator（详情页「回款流水」区块）
-- 早已存在，但**建表迁移从未提交**——生产库没有这张表，导致打开「应收详情」必 500
-- （Table 't_receivable_receipt_log' doesn't exist）。
-- 此前 t_receivable 长期 0 行、无人打开过详情，2026-10-03 应收有数据后首次暴露。
--
-- 列与 ReceivableReceiptLog 实体一一对应；索引按详情页查询模式
-- （tenant_id + receivable_id 过滤、received_time 倒序）建立。

CREATE TABLE IF NOT EXISTS t_receivable_receipt_log (
    id VARCHAR(36) NOT NULL COMMENT '主键(UUID)',
    receivable_id VARCHAR(36) NOT NULL COMMENT '应收单ID',
    receivable_no VARCHAR(50) DEFAULT NULL COMMENT '应收单号(冗余)',
    customer_id VARCHAR(36) DEFAULT NULL COMMENT '客户ID(冗余)',
    customer_name VARCHAR(200) DEFAULT NULL COMMENT '客户名称(冗余)',
    source_biz_type VARCHAR(32) DEFAULT NULL COMMENT '来源业务类型',
    source_biz_id VARCHAR(64) DEFAULT NULL COMMENT '来源业务ID',
    source_biz_no VARCHAR(64) DEFAULT NULL COMMENT '来源业务单号',
    received_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '回款金额',
    remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
    received_time DATETIME DEFAULT NULL COMMENT '回款时间',
    operator_id VARCHAR(64) DEFAULT NULL COMMENT '操作人ID',
    operator_name VARCHAR(100) DEFAULT NULL COMMENT '操作人姓名',
    tenant_id BIGINT NOT NULL COMMENT '租户ID',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    delete_flag TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除:0正常/1删除',
    PRIMARY KEY (id),
    KEY idx_rrl_tenant_receivable (tenant_id, receivable_id),
    KEY idx_rrl_received_time (received_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='应收回款流水';
