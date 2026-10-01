package com.fashion.supplychain.production.orchestration;

import static org.assertj.core.api.Assertions.assertThat;

import com.fashion.supplychain.intelligence.agent.tool.MaterialPickingTool;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.annotation.AnnotationUtils;
import org.springframework.transaction.annotation.Transactional;

import java.lang.reflect.Field;
import java.lang.reflect.Method;

/**
 * D-693 事务边界回归守护。
 *
 * <p><b>缺陷背景</b>：{@code MaterialPickingOrchestrator.createPicking} 下游做 4 个写操作
 * （建领料单 → 写明细 → 扣库存 → 写出库日志），而 {@code decreaseStock} 在库存不足时
 * 抛 {@code IllegalStateException}。修复前该链路<b>全程无 {@code @Transactional}</b>，
 * 多明细领料中途失败会留下「领料单 status=completed + 明细缺失 + 库存已扣」的脏数据且无回滚。
 *
 * <p>真实库佐证（2026-10-01）：{@code t_material_picking} 共 22 条，{@code MPK} 前缀 7 条
 * （即走 {@code createPicking} 的旁路）最后使用于 2026-05-29，主流程 {@code PICK-} 前缀
 * 13 条最后使用于 2026-09-12 —— 说明旁路仍在被调用，非死代码。
 *
 * <p>本测试用<b>反射读注解</b>守护修复不被回退：注解一旦被误删，
 * {@code mvn test} 仍会全绿（因为没有真正执行事务），故必须显式断言。
 */
@DisplayName("D-693 领料事务边界守护")
class MaterialPickingTransactionTest {

    @Test
    @DisplayName("createPicking 必须带 @Transactional（4 个写操作需同事务）")
    void createPickingMustBeTransactional() throws Exception {
        Method m = MaterialPickingOrchestrator.class.getMethod(
                "createPicking",
                com.fashion.supplychain.production.entity.MaterialPicking.class,
                java.util.List.class);
        Transactional tx = AnnotationUtils.findAnnotation(m, Transactional.class);
        assertThat(tx)
                .as("createPicking 无事务 = 多明细领料中途失败会留下脏数据（D-693 修复点，勿移除）")
                .isNotNull();
        // 必须覆盖 checked Exception，否则扣库存链路抛受检异常时不会回滚
        assertThat(tx.rollbackFor())
                .as("应 rollbackFor = Exception.class，覆盖所有异常类型")
                .contains(Exception.class);
    }

    @Test
    @DisplayName("主流程 createPickingAndOutbound 仍保有事务（D-099 修复不被回退）")
    void mainFlowStillTransactional() throws Exception {
        Method m = MaterialPurchaseOrchestrator.class.getMethod(
                "createPickingAndOutbound",
                com.fashion.supplychain.production.entity.MaterialPicking.class,
                java.util.List.class);
        assertThat(AnnotationUtils.findAnnotation(m, Transactional.class))
                .as("主流程「领取即出库」必须同事务，否则会重演 D-099 的只建单不扣库存")
                .isNotNull();
    }

    @Test
    @DisplayName("MaterialPickingTool 不再直接调 Service 写链路（必须经编排层）")
    void aiToolMustNotBypassOrchestrator() throws Exception {
        // 工具类应注入 Orchestrator 而非直接注入 Service 做写操作
        Field f = MaterialPickingTool.class.getDeclaredField("materialPickingOrchestrator");
        assertThat(MaterialPickingOrchestrator.class.isAssignableFrom(f.getType()))
                .as("AI 工具的领料写入必须走编排层，才能拿到事务保护（D-693 修复点）")
                .isTrue();

        // 该类不应再有第二个「写链路」Service 依赖：materialPickingService 仅用于只读 list
        long serviceFields = java.util.Arrays.stream(MaterialPickingTool.class.getDeclaredFields())
                .filter(fd -> fd.getType().getSimpleName().endsWith("Service"))
                .count();
        assertThat(serviceFields)
                .as("工具类只应保留只读用途的 Service 依赖")
                .isLessThanOrEqualTo(2); // MaterialPickingService(只读) + AiAgentToolAccessService(权限校验)
    }
}
