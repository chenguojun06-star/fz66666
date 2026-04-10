package com.fashion.supplychain.config;

import com.fasterxml.jackson.core.json.JsonWriteFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.module.SimpleModule;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.fasterxml.jackson.datatype.jsr310.deser.LocalDateTimeDeserializer;
import com.fasterxml.jackson.datatype.jsr310.ser.LocalDateTimeSerializer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

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
        // 支持 Java 8 日期时间类型（LocalDateTime 等）
        // 兼容前端 "yyyy-MM-dd HH:mm:ss" 和 ISO "yyyy-MM-ddTHH:mm:ss" 两种格式
        // 修复：前端传 "2026-04-10 12:09:23" 空格分隔导致反序列化 500 的问题
        DateTimeFormatter readFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd[' ']['T']HH:mm:ss[.SSS]");
        DateTimeFormatter writeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
        JavaTimeModule javaTimeModule = new JavaTimeModule();
        javaTimeModule.addDeserializer(LocalDateTime.class, new LocalDateTimeDeserializer(readFormatter));
        javaTimeModule.addSerializer(LocalDateTime.class, new LocalDateTimeSerializer(writeFormatter));
        objectMapper.registerModule(javaTimeModule);
        objectMapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        return objectMapper;
    }
}
