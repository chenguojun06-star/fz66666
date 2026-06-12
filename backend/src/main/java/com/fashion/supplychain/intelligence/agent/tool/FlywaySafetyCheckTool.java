package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.intelligence.agent.AiTool;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Flyway 安全检查工具 — 迁移前自动校验，防炸库。
 * <p>
 * 当用户问"Flyway""迁移""数据库变更""ALTER TABLE""新增字段"时调用。
 * 在执行任何数据库变更前，自动检查：版本号冲突、动态SQL陷阱、租户隔离、幂等性。
 * </p>
 */
@Slf4j
@Component
@Lazy
@AgentToolDef(name = "tool_flyway_safety_check", description = "Flyway迁移安全检查工具", domain = ToolDomain.SYSTEM, timeoutMs = 15000)
@McpToolAnnotation(
        name = "tool_flyway_safety_check",
        description = "Flyway迁移安全检查：版本号冲突检测、动态SQL陷阱扫描、租户隔离校验、幂等性验证",
        domain = ToolDomain.SYSTEM,
        readOnly = true,
        timeoutSeconds = 15,
        version = "1.0",
        tags = {"Flyway", "迁移检查", "版本号冲突", "动态SQL", "幂等性", "防炸库", "数据库变更"}
)
public class FlywaySafetyCheckTool extends AbstractAgentTool {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    /** Flyway 10.x 版本号格式：只允许纯数字和点号分隔 */
    private static final Pattern VALID_VERSION_PATTERN = Pattern.compile("^V(\\d+(\\.\\d+)*)__.*\\.sql$");
    /** 字母后缀版本号（Flyway 10.x 不支持） */
    private static final Pattern LETTER_SUFFIX_PATTERN = Pattern.compile("^V\\d+[a-zA-Z]__.*\\.sql$");
    /** 动态SQL中的字符串字面量陷阱 */
    private static final Pattern DYNAMIC_SQL_STRING_LITERAL = Pattern.compile(
            "SET\\s+@\\w+\\s*=.*(?:COMMENT\\s+''[^']*''|DEFAULT\\s+''[^']*'')", Pattern.CASE_INSENSITIVE);
    /** PREPARE + DEFAULT NULL 陷阱 */
    private static final Pattern PREPARE_DEFAULT_NULL = Pattern.compile(
            "PREPARE\\s+\\w+\\s+FROM.*DEFAULT\\s+NULL", Pattern.CASE_INSENSITIVE);

    @Override
    public String getName() {
        return "tool_flyway_safety_check";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        Map<String, Object> action = new LinkedHashMap<>();
        action.put("type", "string");
        action.put("enum", List.of("check_file", "check_all_pending", "version_conflicts", "scan_traps"));
        action.put("description", "检查类型：check_file=检查指定文件，check_all_pending=检查所有待执行迁移，version_conflicts=版本号冲突检测，scan_traps=扫描已知陷阱");
        properties.put("action", action);
        properties.put("filePath", stringProp("要检查的Flyway文件路径（相对db/migration/）"));
        return buildToolDef(
                "Flyway迁移安全检查工具。在执行任何数据库变更前调用，自动检查版本号冲突、动态SQL陷阱、租户隔离、幂等性。" +
                        "防止Flyway迁移导致启动失败或数据损坏。",
                properties, List.of("action"));
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String action = optionalString(args, "action");
        if (action == null) action = "check_all_pending";

        return switch (action) {
            case "check_file" -> executeCheckFile(optionalString(args, "filePath"));
            case "check_all_pending" -> executeCheckAllPending();
            case "version_conflicts" -> executeVersionConflicts();
            case "scan_traps" -> executeScanTraps();
            default -> errorJson("未知操作: " + action);
        };
    }

    private String executeCheckFile(String filePath) throws Exception {
        if (filePath == null || filePath.isBlank()) {
            return errorJson("请提供要检查的文件路径");
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("action", "check_file");
        result.put("filePath", filePath);

        List<String> errors = new ArrayList<>();
        List<String> warnings = new ArrayList<>();

        // 1. 版本号格式检查
        String fileName = filePath.contains("/") ? filePath.substring(filePath.lastIndexOf('/') + 1) : filePath;
        if (LETTER_SUFFIX_PATTERN.matcher(fileName).matches()) {
            errors.add("版本号包含字母后缀，Flyway 10.x 不支持（会导致 BigInteger 解析失败，迁移被跳过）");
        } else if (!VALID_VERSION_PATTERN.matcher(fileName).matches()) {
            warnings.add("版本号格式可能不符合规范，建议使用 V{timestamp}__{desc}.sql 或 V{timestamp}.{seq}__{desc}.sql");
        }

        // 2. 读取文件内容检查
        try {
            Path path = resolveFilePath(filePath);
            if (path != null && Files.exists(path)) {
                String content = Files.readString(path, StandardCharsets.UTF_8);
                checkSqlContent(content, errors, warnings);
            } else {
                // 尝试从 classpath 读取
                warnings.add("文件未找到，无法检查内容（路径: " + filePath + "）");
            }
        } catch (Exception e) {
            warnings.add("无法读取文件内容：" + e.getMessage());
        }

        // 3. 与已执行版本号对比
        try {
            String version = extractVersion(fileName);
            if (version != null) {
                Integer existing = jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM flyway_schema_history WHERE version = ?",
                        Integer.class, version);
                if (existing != null && existing > 0) {
                    errors.add("版本号 " + version + " 已存在，会导致 checksum 校验失败");
                }
            }
        } catch (Exception ignored) {}

        result.put("errors", errors);
        result.put("warnings", warnings);
        result.put("safe", errors.isEmpty());

        return successJson(errors.isEmpty() ? "文件检查通过" : "文件检查发现问题", result);
    }

    private String executeCheckAllPending() throws Exception {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("action", "check_all_pending");

        List<String> allErrors = new ArrayList<>();
        List<String> allWarnings = new ArrayList<>();
        List<Map<String, Object>> fileResults = new ArrayList<>();

        try {
            PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
            Resource[] resources = resolver.getResources("classpath:db/migration/V*.sql");

            // 获取已执行版本号
            Set<String> executedVersions = new HashSet<>();
            try {
                List<Map<String, Object>> executed = jdbcTemplate.queryForList(
                        "SELECT version FROM flyway_schema_history WHERE success = 1");
                for (Map<String, Object> row : executed) {
                    if (row.get("version") != null) {
                        executedVersions.add(row.get("version").toString());
                    }
                }
            } catch (Exception ignored) {}

            Set<String> seenVersions = new HashSet<>();

            for (Resource resource : resources) {
                String fileName = resource.getFilename();
                if (fileName == null) continue;

                Map<String, Object> fileResult = new LinkedHashMap<>();
                fileResult.put("fileName", fileName);

                List<String> errors = new ArrayList<>();
                List<String> warnings = new ArrayList<>();

                // 版本号格式
                String version = extractVersion(fileName);
                if (version != null) {
                    if (seenVersions.contains(version)) {
                        errors.add("版本号 " + version + " 重复");
                    }
                    seenVersions.add(version);

                    if (executedVersions.contains(version)) {
                        fileResult.put("status", "already_executed");
                        continue;
                    }

                    if (LETTER_SUFFIX_PATTERN.matcher(fileName).matches()) {
                        errors.add("字母后缀版本号，Flyway 10.x 不支持");
                    }
                }

                // 内容检查
                try {
                    String content = resource.getContentAsString(StandardCharsets.UTF_8);
                    checkSqlContent(content, errors, warnings);
                } catch (IOException e) {
                    warnings.add("无法读取内容");
                }

                fileResult.put("errors", errors);
                fileResult.put("warnings", warnings);
                fileResult.put("safe", errors.isEmpty());
                fileResult.put("status", "pending");

                allErrors.addAll(errors.stream().map(e -> fileName + ": " + e).toList());
                allWarnings.addAll(warnings.stream().map(w -> fileName + ": " + w).toList());
                fileResults.add(fileResult);
            }
        } catch (IOException e) {
            allErrors.add("无法扫描迁移文件：" + e.getMessage());
        }

        result.put("fileResults", fileResults);
        result.put("totalErrors", allErrors.size());
        result.put("totalWarnings", allWarnings.size());
        result.put("safe", allErrors.isEmpty());

        return successJson(allErrors.isEmpty() ? "所有待执行迁移检查通过" : "发现" + allErrors.size() + "个错误", result);
    }

    private String executeVersionConflicts() throws Exception {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("action", "version_conflicts");

        try {
            // 检查已执行迁移中的失败记录
            List<Map<String, Object>> failedMigrations = jdbcTemplate.queryForList(
                    "SELECT installed_rank, version, description, script, installed_on "
                            + "FROM flyway_schema_history WHERE success = 0 ORDER BY installed_rank");
            result.put("failedMigrations", failedMigrations);

            // 检查版本号重复
            List<Map<String, Object>> duplicateVersions = jdbcTemplate.queryForList(
                    "SELECT version, COUNT(*) as cnt FROM flyway_schema_history "
                            + "GROUP BY version HAVING cnt > 1");
            result.put("duplicateVersions", duplicateVersions);

            // 检查字母后缀版本号
            List<Map<String, Object>> letterSuffixVersions = jdbcTemplate.queryForList(
                    "SELECT installed_rank, version, description, script "
                            + "FROM flyway_schema_history WHERE version REGEXP '[a-zA-Z]'");
            result.put("letterSuffixVersions", letterSuffixVersions);
            if (!letterSuffixVersions.isEmpty()) {
                result.put("warning", "存在字母后缀版本号，Flyway 10.x 升级时可能导致问题");
            }

        } catch (Exception e) {
            result.put("error", "无法获取版本冲突信息：" + e.getMessage());
        }

        return successJson("版本号冲突检测", result);
    }

    private String executeScanTraps() throws Exception {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("action", "scan_traps");

        List<Map<String, Object>> trapResults = new ArrayList<>();

        try {
            PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
            Resource[] resources = resolver.getResources("classpath:db/migration/V*.sql");

            for (Resource resource : resources) {
                String fileName = resource.getFilename();
                if (fileName == null) continue;

                try {
                    String content = resource.getContentAsString(StandardCharsets.UTF_8);
                    List<String> traps = new ArrayList<>();

                    // 陷阱1：动态SQL中的字符串字面量
                    if (DYNAMIC_SQL_STRING_LITERAL.matcher(content).find()) {
                        traps.add("动态SQL(SET @s)中包含字符串字面量(COMMENT/DEFAULT)，Flyway可能静默失败");
                    }

                    // 陷阱2：PREPARE + DEFAULT NULL
                    if (PREPARE_DEFAULT_NULL.matcher(content).find()) {
                        traps.add("PREPARE语句中包含DEFAULT NULL，MySQL 8.0可能报ERROR 1064");
                    }

                    // 陷阱3：字母后缀版本号
                    if (LETTER_SUFFIX_PATTERN.matcher(fileName).matches()) {
                        traps.add("字母后缀版本号，Flyway 10.x BigInteger解析失败");
                    }

                    // 陷阱4：缺少 WHERE 条件的 UPDATE/DELETE
                    Pattern unsafeDml = Pattern.compile(
                            "(UPDATE\\s+\\w+\\s+SET|DELETE\\s+FROM\\s+\\w+)(?!.*WHERE)",
                            Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
                    if (unsafeDml.matcher(content).find()) {
                        traps.add("存在不带WHERE条件的UPDATE/DELETE，可能影响全表数据");
                    }

                    // 陷阱5：缺少 tenant_id 条件
                    Pattern noTenantId = Pattern.compile(
                            "(UPDATE|DELETE\\s+FROM)\\s+t_\\w+.*WHERE(?!.+tenant_id)",
                            Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
                    if (noTenantId.matcher(content).find()) {
                        traps.add("UPDATE/DELETE缺少tenant_id条件，违反多租户隔离");
                    }

                    if (!traps.isEmpty()) {
                        Map<String, Object> trapResult = new LinkedHashMap<>();
                        trapResult.put("fileName", fileName);
                        trapResult.put("traps", traps);
                        trapResult.put("severity", traps.size() > 1 ? "HIGH" : "MEDIUM");
                        trapResults.add(trapResult);
                    }
                } catch (IOException ignored) {}
            }
        } catch (IOException e) {
            result.put("error", "无法扫描迁移文件：" + e.getMessage());
        }

        result.put("trapResults", trapResults);
        result.put("totalTraps", trapResults.stream().mapToInt(t -> ((List<?>) t.get("traps")).size()).sum());

        return successJson("陷阱扫描完成", result);
    }

    private void checkSqlContent(String content, List<String> errors, List<String> warnings) {
        // 动态SQL字符串字面量
        if (DYNAMIC_SQL_STRING_LITERAL.matcher(content).find()) {
            errors.add("动态SQL(SET @s)中包含字符串字面量(COMMENT/DEFAULT)，Flyway可能静默失败");
        }
        // PREPARE + DEFAULT NULL
        if (PREPARE_DEFAULT_NULL.matcher(content).find()) {
            errors.add("PREPARE语句中包含DEFAULT NULL，MySQL 8.0可能报ERROR 1064");
        }
        // 不带WHERE的UPDATE/DELETE
        Pattern unsafeDml = Pattern.compile(
                "(UPDATE\\s+\\w+\\s+SET|DELETE\\s+FROM\\s+\\w+)(?!.*WHERE)",
                Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
        if (unsafeDml.matcher(content).find()) {
            warnings.add("存在不带WHERE条件的UPDATE/DELETE");
        }
        // 缺少幂等性保护（CREATE TABLE 没有 IF NOT EXISTS）
        Pattern createTable = Pattern.compile("CREATE\\s+TABLE\\s+(?!.*IF\\s+NOT\\s+EXISTS)", Pattern.CASE_INSENSITIVE);
        if (createTable.matcher(content).find()) {
            warnings.add("CREATE TABLE缺少IF NOT EXISTS，非幂等，重复执行会失败");
        }
    }

    private String extractVersion(String fileName) {
        if (fileName == null) return null;
        Matcher m = Pattern.compile("^V(\\d+(?:\\.\\d+)*)").matcher(fileName);
        return m.find() ? m.group(1) : null;
    }

    private Path resolveFilePath(String filePath) {
        String basePath = "backend/src/main/resources/db/migration/";
        Path path = Path.of(basePath + filePath);
        if (Files.exists(path)) return path;
        path = Path.of(filePath);
        if (Files.exists(path)) return path;
        return null;
    }
}
