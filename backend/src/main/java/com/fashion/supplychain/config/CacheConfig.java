package com.fashion.supplychain.config;

import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.annotation.Configuration;

/**
 * 缓存配置类，启用Spring缓存机制
 */
@Configuration
@EnableCaching
public class CacheConfig {
    // 框架会自动配置默认的缓存管理器（例如 ConcurrentMapCacheManager）
    // 如需自定义缓存配置，可以在此类中添加相应的Bean
}
