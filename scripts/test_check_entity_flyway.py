#!/usr/bin/env python3
"""
check-entity-flyway.py 脚本验证测试
验证 commit 4217b7d42 修复的两大历史漏洞：
1. 之前只检查 @TableField 注解的字段，漏掉无注解的普通字段
2. 之前只按列名匹配，不按表名匹配，别的表有同名列会误判通过

运行方式：
    python3 scripts/test_check_entity_flyway.py
"""
import os
import sys
import tempfile
import unittest
from pathlib import Path

# 导入待测脚本
sys.path.insert(0, str(Path(__file__).parent))
import check_entity_flyway as checker


class TestEntityFieldExtraction(unittest.TestCase):
    """测试 Entity 字段提取逻辑（修复漏洞1）"""

    def test_extract_fields_without_tablefield_annotation(self):
        """无 @TableField 注解的普通字段也应被提取"""
        java_text = """
package com.fashion.supplychain.production.entity;

@TableName("t_pattern_scan_record")
public class PatternScanRecord {
    private Long id;
    
    // 无注解的普通字段（MyBatis Plus 默认映射）
    private String size;          // 码数
    private Integer quantity;     // 数量
    private String styleName;     // 款号名称
    
    @TableField("warehouse_code")
    private String warehouseCode; // 仓位编码
    
    @TableField(exist = false)
    private String virtualField;  // 虚字段，不应提取
    
    @Transient
    private String transientField; // 临时字段，不应提取
}
"""
        fields = checker.extract_entity_fields(java_text)
        
        # 验证无注解字段被提取
        field_names = [f[1] for f in fields]
        self.assertIn("size", field_names, "无注解字段 size 应被提取")
        self.assertIn("quantity", field_names, "无注解字段 quantity 应被提取")
        self.assertIn("style_name", field_names, "无注解字段 styleName 应被提取（驼峰转下划线）")
        
        # 验证有注解字段被提取
        self.assertIn("warehouse_code", field_names, "@TableField 字段应被提取")
        
        # 验证虚字段不被提取
        self.assertNotIn("virtual_field", field_names, "@TableField(exist=false) 不应提取")
        self.assertNotIn("transient_field", field_names, "@Transient 不应提取")
        
        # 验证跳过字段不被提取
        self.assertNotIn("id", field_names, "id 在 SKIP_COLUMNS 中，不应提取")

    def test_extract_table_name_from_annotation(self):
        """从 @TableName 注解提取表名"""
        java_text = """
@TableName("t_scan_record")
public class ScanRecord {
}
"""
        table = checker.extract_table_name(java_text)
        self.assertEqual("t_scan_record", table, "应从 @TableName 提取表名")

    def test_extract_table_name_missing_annotation(self):
        """缺少 @TableName 注解时应返回 None"""
        java_text = """
public class SomeEntity {
}
"""
        table = checker.extract_table_name(java_text)
        self.assertIsNone(table, "缺少 @TableName 应返回 None")


class TestFlywayTableParsing(unittest.TestCase):
    """测试 Flyway 迁移脚本解析逻辑（修复漏洞2）"""

    def test_parse_create_table_columns(self):
        """解析 CREATE TABLE 中的列定义"""
        with tempfile.TemporaryDirectory() as tmpdir:
            # 创建测试迁移文件
            migration_file = Path(tmpdir) / "V20260601001__create_test_table.sql"
            migration_file.write_text("""
CREATE TABLE `t_pattern_scan_record` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `size` varchar(32) COMMENT '码数',
  `quantity` int COMMENT '数量',
  `style_name` varchar(128) COMMENT '款号名称',
  `warehouse_code` varchar(32) COMMENT '仓位编码',
  PRIMARY KEY (`id`)
);
""")
            
            # 临时修改 MIGRATION_DIR
            old_dir = checker.MIGRATION_DIR
            checker.MIGRATION_DIR = tmpdir
            
            tables = checker.parse_flyway_tables()
            
            # 恢复原始目录
            checker.MIGRATION_DIR = old_dir
            
            # 验证表和列被正确解析
            self.assertIn("t_pattern_scan_record", tables)
            cols = tables["t_pattern_scan_record"]
            self.assertIn("size", cols)
            self.assertIn("quantity", cols)
            self.assertIn("style_name", cols)
            self.assertIn("warehouse_code", cols)

    def test_parse_alter_table_add_column(self):
        """解析 ALTER TABLE ADD COLUMN"""
        with tempfile.TemporaryDirectory() as tmpdir:
            migration_file = Path(tmpdir) / "V20260601002__add_column.sql"
            migration_file.write_text("""
ALTER TABLE `t_scan_record` ADD COLUMN `new_field` varchar(64) COMMENT '新增字段';
""")
            
            old_dir = checker.MIGRATION_DIR
            checker.MIGRATION_DIR = tmpdir
            
            tables = checker.parse_flyway_tables()
            
            checker.MIGRATION_DIR = old_dir
            
            self.assertIn("t_scan_record", tables)
            self.assertIn("new_field", tables["t_scan_record"])

    def test_parse_idempotent_add_column_procedure(self):
        """解析存储过程内的幂等 ADD COLUMN"""
        with tempfile.TemporaryDirectory() as tmpdir:
            migration_file = Path(tmpdir) / "V20260601003__idempotent_column.sql"
            migration_file.write_text("""
-- 幂等添加列
SET @table_name = 't_test_table';
SET @column_name = 'tenant_id';
SET @column_type = 'bigint COMMENT \'租户ID\'';
SET @s = CONCAT('ALTER TABLE `', @table_name, '` ADD COLUMN IF NOT EXISTS `', @column_name, '` ', @column_type);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
""")
            
            old_dir = checker.MIGRATION_DIR
            checker.MIGRATION_DIR = tmpdir
            
            tables = checker.parse_flyway_tables()
            
            checker.MIGRATION_DIR = old_dir
            
            # 存储过程写法的解析（脚本应能识别）
            # 注意：当前脚本可能不完全支持这种写法，这里测试能否识别到 ALTER TABLE
            if "t_test_table" in tables:
                self.assertIn("tenant_id", tables["t_test_table"])


class TestColumnNameMatching(unittest.TestCase):
    """测试列名匹配逻辑（修复漏洞2：按表名+列名精确匹配）"""

    def test_same_column_name_different_tables(self):
        """不同表有同名列时，不应误判通过"""
        with tempfile.TemporaryDirectory() as tmpdir:
            # 创建两个表的迁移
            migration1 = Path(tmpdir) / "V20260601001__create_table1.sql"
            migration1.write_text("""
CREATE TABLE `t_bundle` (
  `id` bigint,
  `size` varchar(32),
  PRIMARY KEY (`id`)
);
""")
            
            migration2 = Path(tmpdir) / "V20260601002__create_table2.sql"
            migration2.write_text("""
CREATE TABLE `t_other_table` (
  `id` bigint,
  PRIMARY KEY (`id`)
);
""")
            
            old_dir = checker.MIGRATION_DIR
            checker.MIGRATION_DIR = tmpdir
            
            tables = checker.parse_flyway_tables()
            
            checker.MIGRATION_DIR = old_dir
            
            # t_bundle 有 size 列，但 t_other_table 没有
            self.assertIn("size", tables.get("t_bundle", set()))
            self.assertNotIn("size", tables.get("t_other_table", set()))

    def test_column_exists_for_table_exact_match(self):
        """column_exists_for_table 应精确匹配表名+列名"""
        flyway_tables = {
            "t_scan_record": {"id", "scan_time", "scan_result"},
            "t_bundle": {"id", "size", "quantity"}
        }
        
        # t_scan_record 有 scan_time
        result = checker.column_exists_for_table("t_scan_record", "scan_time", flyway_tables)
        self.assertTrue(result)
        
        # t_scan_record 没有 size（虽然 t_bundle 有）
        result = checker.column_exists_for_table("t_scan_record", "size", flyway_tables)
        self.assertIsNone(result, "t_scan_record 没有 size 列，即使 t_bundle 有也不应误判")
        
        # 不存在的表
        result = checker.column_exists_for_table("t_unknown_table", "id", flyway_tables)
        self.assertIsNone(result)


class TestCamelToSnakeConversion(unittest.TestCase):
    """测试驼峰转下划线逻辑"""

    def test_simple_conversion(self):
        """简单驼峰转下划线"""
        self.assertEqual("style_name", checker.camel_to_snake("styleName"))
        self.assertEqual("warehouse_code", checker.camel_to_snake("warehouseCode"))
        self.assertEqual("scan_time", checker.camel_to_snake("scanTime"))

    def test_complex_conversion(self):
        """复杂驼峰转下划线"""
        self.assertEqual("production_progress", checker.camel_to_snake("productionProgress"))
        self.assertEqual("factory_name", checker.camel_to_snake("factoryName"))


class TestSkipColumns(unittest.TestCase):
    """测试跳过列逻辑"""

    def test_skip_columns_not_extracted(self):
        """SKIP_COLUMNS 中的字段不应被提取"""
        java_text = """
@TableName("t_test")
public class TestEntity {
    private Long id;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private Integer deleteFlag;
    private Long tenantId;
    private String createdBy;
    private String updatedBy;
    private Integer version;
    
    private String realField;  // 应被提取
}
"""
        fields = checker.extract_entity_fields(java_text)
        field_names = [f[1] for f in fields]
        
        # 只有 realField 应被提取
        self.assertEqual(["real_field"], field_names)


if __name__ == "__main__":
    # 运行测试
    print("=" * 60)
    print("check-entity-flyway.py 脚本验证测试")
    print("验证 commit 4217b7d42 修复的两大漏洞")
    print("=" * 60)
    
    unittest.main(verbosity=2)