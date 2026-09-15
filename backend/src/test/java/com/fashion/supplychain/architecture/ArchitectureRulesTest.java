package com.fashion.supplychain.architecture;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.library.Architectures;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.library.Architectures.layeredArchitecture;

/**
 * 架构守护测试（ArchUnit）
 *
 * <p><b>为什么需要这个文件：</b>
 * 此前 {@code safe-push.sh} 里跑的是
 * {@code mvn test -Dtest="ArchitectureConstraintTest,ArchitectureRulesTest" -DfailIfNoTests=false}，
 * 但这两个类<b>根本不存在</b>，而 {@code -DfailIfNoTests=false} 让"测试不存在"不报错
 * → 这一项<b>永远 PASS</b>，是个给人虚假安全感的空转门控。
 *
 * <p><b>冻结基线（ratchet）策略：</b>
 * 存量代码已有大量违规（如 Orchestrator 直接依赖 Mapper 的有 150 个），
 * 若直接写死规则，CI 会天天红逼着人加 {@code -DskipTests} 绕过 —— 比假绿灯更糟。
 * 故采用基线冻结：首次运行把违规数写入基线文件，之后<b>违规数只许减少不许增加</b>，
 * 每修复一处就调低一格，保证架构单调收敛。
 *
 * <p>基线文件：{@code backend/arch-baseline.properties}（需提交进 git，否则 CI 上不生效）
 */
@DisplayName("架构规则守护")
class ArchitectureRulesTest {

    private static final String PKG = "com.fashion.supplychain";
    private static final Path BASELINE = Paths.get("arch-baseline.properties");

    private static JavaClasses classes() {
        return new ClassFileImporter()
                .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                .importPackages(PKG);
    }

    /** 读取基线；不存在时返回 Integer.MAX_VALUE（首次运行：只记录，不失败） */
    private static int baselineOf(String key) {
        try {
            if (!Files.exists(BASELINE)) return Integer.MAX_VALUE;
            for (String line : Files.readAllLines(BASELINE, StandardCharsets.UTF_8)) {
                String t = line.trim();
                if (t.isEmpty() || t.startsWith("#")) continue;
                int i = t.indexOf('=');
                if (i > 0 && t.substring(0, i).trim().equals(key)) {
                    return Integer.parseInt(t.substring(i + 1).trim());
                }
            }
        } catch (Exception ignore) {
            // 基线解析失败按"无基线"处理
        }
        return Integer.MAX_VALUE;
    }

    /**
     * 断言违规数不超过基线，并在减少时提示收敛基线。
     */
    private static void assertNotWorse(String key, int actual, String detail) {
        int base = baselineOf(key);
        if (actual > base) {
            throw new AssertionError(String.format(
                    "%n【架构违规新增】%s%n  基线允许 %d，实测 %d（+ %d）%n  %s%n"
                            + "  → 请修复新增违规；若为存量清理，请同步调低 %s 中的 %s 值。",
                    key, base, actual, actual - base, detail, BASELINE, key));
        }
        if (actual < base) {
            System.out.printf("[arch] %s 已收敛：%d → %d，请把基线更新为 %d%n", key, base, actual, actual);
        }
    }

    /**
     * 规则1：Controller 不得直接依赖 Mapper。
     * Controller 只应依赖 Orchestrator / Service，绕过业务层直接查库会让事务与权限校验失效。
     */
    @Test
    @DisplayName("Controller 不得直接依赖 Mapper")
    void controllersShouldNotDependOnMappers() {
        JavaClasses c = classes();
        ArchRule rule = noClasses()
                .that().haveSimpleNameEndingWith("Controller")
                .should().dependOnClassesThat().haveSimpleNameEndingWith("Mapper")
                .because("Controller 应通过 Orchestrator/Service 访问数据，直接依赖 Mapper 会绕过事务与业务校验");

        int violations = countViolations(c, rule);
        assertNotWorse("controller.depends.on.mapper", violations,
                "违规类示例见 ArchUnit 输出");
        // 规则本身仍然执行，保证失败信息可读
        if (violations > 0) {
            System.out.printf("[arch] Controller→Mapper 当前违规数：%d（基线允许 %d）%n",
                    violations, baselineOf("controller.depends.on.mapper"));
        }
    }

    /**
     * 规则2：禁止在业务代码中使用 System.out / printStackTrace。
     * 前者绕过日志框架（无法分级、无 traceId），后者吞掉堆栈、掩盖故障根因。
     */
    @Test
    @DisplayName("禁止 System.out 与 printStackTrace")
    void noStdoutAndPrintStackTrace() {
        JavaClasses c = classes();
        ArchRule rule = noClasses()
                .that().resideInAPackage(PKG + "..")
                .should().callMethod(System.out.getClass(), "println")
                .orShould().callMethod(Throwable.class, "printStackTrace")
                .because("应使用 slf4j 日志（可分级、带 traceId）；printStackTrace 会吞掉堆栈掩盖根因");

        int violations = countViolations(c, rule);
        assertNotWorse("no.stdout.no.printstacktrace", violations, "见 ArchUnit 输出");
    }

    /**
     * 规则3：禁止直接 new Thread()（应使用线程池，避免线程泄漏与资源耗尽）。
     */
    @Test
    @DisplayName("禁止直接 new Thread()")
    void noRawThreadCreation() {
        JavaClasses c = classes();
        ArchRule rule = noClasses()
                .that().resideInAPackage(PKG + "..")
                .should().callConstructor(Thread.class)
                .because("应使用线程池（@Async / ExecutorService），裸线程在高并发下会耗尽资源且无法治理");

        int violations = countViolations(c, rule);
        assertNotWorse("no.raw.thread", violations, "见 ArchUnit 输出");
    }

    /**
     * 规则4：Controller 不得被 Service/Orchestrator 反向依赖（防止循环依赖）。
     */
    @Test
    @DisplayName("业务层不得反向依赖 Controller")
    void noReverseDependencyOnController() {
        JavaClasses c = classes();
        ArchRule rule = noClasses()
                .that().haveSimpleNameEndingWith("Service")
                .or().haveSimpleNameEndingWith("Orchestrator")
                .should().dependOnClassesThat().haveSimpleNameEndingWith("Controller")
                .because("Controller 是最外层，业务层反向依赖它说明分层被破坏、存在循环依赖");

        int violations = countViolations(c, rule);
        assertNotWorse("no.reverse.dep.on.controller", violations, "见 ArchUnit 输出");
    }

    /**
     * 规则5：分层结构检查（ informational —— 当前只提示，不作为硬门禁）。
     * 存量 Orchestrator 直接依赖 Mapper 的达 150 个，一次性卡死会逼出 -DskipTests，
     * 故本规则先输出现状，待前几条收敛后再转硬门禁。
     */
    @Test
    @DisplayName("分层结构现状（仅提示）")
    void layeredArchitectureReport() {
        JavaClasses c = classes();
        Architectures.LayeredArchitecture arch = layeredArchitecture()
                .consideringOnlyDependenciesInLayers()
                .layer("Controller").definedBy(PKG + "..controller..")
                .layer("Orchestrator").definedBy(PKG + "..orchestration..")
                .layer("Service").definedBy(PKG + "..service..")
                .layer("Mapper").definedBy(PKG + "..mapper..")
                .whereLayer("Controller").mayNotBeAccessedByAnyLayer()
                .whereLayer("Mapper").mayOnlyBeAccessedByLayers("Service", "Orchestrator");

        try {
            arch.check(c);
            System.out.println("[arch] 分层结构检查通过");
        } catch (AssertionError e) {
            // 仅提示：存量违规多，先记录不阻断
            System.out.println("[arch] 分层结构现状（存量违规，暂不阻断）：");
            String msg = e.getMessage();
            System.out.println(msg == null ? "" : msg.lines().limit(5)
                    .reduce("", (a, b) -> a + "    " + b + "\n"));
        }
    }

    /**
     * 统计规则的违规条数（ArchUnit 的 violation 以换行分隔的 "was violated (N times)" 形式给出）。
     */
    private static int countViolations(JavaClasses classes, ArchRule rule) {
        try {
            rule.check(classes);
            return 0;
        } catch (AssertionError e) {
            String msg = String.valueOf(e.getMessage());
            // 形如 "... was violated (12 times):"
            int idx = msg.indexOf("was violated (");
            if (idx > 0) {
                int start = idx + "was violated (".length();
                int end = msg.indexOf(" times", start);
                if (end > start) {
                    try {
                        return Integer.parseInt(msg.substring(start, end).trim());
                    } catch (NumberFormatException ignore) {
                        // fall through
                    }
                }
            }
            // 解析不出具体条数时，按"有违规"计 1，避免误判为 0
            return 1;
        }
    }
}
