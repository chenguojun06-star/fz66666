package com.fashion.supplychain.common.tenant;

import com.fashion.supplychain.common.UserContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.sql.SQLException;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("TenantInterceptor - 租户隔离SQL改写")
class TenantInterceptorTest {

    private TenantInterceptor interceptor;

    @BeforeEach
    void setUp() {
        interceptor = new TenantInterceptor();
        UserContext.clear();
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    private void setTenantContext(Long tenantId) {
        UserContext ctx = new UserContext();
        ctx.setUserId("testUser");
        ctx.setUsername("test");
        ctx.setRole("admin");
        ctx.setTenantId(tenantId);
        UserContext.set(ctx);
    }

    @Test
    @DisplayName("addWhereCondition - 普通表追加 tenant_id 条件")
    void addWhereCondition_normalTable_appendsTenantFilter() throws SQLException {
        String sql = "SELECT * FROM t_production_order WHERE status = 'ACTIVE'";
        String result = invokeAddWhereCondition(sql, 1L, false);
        assertTrue(result.contains("tenant_id = 1"), "应追加 tenant_id = 1 条件");
        assertTrue(result.contains("status = 'ACTIVE'"), "原条件应保留");
    }

    @Test
    @DisplayName("addWhereCondition - 混合表追加 OR tenant_id IS NULL")
    void addWhereCondition_sharedTable_appendsOrIsNull() throws SQLException {
        String sql = "SELECT * FROM t_role WHERE role_name = 'admin'";
        String result = invokeAddWhereCondition(sql, 1L, true);
        assertTrue(result.contains("tenant_id = 1 OR tenant_id IS NULL"), "混合表应追加 OR IS NULL");
    }

    @Test
    @DisplayName("addWhereCondition - 无WHERE时插入 WHERE tenant_id")
    void addWhereCondition_noWhere_insertsWhere() throws SQLException {
        String sql = "SELECT * FROM t_production_order";
        String result = invokeAddWhereCondition(sql, 1L, false);
        assertTrue(result.contains("WHERE tenant_id = 1"), "无WHERE时应插入 WHERE tenant_id");
    }

    @Test
    @DisplayName("addWhereCondition - ORDER BY前插入条件")
    void addWhereCondition_withOrderBy_insertsBeforeOrderBy() throws SQLException {
        String sql = "SELECT * FROM t_production_order WHERE status = 'ACTIVE' ORDER BY id DESC";
        String result = invokeAddWhereCondition(sql, 1L, false);
        int tenantIdx = result.indexOf("tenant_id = 1");
        int orderByIdx = result.indexOf("ORDER BY");
        assertTrue(tenantIdx > 0 && orderByIdx > tenantIdx, "tenant_id条件应在ORDER BY之前");
    }

    @Test
    @DisplayName("addWhereCondition - LIMIT前插入条件")
    void addWhereCondition_withLimit_insertsBeforeLimit() throws SQLException {
        String sql = "SELECT * FROM t_production_order LIMIT 10";
        String result = invokeAddWhereCondition(sql, 1L, false);
        int tenantIdx = result.indexOf("tenant_id = 1");
        int limitIdx = result.indexOf("LIMIT");
        assertTrue(tenantIdx > 0 && limitIdx > tenantIdx, "tenant_id条件应在LIMIT之前");
    }

    @Test
    @DisplayName("addWhereCondition - tenantId为null时原样返回")
    void addWhereCondition_nullTenantId_returnsOriginal() throws SQLException {
        String sql = "SELECT * FROM t_production_order";
        String result = invokeAddWhereCondition(sql, null, false);
        assertEquals(sql, result, "tenantId为null时应原样返回");
    }

    @Test
    @DisplayName("addWhereCondition - 非数字tenantId应抛出SQLException")
    void addWhereCondition_invalidTenantId_throwsSQLException() {
        String sql = "SELECT * FROM t_production_order";
        assertThrows(SQLException.class, () -> invokeAddWhereCondition(sql, -1L, false),
                "负数tenantId应抛出SQLException");
    }

    @Test
    @DisplayName("shouldSkipSql - 系统排除表应跳过")
    void shouldSkipSql_excludedTable_returnsTrue() {
        assertTrue(invokeShouldSkipSql("SELECT * FROM t_tenant"));
        assertTrue(invokeShouldSkipSql("SELECT * FROM t_permission"));
        assertTrue(invokeShouldSkipSql("SELECT * FROM t_cron_job"));
    }

    @Test
    @DisplayName("shouldSkipSql - 业务表不应跳过")
    void shouldSkipSql_businessTable_returnsFalse() {
        assertFalse(invokeShouldSkipSql("SELECT * FROM t_production_order"));
        assertFalse(invokeShouldSkipSql("SELECT * FROM t_style_info"));
        assertFalse(invokeShouldSkipSql("SELECT * FROM t_shipment_reconciliation"));
    }

    @Test
    @DisplayName("shouldSkipSql - 混合表不应跳过")
    void shouldSkipSql_sharedTable_returnsFalse() {
        assertFalse(invokeShouldSkipSql("SELECT * FROM t_role"));
        assertFalse(invokeShouldSkipSql("SELECT * FROM t_template_library"));
    }

    @Test
    @DisplayName("involvesOnlySuperAdminTables - 超管可管理表返回true")
    void involvesOnlySuperAdminTables_managedTables_returnsTrue() {
        assertTrue(invokeInvolvesOnlySuperAdminTables("SELECT * FROM t_user"));
        assertTrue(invokeInvolvesOnlySuperAdminTables("SELECT * FROM t_organization_unit"));
    }

    @Test
    @DisplayName("involvesOnlySuperAdminTables - 包含业务表返回false")
    void involvesOnlySuperAdminTables_withBusinessTable_returnsFalse() {
        assertFalse(invokeInvolvesOnlySuperAdminTables("SELECT * FROM t_production_order"));
        assertFalse(invokeInvolvesOnlySuperAdminTables(
                "SELECT u.* FROM t_user u JOIN t_production_order p ON u.id = p.user_id"));
    }

    @Test
    @DisplayName("addTenantIsNullFilter - 超管业务表追加永假条件(有WHERE时)")
    void addTenantIsNullFilter_appendsIsNull() {
        String sql = "SELECT * FROM t_production_order WHERE status = 'ACTIVE'";
        String result = invokeAddTenantIsNullFilter(sql);
        assertTrue(result.contains("AND 1=0"), "超管业务表应追加 AND 1=0 永假条件，杜绝脏数据泄露");
    }

    @Test
    @DisplayName("addTenantIsNullFilter - 无WHERE时插入 WHERE 1=0")
    void addTenantIsNullFilter_noWhere_insertsWhereIsNull() {
        String sql = "SELECT * FROM t_production_order";
        String result = invokeAddTenantIsNullFilter(sql);
        assertTrue(result.contains("WHERE 1=0"), "无WHERE时应插入 WHERE 1=0 永假条件");
    }

    private String invokeAddWhereCondition(String sql, Long tenantId, boolean isSharedTable) throws SQLException {
        try {
            var method = TenantInterceptor.class.getDeclaredMethod("addWhereCondition", String.class, Long.class, boolean.class);
            method.setAccessible(true);
            return (String) method.invoke(interceptor, sql, tenantId, isSharedTable);
        } catch (java.lang.reflect.InvocationTargetException e) {
            if (e.getCause() instanceof SQLException) throw (SQLException) e.getCause();
            throw new RuntimeException(e.getCause());
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private boolean invokeShouldSkipSql(String sql) {
        try {
            var method = TenantInterceptor.class.getDeclaredMethod("shouldSkipSql", String.class);
            method.setAccessible(true);
            return (boolean) method.invoke(interceptor, sql);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private boolean invokeInvolvesOnlySuperAdminTables(String sql) {
        try {
            var method = TenantInterceptor.class.getDeclaredMethod("involvesOnlySuperAdminTables", String.class);
            method.setAccessible(true);
            return (boolean) method.invoke(interceptor, sql);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private String invokeAddTenantIsNullFilter(String sql) {
        try {
            var method = TenantInterceptor.class.getDeclaredMethod("addTenantIsNullFilter", String.class);
            method.setAccessible(true);
            return (String) method.invoke(interceptor, sql);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
