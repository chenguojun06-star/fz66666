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

    /**
     * 线上事故回归（2026-10-21）：/api/pos/today 500，
     * `Unknown column 'tenant_id' in 'where clause'`。
     *
     * todayByPayMethod 是 UNION ALL + 派生表，两个子查询内部都已
     * `s.tenant_id = #{tenantId}`，拦截器却又在最外层 `) m` 后拼了
     * `WHERE tenant_id = 2` —— 派生表 m 没这一列 → 整条 SQL 语法错误。
     */
    @Test
    @DisplayName("派生表（UNION ALL 子查询）不得再拼 tenant_id —— pos/today 500 回归")
    void addWhereCondition_derivedTable_skipsAppending() throws SQLException {
        String sql = "SELECT m.payMethod AS payMethod, COUNT(*) AS saleCount FROM ( "
                + "SELECT p.pay_method AS payMethod FROM t_pos_sale_payment p JOIN t_pos_sale s ON s.id = p.sale_id "
                + "WHERE s.tenant_id = 2 AND s.status = 'NORMAL' "
                + "UNION ALL "
                + "SELECT s.pay_method FROM t_pos_sale s WHERE s.tenant_id = 2 AND s.status = 'NORMAL' "
                + ") m GROUP BY m.payMethod ORDER BY saleCount DESC";
        String result = invokeAddWhereCondition(sql, 2L, false);
        assertEquals(sql, result, "最外层 FROM 派生表时应原样返回，不得在最外层拼 tenant_id");
        assertFalse(result.contains(") m WHERE"), "不得出现拼在派生表后面的 WHERE（那正是线上报错形态）");
    }

    @Test
    @DisplayName("SQL 已自带 tenant_id = 本租户 过滤时，不重复拼接")
    void addWhereCondition_alreadyFiltered_noDuplicateAppend() throws SQLException {
        String sql = "SELECT COUNT(*) FROM t_pos_sale WHERE tenant_id = 7 AND status = 'NORMAL'";
        String result = invokeAddWhereCondition(sql, 7L, false);
        assertEquals(sql, result, "作者已显式过滤租户时不应再拼一次");
    }

    @Test
    @DisplayName("SQL 自带的是别的租户值，仍然要拼（防绕过隔离）")
    void addWhereCondition_filteredWithOtherTenant_stillAppends() throws SQLException {
        String sql = "SELECT COUNT(*) FROM t_pos_sale WHERE tenant_id = 999";
        String result = invokeAddWhereCondition(sql, 7L, false);
        assertTrue(result.contains("tenant_id = 7"), "原 SQL 用别的租户值过滤时，本拦截器仍须补上本租户条件");
    }

    @Test
    @DisplayName("普通表仍然照旧追加（守护不过度放宽）")
    void addWhereCondition_normalTable_stillAppends() throws SQLException {
        String sql = "SELECT * FROM t_pos_sale WHERE status = 'NORMAL'";
        String result = invokeAddWhereCondition(sql, 3L, false);
        assertTrue(result.contains("tenant_id = 3"), "普通表查询必须继续追加租户条件");
        assertFalse(result.contains("tenant_id = 999"), "不应出现无关租户值");
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
