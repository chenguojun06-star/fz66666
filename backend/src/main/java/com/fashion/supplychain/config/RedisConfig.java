package com.fashion.supplychain.config;

import com.fasterxml.jackson.annotation.JsonTypeInfo;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.jsontype.impl.LaissezFaireSubTypeValidator;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.pool2.impl.GenericObjectPoolConfig;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.CachingConfigurer;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.interceptor.CacheErrorHandler;
import org.springframework.cache.interceptor.KeyGenerator;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.connection.lettuce.LettucePoolingClientConfiguration;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializationContext;
import org.springframework.data.redis.serializer.StringRedisSerializer;

import java.time.Duration;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

/**
 * Redis配置类
 * 配置Redis连接、序列化、缓存管理器
 * 实现 CachingConfigurer 以提供容错 errorHandler：
 *   Redis 不可用时 @Cacheable 降级为直接查 DB（cache miss），不抛异常。
 *   TokenAuthFilter 已有独立熔断器，此处仅覆盖 Spring Cache 注解路径。
 */
@Slf4j
@Configuration
@EnableCaching
public class RedisConfig implements CachingConfigurer {

    /**
     * 自定义 LettuceConnectionFactory，解决 Redis 短暂中断后事件循环永久关闭的问题
     *
     * 关键修复：
     * 1. 启用连接池（LettucePoolingClientConfiguration），避免单连接断开后无备用
     * 2. 启用 autoReconnect(true)，连接中断时自动异步重连
     * 3. 配置连接验证（testOnCreate / testOnBorrow），确保取出的连接仍可用
     * 4. 配置命令超时，避免 Lettuce 事件循环阻塞导致系统整体挂死
     */
    @Bean
    @Primary
    public LettuceConnectionFactory redisConnectionFactory(RedisStandaloneConfiguration customRedisConfig,
                                                           org.springframework.core.env.Environment env) {
        int maxActive = Integer.parseInt(env.getProperty("spring.data.redis.lettuce.pool.max-active", "32"));
        int maxIdle = Integer.parseInt(env.getProperty("spring.data.redis.lettuce.pool.max-idle", "16"));
        int minIdle = Integer.parseInt(env.getProperty("spring.data.redis.lettuce.pool.min-idle", "4"));
        int maxWaitMs = Integer.parseInt(env.getProperty("spring.data.redis.lettuce.pool.max-wait", "5000").replaceAll("[^0-9]", ""));
        int shutdownMs = Integer.parseInt(env.getProperty("spring.data.redis.lettuce.shutdown-timeout", "200").replaceAll("[^0-9]", ""));
        int cmdTimeoutMs = Integer.parseInt(env.getProperty("spring.data.redis.timeout", "5000").replaceAll("[^0-9]", ""));

        GenericObjectPoolConfig<Object> poolConfig = new GenericObjectPoolConfig<>();
        poolConfig.setMaxTotal(maxActive);
        poolConfig.setMaxIdle(maxIdle);
        poolConfig.setMinIdle(minIdle);
        poolConfig.setMaxWait(Duration.ofMillis(maxWaitMs));
        poolConfig.setTestOnCreate(true);
        poolConfig.setTestOnBorrow(true);
        poolConfig.setTestWhileIdle(true);
        poolConfig.setTimeBetweenEvictionRuns(Duration.ofMinutes(3));
        poolConfig.setMinEvictableIdleTime(Duration.ofMinutes(10));

        LettucePoolingClientConfiguration clientConfig = LettucePoolingClientConfiguration.builder()
                .commandTimeout(Duration.ofMillis(cmdTimeoutMs))
                .shutdownTimeout(Duration.ofMillis(shutdownMs))
                .poolConfig(poolConfig)
                .build();

        LettuceConnectionFactory factory = new LettuceConnectionFactory(customRedisConfig, clientConfig);
        factory.setShareNativeConnection(false);
        factory.afterPropertiesSet();
        log.info("[RedisConfig] Lettuce 连接池初始化完成 maxTotal={} maxIdle={} minIdle={} maxWaitMs={} cmdTimeoutMs={} shutdownMs={} autoReconnect=true",
                maxActive, maxIdle, minIdle, maxWaitMs, cmdTimeoutMs, shutdownMs);
        return factory;
    }

    /**
     * 显式配置 RedisStandaloneConfiguration，完全从 Spring 自动装配读取
     * 确保连接池使用的 host/port/password 与 application.yml 保持一致
     */
    @Bean
    public RedisStandaloneConfiguration customRedisConfig(org.springframework.core.env.Environment env) {
        RedisStandaloneConfiguration config = new RedisStandaloneConfiguration();
        String host = env.getProperty("spring.data.redis.host", "localhost");
        int port = Integer.parseInt(env.getProperty("spring.data.redis.port", "6379"));
        String password = env.getProperty("spring.data.redis.password");
        int database = Integer.parseInt(env.getProperty("spring.data.redis.database", "0"));
        config.setHostName(host);
        config.setPort(port);
        if (password != null && !password.isEmpty()) {
            config.setPassword(password);
        }
        config.setDatabase(database);
        log.info("[RedisConfig] Redis 配置 host={} port={} database={} passwordSet={}", host, port, database, (password != null && !password.isEmpty()));
        return config;
    }

    /**
     * 配置 StringRedisTemplate（用于 TokenAuthFilter 等简单场景）
     */
    @Bean
    public StringRedisTemplate stringRedisTemplate(RedisConnectionFactory connectionFactory) {
        return new StringRedisTemplate(connectionFactory);
    }

    /**
     * 配置RedisTemplate
     */
    @Bean
    public RedisTemplate<String, Object> redisTemplate(RedisConnectionFactory connectionFactory) {
        RedisTemplate<String, Object> template = new RedisTemplate<>();
        template.setConnectionFactory(connectionFactory);

        // 配置序列化器
        ObjectMapper objectMapper = new ObjectMapper();
        // 注册 Java 8 时间模块，支持 LocalDateTime 等类型
        objectMapper.registerModule(new JavaTimeModule());
        objectMapper.activateDefaultTyping(
                LaissezFaireSubTypeValidator.instance,
                ObjectMapper.DefaultTyping.NON_FINAL,
                JsonTypeInfo.As.WRAPPER_ARRAY
        );
        GenericJackson2JsonRedisSerializer jsonSerializer = new GenericJackson2JsonRedisSerializer(objectMapper);

        StringRedisSerializer stringSerializer = new StringRedisSerializer();

        // key采用String序列化
        template.setKeySerializer(stringSerializer);
        template.setHashKeySerializer(stringSerializer);

        // value采用JSON序列化
        template.setValueSerializer(jsonSerializer);
        template.setHashValueSerializer(jsonSerializer);

        template.afterPropertiesSet();
        return template;
    }

    /**
     * 配置缓存管理器
     */
    @Bean
    @Primary
    public CacheManager cacheManager(RedisConnectionFactory connectionFactory) {
        // 创建支持 Java 8 时间类型的 ObjectMapper
        ObjectMapper cacheObjectMapper = new ObjectMapper();
        cacheObjectMapper.registerModule(new JavaTimeModule());
        cacheObjectMapper.activateDefaultTyping(
                LaissezFaireSubTypeValidator.instance,
                ObjectMapper.DefaultTyping.NON_FINAL,
                JsonTypeInfo.As.WRAPPER_ARRAY
        );
        GenericJackson2JsonRedisSerializer cacheSerializer = new GenericJackson2JsonRedisSerializer(cacheObjectMapper);

        // 默认缓存配置
        RedisCacheConfiguration defaultConfig = RedisCacheConfiguration.defaultCacheConfig()
                .entryTtl(Duration.ofMinutes(30))  // 默认过期时间30分钟
                .serializeKeysWith(RedisSerializationContext.SerializationPair.fromSerializer(new StringRedisSerializer()))
                .serializeValuesWith(RedisSerializationContext.SerializationPair.fromSerializer(cacheSerializer))
                .disableCachingNullValues();  // 不缓存null值

        // 不同缓存的过期时间配置
        Map<String, RedisCacheConfiguration> configMap = new HashMap<>();
        configMap.put("user", defaultConfig.entryTtl(Duration.ofHours(2)));  // 用户缓存2小时
        configMap.put("dict", defaultConfig.entryTtl(Duration.ofHours(1)));  // 字典缓存1小时
        configMap.put("style", defaultConfig.entryTtl(Duration.ofMinutes(10)));  // 款式缓存10分钟
        configMap.put("order", defaultConfig.entryTtl(Duration.ofMinutes(5)));  // 订单缓存5分钟
        configMap.put("permission", defaultConfig.entryTtl(Duration.ofHours(1)));  // 权限缓存1小时
        configMap.put("daily-brief", defaultConfig.entryTtl(Duration.ofMinutes(5)));  // AI日报建议缓存5分钟
        // templateProgressNodes 已迁移为 Caffeine 本地缓存（避免 Redis DefaultTyping 模式下 List<Map> 反序列化失败），无需 Redis TTL 注册

        return RedisCacheManager.builder(connectionFactory)
                .cacheDefaults(defaultConfig)
                .withInitialCacheConfigurations(configMap)
                .transactionAware()
                .build();
    }

    /**
     * 自定义缓存key生成器
     */
    @Bean("customKeyGenerator")
    public KeyGenerator customKeyGenerator() {
        return (target, method, params) -> {
            StringBuilder sb = new StringBuilder();
            sb.append(target.getClass().getSimpleName()).append(":");
            sb.append(method.getName()).append(":");
            for (Object param : params) {
                if (param != null) {
                    sb.append(param.toString()).append(":");
                }
            }
            return sb.toString();
        };
    }

    /**
     * Redis 不可用时的容错处理器
     * 所有 @Cacheable / @CachePut / @CacheEvict 操作出错时：
     *   - 只打 WARN 日志，不向上抛异常
     *   - handleCacheGetError → 视为 cache miss，直接调用真实方法
     * 这样即使云端无 Redis，业务接口仍正常响应，只是没有缓存加速。
     */
    @Override
    public CacheErrorHandler errorHandler() {
        return new CacheErrorHandler() {
            @Override
            public void handleCacheGetError(RuntimeException e, Cache cache, Object key) {
                log.warn("[Cache] Redis 读取失败，降级直查DB  cache={} key={} err={}",
                        cache.getName(), key, e.getMessage());
            }
            @Override
            public void handleCachePutError(RuntimeException e, Cache cache, Object key, Object value) {
                log.warn("[Cache] Redis 写入失败，跳过缓存  cache={} key={} err={}",
                        cache.getName(), key, e.getMessage());
            }
            @Override
            public void handleCacheEvictError(RuntimeException e, Cache cache, Object key) {
                log.warn("[Cache] Redis 删除失败，忽略  cache={} key={} err={}",
                        cache.getName(), key, e.getMessage());
            }
            @Override
            public void handleCacheClearError(RuntimeException e, Cache cache) {
                log.warn("[Cache] Redis 清空失败，忽略  cache={} err={}",
                        cache.getName(), e.getMessage());
            }
        };
    }
}
