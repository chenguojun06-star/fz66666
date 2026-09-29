package com.fashion.supplychain.system.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.system.entity.Tenant;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.service.DatabaseStructureHealthService;
import com.fashion.supplychain.system.service.TenantService;
import com.fashion.supplychain.system.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.sql.DataSource;
import java.lang.management.ManagementFactory;
import java.lang.management.MemoryMXBean;
import java.lang.management.OperatingSystemMXBean;
import java.lang.management.RuntimeMXBean;
import java.sql.Connection;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 系统运行状态编排器（简易运维面板）。
 *
 * <p>D-636：原逻辑位于 {@code SystemStatusController}。该 Controller 直接注入了
 * TenantService / UserService / DatabaseStructureHealthService 三个 Service，
 * 且 JVM 指标采集、租户人员聚合统计都在最外层完成，属「Controller 依赖多个 Service」
 * 且编排泄漏。现全部下沉到本类，Controller 只保留端点声明。
 */
@Service
public class SystemStatusOrchestrator {

    @Autowired
    private DataSource dataSource;

    @Autowired
    private TenantService tenantService;

    @Autowired
    private UserService userService;

    @Autowired
    private DatabaseStructureHealthService databaseStructureHealthService;

    @Value("${spring.application.name:supplychain}")
    private String applicationName;

    /** 应用启动时间（类加载时刻，Spring 单例在启动期完成加载） */
    private static final LocalDateTime START_TIME = LocalDateTime.now();

    private static final DateTimeFormatter TS_FORMAT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    /**
     * 系统运行状态概览（应用信息 / 运行时长 / JVM 内存 / CPU / 线程 / 数据库连接）
     */
    public Map<String, Object> overview() {
        Map<String, Object> info = new LinkedHashMap<>();

        // 应用信息
        info.put("applicationName", applicationName);
        info.put("javaVersion", System.getProperty("java.version"));
        info.put("osName", System.getProperty("os.name"));
        info.put("osArch", System.getProperty("os.arch"));
        info.put("startTime", START_TIME.format(TS_FORMAT));
        info.put("currentTime", LocalDateTime.now().format(TS_FORMAT));

        // 运行时长
        RuntimeMXBean runtime = ManagementFactory.getRuntimeMXBean();
        long uptime = runtime.getUptime();
        Duration d = Duration.ofMillis(uptime);
        info.put("uptime", String.format("%d天%d小时%d分钟", d.toDays(), d.toHoursPart(), d.toMinutesPart()));
        info.put("uptimeMs", uptime);

        // JVM 内存
        MemoryMXBean memory = ManagementFactory.getMemoryMXBean();
        long heapUsed = memory.getHeapMemoryUsage().getUsed();
        long heapMax = memory.getHeapMemoryUsage().getMax();
        long nonHeapUsed = memory.getNonHeapMemoryUsage().getUsed();
        info.put("heapUsedMb", heapUsed / 1024 / 1024);
        info.put("heapMaxMb", heapMax > 0 ? heapMax / 1024 / 1024 : -1);
        info.put("heapUsedPercent", heapMax > 0 ? Math.round(heapUsed * 100.0 / heapMax) : 0);
        info.put("nonHeapUsedMb", nonHeapUsed / 1024 / 1024);

        // CPU
        OperatingSystemMXBean os = ManagementFactory.getOperatingSystemMXBean();
        info.put("availableProcessors", os.getAvailableProcessors());
        info.put("systemLoadAverage", Math.round(os.getSystemLoadAverage() * 100.0) / 100.0);

        // 线程
        info.put("threadCount", ManagementFactory.getThreadMXBean().getThreadCount());
        info.put("peakThreadCount", ManagementFactory.getThreadMXBean().getPeakThreadCount());

        // 数据库连接
        info.put("database", checkDatabase());

        return info;
    }

    /**
     * 租户人员统计（每个租户的用户数量、上限、活跃/待审批分类）
     */
    public Map<String, Object> tenantUserStats() {
        List<Tenant> tenants = tenantService.list(new LambdaQueryWrapper<Tenant>().last("LIMIT 500"));
        List<Map<String, Object>> result = new ArrayList<>();
        long totalUsers = 0;

        for (Tenant tenant : tenants) {
            // 总用户数（含待审批，以 tenantId 为准）
            long userCount = userService.count(
                    new LambdaQueryWrapper<User>().eq(User::getTenantId, tenant.getId()));
            // 活跃用户数（registrationStatus = ACTIVE）
            long activeCount = userService.count(new LambdaQueryWrapper<User>()
                    .eq(User::getTenantId, tenant.getId())
                    .eq(User::getRegistrationStatus, "ACTIVE"));
            // 待审批用户数（registrationStatus = PENDING）
            long pendingCount = userService.count(new LambdaQueryWrapper<User>()
                    .eq(User::getTenantId, tenant.getId())
                    .eq(User::getRegistrationStatus, "PENDING"));

            totalUsers += userCount;

            Map<String, Object> item = new LinkedHashMap<>();
            item.put("tenantId", tenant.getId());
            item.put("tenantName", tenant.getTenantName());
            item.put("userCount", userCount);
            item.put("activeUsers", activeCount);
            item.put("pendingUsers", pendingCount);
            // maxUsers: null 或 0 表示不限制，9999 表示超管账号（也视为不限制）
            item.put("maxUsers", tenant.getMaxUsers() != null ? tenant.getMaxUsers() : 0);
            result.add(item);
        }

        // 按人数降序排列
        result.sort((a, b) -> Long.compare((long) b.get("userCount"), (long) a.get("userCount")));

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("totalTenants", tenants.size());
        data.put("totalUsers", totalUsers);
        data.put("tenants", result);
        return data;
    }

    /**
     * 数据库结构健康检查。
     * 用于发布前/发布后核对关键表结构与当前代码是否一致。
     */
    public Object structureHealth() {
        return databaseStructureHealthService.inspect();
    }

    /**
     * 数据库连接状态
     */
    private Map<String, Object> checkDatabase() {
        Map<String, Object> db = new LinkedHashMap<>();
        try (Connection conn = dataSource.getConnection()) {
            db.put("status", "UP");
            db.put("product", conn.getMetaData().getDatabaseProductName());
            db.put("version", conn.getMetaData().getDatabaseProductVersion());
            db.put("url", conn.getMetaData().getURL().replaceAll("password=[^&]*", "password=***"));
        } catch (Exception e) {
            db.put("status", "DOWN");
            db.put("error", e.getMessage());
        }
        return db;
    }
}
