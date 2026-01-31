package com.fashion.supplychain.common;

import com.fashion.supplychain.common.PerformanceMonitor.MethodStats;
import com.fashion.supplychain.common.Result;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 性能监控接口
 * 提供性能统计信息的查询接口
 */
@RestController
@RequestMapping("/api/monitor/performance")
public class PerformanceController {

    @Autowired
    private PerformanceMonitor performanceMonitor;

    /**
     * 获取所有性能统计信息
     */
    @GetMapping("/stats")
    @PreAuthorize("hasRole('ADMIN')")
    public Result<Map<String, Object>> getAllStats() {
        Map<String, MethodStats> stats = performanceMonitor.getAllStats();

        Map<String, Object> result = new HashMap<>();
        result.put("totalMethods", stats.size());
        result.put("methods", stats.entrySet().stream()
                .collect(Collectors.toMap(
                        Map.Entry::getKey,
                        e -> {
                            MethodStats s = e.getValue();
                            Map<String, Long> map = new HashMap<>();
                            map.put("callCount", s.getCallCount());
                            map.put("avgTime", s.getAvgTime());
                            map.put("maxTime", s.getMaxTime());
                            map.put("minTime", s.getMinTime());
                            return map;
                        }
                )));

        return Result.success(result);
    }

    /**
     * 获取指定方法的统计信息
     */
    @GetMapping("/stats/{methodName}")
    @PreAuthorize("hasRole('ADMIN')")
    public Result<Map<String, Long>> getMethodStats(@PathVariable String methodName) {
        MethodStats stats = performanceMonitor.getStats(methodName);

        if (stats == null) {
            return Result.fail("方法不存在或暂无统计信息");
        }

        Map<String, Long> result = new HashMap<>();
        result.put("callCount", stats.getCallCount());
        result.put("avgTime", stats.getAvgTime());
        result.put("maxTime", stats.getMaxTime());
        result.put("minTime", stats.getMinTime());

        return Result.success(result);
    }

    /**
     * 清除所有统计信息
     */
    @PostMapping("/clear")
    @PreAuthorize("hasRole('ADMIN')")
    public Result<Void> clearStats() {
        performanceMonitor.clearStats();
        return Result.successMessage("统计信息已清除");
    }

    /**
     * 打印统计报告到日志
     */
    @PostMapping("/report")
    @PreAuthorize("hasRole('ADMIN')")
    public Result<Void> printReport() {
        performanceMonitor.printReport();
        return Result.successMessage("统计报告已打印到日志");
    }

    /**
     * 获取慢方法列表（执行时间超过阈值的）
     */
    @GetMapping("/slow-methods")
    @PreAuthorize("hasRole('ADMIN')")
    public Result<Map<String, Object>> getSlowMethods(
            @RequestParam(defaultValue = "1000") long threshold) {

        Map<String, MethodStats> allStats = performanceMonitor.getAllStats();

        Map<String, MethodStats> slowMethods = allStats.entrySet().stream()
                .filter(e -> e.getValue().getAvgTime() > threshold)
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));

        Map<String, Object> result = new HashMap<>();
        result.put("threshold", threshold);
        result.put("slowMethodCount", slowMethods.size());
        result.put("slowMethods", slowMethods.entrySet().stream()
                .collect(Collectors.toMap(
                        Map.Entry::getKey,
                        e -> {
                            MethodStats s = e.getValue();
                            Map<String, Long> map = new HashMap<>();
                            map.put("callCount", s.getCallCount());
                            map.put("avgTime", s.getAvgTime());
                            map.put("maxTime", s.getMaxTime());
                            map.put("minTime", s.getMinTime());
                            return map;
                        }
                )));

        return Result.success(result);
    }
}
