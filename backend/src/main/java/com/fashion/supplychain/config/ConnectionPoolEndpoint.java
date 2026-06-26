package com.fashion.supplychain.config;

import com.zaxxer.hikari.HikariDataSource;
import com.zaxxer.hikari.HikariPoolMXBean;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.actuate.endpoint.annotation.Endpoint;
import org.springframework.boot.actuate.endpoint.annotation.ReadOperation;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.lang.management.ManagementFactory;
import java.util.HashMap;
import java.util.Map;

@Slf4j
@Component
@Endpoint(id = "connection-pool")
public class ConnectionPoolEndpoint {

    private final DataSource dataSource;

    public ConnectionPoolEndpoint(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @ReadOperation
    public Map<String, Object> getPoolInfo() {
        Map<String, Object> result = new HashMap<>();

        if (dataSource instanceof HikariDataSource hikariDs) {
            try {
                HikariPoolMXBean poolMXBean = hikariDs.getHikariPoolMXBean();
                if (poolMXBean != null) {
                    result.put("activeConnections", poolMXBean.getActiveConnections());
                    result.put("idleConnections", poolMXBean.getIdleConnections());
                    result.put("totalConnections", poolMXBean.getTotalConnections());
                    result.put("threadsAwaitingConnection", poolMXBean.getThreadsAwaitingConnection());
                    result.put("activePercent", poolMXBean.getTotalConnections() > 0
                            ? Math.round(poolMXBean.getActiveConnections() * 100.0 / poolMXBean.getTotalConnections())
                            : 0);
                }
                result.put("maxPoolSize", hikariDs.getMaximumPoolSize());
                result.put("minimumIdle", hikariDs.getMinimumIdle());
                result.put("connectionTimeout", hikariDs.getConnectionTimeout());
                result.put("idleTimeout", hikariDs.getIdleTimeout());
                result.put("maxLifetime", hikariDs.getMaxLifetime());
                result.put("leakDetectionThreshold", hikariDs.getLeakDetectionThreshold());
                result.put("poolName", hikariDs.getPoolName());
                result.put("status", "healthy");
            } catch (Exception e) {
                result.put("status", "error");
                result.put("error", e.getMessage());
                log.warn("获取连接池信息失败", e);
            }
        } else {
            result.put("status", "unknown");
            result.put("dataSourceType", dataSource.getClass().getName());
        }

        result.put("timestamp", System.currentTimeMillis());
        return result;
    }
}
