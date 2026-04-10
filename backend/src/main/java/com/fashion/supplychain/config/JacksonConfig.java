package com.fashion.supplychain.config;

import com.fasterxml.jackson.core.json.JsonWriteFeature;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.module.SimpleModule;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import com.fasterxml.jackson.datatype.jsr310.ser.LocalDateTimeSerializer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;

import java.io.IOException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.List;

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
        // 兼容前端 "yyyy-MM-dd"、"yyyy-MM-dd HH:mm:ss"（空格）和 ISO "yyyy-MM-dd'T'HH:mm:ss"。
        // ⚠️ 注意：不能用 new JavaTimeModule()，Spring Boot 自动配置已注册 JavaTimeModule，
        //    objectMapper.registerModule(new JavaTimeModule()) 会被 Jackson 静默跳过（同 typeId 不重复注册）。
        //    改用唯一名称的 SimpleModule 覆盖 LocalDateTime 的序列化/反序列化器。
        DateTimeFormatter writeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
        SimpleModule dateTimeOverride = new SimpleModule("fashion-datetime-override");
        dateTimeOverride.addDeserializer(LocalDateTime.class, new FlexibleLocalDateTimeDeserializer());
        dateTimeOverride.addSerializer(LocalDateTime.class, new LocalDateTimeSerializer(writeFormatter));
        objectMapper.registerModule(dateTimeOverride);
        objectMapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        return objectMapper;
    }

    private static class FlexibleLocalDateTimeDeserializer extends JsonDeserializer<LocalDateTime> {

        private static final DateTimeFormatter DATE_ONLY = DateTimeFormatter.ofPattern("yyyy-MM-dd");
        private static final List<DateTimeFormatter> DATE_TIME_FORMATTERS = List.of(
                DateTimeFormatter.ISO_LOCAL_DATE_TIME,
                DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss[.SSS][.SSSSSS][.SSSSSSSSS]"),
                DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")
        );

        @Override
        public LocalDateTime deserialize(JsonParser parser, DeserializationContext context) throws IOException {
            String raw = parser.getValueAsString();
            if (raw == null) {
                return null;
            }
            String text = raw.trim();
            if (text.isEmpty()) {
                return null;
            }

            if (text.length() == 10) {
                try {
                    return LocalDate.parse(text, DATE_ONLY).atStartOfDay();
                } catch (DateTimeParseException ignored) {
                    // 继续走下方统一报错，避免吞掉非法日期。
                }
            }

            // 兼容前端 new Date().toISOString() 产生的 UTC 时间（"...Z"）
            // 以及带偏移的 ISO 8601（"...+08:00" / "-05:00"）
            // 将带时区的绝对时刻转换为服务器本地时间后存储
            try {
                OffsetDateTime odt = OffsetDateTime.parse(text, DateTimeFormatter.ISO_OFFSET_DATE_TIME);
                return odt.atZoneSameInstant(ZoneId.systemDefault()).toLocalDateTime();
            } catch (DateTimeParseException ignored) {
                // 非带偏移格式，继续尝试无时区格式
            }

            for (DateTimeFormatter formatter : DATE_TIME_FORMATTERS) {
                try {
                    return LocalDateTime.parse(text, formatter);
                } catch (DateTimeParseException ignored) {
                    // 尝试下一个兼容格式。
                }
            }

            throw context.weirdStringException(text, LocalDateTime.class,
                    "支持格式：yyyy-MM-dd、yyyy-MM-dd HH:mm[:ss[.SSS]]、yyyy-MM-dd'T'HH:mm:ss[.SSS][Z|+HH:mm]");
        }
    }
}
