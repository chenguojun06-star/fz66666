-- V20260306: 新增 CRM 客户档案表
-- 云端 FLYWAY_ENABLED=false，需在微信云托管控制台手动执行

CREATE TABLE IF NOT EXISTS t_customer (
    id              VARCHAR(36)  NOT NULL PRIMARY KEY                   COMMENT '主键',
    customer_no     VARCHAR(50)  NOT NULL UNIQUE                        COMMENT '客户编号（自动生成，如 CRM20260306001）',
    company_name    VARCHAR(100) NOT NULL                               COMMENT '公司/品牌名称',
    contact_person  VARCHAR(50)  NULL                                   COMMENT '主要联系人',
    contact_phone   VARCHAR(20)  NULL                                   COMMENT '联系电话',
    contact_email   VARCHAR(100) NULL                                   COMMENT '邮箱',
    address         VARCHAR(200) NULL                                   COMMENT '地址',
    customer_level  VARCHAR(20)  NOT NULL DEFAULT 'NORMAL'              COMMENT '客户等级：VIP / NORMAL',
    industry        VARCHAR(50)  NULL                                   COMMENT '行业/品类',
    source          VARCHAR(50)  NULL                                   COMMENT '客户来源：referral/exhibition/online 等',
    status          VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE'              COMMENT '状态：ACTIVE / INACTIVE',
    remark          VARCHAR(500) NULL                                   COMMENT '备注',
    create_time     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP     COMMENT '创建时间',
    update_time     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                        ON UPDATE CURRENT_TIMESTAMP                    COMMENT '更新时间',
    delete_flag     INT          NOT NULL DEFAULT 0                     COMMENT '软删除：0=正常 1=已删除',
    creator_id      VARCHAR(50)  NULL                                   COMMENT '创建人 ID',
    creator_name    VARCHAR(100) NULL                                   COMMENT '创建人名称',
    tenant_id       BIGINT       NULL                                   COMMENT '租户 ID（多租户隔离）',
    INDEX idx_crm_tenant_del (tenant_id, delete_flag),
    INDEX idx_crm_no         (customer_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='CRM 客户档案表';
