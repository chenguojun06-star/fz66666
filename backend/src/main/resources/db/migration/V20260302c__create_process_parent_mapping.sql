-- ========================================================================
-- 工序→父节点动态映射表
-- 替代后端/前端所有硬编码的工序名关键词列表
-- 管理员可通过 INSERT 新增映射，无需改代码、无需重新部署
-- ========================================================================

CREATE TABLE IF NOT EXISTS t_process_parent_mapping (
    id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    process_keyword VARCHAR(50) NOT NULL COMMENT '子工序关键词（用于 contains 匹配）',
    parent_node     VARCHAR(20) NOT NULL COMMENT '父进度节点（6个之一：采购/裁剪/二次工艺/车缝/尾部/入库）',
    tenant_id       BIGINT      DEFAULT NULL COMMENT '租户ID，NULL表示全局通用',
    create_time     DATETIME    DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_keyword_tenant (process_keyword, tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工序→父进度节点动态映射（替代硬编码关键词）';

-- ── 尾部子工序 ──
INSERT IGNORE INTO t_process_parent_mapping (process_keyword, parent_node) VALUES
('整烫', '尾部'), ('大烫', '尾部'), ('熨烫', '尾部'), ('烫整', '尾部'),
('质检', '尾部'), ('检验', '尾部'), ('品检', '尾部'), ('验货', '尾部'), ('验收', '尾部'),
('包装', '尾部'), ('打包', '尾部'), ('装箱', '尾部'), ('后整', '尾部'),
('剪线', '尾部'), ('尾工', '尾部'), ('钉扣', '尾部'), ('锁眼', '尾部');

-- ── 二次工艺子工序 ──
INSERT IGNORE INTO t_process_parent_mapping (process_keyword, parent_node) VALUES
('绣花', '二次工艺'), ('印花', '二次工艺'), ('水洗', '二次工艺'),
('染色', '二次工艺'), ('压花', '二次工艺'), ('烫钻', '二次工艺');

-- ── 车缝子工序 ──
INSERT IGNORE INTO t_process_parent_mapping (process_keyword, parent_node) VALUES
('缝制', '车缝'), ('缝纫', '车缝'), ('车工', '车缝'),
('上领', '车缝'), ('上袖', '车缝'), ('锁边', '车缝'),
('拼缝', '车缝'), ('上拉链', '车缝'), ('上腰', '车缝'), ('辑线', '车缝');

-- ── 裁剪子工序 ──
INSERT IGNORE INTO t_process_parent_mapping (process_keyword, parent_node) VALUES
('裁床', '裁剪'), ('剪裁', '裁剪'), ('开裁', '裁剪');

-- ── 采购子工序 ──
INSERT IGNORE INTO t_process_parent_mapping (process_keyword, parent_node) VALUES
('物料', '采购'), ('面辅料', '采购'), ('备料', '采购'), ('到料', '采购');
