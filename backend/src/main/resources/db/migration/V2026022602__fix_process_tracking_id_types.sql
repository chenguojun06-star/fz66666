-- =====================================================================================
-- Migration: V2026022602__fix_process_tracking_id_types.sql
--
-- 【根本原因】V34 migration 将 t_production_process_tracking 所有 ID 字段错误定义为 BIGINT，
-- 但 Java 实体类 ProductionProcessTracking 使用 @TableId(type=IdType.ASSIGN_UUID) 和
-- String 类型存储 UUID。云端执行 V34 后建出的是 BIGINT 列，写入 UUID 字符串时 MySQL
-- 静默截断为 0，导致：
--   1. 所有 process_tracking 行的外键都是 0（关联全部断裂）
--   2. 按真实 UUID 查询永远返回空（扫码更新 process_tracking 全部无效）
--   3. 工序进度、工资结算依赖该表的功能全部失效
--
-- 本地开发从未跑过 V34（FLYWAY_ENABLED=false，手动建表且字段正确为 VARCHAR(64)），
-- 所以本地正常，一上云就全部失效。
--
-- 【修复策略】
--   - 不修改 V34（修改会导致 Flyway checksum 校验失败，阻断所有已部署环境）
--   - 本迁移：TRUNCATE 清理 BIGINT 截断的垃圾数据 + ALTER 修正所有 ID 列类型
--   - 新鲜环境：V34 建 BIGINT → 本脚本立即 ALTER 为 VARCHAR(64) → 最终正确
--   - 已部署云端：直接修正列类型 + 清理垃圾数据 → 重新初始化 process_tracking
--
-- 【注意】TRUNCATE 是安全的：云端已有的 BIGINT 数据是被截断的垃圾（UUID→BIGINT=0），
-- 无任何有价值的数据，可以且应当清除后重新从裁剪单数据初始化。
-- =====================================================================================

-- Step 1: 清理被 BIGINT 截断导致的垃圾数据（UUID→BIGINT 全部截断为 0，无法恢复，必须清除）
TRUNCATE TABLE t_production_process_tracking;

-- Step 2: 移除 id 列的 AUTO_INCREMENT（BIGINT AUTO_INCREMENT 不允许直接改为 VARCHAR，须先去掉自增）
ALTER TABLE t_production_process_tracking
    MODIFY COLUMN id BIGINT NOT NULL COMMENT '临时移除AUTO_INCREMENT';

-- Step 3: 删除主键约束（更换主键列类型时必须先删除主键再重建）
ALTER TABLE t_production_process_tracking
    DROP PRIMARY KEY;

-- Step 4: 将所有 BIGINT ID 字段改为 VARCHAR(64) 以匹配 UUID 类型
ALTER TABLE t_production_process_tracking
    MODIFY COLUMN id                  VARCHAR(64)  NOT NULL    COMMENT '主键ID（UUID）',
    MODIFY COLUMN production_order_id VARCHAR(64)  NOT NULL    COMMENT '生产订单ID（UUID）',
    MODIFY COLUMN cutting_bundle_id   VARCHAR(64)  NOT NULL    COMMENT '菲号ID（裁剪单ID，UUID）',
    MODIFY COLUMN scan_record_id      VARCHAR(64)  DEFAULT NULL COMMENT '关联的扫码记录ID（UUID）',
    MODIFY COLUMN operator_id         VARCHAR(64)  DEFAULT NULL COMMENT '操作人ID（UUID）',
    MODIFY COLUMN factory_id          VARCHAR(64)  DEFAULT NULL COMMENT '执行工厂ID（UUID）';

-- Step 5: 重新添加主键
ALTER TABLE t_production_process_tracking
    ADD PRIMARY KEY (id);

-- =====================================================================================
-- 执行完本迁移后，t_production_process_tracking 表结构与本地开发库完全一致：
--   id                 VARCHAR(64) NOT NULL (PRIMARY KEY)
--   production_order_id VARCHAR(64) NOT NULL
--   cutting_bundle_id   VARCHAR(64) NOT NULL
--   scan_record_id      VARCHAR(64) DEFAULT NULL
--   operator_id         VARCHAR(64) DEFAULT NULL
--   factory_id          VARCHAR(64) DEFAULT NULL
--
-- 【部署后操作】表数据已清空，需要重新初始化 process_tracking 记录：
--   对所有「裁剪完成」状态的裁剪单，调用后端初始化接口，或重新触发扫码初始化逻辑。
--   可以通过业务接口 POST /api/internal/maintenance/reinit-process-tracking 重新初始化。
-- =====================================================================================
