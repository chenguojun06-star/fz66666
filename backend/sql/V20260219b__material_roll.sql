-- ============================================================
-- 面辅料料卷/箱管理表
-- 每个物理料卷或箱子对应一条记录，贴一张二维码标签
-- QR码内容 = roll_code（格式：MR{YYYYMMDD}{5位序号} 如 MR2026021900001）
-- ============================================================

CREATE TABLE IF NOT EXISTS t_material_roll (
    id              VARCHAR(32)     NOT NULL COMMENT '主键ID',
    roll_code       VARCHAR(30)     NOT NULL COMMENT '料卷/箱编号，即二维码内容 MR+日期+序号',
    inbound_id      VARCHAR(32)         NULL COMMENT '关联入库单ID',
    inbound_no      VARCHAR(50)         NULL COMMENT '入库单号（冗余，便于显示）',
    material_code   VARCHAR(50)     NOT NULL COMMENT '物料编码',
    material_name   VARCHAR(100)    NOT NULL COMMENT '物料名称',
    material_type   VARCHAR(20)         NULL COMMENT '物料类型：面料/辅料/其他',
    color           VARCHAR(50)         NULL COMMENT '颜色',
    specifications  VARCHAR(100)        NULL COMMENT '规格',
    unit            VARCHAR(20)         NULL COMMENT '单位（米/件/kg等）',
    quantity        DECIMAL(10,2)   NOT NULL COMMENT '本卷/箱数量',
    warehouse_location VARCHAR(50)  NOT NULL DEFAULT '默认仓' COMMENT '存放仓库',
    status          VARCHAR(20)     NOT NULL DEFAULT 'IN_STOCK'
                    COMMENT '状态：IN_STOCK-在库 / ISSUED-已发料 / RETURNED-已退回',
    issued_order_id   VARCHAR(32)       NULL COMMENT '发料关联裁剪单ID',
    issued_order_no   VARCHAR(50)       NULL COMMENT '发料关联裁剪单号',
    issued_time       DATETIME          NULL COMMENT '发料时间',
    issued_by_id      VARCHAR(32)       NULL COMMENT '发料操作人ID',
    issued_by_name    VARCHAR(50)       NULL COMMENT '发料操作人姓名',
    supplier_name   VARCHAR(100)        NULL COMMENT '供应商名称',
    remark          VARCHAR(255)        NULL COMMENT '备注',
    tenant_id       VARCHAR(32)         NULL COMMENT '租户ID',
    creator_id      VARCHAR(32)         NULL COMMENT '创建人ID',
    creator_name    VARCHAR(50)         NULL COMMENT '创建人姓名',
    create_time     DATETIME    DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time     DATETIME    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    delete_flag     TINYINT     DEFAULT 0 COMMENT '删除标记 0-正常 1-已删除',
    PRIMARY KEY (id),
    UNIQUE KEY uk_roll_code (roll_code, tenant_id),
    INDEX idx_inbound_id   (inbound_id),
    INDEX idx_material_code (material_code),
    INDEX idx_status       (status),
    INDEX idx_tenant_id    (tenant_id),
    INDEX idx_create_time  (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='面辅料料卷/箱明细 - 每行对应一张二维码标签';

-- 序列表：用于生成每日唯一料卷流水号
CREATE TABLE IF NOT EXISTS t_material_roll_sequence (
    id              INT             NOT NULL AUTO_INCREMENT COMMENT '主键',
    roll_date       DATE            NOT NULL COMMENT '日期',
    seq             INT             NOT NULL DEFAULT 1 COMMENT '当日序号',
    PRIMARY KEY (id),
    UNIQUE KEY uk_roll_date (roll_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='料卷编号日序列表';
