package com.fashion.supplychain.config;

import com.fashion.supplychain.common.interceptor.RequestLoggingInterceptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Configuration;
import org.springframework.lang.NonNull;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * 网站配置类，用于注册拦截器等
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Autowired
    @NonNull
    private RequestLoggingInterceptor requestLoggingInterceptor;

    @Override
    public void addInterceptors(@NonNull InterceptorRegistry registry) {
        // 注册请求日志拦截器，拦截所有请求
        registry.addInterceptor(requestLoggingInterceptor)
                .addPathPatterns("/**")
                // 排除静态资源和接口文档
                .excludePathPatterns("/swagger-resources/**", "/webjars/**", "/v3/api-docs/**", "/swagger-ui/**",
                        "/swagger-ui.html");
    }
}
