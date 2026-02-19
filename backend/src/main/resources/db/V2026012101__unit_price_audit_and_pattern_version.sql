-- 单价审计日志表和纸样版本管理增量脚本
-- 创建时间：2026-01-21

USE fashion_supplychain;

-- 1. 单价修改审计日志表
CREATE TABLE IF NOT EXISTS t_unit_price_audit_log (
    id VARCHAR(36) PRIMARY KEY COMMENT '主键ID',
    style_no VARCHAR(50) NOT NULL COMMENT '款号',
    process_name VARCHAR(50) NOT NULL COMMENT '工序名称',
    old_price DECIMAL(10,2) DEFAULT 0.00 COMMENT '修改前单价',
    new_price DECIMAL(10,2) DEFAULT 0.00 COMMENT '修改后单价',
    change_source VARCHAR(30) NOT NULL COMMENT '变更来源: template/scan/reconciliation',
    related_id VARCHAR(36) COMMENT '关联ID',
    operator VARCHAR(50) COMMENT '操作人',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    remark VARCHAR(200) COMMENT '备注',
    INDEX idx_style_no (style_no),
    INDEX idx_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='单价修改审计日志表';

-- 2. 为款号附件表添加版本管理字段
ALTER TABLE t_style_attachment 
    ADD COLUMN IF NOT EXISTS biz_type VARCHAR(30) DEFAULT 'general' COMMENT '业务类型: general/pattern/pattern_grading/workorder' AFTER file_url,
    ADD COLUMN IF NOT EXISTS version INT DEFAULT 1 COMMENT '版本号' AFTER biz_type,
    ADD COLUMN IF NOT EXISTS version_remark VARCHAR(200) COMMENT '版本说明' AFTER version,
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active' COMMENT '状态: active/archived' AFTER version_remark,
    ADD COLUMN IF NOT EXISTS uploader VARCHAR(50) COMMENT '上传人' AFTER status,
    ADD COLUMN IF NOT EXISTS parent_id VARCHAR(36) COMMENT '父版本ID' AFTER uploader,
    ADD INDEX IF NOT EXISTS idx_biz_type (biz_type),
    ADD INDEX IF NOT EXISTS idx_status (status);

-- 3. 纸样检查配置表
CREATE TABLE IF NOT EXISTS t_pattern_check_config (
    id VARCHAR(36) PRIMARY KEY COMMENT '主键ID',
    style_no VARCHAR(50) NOT NULL COMMENT '款号',
    require_pattern TINYINT DEFAULT 1 COMMENT '是否需要纸样',
    require_grading TINYINT DEFAULT 1 COMMENT '是否需要放码文件',
    require_marker TINYINT DEFAULT 0 COMMENT '是否需要排料图',
    check_on_order_create TINYINT DEFAULT 1 COMMENT '创建订单时检查',
    check_on_cutting TINYINT DEFAULT 1 COMMENT '裁剪时检查',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_style_no (style_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='纸样检查配置表';

-- 4. 为款号信息表添加纸样相关字段（如果还没有）
ALTER TABLE t_style_info
    ADD COLUMN IF NOT EXISTS pattern_status VARCHAR(20) DEFAULT 'pending' COMMENT '纸样状态: pending/in_progress/completed' AFTER sample_status,
    ADD COLUMN IF NOT EXISTS pattern_started_at DATETIME COMMENT '纸样开始时间' AFTER pattern_status,
    ADD COLUMN IF NOT EXISTS pattern_completed_at DATETIME COMMENT '纸样完成时间' AFTER pattern_started_at,
    ADD COLUMN IF NOT EXISTS grading_status VARCHAR(20) DEFAULT 'pending' COMMENT '放码状态: pending/in_progress/completed' AFTER pattern_completed_at,
    ADD COLUMN IF NOT EXISTS grading_completed_at DATETIME COMMENT '放码完成时间' AFTER grading_status;

COMMIT;
