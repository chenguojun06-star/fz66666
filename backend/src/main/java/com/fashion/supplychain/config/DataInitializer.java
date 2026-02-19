package com.fashion.supplychain.config;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import lombok.extern.slf4j.Slf4j;

/**
 * 数据库初始化编排器（瘦身版）
 * 原始文件 2630 行 → 拆分为 7 个领域迁移器 + 1 个共享工具类
 *
 * @see DatabaseMigrationHelper   共享工具方法
 * @see SystemTableMigrator       系统/权限/认证表
 * @see TemplateTableMigrator     模板库
 * @see StyleTableMigrator        款式表
 * @see ProductionTableMigrator   生产/扫码/裁剪/工资表
 * @see FinanceTableMigrator      采购/面辅料/对账/仓储表
 * @see ViewMigrator              生产视图
 */
@Component
@ConditionalOnProperty(prefix = "fashion.db", name = "initializer-enabled", havingValue = "true", matchIfMissing = true)
@Slf4j
public class DataInitializer implements CommandLineRunner {

    @Autowired
    private DatabaseMigrationHelper dbHelper;

    @Autowired
    private SystemTableMigrator systemMigrator;

    @Autowired
    private TemplateTableMigrator templateMigrator;

    @Autowired
    private StyleTableMigrator styleMigrator;

    @Autowired
    private ProductionTableMigrator productionMigrator;

    @Autowired
    private FinanceTableMigrator financeMigrator;

    @Autowired
    private ViewMigrator viewMigrator;

    @Override
    public void run(String... args) throws Exception {
        log.info("Checking database initialization...");

        if (!dbHelper.waitForDatabaseReady()) {
            log.warn("Database not ready, skip initialization");
            return;
        }

        // 1. 系统基础表（用户、工厂、日志、权限、字典、管理员）
        systemMigrator.initialize();

        // 2. 模板库
        templateMigrator.initialize();

        // 3. 款式表（BOM、尺寸、工序、报价、附件、操作日志）
        styleMigrator.initialize();

        // 4. 生产表（订单、扫码、裁剪、工资）
        productionMigrator.initialize();

        // 5. 财务/仓储表（采购、面辅料库、对账、入库、出库）
        financeMigrator.initialize();

        // 6. 生产视图
        viewMigrator.initialize();

        log.info("Database initialization completed.");
    }
}
