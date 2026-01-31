-- ============================================================================
-- 纸样修改记录表创建脚本
-- 创建时间：2026-01-31
-- 功能说明：独立的纸样修改更新记录，不影响样板生产数据
-- ============================================================================

-- 创建纸样修改记录表
CREATE TABLE IF NOT EXISTS t_pattern_revision (
    id VARCHAR(64) PRIMARY KEY COMMENT '主键ID',

    -- 关联信息
    style_id VARCHAR(64) COMMENT '款号ID',
    style_no VARCHAR(100) COMMENT '款号',

    -- 修改信息
    revision_no VARCHAR(100) COMMENT '修改版本号（如：V1.0, V1.1, V2.0）',
    revision_type VARCHAR(50) COMMENT '修改类型：MINOR(小改), MAJOR(大改), URGENT(紧急修改)',
    revision_reason TEXT COMMENT '修改原因',
    revision_content TEXT COMMENT '修改内容详情',

    -- 修改前后对比
    before_changes TEXT COMMENT '修改前信息（JSON格式）',
    after_changes TEXT COMMENT '修改后信息（JSON格式）',

    -- 附件信息
    attachment_urls TEXT COMMENT '附件URL列表（JSON数组格式）',

    -- 状态管理
    status VARCHAR(50) DEFAULT 'DRAFT' COMMENT '状态：DRAFT(草稿), SUBMITTED(已提交), APPROVED(已审核), REJECTED(已拒绝), COMPLETED(已完成)',

    -- 时间信息
    revision_date DATE COMMENT '修改日期',
    expected_complete_date DATE COMMENT '预计完成日期',
    actual_complete_date DATE COMMENT '实际完成日期',

    -- 人员信息
    maintainer_id VARCHAR(64) COMMENT '维护人ID',
    maintainer_name VARCHAR(100) COMMENT '维护人姓名',
    maintain_time DATETIME COMMENT '维护时间',

    submitter_id VARCHAR(64) COMMENT '提交人ID',
    submitter_name VARCHAR(100) COMMENT '提交人姓名',
    submit_time DATETIME COMMENT '提交时间',

    approver_id VARCHAR(64) COMMENT '审核人ID',
    approver_name VARCHAR(100) COMMENT '审核人姓名',
    approval_time DATETIME COMMENT '审核时间',
    approval_comment TEXT COMMENT '审核意见',

    -- 执行人员
    pattern_maker_id VARCHAR(64) COMMENT '纸样师傅ID',
    pattern_maker_name VARCHAR(100) COMMENT '纸样师傅姓名',

    -- 系统字段
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    create_by VARCHAR(100) COMMENT '创建人',
    update_by VARCHAR(100) COMMENT '更新人',

    -- 扩展字段
    remark TEXT COMMENT '备注',
    factory_id VARCHAR(64) COMMENT '工厂ID（多工厂隔离）',

    -- 索引
    INDEX idx_style_no (style_no),
    INDEX idx_style_id (style_id),
    INDEX idx_maintainer (maintainer_id),
    INDEX idx_status (status),
    INDEX idx_revision_date (revision_date),
    INDEX idx_factory_id (factory_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='纸样修改记录表';

-- 添加注释
ALTER TABLE t_pattern_revision COMMENT = '纸样修改记录表 - 记录纸样的修改历史，独立于样板生产数据';

-- 验证表创建
SELECT
    TABLE_NAME,
    TABLE_COMMENT,
    TABLE_ROWS
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 't_pattern_revision';

-- 查看表结构
DESC t_pattern_revision;

-- ============================================================================
-- 使用说明
-- ============================================================================
-- 1. 此表独立于 t_pattern_production（样板生产表）
-- 2. 支持一个款号多次修改记录
-- 3. 记录完整的修改历史和审批流程
-- 4. revision_no 格式建议：V1.0, V1.1, V2.0（主版本.次版本）
-- 5. 修改类型：
--    - MINOR: 小改（不影响结构，如尺寸微调）
--    - MAJOR: 大改（结构性修改）
--    - URGENT: 紧急修改（需要快速处理）
-- 6. 状态流转：DRAFT → SUBMITTED → APPROVED → COMPLETED
-- 7. 支持多工厂数据隔离（通过 factory_id）
-- ============================================================================
