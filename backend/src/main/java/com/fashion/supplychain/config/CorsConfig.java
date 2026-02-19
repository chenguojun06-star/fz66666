package com.fashion.supplychain.config;

import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

@Configuration
public class CorsConfig {

    @Value("${app.cors.allowed-origin-patterns:http://localhost:*,http://127.0.0.1:*,http://192.168.*:*,http://10.*:*}")
    private String allowedOriginPatterns;

    @Value("${app.cors.allow-credentials:true}")
    private boolean allowCredentials;

    @Bean
    public CorsFilter corsFilter() {
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        CorsConfiguration config = new CorsConfiguration();

        List<String> patterns = parseCsv(allowedOriginPatterns);
        boolean hasWildcard = patterns.stream().anyMatch(p -> "*".equals(p));
        boolean credentials = allowCredentials && !hasWildcard;
        config.setAllowCredentials(credentials);

        for (String p : patterns) {
            if (!credentials && "*".equals(p)) {
                config.addAllowedOriginPattern("*");
                continue;
            }
            if ("*".equals(p)) {
                continue;
            }
            config.addAllowedOriginPattern(p);
        }

        // 允许的头信息
        config.addAllowedHeader("*");

        // 允许的请求方法
        config.addAllowedMethod("*");

        source.registerCorsConfiguration("/**", config);
        return new CorsFilter(source);
    }

    private List<String> parseCsv(String value) {
        List<String> list = new ArrayList<>();
        if (value == null) {
            return list;
        }
        String[] parts = value.split(",");
        for (String part : parts) {
            if (part == null) {
                continue;
            }
            String v = part.trim();
            if (!v.isEmpty()) {
                list.add(v);
            }
        }
        return list;
    }
}
