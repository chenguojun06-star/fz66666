# 数据库性能优化指南

## 概述

本文档提供服装供应链管理系统的数据库性能优化建议，包括索引优化、查询优化和配置优化。

---

## 1. 索引优化建议

### 1.1 生产订单表 (t_production_order)

```sql
-- 已有索引检查
SHOW INDEX FROM t_production_order;

-- 建议添加的索引
-- 1. 订单编号索引（用于查询）
CREATE INDEX idx_order_no ON t_production_order(order_no);

-- 2. 款式编号索引（用于关联查询）
CREATE INDEX idx_style_no ON t_production_order(style_no);

-- 3. 工厂ID索引（用于工厂维度的查询）
CREATE INDEX idx_factory_id ON t_production_order(factory_id);

-- 4. 状态索引（用于状态筛选）
CREATE INDEX idx_status ON t_production_order(status);

-- 5. 创建时间索引（用于排序和范围查询）
CREATE INDEX idx_create_time ON t_production_order(create_time);

-- 6. 复合索引（用于常用查询组合）
CREATE INDEX idx_factory_status ON t_production_order(factory_id, status);
CREATE INDEX idx_style_create_time ON t_production_order(style_id, create_time);
```

### 1.2 入库表 (t_product_warehousing)

```sql
-- 订单ID索引（用于聚合查询）
CREATE INDEX idx_order_id ON t_product_warehousing(order_id);

-- 删除标记索引（用于软删除过滤）
CREATE INDEX idx_delete_flag ON t_product_warehousing(delete_flag);

-- 复合索引
CREATE INDEX idx_order_delete ON t_product_warehousing(order_id, delete_flag);
```

### 1.3 出库表 (t_product_outstock)

```sql
-- 订单ID索引
CREATE INDEX idx_order_id ON t_product_outstock(order_id);

-- 删除标记索引
CREATE INDEX idx_delete_flag ON t_product_outstock(delete_flag);

-- 复合索引
CREATE INDEX idx_order_delete ON t_product_outstock(order_id, delete_flag);
```

### 1.4 裁剪菲号表 (t_cutting_bundle)

```sql
-- 生产订单ID索引
CREATE INDEX idx_production_order_id ON t_cutting_bundle(production_order_id);
```

### 1.5 款式表 (t_style_info)

```sql
-- 款式编号唯一索引
CREATE UNIQUE INDEX idx_style_no ON t_style_info(style_no);

-- 状态索引
CREATE INDEX idx_status ON t_style_info(status);

-- 创建时间索引
CREATE INDEX idx_create_time ON t_style_info(create_time);
```

---

## 2. 慢查询优化

### 2.1 生产订单查询优化

**问题查询：**
```sql
-- 原查询（可能全表扫描）
SELECT * FROM t_production_order 
WHERE factory_id = ? AND status = ? 
ORDER BY create_time DESC;
```

**优化方案：**
```sql
-- 添加复合索引
CREATE INDEX idx_factory_status_create_time 
ON t_production_order(factory_id, status, create_time);

-- 优化后的查询（只查询需要的字段）
SELECT id, order_no, style_no, style_name, factory_name, 
       order_quantity, completed_quantity, status, create_time
FROM t_production_order 
WHERE factory_id = ? AND status = ? 
ORDER BY create_time DESC
LIMIT ?, ?;
```

### 2.2 库存聚合查询优化

**问题查询：**
```sql
-- 原查询（多次扫描表）
SELECT order_id, SUM(qualified_quantity) 
FROM t_product_warehousing 
WHERE order_id IN (?, ?, ?) AND delete_flag = 0
GROUP BY order_id;
```

**优化方案：**
```sql
-- 确保有复合索引
CREATE INDEX idx_order_delete_qualified 
ON t_product_warehousing(order_id, delete_flag, qualified_quantity);

-- 使用覆盖索引查询
SELECT order_id, SUM(qualified_quantity) 
FROM t_product_warehousing 
WHERE order_id IN (?, ?, ?) AND delete_flag = 0
GROUP BY order_id;
```

### 2.3 分页查询优化

**问题：** 大数据量分页查询性能差

**优化方案：**
```sql
-- 使用游标分页替代OFFSET
-- 原查询
SELECT * FROM t_production_order 
ORDER BY create_time DESC 
LIMIT 10000, 20;

-- 优化后（使用上次查询的最大ID）
SELECT * FROM t_production_order 
WHERE create_time < ? 
ORDER BY create_time DESC 
LIMIT 20;
```

---

## 3. 数据库配置优化

### 3.1 MySQL配置优化

```ini
# my.cnf 优化配置

[mysqld]
# 缓冲池大小（建议设置为物理内存的50-70%）
innodb_buffer_pool_size = 4G

# 日志文件大小
innodb_log_file_size = 512M
innodb_log_files_in_group = 3

# 连接数
max_connections = 500

# 查询缓存（MySQL 8.0已移除，建议使用Redis）
# query_cache_type = 0

# 临时表大小
tmp_table_size = 128M
max_heap_table_size = 128M

# 排序缓冲区
sort_buffer_size = 4M
read_buffer_size = 2M
read_rnd_buffer_size = 8M

# InnoDB刷新方式
innodb_flush_method = O_DIRECT
innodb_flush_log_at_trx_commit = 2

# 连接超时
wait_timeout = 600
interactive_timeout = 600
```

### 3.2 连接池优化（HikariCP）

```yaml
# application.yml
spring:
  datasource:
    hikari:
      maximum-pool-size: 50
      minimum-idle: 10
      idle-timeout: 600000
      max-lifetime: 1800000
      connection-timeout: 30000
      connection-test-query: SELECT 1
```

---

## 4. 应用层优化

### 4.1 MyBatis Plus优化

```java
// 1. 使用分页插件
@Configuration
public class MybatisPlusConfig {
    @Bean
    public MybatisPlusInterceptor mybatisPlusInterceptor() {
        MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();
        interceptor.addInnerInterceptor(new PaginationInnerInterceptor(DbType.MYSQL));
        return interceptor;
    }
}

// 2. 批量操作
@Service
public class ProductionOrderService {
    // 批量插入（代替逐条插入）
    public void batchInsert(List<ProductionOrder> orders) {
        productionOrderMapper.insertBatchSomeColumn(orders);
    }
    
    // 批量更新
    public void batchUpdate(List<ProductionOrder> orders) {
        productionOrderMapper.updateBatchById(orders);
    }
}
```

### 4.2 缓存策略

```java
// 使用Spring Cache
@Service
public class ProductionOrderQueryService {
    
    @Cacheable(value = "productionOrder", key = "#id")
    public ProductionOrder getById(String id) {
        return productionOrderMapper.selectById(id);
    }
    
    @CacheEvict(value = "productionOrder", key = "#order.id")
    public void update(ProductionOrder order) {
        productionOrderMapper.updateById(order);
    }
}
```

---

## 5. 监控和诊断

### 5.1 慢查询日志

```sql
-- 开启慢查询日志
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 2;
SET GLOBAL slow_query_log_file = '/var/log/mysql/slow.log';

-- 查看慢查询
SELECT * FROM mysql.slow_log 
ORDER BY start_time DESC 
LIMIT 100;
```

### 5.2 性能分析

```sql
-- 查看查询执行计划
EXPLAIN SELECT * FROM t_production_order 
WHERE factory_id = 'FACTORY001' AND status = 'processing';

-- 查看表统计信息
SHOW TABLE STATUS LIKE 't_production_order';

-- 查看索引使用情况
SHOW STATUS LIKE 'Handler_read%';
```

### 5.3 连接监控

```sql
-- 查看当前连接
SHOW PROCESSLIST;

-- 查看连接统计
SHOW STATUS LIKE 'Threads_%';
SHOW STATUS LIKE 'Connections';
SHOW STATUS LIKE 'Max_used_connections';
```

---

## 6. 实施计划

### 阶段1：索引优化（1天）
- [ ] 分析现有索引
- [ ] 创建缺失索引
- [ ] 验证查询性能提升

### 阶段2：配置优化（1天）
- [ ] 调整MySQL配置
- [ ] 优化连接池配置
- [ ] 监控性能指标

### 阶段3：应用层优化（2天）
- [ ] 实现批量操作
- [ ] 添加缓存策略
- [ ] 优化慢查询

### 阶段4：持续监控（长期）
- [ ] 配置慢查询日志
- [ ] 设置性能告警
- [ ] 定期审查执行计划

---

## 7. 预期效果

| 优化项 | 预期提升 | 验证方式 |
|--------|---------|---------|
| 索引优化 | 查询速度提升50-80% | EXPLAIN分析 |
| 批量操作 | 插入速度提升10倍 | 压测对比 |
| 缓存策略 | 热点数据查询提升90% | 响应时间监控 |
| 连接池优化 | 连接等待时间降低80% | 连接池监控 |

---

## 8. 注意事项

1. **索引创建时机** - 建议在业务低峰期创建索引
2. **索引维护** - 定期使用`OPTIMIZE TABLE`维护表
3. **监控资源** - 创建索引会消耗CPU和磁盘IO
4. **回滚方案** - 保留索引创建语句，必要时可以删除

---

**文档版本：** v1.0  
**创建日期：** 2026-01-31  
**维护人：** 技术团队
