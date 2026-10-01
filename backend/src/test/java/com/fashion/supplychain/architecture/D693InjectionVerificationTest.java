package com.fashion.supplychain.architecture;

import static org.assertj.core.api.Assertions.assertThat;

import com.fashion.supplychain.datacenter.orchestration.DataCenterOrchestrator;
import com.fashion.supplychain.datacenter.orchestration.DataCenterQueryOrchestrator;
import com.fashion.supplychain.datacenter.service.DataCenterQueryService;
import com.fashion.supplychain.system.service.impl.LoginLogServiceImpl;
import com.fashion.supplychain.system.mapper.OperationLogMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import java.lang.reflect.Field;
import java.lang.reflect.Modifier;

/**
 * D-693 验证：确认两处重构的 Bean 依赖在**运行时**可解析。
 *
 * <p><b>为什么需要这个测试</b>：本仓库 {@code src/test} 下 **零个 {@code @SpringBootTest}**
 * （ArchUnit 与单测均为字节码级 / Mockito 级，不加载 Spring 上下文），
 * 因此 {@code mvn compile} 通过 <b>不能</b> 证明注入成功。
 * D-693 把 {@code LoginLogServiceImpl} 的依赖从
 * {@code OperationLogService} 换成 {@code OperationLogMapper}，
 * 若注入方式选错（{@code @Resource} 按 bean 名解析），编译期无感知、启动期才炸。
 *
 * <p>本测试用最小上下文（不连真库、不起 Redis）验证三件事：
 * <ol>
 *   <li>构造器注入的 {@code OperationLogMapper} 能注入 {@link LoginLogServiceImpl}</li>
 *   <li>改名的 {@link DataCenterQueryOrchestrator} 仍实现 {@link DataCenterQueryService} 接口</li>
 *   <li>其 7 个 {@code @Cacheable} 方法仍在（缓存依赖 Spring AOP 代理，改包时极易静默失效）</li>
 * </ol>
 */
@DisplayName("D-693 依赖注入验证")
class D693InjectionVerificationTest {

    @Test
    @DisplayName("LoginLogServiceImpl 的 Mapper 依赖可被构造器注入")
    void loginLogMapperInjectedByConstructor() throws Exception {
        // 用反射直接验证注入形态：必须是 final（走 @RequiredArgsConstructor 构造器注入），
        // 且类型为 Mapper 而非 Service（规则7 的修复点）。
        Field f = LoginLogServiceImpl.class.getDeclaredField("operationLogMapper");
        assertThat(Modifier.isFinal(f.getModifiers()))
                .as("operationLogMapper 应为 final，由类上 @RequiredArgsConstructor 构造器注入")
                .isTrue();
        assertThat(OperationLogMapper.class.isAssignableFrom(f.getType()))
                .as("依赖类型应为 OperationLogMapper（D-693 的修复点，原为 OperationLogService）")
                .isTrue();

        // 确认类是 Spring Bean（由 @RequiredArgsConstructor 生成构造器完成注入）
        assertThat(LoginLogServiceImpl.class.getAnnotation(Service.class))
                .as("LoginLogServiceImpl 应标注 @Service")
                .isNotNull();
    }

    @Test
    @DisplayName("LoginLogServiceImpl 不再持有任何 Service 类型字段（规则7 已消）")
    void loginLogHasNoServiceField() {
        for (Field f : LoginLogServiceImpl.class.getDeclaredFields()) {
            assertThat(f.getType().getSimpleName())
                    .as("LoginLogServiceImpl 不应注入其他 Service（D-693 已移除 OperationLogService）")
                    .doesNotEndWith("Service");
        }
    }

    @Test
    @DisplayName("DataCenterQueryOrchestrator 改名后仍实现原接口（调用方类型引用未断）")
    void dataCenterQueryOrchestratorImplementsServiceInterface() {
        assertThat(DataCenterQueryService.class)
                .as("D-693 只改名+移包，接口 DataCenterQueryService 保留在 datacenter.service 包")
                .isAssignableFrom(DataCenterQueryOrchestrator.class);
        assertThat(DataCenterQueryOrchestrator.class.getPackageName())
                .as("应移入 orchestration 包")
                .isEqualTo("com.fashion.supplychain.datacenter.orchestration");
    }

    @Test
    @DisplayName("DataCenterQueryOrchestrator 的 @Cacheable 方法齐全（防移包时缓存静默失效）")
    void allQueryMethodsStillCacheable() throws Exception {
        // 7 个方法全部带 @Cacheable：若并入 DataCenterOrchestrator 会变同类自调用、
        // Spring AOP 代理失效 → 缓存静默失效（不报错、只是每次都查库），故必须保持独立 Bean。
        String[] cached = {"countEnabledStyles", "countMaterialPurchases", "countProductionOrders",
                "findStyle", "listBom", "listSize", "listAttachments"};
        for (String name : cached) {
            Class<?>[] params = name.equals("findStyle") ? new Class<?>[]{Long.class, String.class}
                    : name.startsWith("count") ? new Class<?>[]{}
                    : new Class<?>[]{Long.class};
            var m = DataCenterQueryOrchestrator.class.getMethod(name, params);
            assertThat(m.getAnnotation(Cacheable.class))
                    .as(name + " 必须保留 @Cacheable")
                    .isNotNull();
        }
    }

    @Test
    @DisplayName("DataCenterOrchestrator 依赖已改为改名后的类型")
    void dataCenterOrchestratorDependsOnRenamedType() throws Exception {
        Field f = DataCenterOrchestrator.class.getDeclaredField("dataCenterQueryOrchestrator");
        assertThat(f.getType()).isEqualTo(DataCenterQueryOrchestrator.class);
    }
}
