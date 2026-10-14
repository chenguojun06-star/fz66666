package com.fashion.supplychain.finance.mapper;

import org.apache.ibatis.annotations.Update;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@code PayrollSettlementMapper.atomicAddPaidAmount} 的 SQL 契约测试。
 *
 * <p>守护的核心契约：<b>这条 UPDATE 引用的每一列都必须真实存在，
 * 且必须保住「原子累加 + 乐观锁 + 租户隔离」三件事</b>。
 *
 * <p>事故背景（2026-10-14 全项目列名核对，生产库实测）：
 * 这条语句写了 {@code settlement_time = CASE ... THEN NOW() ELSE settlement_time END}，
 * 而 {@code t_payroll_settlement} <b>从来没有这一列</b> ——
 * 在生产库实跑：{@code ERROR 1054 (42S22) Unknown column 'settlement_time' in 'field list'}。
 *
 * <p>根因是照抄了 {@code ProductOutstockMapper.atomicAddPaidAmount}
 * （{@code t_product_outstock} 的这列由 V202608031000 补过），抄了语句漏了列。
 *
 * <p>影响面：该方法在 {@code @Transactional} 内且调用方没有 try/catch，
 * 异常直接冒泡回滚 —— <b>工资打款一点就 500，功能完全不可用</b>。
 * 修法是补列（V202710140001）而不是删掉该列：列的语义明确（全额付清时刻），
 * 且与 t_product_outstock 同构；删掉会静默丢掉"何时付清"。
 *
 * <p>这条 SQL 是资金链路，出错代价最高，所以单独钉住。
 */
@DisplayName("PayrollSettlementMapper - 打款原子更新的列名与不变量")
class PayrollSettlementMapperSqlTest {

    private static String updateSql() throws Exception {
        Method m = PayrollSettlementMapper.class.getMethod("atomicAddPaidAmount",
                String.class, java.math.BigDecimal.class, java.math.BigDecimal.class, Long.class);
        Update update = m.getAnnotation(Update.class);
        assertThat(update).as("atomicAddPaidAmount 应有 @Update 注解").isNotNull();
        return String.join(" ", update.value());
    }

    @Test
    @DisplayName("必须写 settlement_time（回归：该列曾不存在，导致打款必 500）")
    void referencesSettlementTime() throws Exception {
        String sql = updateSql();
        assertThat(sql)
                .as("settlement_time 由 V202710140001 补上；删掉它就丢了「何时付清」这个信息")
                .contains("settlement_time");
    }

    @Test
    @DisplayName("不得引用不存在的列（created_at / delete_flag / 裸 status 之类）")
    void doesNotReferenceMissingColumns() throws Exception {
        String sql = updateSql();
        assertThat(sql)
                .as("该表时间列是 create_time/update_time，没有 created_at；也没有 delete_flag")
                .doesNotContain("created_at")
                .doesNotContain("delete_flag")
                .doesNotContain("delete_time")
                .doesNotContain("insights");

        // 该表的状态列叫 payment_status，没有裸 status。
        // 注意不能简单写 doesNotContain("status =") —— payment_status = CASE 里也含这段，
        // 会把自己误判成违规（第一版就是这么挂的）。改成逐处核对前缀。
        java.util.regex.Matcher m = java.util.regex.Pattern
                .compile("(?<![_a-z])status\\b").matcher(sql);
        assertThat(m.find())
                .as("出现了裸 status 列；该表只有 payment_status")
                .isFalse();
        assertThat(sql).contains("payment_status");
    }

    @Test
    @DisplayName("必须带乐观锁条件：COALESCE(paid_amount,0) = expectedPaidAmount")
    void keepsOptimisticLock() throws Exception {
        assertThat(updateSql())
                .as("去掉它就会出现并发重复打款 —— 两个人同时点，钱扣两次")
                .contains("COALESCE(paid_amount, 0) = #{expectedPaidAmount}");
    }

    @Test
    @DisplayName("必须带租户隔离：tenant_id = #{tenantId}")
    void keepsTenantIsolation() throws Exception {
        assertThat(updateSql())
                .as("没有租户条件就可能改到别的租户的结算单")
                .contains("tenant_id = #{tenantId}");
    }

    @Test
    @DisplayName("剩余金额与付清口径必须一致：都用「总额-已付-扣款-预支」，且负数封顶为 0")
    void remainingFormulaStaysConsistent() throws Exception {
        String sql = updateSql();
        assertThat(sql)
                .as("remaining 与 payment_status 用两套口径的话，会出现"
                        + "「剩余>0 但状态=已付清」这类对不上的账")
                .contains("GREATEST(");
        assertThat(sql).contains("COALESCE(deduction_amount, 0)");
        assertThat(sql).contains("COALESCE(advance_amount, 0)");
        assertThat(sql).contains("'fully_paid'").contains("'partially_paid'");
    }

    @Test
    @DisplayName("只按主键更新，不得出现无条件全表 UPDATE")
    void updatesByPrimaryKeyOnly() throws Exception {
        String sql = updateSql();
        assertThat(sql).as("UPDATE 必须带 WHERE").contains("WHERE id = #{id}");
        assertThat(sql).doesNotContain("WHERE 1=1");
    }
}
