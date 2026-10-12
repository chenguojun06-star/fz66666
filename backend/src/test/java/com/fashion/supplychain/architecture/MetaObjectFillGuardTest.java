package com.fashion.supplychain.architecture;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 自动填充字段的结构守护（D-802）。
 *
 * <p><b>为什么需要它（2026-10-13 线上实证）</b>：MyBatis-Plus 对声明了
 * {@code @TableField(fill = ...)} 的字段会<b>无条件</b>把它写进 INSERT 语句 ——
 * 不受 {@code NOT_NULL} 策略保护。也就是说：<b>实体声明了 fill，处理器却没填，
 * 落库就是显式 NULL</b>。而 MySQL 里 {@code created_time DATETIME NOT NULL
 * DEFAULT CURRENT_TIMESTAMP} 遇到显式 NULL 不会走默认值，直接报
 * {@code Column 'created_time' cannot be null}。
 *
 * <p>当时 {@code MyBatisPlusMetaObjectHandler} 只填了 {@code createTime/updateTime/
 * createdAt/updatedAt}，漏了另一套命名的 {@code createdTime/updatedTime}，
 * 后果是：
 * <ul>
 *   <li>支付回调日志写不进去 → 整条回调 500（支付宝会重推 8 次，全部失败）；</li>
 *   <li>{@code t_payment_record} 落流水同样失败 → <b>收银台扫码收款根本走不通</b>。</li>
 * </ul>
 * 而单测全绿：所有 Mapper 都是 mock 的，没有一条 SQL 真的打到库上。
 *
 * <p>所以这里用源码级断言把「声明了 fill 就必须真的填」锁死 —— 新增实体用新命名时，
 * 忘了同步处理器会直接构建失败，而不是等线上第一次 INSERT。
 */
@DisplayName("自动填充守护：声明了 fill 的字段，处理器必须真的填")
class MetaObjectFillGuardTest {

    private static final String HANDLER =
            "com/fashion/supplychain/config/MyBatisPlusMetaObjectHandler.java";

    /** 匹配 @TableField(...fill = FieldFill.XXX...) 紧跟的字段声明，取出 (操作类型, 属性名) */
    private static final Pattern FILL_FIELD = Pattern.compile(
            "@TableField\\([^)]*fill\\s*=\\s*FieldFill\\.(INSERT_UPDATE|INSERT|UPDATE)[^)]*\\)"
                    + "\\s*private\\s+[\\w<>, .\\[\\]]+?\\s+(\\w+)\\s*;");

    @Test
    @DisplayName("① 每个 fill=INSERT 的字段，insertFill 里必须有对应的 strictInsertFill")
    void everyInsertFillFieldMustBeHandled() throws Exception {
        Map<String, Set<String>> owners = collectFillFields();

        Set<String> needInsert = new LinkedHashSet<>();
        for (Map.Entry<String, Set<String>> e : owners.entrySet()) {
            if (e.getValue().contains("INSERT") || e.getValue().contains("INSERT_UPDATE")) {
                needInsert.add(e.getKey());
            }
        }

        String handler = readHandler();
        List<String> missing = new ArrayList<>();
        for (String prop : needInsert) {
            if (!handler.contains("strictInsertFill(metaObject, \"" + prop + "\"")) {
                missing.add(prop);
            }
        }

        assertThat(missing)
                .as("这些字段声明了 fill=INSERT 但处理器没填 —— INSERT 会写显式 NULL，"
                        + "遇到 NOT NULL 列直接报错（t_payment_record / t_integration_callback_log "
                        + "的 created_time 就是这么炸的）。请在 MyBatisPlusMetaObjectHandler"
                        + ".insertFill 里补上：%s", missing)
                .isEmpty();
    }

    @Test
    @DisplayName("② 每个 fill=UPDATE 的字段，updateFill 里必须有对应的 strictUpdateFill")
    void everyUpdateFillFieldMustBeHandled() throws Exception {
        Map<String, Set<String>> owners = collectFillFields();

        Set<String> needUpdate = new LinkedHashSet<>();
        for (Map.Entry<String, Set<String>> e : owners.entrySet()) {
            if (e.getValue().contains("UPDATE") || e.getValue().contains("INSERT_UPDATE")) {
                needUpdate.add(e.getKey());
            }
        }

        String handler = readHandler();
        List<String> missing = new ArrayList<>();
        for (String prop : needUpdate) {
            if (!handler.contains("strictUpdateFill(metaObject, \"" + prop + "\"")) {
                missing.add(prop);
            }
        }

        assertThat(missing)
                .as("这些字段声明了 fill=UPDATE 但处理器没填 —— UPDATE 会把列写成 NULL。"
                        + "请在 MyBatisPlusMetaObjectHandler.updateFill 里补上：%s", missing)
                .isEmpty();
    }

    /**
     * 扫描全部实体源码，收集「属性名 → 需要填充的操作集合」。
     *
     * <p>属性名是 Java 侧名字（如 {@code createdTime}），不是列名 —— 处理器填的也是属性名。
     */
    private static Map<String, Set<String>> collectFillFields() throws IOException {
        Map<String, Set<String>> owners = new LinkedHashMap<>();
        for (Path root : List.of(Path.of("src/main/java"), Path.of("backend/src/main/java"))) {
            if (!Files.isDirectory(root)) {
                continue;
            }
            try (Stream<Path> walk = Files.walk(root)) {
                for (Path p : (Iterable<Path>) walk.filter(f -> f.toString().endsWith(".java"))::iterator) {
                    String src = Files.readString(p, StandardCharsets.UTF_8);
                    Matcher m = FILL_FIELD.matcher(src);
                    while (m.find()) {
                        String kind = m.group(1);
                        String prop = m.group(2);
                        Set<String> kinds = owners.computeIfAbsent(prop, k -> new LinkedHashSet<>());
                        if ("INSERT_UPDATE".equals(kind)) {
                            kinds.add("INSERT");
                            kinds.add("UPDATE");
                        } else {
                            kinds.add(kind);
                        }
                    }
                }
            }
            break; // 找到一份源码树就够了
        }
        assertThat(owners)
                .as("一个 fill 字段都没扫到 —— 源码路径变了或正则失效，本测试会变成空转")
                .isNotEmpty();
        return owners;
    }

    private static String readHandler() throws IOException {
        for (Path p : List.of(Path.of("src/main/java/" + HANDLER),
                Path.of("backend/src/main/java/" + HANDLER))) {
            if (Files.exists(p)) {
                return Files.readString(p, StandardCharsets.UTF_8);
            }
        }
        throw new AssertionError("找不到 " + HANDLER);
    }
}
