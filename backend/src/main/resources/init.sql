-- 服装供应链系统数据库初始化脚本
-- 创建时间：2026-01-05

-- 创建数据库
CREATE DATABASE IF NOT EXISTS fashion_supplychain
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE fashion_supplychain;

-- 1. 用户表
CREATE TABLE IF NOT EXISTS t_user (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '用户ID',
    username VARCHAR(50) NOT NULL UNIQUE COMMENT '用户名',
    password VARCHAR(100) NOT NULL COMMENT '密码',
    name VARCHAR(50) NOT NULL COMMENT '姓名',
    role_id BIGINT COMMENT '角色ID',
    role_name VARCHAR(50) COMMENT '角色名称',
    permission_range VARCHAR(50) COMMENT '权限范围',
    status VARCHAR(20) DEFAULT 'ENABLED' COMMENT '状态：ENABLED-启用，DISABLED-禁用',
    phone VARCHAR(20) COMMENT '电话',
    email VARCHAR(50) COMMENT '邮箱',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    last_login_time DATETIME COMMENT '最后登录时间',
    last_login_ip VARCHAR(20) COMMENT '最后登录IP'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

-- 2. 角色表
CREATE TABLE IF NOT EXISTS t_role (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '角色ID',
    role_name VARCHAR(50) NOT NULL UNIQUE COMMENT '角色名称',
    role_code VARCHAR(50) NOT NULL UNIQUE COMMENT '角色编码',
    description VARCHAR(200) COMMENT '角色描述',
    status VARCHAR(20) DEFAULT 'ENABLED' COMMENT '状态：ENABLED-启用，DISABLED-禁用',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色表';

-- 3. 权限表
CREATE TABLE IF NOT EXISTS t_permission (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '权限ID',
    permission_name VARCHAR(50) NOT NULL COMMENT '权限名称',
    permission_code VARCHAR(50) NOT NULL UNIQUE COMMENT '权限编码',
    permission_type VARCHAR(20) NOT NULL COMMENT '权限类型：MENU-菜单，BUTTON-按钮',
    parent_id BIGINT DEFAULT 0 COMMENT '父权限ID',
    parent_name VARCHAR(50) COMMENT '父权限名称',
    path VARCHAR(100) COMMENT '访问路径',
    component VARCHAR(100) COMMENT '组件路径',
    icon VARCHAR(50) COMMENT '图标',
    sort INT DEFAULT 0 COMMENT '排序',
    status VARCHAR(20) DEFAULT 'ENABLED' COMMENT '状态：ENABLED-启用，DISABLED-禁用',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='权限表';

-- 4. 角色权限关联表
CREATE TABLE IF NOT EXISTS t_role_permission (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    role_id BIGINT NOT NULL COMMENT '角色ID',
    permission_id BIGINT NOT NULL COMMENT '权限ID',
    UNIQUE KEY uk_role_permission (role_id, permission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色权限关联表';

-- 5. 登录日志表
CREATE TABLE IF NOT EXISTS t_login_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '日志ID',
    username VARCHAR(50) NOT NULL COMMENT '用户名',
    login_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '登录时间',
    login_ip VARCHAR(20) NOT NULL COMMENT '登录IP',
    login_result VARCHAR(20) NOT NULL COMMENT '登录结果：SUCCESS-成功，FAILED-失败',
    error_message VARCHAR(200) COMMENT '错误信息'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='登录日志表';

-- 6. 工厂表
CREATE TABLE IF NOT EXISTS t_factory (
    id VARCHAR(36) PRIMARY KEY COMMENT '工厂ID',
    factory_code VARCHAR(50) NOT NULL UNIQUE COMMENT '工厂编码',
    factory_name VARCHAR(100) NOT NULL COMMENT '工厂名称',
    contact_person VARCHAR(50) COMMENT '联系人',
    contact_phone VARCHAR(30) COMMENT '联系电话',
    address VARCHAR(200) COMMENT '工厂地址',
    business_license VARCHAR(512) COMMENT '营业执照图片URL',
    status VARCHAR(20) DEFAULT 'active' COMMENT '状态：active-启用，inactive-禁用',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    delete_flag INT NOT NULL DEFAULT 0 COMMENT '删除标识：0-未删除，1-已删除'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工厂表';

-- 7. 款号信息表
CREATE TABLE IF NOT EXISTS t_style_info (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '款号ID',
    style_no VARCHAR(50) NOT NULL UNIQUE COMMENT '款号',
    style_name VARCHAR(100) NOT NULL COMMENT '款名',
    category VARCHAR(20) NOT NULL COMMENT '品类：WOMAN-女装，MAN-男装，KID-童装',
    year INT COMMENT '年份',
    season VARCHAR(20) COMMENT '季节：SPRING-春季，SUMMER-夏季，AUTUMN-秋季，WINTER-冬季',
    price DECIMAL(10,2) DEFAULT 0.00 COMMENT '单价',
    cycle INT DEFAULT 0 COMMENT '生产周期(天)',
    cover VARCHAR(200) COMMENT '封面图片',
    description TEXT COMMENT '描述',
    status VARCHAR(20) DEFAULT 'ENABLED' COMMENT '状态：ENABLED-启用，DISABLED-禁用',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='款号信息表';

-- 8. 款号BOM表
CREATE TABLE IF NOT EXISTS t_style_bom (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT 'BOM ID',
    style_id BIGINT NOT NULL COMMENT '款号ID',
    material_code VARCHAR(50) NOT NULL COMMENT '物料编码',
    material_name VARCHAR(100) NOT NULL COMMENT '物料名称',
    specification VARCHAR(100) COMMENT '规格',
    color VARCHAR(20) COMMENT '颜色',
    unit VARCHAR(20) NOT NULL COMMENT '单位',
    consumption DECIMAL(10,4) NOT NULL COMMENT '单耗',
    loss_rate DECIMAL(5,2) DEFAULT 0.00 COMMENT '损耗率',
    unit_price DECIMAL(10,2) DEFAULT 0.00 COMMENT '单价',
    total_price DECIMAL(10,2) DEFAULT 0.00 COMMENT '总价',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_style_id (style_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='款号BOM表';

-- 9. 款号尺寸表
CREATE TABLE IF NOT EXISTS t_style_size (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '尺寸ID',
    style_id BIGINT NOT NULL COMMENT '款号ID',
    size_code VARCHAR(20) NOT NULL COMMENT '尺寸码',
    part_name VARCHAR(50) NOT NULL COMMENT '部位名称',
    part_value DECIMAL(10,2) NOT NULL COMMENT '部位尺寸',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_style_id (style_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='款号尺寸表';

-- 10. 款号工序表
CREATE TABLE IF NOT EXISTS t_style_process (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '工序ID',
    style_id BIGINT NOT NULL COMMENT '款号ID',
    process_code VARCHAR(50) NOT NULL COMMENT '工序编码',
    process_name VARCHAR(100) NOT NULL COMMENT '工序名称',
    process_order INT NOT NULL COMMENT '工序顺序',
    work_hours DECIMAL(10,2) DEFAULT 0.00 COMMENT '工时',
    unit_price DECIMAL(10,2) DEFAULT 0.00 COMMENT '单价',
    total_price DECIMAL(10,2) DEFAULT 0.00 COMMENT '总价',
    description TEXT COMMENT '描述',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_style_id (style_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='款号工序表';

-- 11. 款号报价单表
CREATE TABLE IF NOT EXISTS t_style_quotation (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '报价单ID',
    style_id BIGINT NOT NULL UNIQUE COMMENT '款号ID',
    material_cost DECIMAL(10,2) DEFAULT 0.00 COMMENT '物料成本',
    process_cost DECIMAL(10,2) DEFAULT 0.00 COMMENT '工序成本',
    other_cost DECIMAL(10,2) DEFAULT 0.00 COMMENT '其他成本',
    total_cost DECIMAL(10,2) DEFAULT 0.00 COMMENT '总成本',
    profit_rate DECIMAL(5,2) DEFAULT 0.00 COMMENT '利润率',
    quoted_price DECIMAL(10,2) DEFAULT 0.00 COMMENT '报价',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_style_id (style_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='款号报价单表';

-- 12. 款号附件表
CREATE TABLE IF NOT EXISTS t_style_attachment (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '附件ID',
    style_id BIGINT NOT NULL COMMENT '款号ID',
    file_name VARCHAR(100) NOT NULL COMMENT '文件名',
    file_type VARCHAR(20) NOT NULL COMMENT '文件类型',
    file_size BIGINT NOT NULL COMMENT '文件大小(字节)',
    file_url VARCHAR(200) NOT NULL COMMENT '文件URL',
    version INT DEFAULT 1 COMMENT '版本号',
    version_remark VARCHAR(255) COMMENT '版本说明',
    status VARCHAR(20) DEFAULT 'active' COMMENT '状态',
    parent_id VARCHAR(36) COMMENT '父版本ID',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    uploader VARCHAR(50) COMMENT '上传人',
    biz_type VARCHAR(20) DEFAULT 'general' COMMENT '业务类型',
    INDEX idx_style_id (style_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='款号附件表';

-- 13. 生产订单表
CREATE TABLE IF NOT EXISTS t_production_order (
    id VARCHAR(36) PRIMARY KEY COMMENT '订单ID',
    order_no VARCHAR(50) NOT NULL UNIQUE COMMENT '订单号',
    style_id VARCHAR(36) NOT NULL COMMENT '款号ID',
    style_no VARCHAR(50) NOT NULL COMMENT '款号',
    style_name VARCHAR(100) NOT NULL COMMENT '款名',
    factory_id VARCHAR(36) NOT NULL COMMENT '加工厂ID',
    factory_name VARCHAR(100) NOT NULL COMMENT '加工厂名称',
    order_quantity INT DEFAULT 0 COMMENT '订单数量',
    completed_quantity INT DEFAULT 0 COMMENT '完成数量',
    material_arrival_rate INT DEFAULT 0 COMMENT '物料到位率(%)',
    production_progress INT DEFAULT 0 COMMENT '生产进度(%)',
    status VARCHAR(20) DEFAULT 'pending' COMMENT '状态：pending-待生产，production-生产中，completed-已完成，delayed-已逾期',
    planned_start_date DATETIME COMMENT '计划开始日期',
    planned_end_date DATETIME COMMENT '计划完成日期',
    actual_start_date DATETIME COMMENT '实际开始日期',
    actual_end_date DATETIME COMMENT '实际完成日期',
    delete_flag INT DEFAULT 0 COMMENT '删除标志(0:正常,1:删除)',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_style_no (style_no),
    INDEX idx_factory_id (factory_id),
    INDEX idx_status (status),
    INDEX idx_delete_flag (delete_flag),
    INDEX idx_create_time (create_time),
    INDEX idx_update_time (update_time),
    INDEX idx_style_status (style_no, status),
    INDEX idx_factory_status (factory_id, status),
    INDEX idx_status_create_time (status, create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='生产订单表';

-- 14. 物料采购表
CREATE TABLE IF NOT EXISTS t_material_purchase (
    id VARCHAR(36) PRIMARY KEY COMMENT '采购ID',
    purchase_no VARCHAR(50) NOT NULL UNIQUE COMMENT '采购单号',
    material_code VARCHAR(50) NOT NULL COMMENT '物料编码',
    material_name VARCHAR(100) NOT NULL COMMENT '物料名称',
    material_type VARCHAR(20) DEFAULT 'fabric' COMMENT '物料类型：fabric-面料，accessory-辅料',
    specifications VARCHAR(100) COMMENT '规格',
    unit VARCHAR(20) NOT NULL COMMENT '单位',
    purchase_quantity INT NOT NULL DEFAULT 0 COMMENT '采购数量',
    arrived_quantity INT NOT NULL DEFAULT 0 COMMENT '到货数量',
    supplier_id VARCHAR(36) COMMENT '供应商ID',
    supplier_name VARCHAR(100) COMMENT '供应商名称',
    unit_price DECIMAL(10,2) DEFAULT 0.00 COMMENT '单价',
    total_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '总金额',
    receiver_id VARCHAR(36) COMMENT '收货人ID',
    receiver_name VARCHAR(100) COMMENT '收货人名称',
    received_time DATETIME COMMENT '收货时间',
    remark VARCHAR(500) COMMENT '备注',
    order_id VARCHAR(36) COMMENT '生产订单ID',
    order_no VARCHAR(50) COMMENT '生产订单号',
    style_id VARCHAR(36) COMMENT '款号ID',
    style_no VARCHAR(50) COMMENT '款号',
    style_name VARCHAR(100) COMMENT '款名',
    style_cover VARCHAR(500) COMMENT '款式图片',
    return_confirmed INT DEFAULT 0 COMMENT '回料是否确认(0-否,1-是)',
    return_quantity INT DEFAULT 0 COMMENT '回料数量',
    return_confirmer_id VARCHAR(36) COMMENT '回料确认人ID',
    return_confirmer_name VARCHAR(100) COMMENT '回料确认人名称',
    return_confirm_time DATETIME COMMENT '回料确认时间',
    status VARCHAR(20) DEFAULT 'pending' COMMENT '状态',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    delete_flag INT NOT NULL DEFAULT 0 COMMENT '删除标识：0-未删除，1-已删除',
    INDEX idx_order_id (order_id),
    INDEX idx_order_no (order_no),
    INDEX idx_style_no (style_no),
    INDEX idx_supplier_id (supplier_id),
    INDEX idx_material_code (material_code),
    INDEX idx_status (status),
    INDEX idx_delete_flag (delete_flag),
    INDEX idx_create_time (create_time),
    INDEX idx_order_delete_flag (order_id, delete_flag),
    INDEX idx_style_delete_flag (style_no, delete_flag),
    INDEX idx_status_create_time (status, create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物料采购表';

-- 15. 质检入库表
CREATE TABLE IF NOT EXISTS t_product_warehousing (
    id VARCHAR(36) PRIMARY KEY COMMENT '入库ID',
    warehousing_no VARCHAR(50) NOT NULL UNIQUE COMMENT '入库单号',
    order_id VARCHAR(36) NOT NULL COMMENT '生产订单ID',
    order_no VARCHAR(50) NOT NULL COMMENT '生产订单号',
    style_id VARCHAR(36) NOT NULL COMMENT '款号ID',
    style_no VARCHAR(50) NOT NULL COMMENT '款号',
    style_name VARCHAR(100) NOT NULL COMMENT '款名',
    warehousing_quantity INT NOT NULL DEFAULT 0 COMMENT '入库数量',
    qualified_quantity INT NOT NULL DEFAULT 0 COMMENT '合格数量',
    unqualified_quantity INT NOT NULL DEFAULT 0 COMMENT '不合格数量',
    warehousing_type VARCHAR(20) DEFAULT 'manual' COMMENT '入库类型',
    warehouse VARCHAR(50) COMMENT '仓库',
    quality_status VARCHAR(20) DEFAULT 'qualified' COMMENT '质检状态',
    cutting_bundle_id VARCHAR(36) COMMENT '裁剪扎号ID',
    cutting_bundle_no INT COMMENT '裁剪扎号序号',
    cutting_bundle_qr_code VARCHAR(200) COMMENT '裁剪扎号二维码内容',
    unqualified_image_urls VARCHAR(2000) COMMENT '不合格图片URL列表(JSON)',
    defect_category VARCHAR(64) COMMENT '次品类别',
    defect_remark VARCHAR(500) COMMENT '次品备注',
    repair_remark VARCHAR(500) COMMENT '返修备注',
    receiver_id VARCHAR(36) COMMENT '领取人ID',
    receiver_name VARCHAR(50) COMMENT '领取人名称',
    received_time DATETIME COMMENT '领取时间',
    inspection_status VARCHAR(20) COMMENT '验收状态',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    delete_flag INT NOT NULL DEFAULT 0 COMMENT '删除标识：0-未删除，1-已删除',
    INDEX idx_order_id (order_id),
    INDEX idx_order_no (order_no),
    INDEX idx_style_no (style_no),
    INDEX idx_create_time (create_time),
    INDEX idx_cutting_bundle_id (cutting_bundle_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='质检入库表';

-- 16. 扫码记录表
CREATE TABLE IF NOT EXISTS t_scan_record (
    id VARCHAR(36) PRIMARY KEY COMMENT '扫码记录ID',
    scan_code VARCHAR(200) COMMENT '扫码内容',
    request_id VARCHAR(64) COMMENT '幂等请求ID',
    order_id VARCHAR(36) COMMENT '订单ID',
    order_no VARCHAR(50) COMMENT '订单号',
    style_id VARCHAR(36) COMMENT '款号ID',
    style_no VARCHAR(50) COMMENT '款号',
    color VARCHAR(50) COMMENT '颜色',
    size VARCHAR(50) COMMENT '码数',
    quantity INT NOT NULL DEFAULT 0 COMMENT '数量',
    unit_price DECIMAL(10,2) COMMENT '单价',
    total_amount DECIMAL(10,2) COMMENT '金额',
    settlement_status VARCHAR(20) COMMENT '核算状态',
    payroll_settlement_id VARCHAR(36) COMMENT '工资结算单ID',
    process_code VARCHAR(50) COMMENT '工序编码',
    progress_stage VARCHAR(100) COMMENT '进度环节',
    process_name VARCHAR(100) COMMENT '工序名称',
    operator_id VARCHAR(36) COMMENT '操作员ID',
    operator_name VARCHAR(50) COMMENT '操作员名称',
    scan_type VARCHAR(20) DEFAULT 'production' COMMENT '扫码类型',
    scan_result VARCHAR(20) DEFAULT 'success' COMMENT '扫码结果',
    remark VARCHAR(255) COMMENT '备注',
    scan_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '扫码时间',
    scan_ip VARCHAR(20) COMMENT '扫码IP',
    cutting_bundle_id VARCHAR(36) COMMENT '裁剪扎号ID',
    cutting_bundle_no INT COMMENT '裁剪扎号序号',
    cutting_bundle_qr_code VARCHAR(200) COMMENT '裁剪扎号二维码内容',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_scan_request_id (request_id),
    UNIQUE KEY uk_bundle_stage (cutting_bundle_id, scan_type, progress_stage),
    INDEX idx_order_id (order_id),
    INDEX idx_order_no (order_no),
    INDEX idx_style_no (style_no),
    INDEX idx_request_id (request_id),
    INDEX idx_scan_time (scan_time),
    INDEX idx_payroll_settlement_id (payroll_settlement_id),
    INDEX idx_scan_result (scan_result),
    INDEX idx_scan_type (scan_type),
    INDEX idx_operator_id (operator_id),
    INDEX idx_process_code (process_code),
    INDEX idx_order_scan_result (order_id, scan_result),
    INDEX idx_order_scan_type (order_id, scan_type),
    INDEX idx_order_scan_time (order_id, scan_time),
    INDEX idx_bundle_scan_result (cutting_bundle_id, scan_result),
    INDEX idx_bundle_scan_type (cutting_bundle_id, scan_type),
    INDEX idx_scan_result_time (scan_result, scan_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='扫码记录表';

CREATE TABLE IF NOT EXISTS t_payroll_settlement (
    id VARCHAR(36) PRIMARY KEY COMMENT '结算ID',
    settlement_no VARCHAR(50) NOT NULL COMMENT '结算单号',
    order_id VARCHAR(36) COMMENT '订单ID',
    order_no VARCHAR(50) COMMENT '订单号',
    style_id VARCHAR(36) COMMENT '款号ID',
    style_no VARCHAR(50) COMMENT '款号',
    style_name VARCHAR(100) COMMENT '款名',
    start_time DATETIME COMMENT '开始时间',
    end_time DATETIME COMMENT '结束时间',
    total_quantity INT DEFAULT 0 COMMENT '总数量',
    total_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '总金额',
    status VARCHAR(20) COMMENT '状态',
    remark VARCHAR(255) COMMENT '备注',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    create_by VARCHAR(36) COMMENT '创建人',
    update_by VARCHAR(36) COMMENT '更新人',
    UNIQUE KEY uk_payroll_settlement_no (settlement_no),
    INDEX idx_payroll_order_no (order_no),
    INDEX idx_payroll_style_no (style_no),
    INDEX idx_payroll_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工资结算单表';

CREATE TABLE IF NOT EXISTS t_payroll_settlement_item (
    id VARCHAR(36) PRIMARY KEY COMMENT '明细ID',
    settlement_id VARCHAR(36) NOT NULL COMMENT '结算单ID',
    operator_id VARCHAR(36) COMMENT '人员ID',
    operator_name VARCHAR(50) COMMENT '人员名称',
    process_name VARCHAR(100) COMMENT '工序名称',
    quantity INT DEFAULT 0 COMMENT '数量',
    unit_price DECIMAL(10,2) COMMENT '单价',
    total_amount DECIMAL(10,2) COMMENT '总金额',
    order_id VARCHAR(36) COMMENT '订单ID',
    order_no VARCHAR(50) COMMENT '订单号',
    style_no VARCHAR(50) COMMENT '款号',
    scan_type VARCHAR(20) COMMENT '扫码类型',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_payroll_item_settlement_id (settlement_id),
    INDEX idx_payroll_item_operator_id (operator_id),
    INDEX idx_payroll_item_order_no (order_no),
    INDEX idx_payroll_item_style_no (style_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工资结算明细表';

-- 16.1 裁剪扎号表
CREATE TABLE IF NOT EXISTS t_cutting_bundle (
    id VARCHAR(36) PRIMARY KEY COMMENT '扎号ID',
    production_order_id VARCHAR(36) NOT NULL COMMENT '生产订单ID',
    production_order_no VARCHAR(50) NOT NULL COMMENT '生产订单号',
    style_id VARCHAR(36) NOT NULL COMMENT '款号ID',
    style_no VARCHAR(50) NOT NULL COMMENT '款号',
    color VARCHAR(50) COMMENT '颜色',
    size VARCHAR(50) COMMENT '码数',
    bundle_no INT NOT NULL COMMENT '扎号序号',
    quantity INT NOT NULL DEFAULT 0 COMMENT '数量',
    qr_code VARCHAR(200) NOT NULL UNIQUE COMMENT '二维码内容',
    status VARCHAR(20) DEFAULT 'created' COMMENT '状态',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_order_id (production_order_id),
    INDEX idx_order_no (production_order_no),
    INDEX idx_style_no (style_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='裁剪扎号表';

-- 18. 加工厂扣款项表
CREATE TABLE IF NOT EXISTS t_deduction_item (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '扣款项ID',
    reconciliation_id BIGINT NOT NULL COMMENT '对账单ID',
    deduction_type VARCHAR(50) NOT NULL COMMENT '扣款类型',
    deduction_amount DECIMAL(10,2) NOT NULL COMMENT '扣款金额',
    description VARCHAR(200) COMMENT '扣款描述',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_reconciliation_id (reconciliation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='加工厂扣款项表';

-- 19. 物料采购对账单表
CREATE TABLE IF NOT EXISTS t_material_reconciliation (
    id VARCHAR(36) PRIMARY KEY COMMENT '对账ID',
    reconciliation_no VARCHAR(50) NOT NULL UNIQUE COMMENT '对账单号',
    supplier_id VARCHAR(36) NOT NULL COMMENT '供应商ID',
    supplier_name VARCHAR(100) NOT NULL COMMENT '供应商名称',
    material_id VARCHAR(36) NOT NULL COMMENT '物料ID',
    material_code VARCHAR(50) NOT NULL COMMENT '物料编码',
    material_name VARCHAR(100) NOT NULL COMMENT '物料名称',
    purchase_id VARCHAR(36) COMMENT '采购单ID',
    purchase_no VARCHAR(50) COMMENT '采购单号',
    order_id VARCHAR(36) COMMENT '订单ID',
    order_no VARCHAR(50) COMMENT '订单号',
    style_id VARCHAR(36) COMMENT '款号ID',
    style_no VARCHAR(50) COMMENT '款号',
    style_name VARCHAR(100) COMMENT '款名',
    quantity INT DEFAULT 0 COMMENT '数量',
    unit_price DECIMAL(10,2) DEFAULT 0.00 COMMENT '单价',
    total_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '总金额',
    deduction_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '扣款项',
    final_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '最终金额',
    paid_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '已付金额',
    reconciliation_date VARCHAR(20) COMMENT '对账日期',
    period_start_date DATETIME COMMENT '对账周期开始日期',
    period_end_date DATETIME COMMENT '对账周期结束日期',
    status VARCHAR(20) DEFAULT 'pending' COMMENT '状态：pending-待审核，verified-已验证，approved-已批准，paid-已付款，rejected-已拒绝',
    remark VARCHAR(255) COMMENT '备注',
    delete_flag INT DEFAULT 0 COMMENT '删除标识：0-未删除，1-已删除',
    reconciliation_operator_id VARCHAR(36) COMMENT '对账人ID',
    reconciliation_operator_name VARCHAR(50) COMMENT '对账人姓名',
    audit_operator_id VARCHAR(36) COMMENT '审核人ID',
    audit_operator_name VARCHAR(50) COMMENT '审核人姓名',
    verified_at DATETIME COMMENT '验证时间',
    approved_at DATETIME COMMENT '批准时间',
    paid_at DATETIME COMMENT '付款时间',
    re_review_at DATETIME COMMENT '复审时间',
    re_review_reason VARCHAR(255) COMMENT '复审原因',
    create_by VARCHAR(36) COMMENT '创建人',
    update_by VARCHAR(36) COMMENT '更新人',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物料采购对账单表';

-- 20. 成品出货对账单表
CREATE TABLE IF NOT EXISTS t_shipment_reconciliation (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '对账ID',
    reconciliation_no VARCHAR(50) NOT NULL UNIQUE COMMENT '对账单号',
    customer VARCHAR(100) NOT NULL COMMENT '客户',
    reconciliation_date DATE NOT NULL COMMENT '对账日期',
    total_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '总金额',
    received_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '已收金额',
    outstanding_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '未收金额',
    status VARCHAR(20) DEFAULT 'PENDING' COMMENT '状态：PENDING-待对账，CONFIRMED-已确认，SETTLED-已结算',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='成品出货对账单表';

-- 21. 字典表
CREATE TABLE IF NOT EXISTS t_dict (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '字典ID',
    dict_code VARCHAR(50) NOT NULL COMMENT '字典编码',
    dict_label VARCHAR(100) NOT NULL COMMENT '字典标签',
    dict_value VARCHAR(100) NOT NULL COMMENT '字典值',
    dict_type VARCHAR(50) NOT NULL COMMENT '字典类型',
    sort INT DEFAULT 0 COMMENT '排序',
    status VARCHAR(20) DEFAULT 'ENABLED' COMMENT '状态：ENABLED-启用，DISABLED-禁用',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_dict_type (dict_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='字典表';

-- 22. 参数配置表
CREATE TABLE IF NOT EXISTS t_param_config (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '配置ID',
    param_key VARCHAR(50) NOT NULL UNIQUE COMMENT '参数键',
    param_value VARCHAR(200) NOT NULL COMMENT '参数值',
    param_desc VARCHAR(200) COMMENT '参数描述',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='参数配置表';

-- 23. 流水号规则表
CREATE TABLE IF NOT EXISTS t_serial_rule (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '规则ID',
    rule_code VARCHAR(50) NOT NULL UNIQUE COMMENT '规则编码',
    rule_name VARCHAR(100) NOT NULL COMMENT '规则名称',
    rule_pattern VARCHAR(100) NOT NULL COMMENT '规则模板',
    current_no BIGINT DEFAULT 0 COMMENT '当前序号',
    prefix VARCHAR(20) COMMENT '前缀',
    suffix VARCHAR(20) COMMENT '后缀',
    date_format VARCHAR(20) COMMENT '日期格式',
    digit_length INT DEFAULT 4 COMMENT '序号位数',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流水号规则表';

CREATE OR REPLACE VIEW v_production_order_flow_stage_snapshot AS
SELECT
  sr.order_id AS order_id,
  sr.tenant_id AS tenant_id,
  MIN(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '下单' THEN sr.scan_time END) AS order_start_time,
  MAX(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '下单' THEN sr.scan_time END) AS order_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '下单' THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS order_operator_name,
  MAX(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '采购' THEN sr.scan_time END) AS procurement_scan_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '采购' THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS procurement_scan_operator_name,
  MIN(CASE WHEN sr.scan_type = 'cutting' THEN sr.scan_time END) AS cutting_start_time,
  MAX(CASE WHEN sr.scan_type = 'cutting' THEN sr.scan_time END) AS cutting_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'cutting' THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS cutting_operator_name,
  SUM(CASE WHEN sr.scan_type = 'cutting' THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS cutting_quantity,
  MIN(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT IN ('下单', '采购')
        AND IFNULL(sr.process_code, '') <> 'quality_warehousing'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%质检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%检验%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%品检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%验货%'
      THEN sr.scan_time END) AS sewing_start_time,
  MAX(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT IN ('下单', '采购')
        AND IFNULL(sr.process_code, '') <> 'quality_warehousing'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%质检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%检验%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%品检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%验货%'
      THEN sr.scan_time END) AS sewing_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT IN ('下单', '采购')
        AND IFNULL(sr.process_code, '') <> 'quality_warehousing'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%质检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%检验%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%品检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%验货%'
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS sewing_operator_name,
  MIN(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%车缝%'
      THEN sr.scan_time END) AS car_sewing_start_time,
  MAX(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%车缝%'
      THEN sr.scan_time END) AS car_sewing_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%车缝%'
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS car_sewing_operator_name,
  MIN(CASE WHEN sr.scan_type = 'production'
        AND (COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%烫%')
      THEN sr.scan_time END) AS ironing_start_time,
  MAX(CASE WHEN sr.scan_type = 'production'
        AND (COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%烫%')
      THEN sr.scan_time END) AS ironing_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'production'
        AND (COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%烫%')
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS ironing_operator_name,
  MIN(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('secondaryProcess', 'secondary_process')
             OR TRIM(sr.process_name) = '二次工艺'
             OR TRIM(sr.process_name) LIKE '%绣花%'
             OR TRIM(sr.process_name) LIKE '%印花%'
             OR TRIM(sr.process_name) LIKE '%二次%')
      THEN sr.scan_time END) AS secondary_process_start_time,
  MAX(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('secondaryProcess', 'secondary_process')
             OR TRIM(sr.process_name) = '二次工艺'
             OR TRIM(sr.process_name) LIKE '%绣花%'
             OR TRIM(sr.process_name) LIKE '%印花%'
             OR TRIM(sr.process_name) LIKE '%二次%')
      THEN sr.scan_time END) AS secondary_process_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('secondaryProcess', 'secondary_process')
             OR TRIM(sr.process_name) = '二次工艺'
             OR TRIM(sr.process_name) LIKE '%绣花%'
             OR TRIM(sr.process_name) LIKE '%印花%'
             OR TRIM(sr.process_name) LIKE '%二次%')
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS secondary_process_operator_name,
  SUM(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('secondaryProcess', 'secondary_process')
             OR TRIM(sr.process_name) = '二次工艺'
             OR TRIM(sr.process_name) LIKE '%绣花%'
             OR TRIM(sr.process_name) LIKE '%印花%'
             OR TRIM(sr.process_name) LIKE '%二次%')
      THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS secondary_process_quantity,
  MIN(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
      THEN sr.scan_time END) AS packaging_start_time,
  MAX(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
      THEN sr.scan_time END) AS packaging_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS packaging_operator_name,
  MIN(CASE WHEN (sr.scan_type = 'quality'
        OR IFNULL(sr.process_code, '') = 'quality_warehousing'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%质检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%检验%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%品检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%验货%')
      THEN sr.scan_time END) AS quality_start_time,
  MAX(CASE WHEN (sr.scan_type = 'quality'
        OR IFNULL(sr.process_code, '') = 'quality_warehousing'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%质检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%检验%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%品检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%验货%')
      THEN sr.scan_time END) AS quality_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN (sr.scan_type = 'quality'
        OR IFNULL(sr.process_code, '') = 'quality_warehousing'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%质检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%检验%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%品检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%验货%')
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS quality_operator_name,
  SUM(CASE WHEN (sr.scan_type = 'quality'
        OR IFNULL(sr.process_code, '') = 'quality_warehousing'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%质检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%检验%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%品检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%验货%')
      THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS quality_quantity,
  MIN(CASE WHEN sr.scan_type = 'warehouse' AND IFNULL(sr.process_code, '') <> 'warehouse_rollback' THEN sr.scan_time END) AS warehousing_start_time,
  MAX(CASE WHEN sr.scan_type = 'warehouse' AND IFNULL(sr.process_code, '') <> 'warehouse_rollback' THEN sr.scan_time END) AS warehousing_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'warehouse' AND IFNULL(sr.process_code, '') <> 'warehouse_rollback' THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS warehousing_operator_name,
  SUM(CASE WHEN sr.scan_type = 'warehouse' AND IFNULL(sr.process_code, '') <> 'warehouse_rollback' THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS warehousing_quantity
FROM t_scan_record sr
WHERE sr.scan_result = 'success'
GROUP BY sr.order_id, sr.tenant_id;

CREATE OR REPLACE VIEW v_production_order_stage_done_agg AS
SELECT
  t.order_id AS order_id,
  t.tenant_id AS tenant_id,
  t.stage_name AS stage_name,
  SUM(IFNULL(t.quantity, 0)) AS done_quantity,
  MAX(t.scan_time) AS last_scan_time
FROM (
  SELECT
    sr.order_id,
    sr.tenant_id,
    COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) AS stage_name,
    sr.quantity,
    sr.scan_time
  FROM t_scan_record sr
  WHERE sr.scan_result = 'success'
    AND sr.quantity > 0
    AND sr.scan_type IN ('production', 'cutting')
) t
WHERE t.stage_name IS NOT NULL AND t.stage_name <> ''
GROUP BY t.order_id, t.tenant_id, t.stage_name;

CREATE OR REPLACE VIEW v_production_order_procurement_snapshot AS
SELECT
  p.order_id AS order_id,
  p.tenant_id AS tenant_id,
  MIN(p.create_time) AS procurement_start_time,
  MAX(COALESCE(p.received_time, p.update_time)) AS procurement_end_time,
  SUBSTRING_INDEX(
    MAX(CONCAT(LPAD(UNIX_TIMESTAMP(COALESCE(p.received_time, p.update_time)), 20, '0'), LPAD(UNIX_TIMESTAMP(p.update_time), 20, '0'), '|', IFNULL(p.receiver_name, ''))),
    '|', -1
  ) AS procurement_operator_name,
  SUM(IFNULL(p.purchase_quantity, 0)) AS purchase_quantity,
  SUM(IFNULL(p.arrived_quantity, 0)) AS arrived_quantity
FROM t_material_purchase p
WHERE p.delete_flag = 0
  AND p.order_id IS NOT NULL
  AND p.order_id <> ''
GROUP BY p.order_id, p.tenant_id;

-- 插入初始数据

-- 1. 插入字典数据
INSERT INTO t_dict (dict_code, dict_label, dict_value, dict_type, sort, status) VALUES
('WOMAN', '女装', 'WOMAN', 'category', 1, 'ENABLED'),
('MAN', '男装', 'MAN', 'category', 2, 'ENABLED'),
('KID', '童装', 'KID', 'category', 3, 'ENABLED'),
('SPRING', '春季', 'SPRING', 'season', 1, 'ENABLED'),
('SUMMER', '夏季', 'SUMMER', 'season', 2, 'ENABLED'),
('AUTUMN', '秋季', 'AUTUMN', 'season', 3, 'ENABLED'),
('WINTER', '冬季', 'WINTER', 'season', 4, 'ENABLED');

-- 2. 插入系统用户（密码：admin123）
INSERT INTO t_user (username, password, name, role_id, role_name, permission_range, status) VALUES
('admin', '$2a$10$623ZxbbWEcIHyyc9Rx2cneCpPHPp3Q/y8Qfbb7yn1eHD9z6pAWVfC', '系统管理员', 1, 'admin', 'all', 'ENABLED');

-- 3. 插入角色数据
INSERT INTO t_role (role_name, role_code, description, status) VALUES
('管理员', 'admin', '系统管理员', 'ENABLED'),
('普通用户', 'user', '普通用户', 'ENABLED');

-- 4. 插入流水号规则
INSERT INTO t_serial_rule (rule_code, rule_name, rule_pattern, current_no, prefix, date_format, digit_length) VALUES
('STYLE_NO', '款号规则', 'STYLE{yyyyMM}{no}', 0, 'STYLE', 'yyyyMM', 4),
('ORDER_NO', '订单号规则', 'ORDER{yyyyMMdd}{no}', 0, 'ORDER', 'yyyyMMdd', 4),
('PURCHASE_NO', '采购单号规则', 'PURCHASE{yyyyMMdd}{no}', 0, 'PURCHASE', 'yyyyMMdd', 4);

-- 5. 插入初始款号数据
INSERT INTO t_style_info (style_no, style_name, category, year, season, price, cycle, description, status) VALUES
('STYLE2026010001', '春季连衣裙', 'WOMAN', 2026, 'SPRING', 199.00, 15, '2026春季新款连衣裙', 'ENABLED');

-- 6. 插入初始BOM数据
INSERT INTO t_style_bom (style_id, material_code, material_name, specification, color, unit, consumption, loss_rate, unit_price, total_price) VALUES
(1, 'MAT001', '面料', '100%棉', '红色', '米', 1.5000, 5.00, 50.00, 75.00),
(1, 'MAT002', '拉链', 'YKK', '红色', '条', 1.0000, 0.00, 5.00, 5.00),
(1, 'MAT003', '纽扣', '塑料', '白色', '颗', 6.0000, 2.00, 0.50, 3.00);

-- 7. 插入初始尺寸数据
INSERT INTO t_style_size (style_id, size_code, part_name, part_value) VALUES
(1, 'S', '胸围', 84.00),
(1, 'S', '腰围', 68.00),
(1, 'S', '臀围', 92.00),
(1, 'S', '裙长', 85.00),
(1, 'M', '胸围', 88.00),
(1, 'M', '腰围', 72.00),
(1, 'M', '臀围', 96.00),
(1, 'M', '裙长', 86.00),
(1, 'L', '胸围', 92.00),
(1, 'L', '腰围', 76.00),
(1, 'L', '臀围', 100.00),
(1, 'L', '裙长', 87.00);

-- 8. 插入初始工序数据
INSERT INTO t_style_process (style_id, process_code, process_name, process_order, work_hours, unit_price, total_price, description) VALUES
(1, 'PROC001', '裁剪', 1, 0.50, 10.00, 5.00, '裁剪面料'),
(1, 'PROC002', '车缝', 2, 2.00, 15.00, 30.00, '车缝连衣裙'),
(1, 'PROC003', '整烫', 3, 0.50, 8.00, 4.00, '整烫处理'),
(1, 'PROC004', '包装', 4, 0.30, 5.00, 1.50, '包装入库');

-- 9. 插入初始报价单数据
INSERT INTO t_style_quotation (style_id, material_cost, process_cost, other_cost, total_cost, profit_rate, quoted_price) VALUES
(1, 83.00, 40.50, 10.00, 133.50, 50.00, 199.00);

-- 插入初始配置数据
INSERT INTO t_param_config (param_key, param_value, param_desc) VALUES
('system.name', '服装供应链管理系统', '系统名称'),
('system.version', '1.0.0', '系统版本'),
('upload.path', '${user.home}/fashion-upload/', '文件上传路径');

-- 提交事务
COMMIT;

-- 显示创建的表
SHOW TABLES;
