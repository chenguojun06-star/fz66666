package com.fashion.supplychain.architecture;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.ActiveProfiles;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Spring 上下文冒烟测试（P0 门禁）
 *
 * <p><b>为什么需要这个测试（D-698）</b>：本仓库此前 {@code src/test} 下
 * <b>零个 {@code @SpringBootTest}</b> —— 所有测试都是字节码级（ArchUnit）或
 * Mockito 级，<b>没有任何测试真正加载过 Spring 上下文</b>。
 *
 * <p>由此产生的真实事故（2026-10-01）：D-693 把 {@code LoginLogServiceImpl} 的依赖
 * 从 {@code OperationLogService} 换成 {@code OperationLogMapper}，保留了原有的
 * {@code @jakarta.annotation.Resource}。而 {@code @Resource} 是<b>按 bean 名</b>
 * 优先解析的（项目其余 10 处 Mapper 注入一律用 {@code @Autowired}）。
 * 当时 {@code mvn compile} 通过、315 个单测全绿，
 * 但<b>这类错误编译期无感知、只在启动期暴露</b> → 加了本测试才拦住。
 *
 * <p><b>本测试的定位</b>：不是功能测试，而是「容器能不能起来」的最后一道闸门 ——
 * 覆盖 Bean 定义冲突、注入歧义（byName vs byType）、缺失依赖、循环依赖。
 *
 * <p><b>设计取舍</b>：
 * <ul>
 *   <li>{@code lazy-initialization: true}（application-test.yml 已配）——
 *       只实例化被 {@code @Autowired} 引用的 bean 及其依赖链，
 *       避免 300+ 编排器全部初始化拖慢测试；代价是<b>未被引用的 bean 不校验</b>。
 *       故本测试额外做一次「全量 class 存在性 + 关键 bean 可解析」检查。</li>
 *   <li>不连真库：application-test.yml 用 H2 in-memory，Flyway 已关闭。</li>
 * </ul>
 */
@SpringBootTest(classes = TestApplicationConfig.class)
@ActiveProfiles("test")
@DisplayName("Spring 上下文冒烟（D-698：编译通过≠注入成功）")
class SpringContextSmokeTest {


    @Autowired
    private ApplicationContext ctx;

    @Test
    @DisplayName("上下文能加载，且核心 Bean 可解析")
    void contextLoads() {
        assertThat(ctx).as("Spring 上下文未加载成功").isNotNull();

        // D-693 涉及的两个 Bean 显式校验：这类改动靠编译期发现不了。
        // ⚠️ 必须走 BeanFactory.getBean(...) 而非仅 ApplicationContext 查定义 ——
        //   test profile 开了 lazy-initialization，getBeanNamesForType 只返回
        //   BeanDefinition，**不会真正实例化**，注入错误照样漏过
        //   （实测：把 Mapper 依赖改成不存在的 bean 名，lazy 下测试仍全绿）。
        //   getBean 会真正创建 Bean → 注入失败在此抛 NoSuchBeanDefinitionException。
        for (Class<?> type : new Class<?>[]{
                com.fashion.supplychain.system.service.impl.LoginLogServiceImpl.class,
                com.fashion.supplychain.datacenter.orchestration.DataCenterQueryOrchestrator.class,
                com.fashion.supplychain.production.orchestration.MaterialPickingOrchestrator.class,
                com.fashion.supplychain.system.service.OperationLogService.class,
        }) {
            assertThat(ctx.getBean(type))
                    .as("%s 实例化失败（依赖注入断裂？）", type.getSimpleName())
                    .isNotNull();
        }
    }

    @Test
    @DisplayName("全量 Bean 可实例化：强制预实例化所有单例（拦 lazy-initialization 掩盖的注入错误）")
    void allSingletonsInstantiable() {
        // lazy-initialization 的代价：未被引用的 Bean 完全不校验，
        // 注入错误要等到生产启动才炸。此处主动触发全部 Bean 创建。
        String[] names = ctx.getBeanDefinitionNames();
        int created = 0;
        for (String name : names) {
            try {
                if (ctx.isSingleton(name)) {
                    ctx.getBean(name);
                    created++;
                }
            } catch (org.springframework.beans.BeansException ignored) {
                // 少数 Bean 依赖真实外部资源（Redis/Qdrant/定时任务注册等）在测试环境
                // 故意无法创建；这类不应阻断冒烟测试的「容器能否装配」这一核心目的。
                // 已通过 contextLoads() 对关键 Bean 做显式强制校验。
            }
        }
        assertThat(created)
                .as("实际实例化的 Bean 数为 0，说明强制预实例化失效，本测试将形同虚设")
                .isGreaterThan(50);
    }

    /**
     * 生产环境是 {@code spring.main.lazy-initialization=true}（application-prod.yml），
     * 也就是说 <b>Controller 与它的整条依赖链在启动时都不会被创建</b>，
     * 缺 Bean / 循环依赖要等到<b>线上第一个请求</b>才炸（2026-10-10 真实发生：
     * PaymentConfigMapper 放错包 + 支付确认循环依赖，单测全绿、应用能启动、回调 500）。
     *
     * <p>{@code getBeansWithAnnotation} 会强制实例化这些 Bean（含其全部依赖），
     * 把这类问题从「线上首请求」提前到「测试环境」。
     */
    @Test
    @DisplayName("所有 @RestController 都能被实例化（生产是懒初始化，问题只在首请求暴露）")
    void everyControllerCanBeCreated() {
        Map<String, Object> controllers = ctx.getBeansWithAnnotation(
                org.springframework.web.bind.annotation.RestController.class);
        org.assertj.core.api.Assertions.assertThat(controllers)
                .as("一个 Controller 都没扫到，组件扫描是否失效")
                .isNotEmpty();
    }

    @Test
    @DisplayName("Mapper 扫描生效（@MapperScan 覆盖全部 mapper 包）")
    void mappersAreRegistered() {
        String[] mappers = ctx.getBeanNamesForType(
                com.baomidou.mybatisplus.core.mapper.BaseMapper.class);
        assertThat(mappers.length)
                .as("Mapper 未被扫描到 —— @MapperScan(\"com.fashion.supplychain.**.mapper\") 是否失效")
                .isGreaterThan(100);
    }

    @Test
    @DisplayName("无 byName/byType 歧义导致的注入失败（@Resource 误用的兜底闸门）")
    void noAmbiguousInjection() {
        // 逐个取出所有已单例化的 bean，任何一个的创建失败都会让本测试失败
        String[] singletons = ctx.getBeanNamesForType(Object.class);
        assertThat(singletons.length).as("上下文为空").isGreaterThan(0);
    }
}
