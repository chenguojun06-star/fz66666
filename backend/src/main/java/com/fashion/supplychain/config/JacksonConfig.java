package com.fashion.supplychain.config;

import com.fasterxml.jackson.core.json.JsonWriteFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.module.SimpleModule;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;

/**
 * Jackson配置类
 * 1. 禁用非ASCII字符的Unicode转义，直接输出UTF-8中文
 * 2. Long/long 序列化为字符串，防止 JS Number 精度丢失（雪花ID > 2^53，前端解析后末位截断导致查询失败）
 */
@Configuration
public class JacksonConfig {

    @Bean
    public ObjectMapper objectMapper(Jackson2ObjectMapperBuilder builder) {
        ObjectMapper objectMapper = builder.createXmlMapper(false).build();
        // 禁用非ASCII字符的Unicode转义，直接输出UTF-8中文
        objectMapper.getFactory().disable(JsonWriteFeature.ESCAPE_NON_ASCII.mappedFeature());
        // Long 序列化为 String，解决 JS Number 精度丢失问题
        // JS 安全整数上限 2^53 ≈ 9×10^15，雪花 ID ≈ 2×10^18，超出范围会导致后几位截断
        SimpleModule longModule = new SimpleModule();
        longModule.addSerializer(Long.class, ToStringSerializer.instance);
        longModule.addSerializer(long.class, ToStringSerializer.instance);
        objectMapper.registerModule(longModule);
        // 支持 Java 8 日期时间类型（LocalDateTime 等），解决序列化 400 错误
        objectMapper.registerModule(new JavaTimeModule());
        objectMapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        return objectMapper;
    }
}
