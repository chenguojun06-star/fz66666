package com.fashion.supplychain.system.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.system.entity.Tenant;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.service.TenantService;
import com.fashion.supplychain.system.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

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
 * 系统运行状态 Controller（简易运维面板）
 * 超管在客户管理页面查看系统运行状态
 */
@RestController
@RequestMapping("/api/system/status")
@PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
public class SystemStatusController {

    @Autowired
    private DataSource dataSource;

    @Autowired
    private TenantService tenantService;

    @Autowired
    private UserService userService;

    @Value("${spring.application.name:supplychain}")
    private String applicationName;

    private static final LocalDateTime START_TIME = LocalDateTime.now();

    /**
     * 系统运行状态概览
     */
    @GetMapping("/overview")
    public Result<?> overview() {
        Map<String, Object> info = new LinkedHashMap<>();

        // 应用信息
        info.put("applicationName", applicationName);
        info.put("javaVersion", System.getProperty("java.version"));
        info.put("osName", System.getProperty("os.name"));
        info.put("osArch", System.getProperty("os.arch"));
        info.put("startTime", START_TIME.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
        info.put("currentTime", LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));

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

        return Result.success(info);
    }

    /**
     * 租户人员统计（每个租户的用户数量）
     */
    @GetMapping("/tenant-user-stats")
    public Result<?> tenantUserStats() {
        List<Tenant> tenants = tenantService.list();
        List<Map<String, Object>> result = new ArrayList<>();
        long totalUsers = 0;

        for (Tenant tenant : tenants) {
            long userCount = userService.count(
                new LambdaQueryWrapper<User>().eq(User::getTenantId, tenant.getId()));
            totalUsers += userCount;
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("tenantId", tenant.getId());
            item.put("tenantName", tenant.getTenantName());
            item.put("userCount", userCount);
            result.add(item);
        }

        // 按人数降序排列
        result.sort((a, b) -> Long.compare((long) b.get("userCount"), (long) a.get("userCount")));

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("totalTenants", tenants.size());
        data.put("totalUsers", totalUsers);
        data.put("tenants", result);
        return Result.success(data);
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
