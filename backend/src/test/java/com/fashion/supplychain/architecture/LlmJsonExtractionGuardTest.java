package com.fashion.supplychain.architecture;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 大模型 JSON 提取方式的结构守护（D-803）。
 *
 * <p><b>为什么要守住</b>：2026-10-13 盘点发现，全仓有 <b>15 处</b>各自手写的
 * 「从第一个 <code>{</code> 到最后一个 <code>}</code> 切片」逻辑，形态几乎一模一样：
 *
 * <pre>
 *   int start = content.indexOf('{');
 *   int end = content.lastIndexOf('}');
 *   if (start &lt; 0 || end &lt;= start) return null;
 *   String json = content.substring(start, end + 1);
 * </pre>
 *
 * <p>这个写法有三处硬伤，线上都真出过事：
 * <ol>
 *   <li><b>被输出长度截断时直接放弃</b>——没有结束的 <code>}</code>，
 *       {@code end <= start} 成立 → 整条结果丢掉（CEO 智能体诊断就是这么降级的）；</li>
 *   <li>字符串值里出现 <code>}</code>（比如 description 里贴了段代码）会切错位置；</li>
 *   <li>只认 <code>{}</code>，模型返回数组 <code>[]</code> 时无能为力。</li>
 * </ol>
 *
 * <p>现在统一走 {@code LlmJsonUtils}（有 13 个用例覆盖：去围栏 / 去前后解释 /
 * 截断修补 / 嵌套 / 数组 / 字符串里的花括号）。本测试防止有人再手写第 16 份。
 */
@DisplayName("大模型 JSON 提取：必须走 LlmJsonUtils，不得再手写切片")
class LlmJsonExtractionGuardTest {

    private static final String ALLOWED = "common/util/LlmJsonUtils.java";

    @Test
    @DisplayName("① 全仓不得再有「indexOf('{') + lastIndexOf('}')」式的手写 JSON 切片")
    void noHandRolledJsonSlicing() throws IOException {
        List<String> offenders = new ArrayList<>();
        for (Path root : List.of(Path.of("src/main/java"), Path.of("backend/src/main/java"))) {
            if (!Files.isDirectory(root)) {
                continue;
            }
            try (Stream<Path> walk = Files.walk(root)) {
                for (Path p : (Iterable<Path>) walk.filter(f -> f.toString().endsWith(".java"))::iterator) {
                    String rel = p.toString().replace('\\', '/');
                    if (rel.endsWith(ALLOWED)) {
                        continue;
                    }
                    String src = Files.readString(p, StandardCharsets.UTF_8);
                    if (src.contains("indexOf('{')") && src.contains("lastIndexOf('}')")) {
                        offenders.add(rel);
                    }
                }
            }
            break;
        }

        assertThat(offenders)
                .as("这些文件又手写了 JSON 切片 —— 模型输出会被截断/夹带解释/含花括号，"
                        + "手写切片必然丢数据。请改用 LlmJsonUtils.extractJson(...)：%s", offenders)
                .isEmpty();
    }

    @Test
    @DisplayName("② LlmJsonUtils 必须存在且带截断修补（别把它删了或退化成简单切片）")
    void llmJsonUtilsStaysCapable() throws IOException {
        String src = null;
        for (Path p : List.of(Path.of("src/main/java/com/fashion/supplychain/" + ALLOWED),
                Path.of("backend/src/main/java/com/fashion/supplychain/" + ALLOWED))) {
            if (Files.exists(p)) {
                src = Files.readString(p, StandardCharsets.UTF_8);
                break;
            }
        }
        assertThat(src).as("找不到 " + ALLOWED).isNotNull();
        assertThat(src)
                .as("必须保留截断修补能力（闭合未结束的字符串/补齐未闭合的括号）")
                .contains("repairTruncated")
                .contains("dropDanglingTail");
        assertThat(src)
                .as("不得退化成 indexOf/lastIndexOf 切片")
                .doesNotContain("lastIndexOf('}')");
    }
}
