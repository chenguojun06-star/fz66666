package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.common.UserContext;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * 代码诊断与系统自愈工具 — 独立AI用于处理系统代码异常
 *
 * <p>功能：
 * <ul>
 *   <li>scan_errors — 扫描日志文件，提取最近N条ERROR/EXCEPTION，自动分析根因</li>
 *   <li>diagnose — 输入错误堆栈文本，分析根因并给出修复建议</li>
 *   <li>health_check — 系统健康快速检查（日志文件、进程、关键配置）</li>
 * </ul>
 */
@Slf4j
@Component
public class CodeDiagnosticTool extends AbstractAgentTool {

    private static final List<String> LOG_CANDIDATES = List.of(
            "logs/app.log",
            "logs/fashion-supplychain.log",
            "logs/backend-new.log",
            "/logs/app.log"
    );

    // 常见错误模式 -> 修复建议知识库
    private static final List<ErrorPattern> ERROR_KNOWLEDGE = List.of(
            new ErrorPattern(
                    "Unknown column '(.+?)' in 'field list'",
                    "数据库缺列（Schema漂移）",
                    "Entity字段与DB表不同步。修复步骤：" +
                    "\n  1) 确认缺少的列名（如 %s）" +
                    "\n  2) 在 db/migration/ 新增 V{YYYYMMDDHHMM}__add_xxx.sql（幂等写法用IF INFORMATION_SCHEMA）" +
                    "\n  3) 同步更新对应 Entity.java 添加字段" +
                    "\n  4) DbColumnRepairRunner 添加该列到自愈名单" +
                    "\n  ⚡ 永久规律：Entity字段必须有Flyway脚本覆盖，推送前必须跑 schema preflight"
            ),
            new ErrorPattern(
                    "FlywayException|Flyway.*checksum|Migration.*checksum",
                    "Flyway checksum 校验失败",
                    "已执行的Flyway脚本文件内容被修改！" +
                    "\n  ❌ 禁止修改任何已推送的V*.sql文件内容" +
                    "\n  修复步骤：" +
                    "\n  1) 找到被修改的脚本，用 git checkout 恢复原始内容" +
                    "\n  2) 新建 V{YYYYMMDDHHMM}__补偿描述.sql 来实现你要的变更" +
                    "\n  ⚡ 永久规律：已执行脚本绝对不能改，只能新建补偿脚本"
            ),
            new ErrorPattern(
                    "NullPointerException|NPE",
                    "空指针异常",
                    "对象为null时调用了方法。检查点：" +
                    "\n  1) UserContext.tenantId() 返回Long可能为null，用前判空" +
                    "\n  2) MyBatis-Plus getById/getOne 可能返回null" +
                    "\n  3) 统计计数字段用Number()包裹防止null" +
                    "\n  4) Integer/Long 字段做运算前判空（productionProgress != null）"
            ),
            new ErrorPattern(
                    "Data too long for column '(.+?)'",
                    "数据超出字段长度限制",
                    "字段 %s 的值超过DB列定义的VARCHAR长度。修复：" +
                    "\n  1) 新建Flyway脚本 MODIFY COLUMN 扩大长度（如 VARCHAR(500)→TEXT）" +
                    "\n  2) 或在代码中截断/校验输入长度" +
                    "\n  典型案例：t_login_log.error_message VARCHAR(500) 存堆栈时截断"
            ),
            new ErrorPattern(
                    "403|Forbidden|Access Denied",
                    "权限/认证错误 (403)",
                    "可能原因及修复：" +
                    "\n  1) 未使用 ./dev-public.sh 启动（缺少JWT Secret）" +
                    "\n  2) Controller方法上引用了t_permission表中不存在的权限码" +
                    "\n  3) Token过期，重新登录获取新Token" +
                    "\n  快速修复：./fix-403-errors.sh"
            ),
            new ErrorPattern(
                    "Cannot deserialize value|JsonMappingException|Unrecognized field",
                    "JSON反序列化异常",
                    "DTO字段与前端传值不匹配。检查：" +
                    "\n  1) 前端新增字段，后端DTO未添加" +
                    "\n  2) 字段类型不匹配（String vs Long）" +
                    "\n  3) JacksonConfig全局序列化规则冲突（Long→String）"
            ),
            new ErrorPattern(
                    "Duplicate entry '(.+?)' for key",
                    "数据库唯一键冲突",
                    "插入了重复的唯一键值 %s。" +
                    "\n  1) 检查业务逻辑是否有幂等保护" +
                    "\n  2) 添加 ON DUPLICATE KEY UPDATE 或先查后写" +
                    "\n  3) 确认前端是否重复提交"
            ),
            new ErrorPattern(
                    "Connection.*refused|Unable to acquire JDBC Connection|HikariPool.*Connection is not available",
                    "数据库连接失败",
                    "无法连接到MySQL。检查：" +
                    "\n  1) MySQL容器是否运行：docker ps | grep fashion-mysql-simple" +
                    "\n  2) 端口是否为3308（非标准3306）" +
                    "\n  3) 启动：./deployment/db-manager.sh start" +
                    "\n  4) 连接URL: jdbc:mysql://localhost:3308/fashion_supplychain"
            ),
            new ErrorPattern(
                    "Illegal mix of collations|collation.*utf8mb4",
                    "MySQL字符集/排序规则冲突",
                    "视图或查询中字符集混用（utf8mb4_bin vs utf8mb4_unicode_ci）。" +
                    "\n  修复：新建Flyway脚本，重建视图并给CONVERT表达式加 COLLATE utf8mb4_bin" +
                    "\n  参考：V20260312001__fix_view_collation_none.sql"
            ),
            new ErrorPattern(
                    "classNotFoundException|NoClassDefFoundError|BeanCreationException",
                    "Bean创建失败/类未找到",
                    "Spring Bean初始化异常。检查：" +
                    "\n  1) 新增@Component类是否有编译错误（mvn clean compile -q）" +
                    "\n  2) @Autowired依赖的Bean是否存在" +
                    "\n  3) 循环依赖：考虑加@Lazy注解" +
                    "\n  4) 包路径是否在 com.fashion.supplychain 下"
            )
    );

    @Override
    public String getName() {
        return "tool_code_diagnostic";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("action", stringProp("操作：scan_errors（扫描日志错误）/ diagnose（分析堆栈）/ health_check（系统快速检查）"));
        props.put("max_errors", intProp("scan_errors时，返回最近N条错误，默认10，最大50"));
        props.put("stack_trace", stringProp("diagnose时，输入需要分析的错误堆栈文本"));
        return buildToolDef(
                "系统代码诊断与自愈建议工具：自动扫描日志异常、分析根因、给出针对性修复方案。专为服装供应链系统定制，覆盖Flyway/Schema漂移/NPE/权限/数据库连接等常见问题。",
                props, List.of("action"));
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        if (!UserContext.isSuperAdmin()) {
            return errorJson("代码诊断工具仅限超级管理员使用");
        }
        Map<String, Object> args = parseArgs(argumentsJson);
        String action = requireString(args, "action");
        return switch (action) {
            case "scan_errors" -> scanErrors(args);
            case "diagnose" -> diagnoseStack(args);
            case "health_check" -> healthCheck();
            default -> errorJson("不支持的action: " + action + "，可选: scan_errors/diagnose/health_check");
        };
    }

    // ——— 扫描日志文件的最近N条错误 ———
    private String scanErrors(Map<String, Object> args) throws Exception {
        Integer maxRaw = optionalInt(args, "max_errors");
        int maxErrors = Math.min(maxRaw != null ? maxRaw : 10, 50);

        // 寻找日志文件
        String logFile = findLogFile();
        if (logFile == null) {
            return errorJson("未找到日志文件，已检查路径：" + LOG_CANDIDATES);
        }

        List<Map<String, Object>> errors = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(new FileReader(logFile))) {
            List<String> lines = reader.lines().collect(java.util.stream.Collectors.toList());
            List<String[]> errorBlocks = extractErrorBlocks(lines, maxErrors);
            for (String[] block : errorBlocks) {
                String combined = String.join("\n", block);
                Map<String, Object> e = new LinkedHashMap<>();
                e.put("timestamp", block[0].substring(0, Math.min(23, block[0].length())));
                e.put("errorLine", block[0]);
                e.put("analysis", analyzeText(combined));
                errors.add(e);
            }
        } catch (Exception ex) {
            return errorJson("读取日志文件失败: " + ex.getMessage());
        }

        if (errors.isEmpty()) {
            return successJson("扫描日志未发现ERROR级别异常，系统运行正常", Map.of(
                    "logFile", logFile, "scannedErrors", 0));
        }
        return successJson("发现 " + errors.size() + " 条错误，已完成根因分析", Map.of(
                "logFile", logFile, "errors", errors));
    }

    // ——— 分析输入的堆栈文本 ———
    private String diagnoseStack(Map<String, Object> args) throws Exception {
        String stack = requireString(args, "stack_trace");
        Map<String, Object> analysis = analyzeText(stack);
        return successJson("错误分析完成", analysis);
    }

    // ——— 系统健康快速检查 ———
    private String healthCheck() throws Exception {
        Map<String, Object> result = new LinkedHashMap<>();

        // 检查日志文件
        String logFile = findLogFile();
        result.put("logFileFound", logFile != null);
        result.put("logFilePath", logFile != null ? logFile : "未找到");

        // 检查日志中最近是否有错误
        if (logFile != null) {
            try {
                List<String> lines = Files.readAllLines(Path.of(logFile));
                List<String[]> recentErrors = extractErrorBlocks(lines, 5);
                result.put("recentErrorCount", recentErrors.size());
                result.put("logHealthy", recentErrors.isEmpty());
                if (!recentErrors.isEmpty()) {
                    List<String> summaries = new ArrayList<>();
                    for (String[] block : recentErrors) {
                        Map<String, Object> a = analyzeText(String.join("\n", block));
                        summaries.add(a.get("errorType") + ": " + a.get("summary"));
                    }
                    result.put("errorSummaries", summaries);
                }
            } catch (Exception e) {
                result.put("logReadError", e.getMessage());
            }
        }

        // 检查关键目录
        result.put("migrationDirExists",
                new File("backend/src/main/resources/db/migration").exists() ||
                new File("/Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/resources/db/migration").exists());

        String status = Boolean.TRUE.equals(result.get("logHealthy")) ? "系统运行正常，无近期错误" : "发现异常，建议执行 scan_errors 详细分析";
        return successJson(status, result);
    }

    // ——— 工具方法 ———

    private String findLogFile() {
        String baseDir = "/Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/";
        for (String candidate : LOG_CANDIDATES) {
            String full = baseDir + candidate;
            if (new File(full).exists()) return full;
            if (new File(candidate).exists()) return candidate;
        }
        return null;
    }

    private List<String[]> extractErrorBlocks(List<String> lines, int max) {
        List<String[]> result = new ArrayList<>();
        Pattern errorLine = Pattern.compile(".*(ERROR|WARN.*Exception|Exception:|Error:).*");
        for (int i = lines.size() - 1; i >= 0 && result.size() < max; i--) {
            if (errorLine.matcher(lines.get(i)).matches()) {
                int end = Math.min(i + 8, lines.size());
                String[] block = lines.subList(i, end).toArray(new String[0]);
                result.add(0, block);
            }
        }
        return result;
    }

    private Map<String, Object> analyzeText(String text) {
        Map<String, Object> result = new LinkedHashMap<>();
        String errorType = "未知错误";
        String summary = "无法识别的错误类型";
        String suggestion = "请提供更多日志信息或联系开发人员排查。";

        for (ErrorPattern ep : ERROR_KNOWLEDGE) {
            Matcher m = ep.pattern.matcher(text);
            if (m.find()) {
                errorType = ep.errorType;
                summary = ep.errorType;
                String group1 = m.groupCount() > 0 ? m.group(1) : "";
                suggestion = ep.fixTemplate.contains("%s") ? String.format(ep.fixTemplate, group1) : ep.fixTemplate;
                break;
            }
        }

        result.put("errorType", errorType);
        result.put("summary", summary);
        result.put("fixSuggestion", suggestion);
        result.put("rawTextPreview", text.length() > 300 ? text.substring(0, 300) + "..." : text);
        return result;
    }

    // ——— 错误模式记录 ———
    record ErrorPattern(Pattern pattern, String errorType, String fixTemplate) {
        ErrorPattern(String regex, String errorType, String fixTemplate) {
            this(Pattern.compile(regex, Pattern.CASE_INSENSITIVE), errorType, fixTemplate);
        }
    }
}
