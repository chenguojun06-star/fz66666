package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fashion.supplychain.intelligence.entity.AiCostTracking;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * AI 成本归因回归守护（D-700）
 *
 * <p><b>线上事故</b>：DeepSeek 账单累计已 ¥317、单个当日 ¥7.27，
 * 而 {@code t_ai_cost_tracking} 表<b>自建表起 0 行</b>，
 * {@code t_intelligence_metrics} 里后台任务的 token 也恒为 0
 * （数据库口径 9.1 万 vs 账单口径 199 万，<b>22 倍盲区</b>）。
 * 也就是说系统当时<b>完全无法回答「钱花在哪」</b>。
 *
 * <p><b>根因（两个，各自都足以致命）</b>：
 * <ol>
 *   <li><b>实体列名与表不匹配</b>：{@code AiCostTracking} 当时没有任何
 *       {@code @TableField}，依赖驼峰→下划线默认推导，于是生成
 *       {@code model_name} / {@code estimated_cost_usd}，
 *       而表里实际是 {@code model} / {@code estimated_cost}
 *       → INSERT 因未知列<b>必然失败</b>。</li>
 *   <li><b>失败被静默吞掉</b>：调用方 catch 里写的是
 *       {@code log.debug("[AI成本跟踪] 记录失败: ...")}。
 *       debug 级不进生产日志 → 这个 P0 可以安静存在几个月无人发现。</li>
 * </ol>
 *
 * <p><b>本测试的定位</b>：把「实体↔表列名一致」变成编译期之外的<b>可断言事实</b>。
 * 这类 bug 编译能过、单测能过、启动正常，只有真正 INSERT 时才炸，
 * 属于典型的「三层验证法」里只有数据层才能发现的问题，故在此固化。
 */
@DisplayName("AI 成本归因（D-700：t_ai_cost_tracking 恒为 0 行的回归）")
class AiCostTrackingEntityMappingTest {

    private static final String TABLE = "t_ai_cost_tracking";

    /** 表实际列名（与生产 t_ai_cost_tracking 一致） */
    private static final String COL_MODEL = "model";
    private static final String COL_ESTIMATED_COST = "estimated_cost";

    @Test
    @DisplayName("modelName 必须映射到 model 列（默认推导会生成 model_name 导致 INSERT 失败）")
    void modelName_mapsToModelColumn() throws Exception {
        Field f = AiCostTracking.class.getDeclaredField("modelName");
        TableField ann = f.getAnnotation(TableField.class);

        assertThat(ann)
                .as("缺少 @TableField：MyBatis-Plus 会按驼峰推导成 model_name，"
                        + "而表里是 model → INSERT 报未知列 → 成本记录全丢且被 log.debug 静默")
                .isNotNull();
        assertThat(ann.value())
                .as("modelName 必须显式映射到 model 列")
                .isEqualTo(COL_MODEL);
    }

    @Test
    @DisplayName("estimatedCostUsd 必须映射到 estimated_cost 列")
    void estimatedCostUsd_mapsToEstimatedCostColumn() throws Exception {
        Field f = AiCostTracking.class.getDeclaredField("estimatedCostUsd");
        TableField ann = f.getAnnotation(TableField.class);

        assertThat(ann)
                .as("缺少 @TableField：默认推导成 estimated_cost_usd，表里是 estimated_cost → INSERT 失败")
                .isNotNull();
        assertThat(ann.value())
                .as("estimatedCostUsd 必须显式映射到 estimated_cost 列")
                .isEqualTo(COL_ESTIMATED_COST);
    }

    @Test
    @DisplayName("success / errorMessage 标记为 exist=false（表无此列，不得进入 INSERT 语句）")
    void fieldsWithoutColumns_areExcludedFromInsert() throws Exception {
        for (String name : new String[]{"success", "errorMessage"}) {
            Field f = AiCostTracking.class.getDeclaredField(name);
            TableField ann = f.getAnnotation(TableField.class);

            assertThat(ann)
                    .as("%s 在表里没有对应列，必须显式 exist=false，否则 INSERT 会因未知列失败", name)
                    .isNotNull();
            assertThat(ann.exist())
                    .as("%s 必须 exist=false", name)
                    .isFalse();
        }
    }

    @Test
    @DisplayName("表名正确，且成本字段类型可承载金额")
    void tableNameAndCostFieldAreUsable() throws Exception {
        assertThat(AiCostTracking.class.getAnnotation(TableName.class).value())
                .isEqualTo(TABLE);

        // 成本列必须是 BigDecimal：用 double 存钱会有精度问题（金额对不上账单）
        assertThat(AiCostTracking.class.getDeclaredField("estimatedCostUsd").getType())
                .isEqualTo(BigDecimal.class);

        // totalTokens 应能承载单日百万级 token（当前实测单租户单日 45.6 万，全站 199 万）
        assertThat(AiCostTracking.class.getDeclaredField("totalTokens").getType())
                .isEqualTo(Integer.class);
    }
}
