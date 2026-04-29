package com.fashion.supplychain.config;

import com.zaxxer.hikari.HikariDataSource;
import java.util.concurrent.Semaphore;
import javax.sql.DataSource;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Slf4j
@Configuration
public class VirtualThreadsDataSourceConfig {

    @Bean
    @ConditionalOnProperty(name = "spring.threads.virtual.enabled", havingValue = "true")
    public Semaphore dbSemaphore(DataSource dataSource) {
        int permits = 50;
        if (dataSource instanceof HikariDataSource hikari) {
            permits = hikari.getMaximumPoolSize();
            log.info("[VirtualThreads] DB Semaphore initialized with {} permits (matching HikariCP max-pool-size)", permits);
        } else {
            log.info("[VirtualThreads] DB Semaphore initialized with default {} permits", permits);
        }
        return new Semaphore(permits, true);
    }
}
