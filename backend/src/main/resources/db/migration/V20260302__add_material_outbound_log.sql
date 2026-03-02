-- V20260302: 创建面辅料出库日志表，用于记录每次出库操作的操作人和时间
-- ⚠️ 云端 FLYWAY_ENABLED=false，需在微信云托管控制台数据库面板手动执行

CREATE TABLE IF NOT EXISTS t_material_outbound_log (
    id              VARCHAR(64)  NOT NULL PRIMARY KEY COMMENT '主键',
    tenant_id       BIGINT       NOT NULL                COMMENT '租户ID',
    stock_id        VARCHAR(64)  NOT NULL                COMMENT '关联库存记录ID',
    material_code   VARCHAR(100) NOT NULL                COMMENT '物料编码',
    material_name   VARCHAR(200)                         COMMENT '物料名称',
    quantity        INT          NOT NULL DEFAULT 0      COMMENT '出库数量',
    operator_id     VARCHAR(64)                          COMMENT '操作人ID',
    operator_name   VARCHAR(100)                         COMMENT '操作人姓名',
    warehouse_location VARCHAR(200)                      COMMENT '仓位',
    remark          VARCHAR(500)                         COMMENT '备注/出库原因',
    outbound_time   DATETIME     NOT NULL                COMMENT '出库时间',
    create_time     DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    delete_flag     INT          NOT NULL DEFAULT 0      COMMENT '删除标记',
    INDEX idx_mol_stock_id    (stock_id),
    INDEX idx_mol_mat_code    (material_code),
    INDEX idx_mol_tenant      (tenant_id),
    INDEX idx_mol_out_time    (outbound_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='面辅料出库日志';
